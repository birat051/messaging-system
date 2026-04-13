/**
 * Encrypted **keyring backup** file (JSON) — recovery path for a new browser (`README.md` / `docs/PROJECT_PLAN.md` §14).
 * Inner PKCS#8 entries are decrypted with the **storage** passphrase, then the whole payload is wrapped with a **backup** passphrase.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';
import {
  listKeyringVersions,
  loadEncryptedPrivateKeyPkcs8,
  loadKeyringPrivateKeyPkcs8,
  PBKDF2_ITERATIONS_DEFAULT,
  storeKeyringPrivateKeyPkcs8,
} from './privateKeyStorage';
import type { WrappedPrivateKeyPayload } from './privateKeyWrap';
import { unwrapPrivateKeyPkcs8, wrapPrivateKeyPkcs8 } from './privateKeyWrap';

export const KEYRING_BACKUP_FILE_FORMAT = 'messaging-keyring-backup-v1';

export type KeyringBackupPlaintextV1 = {
  format: typeof KEYRING_BACKUP_FILE_FORMAT;
  userId: string;
  exportedAt: string;
  /** keyVersion string → PKCS#8 DER as standard Base64 */
  entries: Record<string, string>;
};

export type KeyringBackupFileV1 = {
  format: typeof KEYRING_BACKUP_FILE_FORMAT;
  userId: string;
  exportedAt: string;
  /** Passphrase-wrapped JSON (**UTF-8**) of **`KeyringBackupPlaintextV1`**. */
  wrapped: WrappedPrivateKeyPayload;
};

function parseBackupJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Backup file is not valid JSON');
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Build a downloadable backup **`Blob`** for **`userId`**. Uses **`listKeyringVersions`**; if only a legacy
 * row exists, loads it via **`loadEncryptedPrivateKeyPkcs8`** and assigns **`legacyKeyVersion`** (from the server).
 */
export async function buildKeyringBackupBlob(
  userId: string,
  storagePassphrase: string,
  backupPassphrase: string,
  legacyKeyVersionIfNoKeyring: number,
  iterations: number = PBKDF2_ITERATIONS_DEFAULT,
): Promise<{ blob: Blob; filename: string }> {
  const versions = await listKeyringVersions(userId);
  const entries: Record<string, string> = {};

  if (versions.length > 0) {
    for (const v of versions) {
      const pkcs8 = await loadKeyringPrivateKeyPkcs8(
        userId,
        v,
        storagePassphrase,
      );
      if (pkcs8) {
        entries[String(v)] = arrayBufferToBase64(pkcs8);
      }
    }
  } else {
    const pkcs8 = await loadEncryptedPrivateKeyPkcs8(
      userId,
      storagePassphrase,
    );
    if (!pkcs8) {
      throw new Error('No private key material found to export');
    }
    if (!Number.isInteger(legacyKeyVersionIfNoKeyring) || legacyKeyVersionIfNoKeyring < 1) {
      throw new Error('Invalid key version for legacy-only export');
    }
    entries[String(legacyKeyVersionIfNoKeyring)] = arrayBufferToBase64(pkcs8);
  }

  const exportedAt = new Date().toISOString();
  const plaintext: KeyringBackupPlaintextV1 = {
    format: KEYRING_BACKUP_FILE_FORMAT,
    userId,
    exportedAt,
    entries,
  };
  const jsonUtf8 = new TextEncoder().encode(JSON.stringify(plaintext));
  const buf = jsonUtf8.buffer.slice(
    jsonUtf8.byteOffset,
    jsonUtf8.byteOffset + jsonUtf8.byteLength,
  ) as ArrayBuffer;
  const wrapped = await wrapPrivateKeyPkcs8(buf, backupPassphrase, iterations);

  const fileBody: KeyringBackupFileV1 = {
    format: KEYRING_BACKUP_FILE_FORMAT,
    userId,
    exportedAt,
    wrapped,
  };

  const blob = new Blob([JSON.stringify(fileBody)], {
    type: 'application/json',
  });
  const filename = `messaging-keyring-backup-${userId.slice(0, 8)}.json`;
  return { blob, filename };
}

/**
 * Parse a backup file **`ArrayBuffer`**, unwrap with **`backupPassphrase`**, and store each entry with **`storagePassphrase`**.
 */
export async function importKeyringBackupFromArrayBuffer(
  userId: string,
  fileBytes: ArrayBuffer,
  backupPassphrase: string,
  storagePassphrase: string,
  iterations: number = PBKDF2_ITERATIONS_DEFAULT,
): Promise<{ importedVersions: number[] }> {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(fileBytes);
  const raw = parseBackupJson(text);
  if (!isRecord(raw)) {
    throw new Error('Invalid backup file');
  }
  if (raw.format !== KEYRING_BACKUP_FILE_FORMAT) {
    throw new Error('Unsupported backup file format');
  }
  if (typeof raw.userId !== 'string' || raw.userId !== userId) {
    throw new Error('Backup file is for a different account');
  }
  const wrapped = raw.wrapped;
  if (!isRecord(wrapped)) {
    throw new Error('Invalid backup file (missing wrapped payload)');
  }

  const payload: WrappedPrivateKeyPayload = {
    pbkdf2Iterations:
      typeof wrapped.pbkdf2Iterations === 'number'
        ? wrapped.pbkdf2Iterations
        : PBKDF2_ITERATIONS_DEFAULT,
    saltB64: String(wrapped.saltB64 ?? ''),
    ivB64: String(wrapped.ivB64 ?? ''),
    ciphertextB64: String(wrapped.ciphertextB64 ?? ''),
  };

  const plainBuf = await unwrapPrivateKeyPkcs8(payload, backupPassphrase);
  const jsonText = new TextDecoder().decode(plainBuf);
  const inner = parseBackupJson(jsonText) as unknown;
  if (!isRecord(inner) || inner.format !== KEYRING_BACKUP_FILE_FORMAT) {
    throw new Error('Corrupted backup payload');
  }
  const ent = inner.entries;
  if (!isRecord(ent)) {
    throw new Error('Corrupted backup entries');
  }

  const importedVersions: number[] = [];
  for (const [k, v] of Object.entries(ent)) {
    const keyVersion = Number.parseInt(k, 10);
    if (!Number.isInteger(keyVersion) || keyVersion < 1) {
      continue;
    }
    if (typeof v !== 'string') {
      continue;
    }
    const pkcs8 = base64ToArrayBuffer(v);
    await storeKeyringPrivateKeyPkcs8(userId, keyVersion, pkcs8, storagePassphrase, {
      iterations,
    });
    importedVersions.push(keyVersion);
  }

  importedVersions.sort((a, b) => a - b);
  if (importedVersions.length === 0) {
    throw new Error('No key entries found in backup');
  }
  return { importedVersions };
}
