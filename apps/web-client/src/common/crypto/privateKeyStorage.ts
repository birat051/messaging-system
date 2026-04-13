/**
 * Persist **PKCS#8** private key material in **IndexedDB** only — **never** sent to the server.
 *
 * **Default:** passphrase-wrapped using **PBKDF2-HMAC-SHA256** (OWASP-aligned iteration count) + **AES-256-GCM**
 * (`privateKeyWrap.ts`). **Option A** (see **`README.md`** / **`docs/PROJECT_PLAN.md` §14** §6.3): multiple
 * **`keyVersion`** rows per user (**keyring**) so older ciphertext remains decryptable after rotation.
 *
 * Call **`assertSecureContextForPrivateKeyOps`** (or rely on these functions) before persisting in the browser.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';
import {
  unwrapPrivateKeyPkcs8,
  wrapPrivateKeyPkcs8,
} from './privateKeyWrap';
import { assertSecureContextForPrivateKeyOps } from './secureContext';

const DB_NAME = 'messaging-client-crypto';
const DB_VERSION = 2;
const STORE_LEGACY = 'privateKeyMaterial';
const STORE_KEYRING = 'privateKeyKeyring';

/** OWASP PBKDF2-HMAC-SHA256 guidance (2023): 310,000 iterations for general passwords. */
export const PBKDF2_ITERATIONS_DEFAULT = 310_000;

const MAX_PASSPHRASE_CHARS = 1024;

export type EncryptedPrivateKeyRecordV1 = {
  kind: 'encrypted-v1';
  pbkdf2Iterations: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
};

export type PlaintextDevPrivateKeyRecordV1 = {
  kind: 'plaintext-dev-v1';
  pkcs8B64: string;
};

export type StoredPrivateKeyPayload =
  | EncryptedPrivateKeyRecordV1
  | PlaintextDevPrivateKeyRecordV1;

export type PrivateKeyRow = {
  userId: string;
  payload: StoredPrivateKeyPayload;
  updatedAt: string;
};

export type KeyringPrivateKeyRow = {
  userId: string;
  keyVersion: number;
  /** Same encoding as **`PUT /users/me/public-key`** — not secret; used to detect server mismatch without decrypting. */
  publicKeySpkiB64?: string;
  payload: EncryptedPrivateKeyRecordV1;
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = (): void => {
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onsuccess = (): void => {
      resolve(req.result);
    };
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LEGACY)) {
        db.createObjectStore(STORE_LEGACY, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORE_KEYRING)) {
        db.createObjectStore(STORE_KEYRING, {
          keyPath: ['userId', 'keyVersion'],
        });
      }
    };
  });
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        request.onerror = (): void => {
          reject(request.error ?? new Error('IndexedDB request failed'));
        };
        tx.oncomplete = (): void => {
          resolve(request.result as T);
          db.close();
        };
        tx.onerror = (): void => {
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
  );
}

function normalizePassphrase(passphrase: string): string {
  const t = passphrase.trim();
  if (t.length === 0) {
    throw new Error('Passphrase must not be empty');
  }
  if (t.length > MAX_PASSPHRASE_CHARS) {
    throw new Error(`Passphrase exceeds ${MAX_PASSPHRASE_CHARS} characters`);
  }
  return t;
}

async function decryptPayloadToPkcs8(
  payload: StoredPrivateKeyPayload,
  passphrase: string,
): Promise<ArrayBuffer> {
  if (payload.kind === 'plaintext-dev-v1') {
    throw new Error(
      'Stored key is plaintext (dev-only); use loadPlaintextPrivateKeyPkcs8DevOnly',
    );
  }
  if (payload.kind !== 'encrypted-v1') {
    throw new Error('Unsupported private key storage record');
  }
  return unwrapPrivateKeyPkcs8(
    {
      pbkdf2Iterations: payload.pbkdf2Iterations,
      saltB64: payload.saltB64,
      ivB64: payload.ivB64,
      ciphertextB64: payload.ciphertextB64,
    },
    passphrase,
  );
}

/**
 * List stored **`keyVersion`** values for **`userId`** (ascending). Empty if none.
 */
