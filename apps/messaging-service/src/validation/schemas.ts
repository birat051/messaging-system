import { z } from 'zod';
import { DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH } from '../config/userSearchPolicy.js';
import { limitQuerySchema, resolveListLimit } from './limitQuery.js';
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

/** Wire id for **`user_device_public_keys`** rows (UUID, **`default`**, etc.). */
export const registeredDeviceIdStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'must contain only letters, digits, underscore, or hyphen',
  );

/** Optional **`sourceDeviceId`** on auth requests — embedded in access JWT when valid. */
export const sourceDeviceIdRequestFieldSchema =
  registeredDeviceIdStringSchema.optional();

/** `components/schemas/RegisterRequest` */
export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: registerUsernameSchema,
  displayName: z.string().trim().min(1).max(200),
  profilePicture: z.union([z.string().url(), z.null()]).optional(),
  status: z.union([z.string().max(280), z.null()]).optional(),
  sourceDeviceId: sourceDeviceIdRequestFieldSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * `components/schemas/GuestRequest` — **`POST /auth/guest`** (guest sandbox; full signup not required).
 * **`username`** is required; **`displayName`** is optional (may match or differ from **`username`**).
 */
export const guestRequestSchema = z.object({
  username: registerUsernameSchema,
  displayName: z.string().trim().min(1).max(200).optional(),
  sourceDeviceId: sourceDeviceIdRequestFieldSchema,
});

export type GuestRequest = z.infer<typeof guestRequestSchema>;

/** `components/schemas/User` — API-safe shape (subset enforced for responses). */
export const userApiShapeSchema = z.object({
  id: z.string().min(1),
  email: z.union([z.string().email(), z.null()]),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  emailVerified: z.boolean(),
  profilePicture: z.string().nullable(),
  status: z.string().nullable(),
  guest: z.boolean(),
});

/**
 * `components/schemas/GuestAuthResponse` — **`POST /auth/guest`** **200** success (**Feature 2a**).
 * **`expiresAt`** is absolute access-token expiry (ISO 8601); **`expiresIn`** is the same window in seconds.
 */
export const guestAuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: userApiShapeSchema,
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  expiresAt: z.string().min(1),
});

export type GuestAuthResponse = z.infer<typeof guestAuthResponseSchema>;

/** `components/schemas/LoginRequest` */
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  sourceDeviceId: sourceDeviceIdRequestFieldSchema,
});

/** `components/schemas/RefreshRequest` */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
  sourceDeviceId: sourceDeviceIdRequestFieldSchema,
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
    /** Per-device wrapped symmetric keys — opaque to the server (`Message.encryptedMessageKeys`). */
    encryptedMessageKeys: z.record(z.string(), z.string()).optional(),
    /** AES-GCM IV for E2EE payload — opaque to the server. */
    iv: z.union([z.string(), z.null()]).optional(),
    /** Client algorithm tag (e.g. hybrid E2EE) — opaque to the server. */
    algorithm: z.union([z.string().max(256), z.null()]).optional(),
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

    const emk = data.encryptedMessageKeys;
    if (
      emk &&
      typeof emk === 'object' &&
      Object.keys(emk as Record<string, string>).length > 0
    ) {
      const ivOk =
        data.iv != null && String(data.iv).trim().length > 0;
      const algOk =
        data.algorithm != null && String(data.algorithm).trim().length > 0;
      if (!ivOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'iv is required when encryptedMessageKeys contains one or more entries',
          path: ['iv'],
        });
      }
      if (!algOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'algorithm is required when encryptedMessageKeys contains one or more entries',
          path: ['algorithm'],
        });
      }
    }
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

/**
 * `components/schemas/RegisterDeviceRequest` — **`POST /users/me/devices`** (bootstrap + full).
 * Send **`publicKey`** or **`pubKey`** (same SPKI Base64). **`bootstrap: true`** → **201** `{ deviceId }` only.
 */
export const registerDeviceRequestSchema = z
  .object({
    publicKey: publicKeySpkiP256Schema.optional(),
    /** Alias for **`publicKey`** (Feature 13 bootstrap naming). */
    pubKey: publicKeySpkiP256Schema.optional(),
    /** Client-generated id for idempotent re-registration of the same physical device. */
    deviceId: z.string().trim().min(1).max(128).optional(),
    /** Optional UX label (e.g. browser / machine). */
    deviceLabel: z.string().max(200).optional(),
    /** When **true**, response is **201** with **`RegisterDeviceBootstrapResponse`** (`deviceId` only). */
    bootstrap: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.publicKey === undefined && val.pubKey === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide publicKey or pubKey (SPKI Base64 P-256)',
        path: ['publicKey'],
      });
    }
    if (
      val.publicKey !== undefined &&
      val.pubKey !== undefined &&
      val.publicKey !== val.pubKey
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'publicKey and pubKey must match when both are sent',
        path: ['pubKey'],
      });
    }
  })
  .transform((val) => ({
    publicKey: val.publicKey ?? val.pubKey!,
    deviceId: val.deviceId,
    deviceLabel: val.deviceLabel,
    bootstrap: val.bootstrap === true,
  }));

/** Path: `components/parameters/DeviceIdPath` — same charset as **`registeredDeviceIdStringSchema`** (wire device ids). */
export const deviceIdPathSchema = z.object({
  deviceId: registeredDeviceIdStringSchema,
});

