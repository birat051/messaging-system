/**
 * **IndexedDB** persistence for **sender** message plaintext (E2EE wire body is recipient ciphertext).
 * Requires **`indexedDB`** (browser or **`fake-indexeddb`** in Vitest).
 *
 * See **`docs/PROJECT_PLAN.md` §7.1** and **`docs/TASK_CHECKLIST.md`** (Option A).
 */

const DB_NAME = 'messaging-client-sender-plaintext';
const DB_VERSION = 1;
const STORE = 'senderPlaintext';

export type SenderPlaintextRecord = {
  userId: string;
  messageId: string;
  plaintext: string;
  updatedAt: number;
};

function requireIndexedDb(): void {
  if (typeof indexedDB === 'undefined') {
    throw new Error(
      'IndexedDB is not available; sender plaintext persistence requires a browser (use fake-indexeddb in tests).',
    );
  }
}

function openDb(): Promise<IDBDatabase> {
  requireIndexedDb();
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: ['userId', 'messageId'] });
      }
    };
  });
}

function runReadWrite<T>(
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
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

function runReadOnly<T>(
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
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

/**
 * Ensures the backing store is reachable. Safe to call multiple times.
 */
export async function open(): Promise<void> {
  const db = await openDb();
  db.close();
}

export async function put(
  userId: string,
  messageId: string,
  plaintext: string,
): Promise<void> {
  const uid = userId.trim();
  const mid = messageId.trim();
  if (!uid || !mid) {
    throw new Error('userId and messageId are required');
  }
  const record: SenderPlaintextRecord = {
    userId: uid,
    messageId: mid,
    plaintext,
    updatedAt: Date.now(),
  };
  await runReadWrite((store) => store.put(record));
}

export async function get(
  userId: string,
  messageId: string,
): Promise<string | null> {
  const uid = userId.trim();
  const mid = messageId.trim();
  if (!uid || !mid) {
    return null;
  }
  const row = await runReadOnly(
    (store) => store.get([uid, mid]) as IDBRequest<SenderPlaintextRecord | undefined>,
  );
  return row?.plaintext ?? null;
}

/**
 * All plaintext rows for **`userId`**, keyed by **`messageId`** (for hydrating Redux).
 */
export async function getAll(userId: string): Promise<Record<string, string>> {
  const uid = userId.trim();
  if (!uid) {
    return {};
  }
  return openDb().then(
    (db) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        const out: Record<string, string> = {};
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const range = IDBKeyRange.bound([uid, ''], [uid, '\uffff']);
        const req = store.openCursor(range);
        req.onerror = (): void => {
          reject(req.error ?? new Error('IndexedDB cursor failed'));
        };
        req.onsuccess = (): void => {
          const cursor = req.result;
          if (cursor) {
            const v = cursor.value as SenderPlaintextRecord;
            out[v.messageId] = v.plaintext;
            cursor.continue();
          }
        };
        tx.oncomplete = (): void => {
          resolve(out);
          db.close();
        };
        tx.onerror = (): void => {
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
  );
}

export async function deleteEntry(
  userId: string,
  messageId: string,
): Promise<void> {
  const uid = userId.trim();
  const mid = messageId.trim();
  if (!uid || !mid) {
    return;
  }
  await runReadWrite((store) => store.delete([uid, mid]));
}

/**
 * Removes every stored plaintext row for **`userId`** (e.g. logout).
 */
export async function clearUser(userId: string): Promise<void> {
  const uid = userId.trim();
  if (!uid) {
    return;
  }
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const range = IDBKeyRange.bound([uid, ''], [uid, '\uffff']);
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
          resolve();
          db.close();
        };
        tx.onerror = (): void => {
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
  );
}

/**
 * Deletes the whole database — **tests only** (clean slate between cases).
 */
export function __deleteSenderPlaintextDbForTests(): Promise<void> {
  requireIndexedDb();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = (): void => resolve();
    req.onerror = (): void =>
      reject(req.error ?? new Error('IndexedDB deleteDatabase failed'));
  });
}
