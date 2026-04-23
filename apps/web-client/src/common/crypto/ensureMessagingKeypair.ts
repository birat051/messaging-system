/**
 * **Automatic** sender keypair: generate, register on server, persist wrapped private key in the keyring.
 * No user-facing wizard — uses **`getOrCreateDeviceScopedPassphrase`** for local wrapping.
 * Concerns **only the signed-in user’s** key — peer device rows are loaded via **`fetchDevicePublicKeys`** /
 * **`usePrefetchDevicePublicKeys`** when sending or selecting a thread.
 */

import { listUserDevicePublicKeys } from '@/common/api/usersApi';
import { parseApiError } from '@/modules/auth/utils/apiError';
import {
  hydrateMessagingDeviceId,
  registerDevice,
  setPublicKeyMeta,
} from '@/modules/crypto/stores/cryptoSlice';
import { store, type AppDispatch } from '@/store/store';
import {
  exportPrivateKeyPkcs8Base64,
  exportPublicKeySpkiBase64,
  generateP256EcdhKeyPair,
} from './keypair';
import { base64ToArrayBuffer } from './encoding';
import {
  DEFAULT_SINGLE_DEVICE_ID,
  getKeyringPublicSpkiOptional,
  getStoredDeviceId,
  listKeyringVersions,
  setStoredDeviceId,
  storeKeyringPrivateKeyPkcs8,
} from './privateKeyStorage';
import { assertSecureContextForPrivateKeyOps } from './secureContext';
import { getOrCreateDeviceScopedPassphrase } from './deviceMessagingPassphrase';
import { evaluateDeviceSyncBootstrapState } from './deviceBootstrapSync';
import { upgradeAccessTokenWithDeviceBinding } from '@/modules/auth/utils/upgradeAccessTokenWithDeviceBinding';

/**
 * Ensures the signed-in user has a **local** keyring row aligned with **`GET /users/{id}/devices/public-keys`**
 * for the persisted **`deviceId`**. Called automatically after login / session restore (**`SessionRestore`**
 * + **`useSenderKeypairBootstrap`**) — no Settings wizard.
 *
 * **New device:** generates a stable client **`deviceId`** (**`crypto.randomUUID()`**), mirrors it into Redux via
 * **`hydrateMessagingDeviceId`** before **`POST /users/me/devices`**, and persists it in **`deviceIdentity`** after a
 * successful response alongside the wrapped PKCS#8 row in the keyring.
 *
 * **Silent re-registration:** **`POST /users/me/devices`** runs when IndexedDB has no **`deviceId`**, or the
 * server list has no row for the stored id (same SPKI re-uploaded). A **404** from **`GET …/devices/public-keys`**
 * is treated like an empty directory (same as **`useKeypairStatus`**) so bootstrap can recover. **`deviceId`** is read
 * from IndexedDB first and mirrored into Redux (**`hydrateMessagingDeviceId`**) before any **`registerDevice`** call.
 * Also re-invoked on **tab visibility** so a briefly offline register can recover without user action.
 *
 * **No local keyring (`versions.length === 0`):** If **`GET …/devices/public-keys`** is **non-empty** and the persisted
 * **`deviceId`** is **missing** or **not** among returned **`deviceId`**s, treat as **another browser / new device** —
 * generate a keypair, **`POST /users/me/devices`**, then **`evaluateDeviceSyncBootstrapState`** (Feature 13 sync UI when
 * appropriate). If the persisted id **matches** a server row but there is still **no** key material, throw (restore from
 * backup). If the directory is **empty**, greenfield registration for this browser.
 *
 * After each successful **`registerDevice`** in those paths, **`evaluateDeviceSyncBootstrapState`** may set
 * **`syncState: 'pending'`** when multiple devices exist and this **`deviceId`** lacks wrapped sync keys.
 */
