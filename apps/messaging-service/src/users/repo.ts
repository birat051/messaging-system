import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { USERS_COLLECTION } from './constants.js';
import { hashPassword } from './password.js';
import type { UserDocument } from './types.js';

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
  return getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .findOne({ email: normalized });
}

export async function findUserById(id: string): Promise<UserDocument | null> {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return getDb()
    .collection<UserDocument>(USERS_COLLECTION)
    .findOne({ id: trimmed });
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
