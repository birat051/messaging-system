import { useCallback, useEffect, useState } from 'react';
import type { components } from '../../generated/api-types';
import { getUserPublicKeyById } from '../api/usersApi';
import {
  getKeyringPublicSpkiOptional,
  hasStoredPrivateKey,
  listKeyringVersions,
} from '../crypto/privateKeyStorage';
import { parseApiError } from '../../modules/auth/utils/apiError';
import { useAuth } from './useAuth';

type UserPublicKeyResponse = components['schemas']['UserPublicKeyResponse'];

/** How this browser’s stored material lines up with the server directory key. */
export type KeypairAlignment =
  | 'loading'
  | 'no_session'
  | 'server_unreachable'
  | 'none'
  | 'no_local'
  | 'orphan_local'
  | 'aligned'
  | 'mismatch'
  | 'unknown_meta';

async function computeAlignment(
  userId: string,
  serverKey: UserPublicKeyResponse | null,
  localPresent: boolean,
): Promise<KeypairAlignment> {
  if (!serverKey && !localPresent) {
    return 'none';
  }
  if (serverKey && !localPresent) {
    return 'no_local';
  }
  if (!serverKey && localPresent) {
    return 'orphan_local';
  }
  if (!serverKey) {
    return 'none';
  }

  const versions = await listKeyringVersions(userId);
  if (versions.length > 0) {
    const max = Math.max(...versions);
    const localSpki = await getKeyringPublicSpkiOptional(userId, max);
    if (!localSpki) {
      return 'unknown_meta';
    }
    const a = localSpki.trim();
    const b = serverKey.publicKey.trim();
    return a === b ? 'aligned' : 'mismatch';
  }

  if (localPresent) {
    return 'unknown_meta';
  }
  return 'none';
}

/**
 * Loads the **signed-in user’s** server **user-level** public key (**GET `/users/{id}/public-key`**) and
 * compares with locally stored **SPKI** metadata (see **`storeKeyringPrivateKeyPkcs8`**).
 * For **peers’** keys before send, use **`prefetchRecipientPublicKey`** / **`fetchRecipientPublicKeyForMessaging`** — not this hook.
 */
export function useKeypairStatus(): {
  loading: boolean;
  alignment: KeypairAlignment;
  serverKey: UserPublicKeyResponse | null;
  serverError: string | null;
  localKeyPresent: boolean;
  refresh: () => Promise<void>;
} {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [alignment, setAlignment] = useState<KeypairAlignment>('loading');
  const [serverKey, setServerKey] = useState<UserPublicKeyResponse | null>(
    null,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [localKeyPresent, setLocalKeyPresent] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setLoading(false);
      setAlignment('no_session');
      setServerKey(null);
      setServerError(null);
      setLocalKeyPresent(false);
      return;
    }
    setLoading(true);
    setAlignment('loading');
    setServerError(null);
    try {
      const local = await hasStoredPrivateKey(user.id);
      setLocalKeyPresent(local);

      let sk: UserPublicKeyResponse | null = null;
      try {
        sk = await getUserPublicKeyById(user.id);
      } catch (e) {
        const p = parseApiError(e);
        if (p.httpStatus === 404) {
          sk = null;
        } else {
          throw e;
        }
      }
      setServerKey(sk);
      setAlignment(await computeAlignment(user.id, sk, local));
    } catch (e) {
      setServerError(parseApiError(e).message);
      setServerKey(null);
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
    serverKey,
    serverError,
    localKeyPresent,
    refresh,
  };
}
