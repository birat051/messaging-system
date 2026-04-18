import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import { MongoServerError } from 'mongodb';
import { getDb } from '../../data/db/mongo.js';
import { hashPassword } from './password.js';
import { escapeRegexLiteral } from '../../utils/escapeRegexLiteral.js';
import {
  USERS_COLLECTION,
  type UserDocument,
} from './users.collection.js';
import { normalizeUsername } from './username.js';

export type CreateUserInput = {
  email: string;
  password: string;
  /** Normalized unique handle — required for new registrations. */
  username: string;
  displayName?: string | null;
  profilePicture?: string | null;
  status?: string | null;
  emailVerified?: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Legacy BSON may omit **`profilePicture`** / **`status`** — align with **`User`** / **`UserPublic`** (nullable). */
export function normalizeUserDocument(doc: UserDocument | null): UserDocument | null {
  if (!doc) {
    return null;
  }
  return {
    ...doc,
    profilePicture: doc.profilePicture ?? null,
    status: doc.status ?? null,
    username: doc.username,
  };
}

/**
 * Insert a new user — **`email`** is normalized (lowercase); **`password`** is Argon2-hashed.
 */
export async function createUser(
  input: CreateUserInput,
): Promise<UserDocument> {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const now = new Date();
  const passwordHash = await hashPassword(input.password);

  const doc: UserDocument = {
    id: randomUUID(),
    email,
    username,
    passwordHash,
    displayName: input.displayName ?? null,
    profilePicture: input.profilePicture ?? null,
    status: input.status ?? null,
    emailVerified: input.emailVerified ?? false,
    refreshTokenVersion: 0,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await getDb().collection<UserDocument>(USERS_COLLECTION).insertOne(doc);
  } catch (err: unknown) {
    if (err instanceof MongoServerError && err.code === 11000) {
      const kp = err.keyPattern as Record<string, unknown> | undefined;
      if (kp && 'username' in kp) {
        throw new DuplicateUsernameError(username);
      }
      if (kp && 'email' in kp) {
        throw new DuplicateEmailError(email);
      }
      throw err;
    }
    throw err;
  }
  return doc;
}

export class DuplicateEmailError extends Error {
  constructor(public readonly email: string) {
    super('Duplicate email');
    this.name = 'DuplicateEmailError';
  }
}

export class DuplicateUsernameError extends Error {
  constructor(public readonly username: string) {
    super('Duplicate username');
    this.name = 'DuplicateUsernameError';
  }
}

export type CreateGuestUserInput = {
  username: string;
  displayName?: string | null;
};

/**
 * Inserts a **guest** row — **no** **`email`** field (sparse unique index allows many guests).
 * **`passwordHash`** is an unusable Argon2 hash (guests never password-login).
 */
export async function createGuestUser(
  input: CreateGuestUserInput,
  options: { guestDataExpiresAt?: Date },
): Promise<UserDocument> {
  const username = normalizeUsername(input.username);
  const now = new Date();
  const passwordHash = await hashPassword(randomUUID());
  const displayTrim =
    input.displayName !== undefined && input.displayName !== null
      ? String(input.displayName).trim()
      : '';
  const doc: UserDocument = {
    id: randomUUID(),
    username,
    passwordHash,
    displayName: displayTrim.length > 0 ? displayTrim : null,
    profilePicture: null,
    status: null,
    emailVerified: true,
    isGuest: true,
    refreshTokenVersion: 0,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (options.guestDataExpiresAt !== undefined) {
    doc.guestDataExpiresAt = options.guestDataExpiresAt;
  }

  try {
    await getDb().collection<UserDocument>(USERS_COLLECTION).insertOne(doc);
  } catch (err: unknown) {
    if (err instanceof MongoServerError && err.code === 11000) {
      const kp = err.keyPattern as Record<string, unknown> | undefined;
      if (kp && 'username' in kp) {
        throw new DuplicateUsernameError(username);
      }
      throw err;
    }
    throw err;
  }
  return doc;
}

export async function findUserByEmail(
  email: string,
): Promise<UserDocument | null> {
  const normalized = normalizeEmail(email);
  const found = await getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .findOne({ email: normalized });
  return normalizeUserDocument(found);
}

/**
 * Fields needed for **`GET /users/search`** — **`passwordHash`** is never read (projection).
 */
export type UserSearchRow = Pick<
  UserDocument,
  'id' | 'email' | 'username' | 'displayName' | 'profilePicture' | 'isGuest'
>;

/**
 * **Access pattern:** case-insensitive **substring** match on **`email`** or **`username`** via escaped regex.
 * The unique index on **`email`** supports **equality** lookups; arbitrary substrings may scan up to
 * **`maxCandidates`** documents — bounded by **`limit`** scaling + hard cap in **`search.ts`**, plus
 * per-IP Redis rate limiting on the route (**`docs/PROJECT_PLAN.md` §14.2**).
 */
export async function findUsersBySearchSubstringMatch(params: {
  normalizedNeedle: string;
  excludeUserId: string;
  maxCandidates: number;
  /** When **`true`**, only users with **`isGuest: true`** (guest sandbox). Used for **`GET /users/search`** when the caller is a guest. */
  guestDirectoryOnly?: boolean;
}): Promise<UserSearchRow[]> {
  const escaped = escapeRegexLiteral(params.normalizedNeedle);
  const regex = new RegExp(escaped, 'i');
  const filter: Filter<UserDocument> = {
    id: { $ne: params.excludeUserId },
    $or: [
      { email: { $regex: regex } },
      { username: { $regex: regex } },
    ],
  };
  if (params.guestDirectoryOnly === true) {
    filter.isGuest = true;
  }
  const docs = await getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .find(filter, { projection: { passwordHash: 0 } })
    .limit(params.maxCandidates)
    .toArray();

  return docs.map((d) => ({
    id: d.id,
    email: d.email,
    username: d.username,
    displayName: d.displayName,
    profilePicture: d.profilePicture ?? null,
    isGuest: d.isGuest,
  }));
}

export async function findUserById(id: string): Promise<UserDocument | null> {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const found = await getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .findOne({ id: trimmed });
  return normalizeUserDocument(found);
}

export type UpdateUserProfilePatch = {
  profilePicture?: string | null;
  status?: string | null;
  displayName?: string | null;
};

/**
 * Partial update — only keys present in **`patch`** are written (plus **`updatedAt`**).
 */
export async function updateUserProfile(
  userId: string,
  patch: UpdateUserProfilePatch,
): Promise<UserDocument | null> {
  const col = getDb().collection<UserDocument>(USERS_COLLECTION);
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.profilePicture !== undefined) {
    $set.profilePicture = patch.profilePicture;
  }
  if (patch.status !== undefined) {
    $set.status = patch.status;
  }
  if (patch.displayName !== undefined) {
    $set.displayName = patch.displayName;
  }
  const keys = Object.keys($set).filter((k) => k !== 'updatedAt');
  if (keys.length === 0) {
    return findUserById(userId);
  }
  const result = await col.updateOne({ id: userId }, { $set });
  if (result.matchedCount === 0) {
    return null;
  }
  return findUserById(userId);
}

export async function setUserEmailVerified(
  userId: string,
  verified: boolean,
): Promise<boolean> {
  const now = new Date();
  const result = await getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .updateOne(
      { id: userId },
      { $set: { emailVerified: verified, updatedAt: now } },
    );
  return result.matchedCount > 0;
}

/**
 * Sets a new password hash and bumps **`refreshTokenVersion`** so all refresh tokens are revoked.
 */
export async function setUserPasswordAndBumpVersion(
  userId: string,
  newPlainPassword: string,
): Promise<boolean> {
  const now = new Date();
  const passwordHash = await hashPassword(newPlainPassword);
  const result = await getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .updateOne(
      { id: userId },
      {
        $set: {
          passwordHash,
          updatedAt: now,
        },
        $inc: { refreshTokenVersion: 1 },
      },
    );
  return result.matchedCount > 0;
}
