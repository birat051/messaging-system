export { USERS_COLLECTION } from './constants.js';
export { ensureUserIndexes } from './ensureIndexes.js';
export { hashPassword, verifyPassword } from './password.js';
export { toUserApiShape, toUserPublicShape } from './publicUser.js';
export {
  createUser,
  findUserByEmail,
  findUserById,
  normalizeUserDocument,
} from './repo.js';
export type { CreateUserInput } from './repo.js';
export type { UserApiShape, UserDocument, UserPublicApiShape } from './types.js';
