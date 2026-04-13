import { z } from 'zod';
import { DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH } from '../config/userSearchPolicy.js';
import { limitQuerySchema } from './limitQuery.js';
import { parseP256SpkiPublicKeyOrThrow } from './publicKeyP256.js';

/** MIME allowlist for `POST /v1/media/upload` — keep in sync with OpenAPI description and `routes/media.ts`. */
export const MEDIA_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
] as const;

export type MediaUploadMimeType = (typeof MEDIA_UPLOAD_MIME_TYPES)[number];

export const mediaUploadMimeEnum = z.enum(MEDIA_UPLOAD_MIME_TYPES);

/** Normalized unique login handle — **`[a-z0-9_]`**, 3–30 chars (stored lowercase). */
export const registerUsernameSchema = z
  .string()
  .min(1)
  .transform((s) => s.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'username must be at least 3 characters')
      .max(30, 'username must be at most 30 characters')
      .regex(
        /^[a-z0-9_]+$/,
        'username must contain only lowercase letters, digits, and underscores',
      ),
  );

/** `components/schemas/RegisterRequest` */
export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: registerUsernameSchema,
  displayName: z.string().trim().min(1).max(200),
  profilePicture: z.union([z.string().url(), z.null()]).optional(),
  status: z.union([z.string().max(280), z.null()]).optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** `components/schemas/LoginRequest` */
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** `components/schemas/RefreshRequest` */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

/** `POST /auth/logout` */
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

/** `POST /auth/forgot-password` */
export const forgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});

/** `POST /auth/reset-password` */
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

/** `POST /auth/verify-email` */
export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1),
});

/** `POST /auth/resend-verification` */
export const resendVerificationRequestSchema = z.object({
  email: z.string().email(),
});

/**
 * `components/schemas/SendMessageRequest` — mutual exclusion per OpenAPI narrative:
 * new direct thread uses `recipientUserId` only; existing/group thread uses `conversationId` only.
 */
export const sendMessageRequestSchema = z
  .object({
    conversationId: z.union([z.string().min(1), z.null()]).optional(),
    recipientUserId: z.union([z.string().min(1), z.null()]).optional(),
    body: z.string().optional(),
    mediaKey: z.union([z.string().min(1), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    const conv =
      data.conversationId === undefined || data.conversationId === null
        ? ''
        : String(data.conversationId).trim();
    const recip =
      data.recipientUserId === undefined || data.recipientUserId === null
        ? ''
        : String(data.recipientUserId).trim();

    const hasConv = conv.length > 0;
    const hasRecip = recip.length > 0;

    if (!hasConv && !hasRecip) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either conversationId (existing or group thread) or recipientUserId (new direct thread)',
        path: ['conversationId'],
      });
    }
    if (hasConv && hasRecip) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Omit recipientUserId when conversationId is set',
        path: ['recipientUserId'],
      });
    }

    const bodyHas =
      data.body !== undefined &&
      data.body !== null &&
      String(data.body).trim().length > 0;
    const mediaHas =
      data.mediaKey !== undefined &&
      data.mediaKey !== null &&
      String(data.mediaKey).trim().length > 0;
    if (!bodyHas && !mediaHas) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide body text and/or mediaKey',
        path: ['body'],
      });
    }
  });

/** `components/schemas/CreateGroupRequest` */
export const createGroupRequestSchema = z.object({
  name: z.string().min(1),
  memberIds: z.array(z.string().min(1)).optional(),
});

/** `components/parameters/LimitQuery` + `CursorQuery` — use **`resolveListLimit`** on **`limit`**. */
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: limitQuerySchema,
});

/**
 * **`GET /users/search`** — provide **`q`** or legacy **`email`** (trimmed + lowercased); **partial** match on
 * stored **email** and **username**. Minimum length is configurable via **`USER_SEARCH_MIN_QUERY_LENGTH`**
 * (default **3** in **`userSearchPolicy.ts`**).
 */
