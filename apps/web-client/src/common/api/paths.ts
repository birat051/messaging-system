/**
 * REST paths relative to **`httpClient` `baseURL`** (includes **`/v1`**).
 * Use these in **`useSWR`**, API modules, and tests — do not duplicate path strings in components.
 */
export const API_PATHS = {
  health: '/health',
  ready: '/ready',
  auth: {
    register: '/auth/register',
    verifyEmail: '/auth/verify-email',
    resendVerification: '/auth/resend-verification',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },
  users: {
    me: '/users/me',
    mePublicKey: '/users/me/public-key',
    mePublicKeyRotate: '/users/me/public-key/rotate',
    byId: (userId: string) => `/users/${encodeURIComponent(userId)}`,
    publicKeyById: (userId: string) =>
      `/users/${encodeURIComponent(userId)}/public-key`,
    search: '/users/search',
  },
  conversations: {
    list: '/conversations',
    messages: (conversationId: string) =>
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
  },
  messages: {
    send: '/messages',
  },
  groups: {
    create: '/groups',
  },
  media: {
    upload: '/media/upload',
  },
} as const;
