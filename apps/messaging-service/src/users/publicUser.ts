import type { UserApiShape, UserDocument } from './types.js';

/** Map a stored user to OpenAPI `User` (no secrets). */
export function toUserApiShape(doc: UserDocument): UserApiShape {
  return {
    id: doc.id,
    email: doc.email,
    displayName: doc.displayName,
    emailVerified: doc.emailVerified,
    profilePicture: doc.profilePicture,
    status: doc.status,
  };
}