export async function listKeyringVersions(userId: string): Promise<number[]> {
  assertSecureContextForPrivateKeyOps();
  const versions: number[] = [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYRING, 'readonly');
    const store = tx.objectStore(STORE_KEYRING);
    const range = IDBKeyRange.bound(
      [userId, 0],
      [userId, Number.MAX_SAFE_INTEGER],
    );
    const req = store.openCursor(range);
    req.onerror = (): void => {
      reject(req.error ?? new Error('IndexedDB cursor failed'));
    };
    req.onsuccess = (): void => {
      const cursor = req.result;
      if (cursor) {
        const row = cursor.value as KeyringPrivateKeyRow;
        versions.push(row.keyVersion);
        cursor.continue();
      }
    };
    tx.oncomplete = (): void => {
      db.close();
      versions.sort((a, b) => a - b);
      resolve(versions);
    };
    tx.onerror = (): void => {
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

/**
 * Store PKCS#8 for a specific **`keyVersion`** (rotation appends; does **not** remove older versions).
 */
export async function storeKeyringPrivateKeyPkcs8(
  userId: string,
  keyVersion: number,
  pkcs8Der: ArrayBuffer,
  passphrase: string,
  options: {
    iterations?: number;
    /** SPKI Base64 for this version — stored in plaintext alongside ciphertext for UX / mismatch checks. */
    publicKeySpkiB64?: string;
  } = {},
): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error('keyVersion must be a positive integer');
  }
  const iterations = options.iterations ?? PBKDF2_ITERATIONS_DEFAULT;
  const pass = normalizePassphrase(passphrase);
  const wrapped = await wrapPrivateKeyPkcs8(pkcs8Der, pass, iterations);

  const payload: EncryptedPrivateKeyRecordV1 = {
    kind: 'encrypted-v1',
    pbkdf2Iterations: wrapped.pbkdf2Iterations,
    saltB64: wrapped.saltB64,
    ivB64: wrapped.ivB64,
    ciphertextB64: wrapped.ciphertextB64,
  };

  const row: KeyringPrivateKeyRow = {
    userId,
    keyVersion,
    ...(options.publicKeySpkiB64 !== undefined
      ? { publicKeySpkiB64: options.publicKeySpkiB64 }
      : {}),
    payload,
    updatedAt: new Date().toISOString(),
  };

  await runTx(STORE_KEYRING, 'readwrite', (store) => store.put(row));
}

/**
 * Load PKCS#8 for **`keyVersion`**, or **`null`** if missing.
 */
export async function loadKeyringPrivateKeyPkcs8(
  userId: string,
  keyVersion: number,
  passphrase: string,
): Promise<ArrayBuffer | null> {
  assertSecureContextForPrivateKeyOps();
  const pass = normalizePassphrase(passphrase);
  const row = await runTx<KeyringPrivateKeyRow | undefined>(
    STORE_KEYRING,
    'readonly',
    (store) => store.get([userId, keyVersion]),
  );
  if (!row?.payload || row.payload.kind !== 'encrypted-v1') {
    return null;
  }
  return decryptPayloadToPkcs8(row.payload, pass);
}

/**
 * Copy legacy single-row storage into the keyring at **`keyVersion`**, then delete the legacy row.
 * Returns **`false`** if there is no legacy row, keyring already has entries, or passphrase fails.
 */
export async function migrateLegacyPrivateKeyToKeyring(
  userId: string,
  keyVersion: number,
  passphrase: string,
): Promise<boolean> {
  assertSecureContextForPrivateKeyOps();
  if ((await listKeyringVersions(userId)).length > 0) {
    return false;
  }
  const row = await runTx<PrivateKeyRow | undefined>(
    STORE_LEGACY,
    'readonly',
    (store) => store.get(userId),
  );
  if (!row?.payload) {
    return false;
  }
  const pass = normalizePassphrase(passphrase);
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await decryptPayloadToPkcs8(row.payload, pass);
  } catch {
    return false;
  }
  await storeKeyringPrivateKeyPkcs8(userId, keyVersion, pkcs8, passphrase);
  await runTx(STORE_LEGACY, 'readwrite', (store) => store.delete(userId));
  return true;
}

/**
 * Public SPKI Base64 stored next to the ciphertext for **`keyVersion`**, if present.
 */
export async function getKeyringPublicSpkiOptional(
  userId: string,
  keyVersion: number,
): Promise<string | null> {
  assertSecureContextForPrivateKeyOps();
  const row = await runTx<KeyringPrivateKeyRow | undefined>(
    STORE_KEYRING,
    'readonly',
    (store) => store.get([userId, keyVersion]),
  );
  const spki = row?.publicKeySpkiB64;
  return typeof spki === 'string' && spki.length > 0 ? spki : null;
}

/**
 * Encrypt PKCS#8 bytes with a passphrase-derived key and store under **`userId`** (legacy single row).
 * Prefer **`storeKeyringPrivateKeyPkcs8`** with the server’s **`keyVersion`** for new code.
 */
