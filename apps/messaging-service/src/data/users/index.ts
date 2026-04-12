export {
  USERS_COLLECTION,
  ensureUserIndexes,
  ensureUserProfileFieldsBackfill,
} from './users.collection.js';
export type { UserDocument } from './users.collection.js';
export { hashPassword, verifyPassword } from './password.js';
export { toUserApiShape, toUserPublicShape } from './publicUser.js';
export {
  createUser,
  findUserByEmail,
  findUserById,
  normalizeUserDocument,
} from './repo.js';
export type { CreateUserInput } from './repo.js';
export type { UserApiShape, UserPublicApiShape } from './users.types.js';
