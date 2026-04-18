import type { UserDocument } from '../users/users.collection.js';
import { AppError } from '../../utils/errors/AppError.js';

/**
 * **Feature 2a:** direct 1:1 sends are allowed only between two **guests** or two **registered** users —
 * never across guest ↔ registered (**REST** **`POST /messages`**, Socket.IO **`message:send`**, **`sendMessageForUser`**).
 */
export function assertGuestGuestDirectMessagingAllowed(
  sender: UserDocument,
  recipient: UserDocument,
): void {
  const senderGuest = sender.isGuest === true;
  const recipientGuest = recipient.isGuest === true;
  if (senderGuest === recipientGuest) {
    return;
  }
  throw new AppError(
    'GUEST_MESSAGING_FORBIDDEN',
    403,
    senderGuest
      ? 'Guests can only message other guests'
      : 'Registered users cannot message guest accounts',
  );
}
