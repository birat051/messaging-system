import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getDb } from '../../data/db/mongo.js';
import { hashPassword } from './password.js';
import {
  USERS_COLLECTION,
  type UserDocument,
} from './users.collection.js';

export type CreateUserInput = {
  email: string;
  password: string;
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
  };
}

/**
 * Insert a new user — **`email`** is normalized (lowercase); **`password`** is Argon2-hashed.
 */
export async function createUser(
  input: CreateUserInput,
): Promise<UserDocument> {
  const email = normalizeEmail(input.email);
  const now = new Date();
  const passwordHash = await hashPassword(input.password);

  const doc: UserDocument = {
    id: randomUUID(),
    email,
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
      throw new DuplicateEmailError(email);
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

export async function findUserByEmail(
  email: string,
): Promise<UserDocument | null> {
  const normalized = normalizeEmail(email);
  const found = await getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .findOne({ email: normalized });
  return normalizeUserDocument(found);
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