export function createSearchUsersQuerySchema(minQueryLength: number) {
  const minLen = Math.min(Math.max(minQueryLength, 2), 254);
  return z
    .object({
      q: z.string().optional(),
      email: z.string().optional(),
      limit: limitQuerySchema,
    })
    .superRefine((data, ctx) => {
      const merged = (data.q ?? data.email ?? '').trim();
      if (merged.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide q or email query parameter',
          path: ['q'],
        });
        return;
      }
      const lower = merged.toLowerCase();
      if (lower.length < minLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `search query must be at least ${minLen} characters`,
          path: ['q'],
        });
        return;
      }
      if (lower.length > 254) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'search query must be at most 254 characters',
          path: ['q'],
        });
        return;
      }
      if (!/^[a-z0-9@._+_-]+$/.test(lower)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'search query contains invalid characters',
          path: ['q'],
        });
      }
    })
    .transform((data) => ({
      q: (data.q ?? data.email ?? '').trim().toLowerCase(),
      limit: data.limit,
    }));
}

/** Default schema — keep **`DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH`** in sync with **`env.ts`** default. */
export const searchUsersQuerySchema = createSearchUsersQuerySchema(
  DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH,
);

/** Path: `components/parameters/UserIdPath` */
export const userIdPathSchema = z.object({
  userId: z.string().min(1),
});

/**
 * **`publicKey`:** Base64 (or Base64url) **SPKI** DER for **P-256** — validated with **`node:crypto`**
 * (rejects wrong curves, RSA, garbage).
 */
export const publicKeySpkiP256Schema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((val, ctx) => {
    try {
      parseP256SpkiPublicKeyOrThrow(val);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : 'Invalid public key',
      });
    }
  });

/** `components/schemas/PutPublicKeyRequest` — **`.strict()`** rejects unknown keys (e.g. `privateKey`). */
export const putPublicKeyRequestSchema = z
  .object({
    publicKey: publicKeySpkiP256Schema,
    keyVersion: z.number().int().min(1).optional(),
  })
  .strict();

/** `components/schemas/RotatePublicKeyRequest` — **`.strict()`** rejects unknown keys (e.g. `privateKey`). */
export const rotatePublicKeyRequestSchema = z
  .object({
    publicKey: publicKeySpkiP256Schema,
  })
  .strict();

/** Path: `components/parameters/ConversationIdPath` */
export const conversationIdPathSchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * Multipart text fields for `PATCH /users/me` (`UpdateProfileRequest`) — file handled by multer separately.
 * OpenAPI: at least one part should be supplied; enforced in route when implemented.
 */
export const updateProfileTextPartsSchema = z.object({
  status: z.string().max(280).optional(),
  displayName: z.string().min(1).optional(),
});

/** `presence:getLastSeen` socket payload (not in OpenAPI; aligned with Feature 6). */
export const getLastSeenPayloadSchema = z.object({
  targetUserId: z
    .string()
    .min(1)
    .transform((s) => s.trim())
    .pipe(z.string().min(1)),
});

/**
 * Socket.IO **`message:delivered`**, **`message:read`**, **`conversation:read`** — **`userId`** is set
 * server-side from auth; clients send **`messageId`** + **`conversationId`** only.
 */
export const messageReceiptPayloadSchema = z.object({
  messageId: z.string().min(1),
  conversationId: z.string().min(1),
});

export function createMulterFileSchema(maxBytes: number) {
  return z
    .object({
      fieldname: z.literal('file'),
      originalname: z.string(),
      encoding: z.string(),
      mimetype: mediaUploadMimeEnum,
      size: z.number().int().positive().max(maxBytes),
      buffer: z.instanceof(Buffer),
    })
    .strict();
}

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PutPublicKeyRequest = z.infer<typeof putPublicKeyRequestSchema>;
export type RotatePublicKeyRequest = z.infer<typeof rotatePublicKeyRequestSchema>;
