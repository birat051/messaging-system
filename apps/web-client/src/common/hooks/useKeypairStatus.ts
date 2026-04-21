import { useCallback, useEffect, useState } from 'react';
import type { components } from '../../generated/api-types';
import { listUserDevicePublicKeys } from '../api/usersApi';
import {
  getKeyringPublicSpkiOptional,
  getStoredDeviceId,
  hasStoredPrivateKey,
  listKeyringVersions,
} from '../crypto/privateKeyStorage';
import { parseApiError } from '../../modules/auth/utils/apiError';
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
 * Loads the signed-in user’s **device** keys (**`GET /users/me/devices/public-keys`**) and compares with
 * locally stored **`deviceId`** (IndexedDB) plus **SPKI** metadata on the active keyring version.
 */
export function useKeypairStatus(): {
  loading: boolean;
  alignment: KeypairAlignment;
  /** Server row for **`storedDeviceId`**, when that device is listed. */
  serverDevice: DevicePublicKeyEntry | null;
  /** Opaque id persisted next to the keyring (**IndexedDB**). */
  storedDeviceId: string | null;
  /** True when **`storedDeviceId`** is set and appears in the server list. */
  deviceRegisteredOnServer: boolean;
  serverError: string | null;
  localKeyPresent: boolean;
  refresh: () => Promise<void>;
} {
  const { user, isAuthenticated } = useAuth();
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
      const devId = await getStoredDeviceId(uid);
      setLocalKeyPresent(local);
      setStoredDeviceId(devId);

      let list: Awaited<ReturnType<typeof listUserDevicePublicKeys>>;
      try {
        list = await listUserDevicePublicKeys('me');
      } catch (e) {
        const p = parseApiError(e);
        if (p.httpStatus === 404) {
          list = { items: [] };
        } else {
          throw e;
        }
      }

      const anyServerDevices = list.items.length > 0;
      const entry =
        devId != null
          ? list.items.find((i) => i.deviceId === devId) ?? null
          : null;
      const registered = Boolean(devId && entry);
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
  }, [isAuthenticated, user?.id]);

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