export async function storeEncryptedPrivateKeyPkcs8(
  userId: string,
  pkcs8Der: ArrayBuffer,
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS_DEFAULT,
): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  const pass = normalizePassphrase(passphrase);
  const wrapped = await wrapPrivateKeyPkcs8(pkcs8Der, pass, iterations);

  const payload: EncryptedPrivateKeyRecordV1 = {
    kind: 'encrypted-v1',
    pbkdf2Iterations: wrapped.pbkdf2Iterations,
    saltB64: wrapped.saltB64,
    ivB64: wrapped.ivB64,
    ciphertextB64: wrapped.ciphertextB64,
  };

  const row: PrivateKeyRow = {
    userId,
    payload,
    updatedAt: new Date().toISOString(),
  };

  await runTx(STORE_LEGACY, 'readwrite', (store) => store.put(row));
}

/**
 * **Insecure:** stores PKCS#8 **without** wrapping. Allowed only in **Vite dev** builds (`import.meta.env.DEV`).
 */
export async function storePrivateKeyPkcs8PlaintextDevOnly(
  userId: string,
  pkcs8Der: ArrayBuffer,
): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error(
      'Plaintext private key storage is only available in development builds',
    );
  }
  assertSecureContextForPrivateKeyOps();
  const payload: PlaintextDevPrivateKeyRecordV1 = {
    kind: 'plaintext-dev-v1',
    pkcs8B64: arrayBufferToBase64(pkcs8Der),
  };
  const row: PrivateKeyRow = {
    userId,
    payload,
    updatedAt: new Date().toISOString(),
  };
  await runTx(STORE_LEGACY, 'readwrite', (store) => store.put(row));
}

/**
 * Load the **active** private key (highest **`keyVersion`** in the keyring, else legacy row).
 * Returns **`null`** if nothing is stored.
 */
export async function loadEncryptedPrivateKeyPkcs8(
  userId: string,
  passphrase: string,
): Promise<ArrayBuffer | null> {
  assertSecureContextForPrivateKeyOps();
  const pass = normalizePassphrase(passphrase);
  const versions = await listKeyringVersions(userId);
  if (versions.length > 0) {
    const max = Math.max(...versions);
    return loadKeyringPrivateKeyPkcs8(userId, max, passphrase);
  }

  const row = await runTx<PrivateKeyRow | undefined>(
    STORE_LEGACY,
    'readonly',
    (store) => store.get(userId),
  );
  if (!row?.payload) {
    return null;
  }
  return decryptPayloadToPkcs8(row.payload, pass);
}

/** Load dev-only plaintext row. Returns **`null`** if missing. */
export async function loadPlaintextPrivateKeyPkcs8DevOnly(
  userId: string,
): Promise<ArrayBuffer | null> {
  if (!import.meta.env.DEV) {
    throw new Error(
      'Plaintext private key load is only available in development builds',
    );
  }
  assertSecureContextForPrivateKeyOps();
  const row = await runTx<PrivateKeyRow | undefined>(
    STORE_LEGACY,
    'readonly',
    (store) => store.get(userId),
  );
  if (!row?.payload || row.payload.kind !== 'plaintext-dev-v1') {
    return null;
  }
  return base64ToArrayBuffer(row.payload.pkcs8B64);
}

async function deleteAllKeyringForUser(userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYRING, 'readwrite');
    const store = tx.objectStore(STORE_KEYRING);
    const range = IDBKeyRange.bound(
      [userId, 0],
      [userId, Number.MAX_SAFE_INTEGER],
    );
    const req = store.openCursor(range);
    req.onerror = (): void => {
      reject(req.error ?? new Error('IndexedDB cursor failed'));
    };
    req.onsuccess = (): void => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = (): void => {
      db.close();
      resolve();
    };
    tx.onerror = (): void => {
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

export async function deleteStoredPrivateKey(userId: string): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  await deleteAllKeyringForUser(userId);
  await runTx(STORE_LEGACY, 'readwrite', (store) => store.delete(userId));
}

export async function hasStoredPrivateKey(userId: string): Promise<boolean> {
  assertSecureContextForPrivateKeyOps();
  const vs = await listKeyringVersions(userId);
  if (vs.length > 0) {
    return true;
  }
  const row = await runTx<PrivateKeyRow | undefined>(
    STORE_LEGACY,
    'readonly',
    (store) => store.get(userId),
  );
  return Boolean(row?.payload);
}
