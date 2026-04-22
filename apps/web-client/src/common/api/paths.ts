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
    guest: '/auth/guest',
  },
  users: {
    me: '/users/me',
    meAvatarPresign: '/users/me/avatar/presign',
    meDevices: '/users/me/devices',
    meDeviceById: (deviceId: string) =>
      `/users/me/devices/${encodeURIComponent(deviceId)}`,
    meSyncMessageKeys: '/users/me/sync/message-keys',
    byId: (userId: string) => `/users/${encodeURIComponent(userId)}`,
    devicePublicKeysByUserId: (userId: string) =>
      `/users/${encodeURIComponent(userId)}/devices/public-keys`,
    search: '/users/search',
  },
  conversations: {
    list: '/conversations',
    messages: (conversationId: string) =>
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
    messageReceipts: (conversationId: string) =>
      `/conversations/${encodeURIComponent(conversationId)}/message-receipts`,
  },
  messages: {
    send: '/messages',
  },
  groups: {
    create: '/groups',
  },
  media: {
    upload: '/media/upload',
    presign: '/media/presign',
  },
} as const;