export async function ensureUserKeypairReadyForMessaging(
  userId: string,
  dispatch: AppDispatch,
): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  const persistedDeviceId = await getStoredDeviceId(userId);
  if (persistedDeviceId) {
    dispatch(hydrateMessagingDeviceId(persistedDeviceId));
  }
  const passphrase = getOrCreateDeviceScopedPassphrase(userId);
  const versions = await listKeyringVersions(userId);

  let deviceList: Awaited<ReturnType<typeof listUserDevicePublicKeys>>;
  try {
    deviceList = await listUserDevicePublicKeys('me');
  } catch (e) {
    if (parseApiError(e).httpStatus === 404) {
      /** Same as **`useKeypairStatus`**: treat as empty directory so bootstrap can **`POST /users/me/devices`** (re-register). */
      deviceList = { items: [] };
    } else {
      throw e;
    }
  }

  if (versions.length > 0) {
    const maxV = Math.max(...versions);
    const localSpkiRaw = await getKeyringPublicSpkiOptional(userId, maxV);
    const localSpki = localSpkiRaw?.trim() ?? '';
    if (!localSpki) {
      throw new Error(
        'Your device has keyring data but no public key metadata. Restore from a backup.',
      );
    }

    const storedDeviceId = await getStoredDeviceId(userId);
    const entry =
      storedDeviceId != null
        ? deviceList.items.find((i) => i.deviceId === storedDeviceId)
        : undefined;

    const mustRegister = storedDeviceId == null || entry == null;

    if (mustRegister) {
      const body =
        storedDeviceId != null
          ? { publicKey: localSpki, deviceId: storedDeviceId }
          : { publicKey: localSpki, deviceId: DEFAULT_SINGLE_DEVICE_ID };

      const result = await dispatch(registerDevice(body)).unwrap();
      await setStoredDeviceId(userId, result.deviceId);
      dispatch(
        setPublicKeyMeta({
          keyVersion: maxV,
          updatedAt: result.updatedAt,
          publicKey: result.publicKey,
          deviceId: result.deviceId,
        }),
      );
      await evaluateDeviceSyncBootstrapState(dispatch, result.deviceId, {
        getState: () => store.getState().crypto,
      });
      await upgradeAccessTokenWithDeviceBinding(dispatch, result.deviceId);
      return;
    }

    const a = localSpki;
    const b = entry!.publicKey.trim();
    if (a !== b) {
      throw new Error(
        'Your local encryption key does not match the server. Restore from a backup on this device.',
      );
    }

    dispatch(
      setPublicKeyMeta({
        keyVersion: maxV,
        updatedAt: entry!.updatedAt,
        publicKey: entry!.publicKey,
        deviceId: storedDeviceId!,
      }),
    );
    await evaluateDeviceSyncBootstrapState(dispatch, storedDeviceId!, {
      getState: () => store.getState().crypto,
    });
    await upgradeAccessTokenWithDeviceBinding(dispatch, storedDeviceId!);
    return;
  }

  const persistedTrim = persistedDeviceId?.trim() ?? '';
  const serverDeviceIds = new Set(
    deviceList.items.map((i) => i.deviceId.trim()),
  );
  const localDeviceMatchesServer =
    persistedTrim.length > 0 && serverDeviceIds.has(persistedTrim);

  if (deviceList.items.length > 0 && localDeviceMatchesServer) {
    throw new Error(
      'An encryption key is registered for this account, but this browser has no key material. Restore from a backup.',
    );
  }

  const pair = await generateP256EcdhKeyPair();
  const publicKeyB64 = await exportPublicKeySpkiBase64(pair.publicKey);
  const clientDeviceId = crypto.randomUUID();
  dispatch(hydrateMessagingDeviceId(clientDeviceId));
  const result = await dispatch(
    registerDevice({ publicKey: publicKeyB64, deviceId: clientDeviceId }),
  ).unwrap();

  await setStoredDeviceId(userId, result.deviceId);
  const pkcs8B64 = await exportPrivateKeyPkcs8Base64(pair.privateKey);
  const pkcs8 = base64ToArrayBuffer(pkcs8B64);
  await storeKeyringPrivateKeyPkcs8(userId, result.keyVersion, pkcs8, passphrase, {
    publicKeySpkiB64: result.publicKey,
  });
  await evaluateDeviceSyncBootstrapState(dispatch, result.deviceId, {
    getState: () => store.getState().crypto,
  });
  await upgradeAccessTokenWithDeviceBinding(dispatch, result.deviceId);
}