/** Optional body for **`POST /users/me/devices/sync-notify`** — **`deviceId`** when JWT lacks **`sourceDeviceId`**. */
export const notifyDeviceSyncRequestSchema = z.preprocess(
  (val) => (val === undefined || val === null ? {} : val),
  z
    .object({
      deviceId: sourceDeviceIdRequestFieldSchema,
    })
    .strict(),
);

/**
 * Query for **`GET /users/me/devices`** — no parameters. **`.strict()`** rejects unknown query keys.
 * (OpenAPI documents an empty query map for this operation.)
 */
export const listMyDevicesQuerySchema = z.object({}).strict();

/**
 * Query for **`GET /users/me/sync/message-keys`** — **`deviceId`** must be a row in **`user_device_public_keys`**
 * for the authenticated user. **`afterMessageId`** is an exclusive cursor (**`(createdAt asc, id asc)`**).
 */
export const listSyncMessageKeysQuerySchema = z
  .object({
    deviceId: registeredDeviceIdStringSchema,
    afterMessageId: z.string().trim().min(1).max(200).optional(),
    limit: limitQuerySchema,
  })
  .strict()
  .transform((v) => ({
    deviceId: v.deviceId,
    afterMessageId:
      v.afterMessageId !== undefined && v.afterMessageId.length > 0
        ? v.afterMessageId
        : undefined,
    limit: resolveListLimit(v.limit),
  }));

/** Matches **`components/schemas/SyncMessageKeyEntry`** — one row in **`BatchKeyUploadRequest.keys`**. */
export const batchSyncMessageKeyItemSchema = z
  .object({
    messageId: z.string().trim().min(1).max(200),
    encryptedMessageKey: z.string().min(1).max(131072),
  })
  .strict();

/** `components/schemas/BatchKeyUploadRequest` — **`POST /users/me/sync/message-keys`**. */
export const batchSyncMessageKeysRequestSchema = z
  .object({
    targetDeviceId: registeredDeviceIdStringSchema,
    keys: z.array(batchSyncMessageKeyItemSchema).min(1).max(200),
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

/**
 * **`GET` / `POST /v1/media/presign`** — same fields; query or JSON body.
 * **`filename`** seeds the object key suffix (sanitized server-side); if omitted, a default per **`contentType`** is used.
 */
export function createMediaPresignRequestSchema(maxBytes: number) {
  return z
    .object({
      contentType: mediaUploadMimeEnum,
      contentLength: z.coerce
        .number()
        .int()
        .positive()
        .max(maxBytes),
      filename: z
        .string()
        .max(128)
        .optional()
        .transform((s) => {
          const t = s?.trim();
          return t === '' ? undefined : t;
        }),
    })
    .strict();
}

export type MediaPresignRequestInput = z.infer<
  ReturnType<typeof createMediaPresignRequestSchema>
>;

/** Image MIME subset for **`POST /users/me/avatar/presign`** — aligned with OpenAPI **`AvatarPresignContentType`**. */
export const AVATAR_PRESIGN_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AvatarPresignMimeType = (typeof AVATAR_PRESIGN_MIME_TYPES)[number];

export const avatarPresignMimeEnum = z.enum(AVATAR_PRESIGN_MIME_TYPES);

/**
 * **`POST /users/me/avatar/presign`** — same shape as media presign; **`contentType`** is **image/** only.
 */
export function createAvatarPresignRequestSchema(maxBytes: number) {
  return z
    .object({
      contentType: avatarPresignMimeEnum,
      contentLength: z.coerce
        .number()
        .int()
        .positive()
        .max(maxBytes),
      filename: z
        .string()
        .max(128)
        .optional()
        .transform((s) => {
          const t = s?.trim();
          return t === '' ? undefined : t;
        }),
    })
    .strict();
}

export type AvatarPresignRequestInput = z.infer<
  ReturnType<typeof createAvatarPresignRequestSchema>
>;

/**
 * **`PATCH /users/me`** with **`Content-Type: application/json`** — set **`profilePicture`** by public URL,
 * by **`profilePictureMediaKey`** after a client **`PUT`** to **`POST /users/me/avatar/presign`**, and/or update
 * **`displayName`** / **`status`**. At least one field is required.
 */
export const patchProfileJsonBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    status: z.union([z.string().trim().max(280), z.null()]).optional(),
    profilePicture: z.union([z.string().url().max(2048), z.null()]).optional(),
    profilePictureMediaKey: z
      .string()
      .trim()
      .min(1)
      .max(1024)
      .optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const defined = [
      val.displayName !== undefined,
      val.status !== undefined,
      val.profilePicture !== undefined,
      val.profilePictureMediaKey !== undefined,
    ].filter(Boolean).length;
    if (defined === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide at least one of displayName, status, profilePicture, profilePictureMediaKey',
      });
    }
    if (
      val.profilePicture !== undefined &&
      val.profilePictureMediaKey !== undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use only one of profilePicture or profilePictureMediaKey',
      });
    }
  });

export type PatchProfileJsonBody = z.infer<typeof patchProfileJsonBodySchema>;

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type BatchKeyUploadRequest = z.infer<
  typeof batchSyncMessageKeysRequestSchema
>;
