import { useCallback, useEffect, useState } from 'react';
import type { components } from '../../generated/api-types';
import { listMyDevices, listUserDevicePublicKeys } from '../api/usersApi';
import {
  getKeyringPublicSpkiOptional,
  getStoredDeviceId,
  hasStoredPrivateKey,
  listKeyringVersions,
} from '../crypto/privateKeyStorage';
import { parseApiError } from '../../modules/auth/utils/apiError';
import { selectMessagingDeviceId } from '../../modules/crypto/stores/selectors';
import { useAppSelector } from '../../store/hooks';
import { useAuth } from './useAuth';

type DevicePublicKeyEntry = components['schemas']['DevicePublicKeyEntry'];

/** How this browser’s stored material lines up with the server device directory. */
export type KeypairAlignment =
  | 'loading'
  | 'no_session'
  | 'server_unreachable'
  | 'none'
  | 'no_local'
  | 'orphan_local'
  | 'aligned'
  | 'mismatch'
  | 'unknown_meta'
  | 'no_device_id';

async function computeAlignment(
  userId: string,
  localPresent: boolean,
  storedDeviceId: string | null,
  serverDevice: DevicePublicKeyEntry | null,
  anyServerDevices: boolean,
): Promise<KeypairAlignment> {
  if (!localPresent && !anyServerDevices) {
    return 'none';
  }
  if (anyServerDevices && !localPresent) {
    return 'no_local';
  }
  if (localPresent && !anyServerDevices) {
    return 'orphan_local';
  }
  if (localPresent && !storedDeviceId) {
    return 'no_device_id';
  }
  if (localPresent && storedDeviceId && !serverDevice) {
    return 'orphan_local';
  }
  if (!serverDevice) {
    return 'unknown_meta';
  }

  const versions = await listKeyringVersions(userId);
  if (versions.length > 0) {
    const max = Math.max(...versions);
    const localSpki = await getKeyringPublicSpkiOptional(userId, max);
    if (!localSpki) {
      return 'unknown_meta';
    }
    const a = localSpki.trim();
    const b = serverDevice.publicKey.trim();
    return a === b ? 'aligned' : 'mismatch';
  }

  if (localPresent) {
    return 'unknown_meta';
  }
  return 'none';
}

/**
 * Loads the signed-in user’s **device** rows (**`GET /users/me/devices`**) and **public-key directory**
 * (**`GET /users/me/devices/public-keys`**) and compares with local **`deviceId`**: **IndexedDB** first, then
 * Redux **`hydrateMessagingDeviceId`** (session bootstrap) if IDB is empty. **Registration** requires the id in
 * **both** lists so “present + registered on server” is explicit.
 */
export function useKeypairStatus(): {
  loading: boolean;
  alignment: KeypairAlignment;
  /** Server row for **`storedDeviceId`**, when that device is listed (**public-keys** response). */
  serverDevice: DevicePublicKeyEntry | null;
  /** Effective **deviceId**: IndexedDB **`deviceIdentity`**, else Redux **`crypto.deviceId`**. */
  storedDeviceId: string | null;
  /** True when **`storedDeviceId`** is set and appears in **`GET /users/me/devices`** and **`…/public-keys`**. */
  deviceRegisteredOnServer: boolean;
  serverError: string | null;
  localKeyPresent: boolean;
  refresh: () => Promise<void>;
} {
  const { user, isAuthenticated } = useAuth();
  const reduxDeviceId = useAppSelector(selectMessagingDeviceId);
  const [loading, setLoading] = useState(true);
  const [alignment, setAlignment] = useState<KeypairAlignment>('loading');
  const [serverDevice, setServerDevice] = useState<DevicePublicKeyEntry | null>(
    null,
  );
  const [storedDeviceId, setStoredDeviceId] = useState<string | null>(null);
  const [deviceRegisteredOnServer, setDeviceRegisteredOnServer] =
    useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [localKeyPresent, setLocalKeyPresent] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setLoading(false);
      setAlignment('no_session');
      setServerDevice(null);
      setStoredDeviceId(null);
      setDeviceRegisteredOnServer(false);
      setServerError(null);
      setLocalKeyPresent(false);
      return;
    }
    const uid = user.id;
    setLoading(true);
    setAlignment('loading');
    setServerError(null);
    try {
      const local = await hasStoredPrivateKey(uid);
      const idbDeviceId = await getStoredDeviceId(uid);
      const devId =
        idbDeviceId?.trim() ||
        reduxDeviceId?.trim() ||
        null;
      setLocalKeyPresent(local);
      setStoredDeviceId(devId);

      let keysList: Awaited<ReturnType<typeof listUserDevicePublicKeys>>;
      try {
        keysList = await listUserDevicePublicKeys('me');
      } catch (e) {
        const p = parseApiError(e);
        if (p.httpStatus === 404) {
          keysList = { items: [] };
        } else {
          throw e;
        }
      }

      let devicesList: Awaited<ReturnType<typeof listMyDevices>>;
      try {
        devicesList = await listMyDevices();
      } catch (e) {
        const p = parseApiError(e);
        if (p.httpStatus === 404) {
          devicesList = { items: [] };
        } else {
          throw e;
        }
      }

      const anyServerDevices = devicesList.items.length > 0;
      const entry =
        devId != null
          ? keysList.items.find((i) => i.deviceId === devId) ?? null
          : null;
      const onDeviceRegistry =
        devId != null
          ? devicesList.items.some((i) => i.deviceId === devId)
          : false;
      const registered = Boolean(devId && entry && onDeviceRegistry);
      setServerDevice(entry);
      setDeviceRegisteredOnServer(registered);

      setAlignment(
        await computeAlignment(uid, local, devId, entry, anyServerDevices),
      );
    } catch (e) {
      setServerError(parseApiError(e).message);
      setServerDevice(null);
      setDeviceRegisteredOnServer(false);
      setAlignment('server_unreachable');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, reduxDeviceId, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    alignment,
    serverDevice,
    storedDeviceId,
    deviceRegisteredOnServer,
    serverError,
    localKeyPresent,
    refresh,
  };
}
