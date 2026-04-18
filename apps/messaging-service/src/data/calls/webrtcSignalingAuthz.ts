import { AppError } from '../../utils/errors/AppError.js';
import { assertGuestGuestDirectMessagingAllowed } from '../messages/guestMessagingAuthz.js';
import { findUserById } from '../users/repo.js';

/**
 * **1:1 WebRTC signaling:** only peers who may exchange direct messages (same **guest ↔ guest** /
 * **registered ↔ registered** rule as **`message:send`** — **`guestMessagingAuthz.ts`**).
 */
export async function assertWebRtcSignalingPeerAllowed(
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const from = fromUserId.trim();
  const to = toUserId.trim();
  if (!from || !to) {
    throw new AppError('INVALID_REQUEST', 400, 'fromUserId and toUserId required');
  }
  if (from === to) {
    throw new AppError('INVALID_REQUEST', 400, 'Cannot signal yourself');
  }

  const [fromUser, toUser] = await Promise.all([
    findUserById(from),
    findUserById(to),
  ]);
  if (!fromUser) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  if (!toUser) {
    throw new AppError('NOT_FOUND', 404, 'Peer not found');
  }

  assertGuestGuestDirectMessagingAllowed(fromUser, toUser);
}
