import { useCallback, useState } from 'react';
import { getToastBridge } from '@/common/components/toast/toastBridge';
import { refreshTokens } from '@/common/api/authApi';
import {
  listMyDevices,
  listMySyncMessageKeys,
  postBatchSyncMessageKeys,
} from '@/common/api/usersApi';
import { loadMessagingEcdhPrivateKey } from '@/common/crypto/loadMessagingEcdhPrivateKey';
import { unwrapMessageKey, wrapMessageKey } from '@/common/crypto/messageKeyCrypto';
import type { DeviceSyncRequestedPayload } from '@/common/realtime/socketWorkerProtocol';
import { applyAuthResponse } from '@/modules/auth/utils/applyAuthResponse';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { readRefreshToken } from '@/modules/auth/utils/authStorage';
import { syncCompleted } from '@/modules/crypto/stores/cryptoSlice';
import type { User } from '@/modules/auth/stores/authSlice';
import type { AppDispatch } from '@/store/store';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { resolveDeviceKeySyncPageLimit } from '@/modules/crypto/deviceKeySyncLimits';

/**
 * Trusted-device path: **`newDeviceId`** / **`newDevicePublicKey`** from the Socket.IO payload must match a row from
 * **`GET /users/me/devices`** before any crypto. Then unwrap each **`encryptedMessageKeys[sourceDeviceId]`** with this
 * device’s private key, re-wrap for the new device’s SPKI, **`POST /users/me/sync/message-keys`**. The long-term private
 * key never leaves the client — only per-message wrapped key strings are uploaded.
 */
export async function executeApproveDeviceKeySync(params: {
  dispatch: AppDispatch;
  authUser: User;
  sourceDeviceId: string;
  payload: DeviceSyncRequestedPayload;
  /** Optional page size for **`GET /users/me/sync/message-keys`** (default **100**, max **100**). */
  syncMessageKeysPageLimit?: number;
}): Promise<void> {
  const userId = params.authUser.id.trim();
  const sourceDeviceId = params.sourceDeviceId.trim();
  const newDeviceId = params.payload.newDeviceId.trim();
  const newDevicePublicKey = params.payload.newDevicePublicKey.trim();
  const pageLimit = resolveDeviceKeySyncPageLimit({
    override: params.syncMessageKeysPageLimit,
  });

  if (!userId || !sourceDeviceId || !newDeviceId || !newDevicePublicKey) {
    throw new Error('Missing device or user context for sync.');
  }

  const devices = await listMyDevices();
  const row = devices.items.find(
    (i) =>
      i.deviceId.trim() === newDeviceId &&
      i.publicKey.trim() === newDevicePublicKey,
  );
  if (!row) {
    throw new Error(
      'This new device is not listed on your account yet, or its public key does not match GET /users/me/devices. Wait a moment and try again.',
    );
  }

  const privateKey = await loadMessagingEcdhPrivateKey(userId);
  if (!privateKey) {
    throw new Error(
      'Your encryption private key is not available on this device. You cannot approve sync here.',
    );
  }

  const refreshToken = readRefreshToken();
  if (!refreshToken?.trim()) {
    throw new Error('Your session has expired. Sign in again to approve sync.');
  }

  const refreshed = await refreshTokens({
    refreshToken: refreshToken.trim(),
    sourceDeviceId,
  });
  applyAuthResponse(
    params.dispatch,
    refreshed,
    params.authUser,
    'crypto.deviceKeySync.approveSync',
  );

  let afterMessageId: string | undefined;
  let totalPosted = 0;

  for (;;) {
    const page = await listMySyncMessageKeys({
      deviceId: sourceDeviceId,
      afterMessageId,
      limit: pageLimit,
    });

    if (page.items.length === 0) {
      break;
    }

    const keys: { messageId: string; encryptedMessageKey: string }[] = [];
    for (const entry of page.items) {
      const messageKey = await unwrapMessageKey(entry.encryptedMessageKey, privateKey);
      const newEncryptedKey = await wrapMessageKey(messageKey, newDevicePublicKey);
      keys.push({ messageId: entry.messageId, encryptedMessageKey: newEncryptedKey });
    }

    const res = await postBatchSyncMessageKeys({
      targetDeviceId: newDeviceId,
      keys,
    });
    totalPosted += res.applied;

    if (!page.hasMore) {
      break;
    }
    const next = page.nextAfterMessageId?.trim();
    if (!next) {
      break;
    }
    afterMessageId = next;
  }

  params.dispatch(syncCompleted({ newDeviceId }));

  const toast = getToastBridge();
  if (totalPosted > 0) {
    toast?.success('Encrypted message keys were synced to your new device.');
  } else {
    toast?.success(
      'Sync finished. There were no older messages to copy keys for; your new device can still use new messages.',
    );
  }
}

export function useDeviceKeySync() {
  const dispatch = useAppDispatch();
  const authUser = useAppSelector((s) => s.auth.user);
  const sourceDeviceId = useAppSelector((s) => s.crypto.deviceId);
  const [isApproving, setIsApproving] = useState(false);

  const approveDeviceKeySync = useCallback(
    async (payload: DeviceSyncRequestedPayload) => {
      if (!authUser?.id?.trim()) {
        getToastBridge()?.warning('You must be signed in to approve sync.');
        return;
      }
      if (!sourceDeviceId?.trim()) {
        getToastBridge()?.warning('This session has no registered device id yet.');
        return;
      }
      setIsApproving(true);
      try {
        await executeApproveDeviceKeySync({
          dispatch,
          authUser,
          sourceDeviceId: sourceDeviceId.trim(),
          payload,
        });
      } catch (e) {
        getToastBridge()?.error(parseApiError(e).message);
      } finally {
        setIsApproving(false);
      }
    },
    [authUser, dispatch, sourceDeviceId],
  );

  return { approveDeviceKeySync, isApproving };
}
