import type { ObjectId } from 'mongodb';

/**
 * Persisted user document — **never** return `passwordHash` on REST/WebSocket.
 * `id` is the stable string id exposed as **`User.id`** in OpenAPI.
 */
export type UserDocument = {
  _id?: ObjectId;
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  profilePicture: string | null;
  status: string | null;
  emailVerified: boolean;
  /** Increment to invalidate all refresh tokens (e.g. password change). */
  refreshTokenVersion?: number;
  /** Durable last-seen (also hot path in Redis while online). */
  lastSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** OpenAPI `User` — safe for clients (no password fields). */
export type UserApiShape = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  profilePicture: string | null;
  status: string | null;
};
