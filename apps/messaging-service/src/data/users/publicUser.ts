import type { UserDocument } from './users.collection.js';
import type { UserApiShape, UserPublicApiShape } from './users.types.js';

/** Map a stored user to OpenAPI `User` (no secrets). */
export function toUserApiShape(doc: UserDocument): UserApiShape {
  return {
    id: doc.id,
    email: doc.email,
    displayName: doc.displayName,
    emailVerified: doc.emailVerified,
    profilePicture: doc.profilePicture ?? null,
    status: doc.status ?? null,
  };
}

/** Map a stored user to OpenAPI `UserPublic` (no email). */
export function toUserPublicShape(doc: UserDocument): UserPublicApiShape {
  return {
    id: doc.id,
    displayName: doc.displayName,
    profilePicture: doc.profilePicture ?? null,
    status: doc.status ?? null,
  };
}
