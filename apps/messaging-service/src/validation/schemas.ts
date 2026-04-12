import { z } from 'zod';
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

/** `components/schemas/RegisterRequest` */
export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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

/** `GET /users/search` query — use **`resolveListLimit`** on **`limit`**. */
export const searchUsersQuerySchema = z.object({
  email: z.string().email(),
  limit: limitQuerySchema,
});

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
