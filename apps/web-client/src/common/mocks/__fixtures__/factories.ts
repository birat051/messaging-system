import type { components } from '@/generated/api-types';

type User = components['schemas']['User'];
type AuthResponse = components['schemas']['AuthResponse'];
type GuestAuthResponse = components['schemas']['GuestAuthResponse'];
type VerifyEmailResponse = components['schemas']['VerifyEmailResponse'];
type ConversationPage = components['schemas']['ConversationPage'];
type MessagePage = components['schemas']['MessagePage'];
type MessageReceiptPage = components['schemas']['MessageReceiptPage'];

/** Default **`User.id`** for **`createMockUser()`** — override when tests need a stable peer id. */
export const DEFAULT_MOCK_USER_ID = 'test-user-1';

/**
 * Builds a **`User`** for tests/MSW. Prefer **`defaultMockUser`** when you need the shared handler default.
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: DEFAULT_MOCK_USER_ID,
    email: 'test@example.com',
    username: 'testuser',
    displayName: 'Test User',
    emailVerified: true,
    status: 'Hello',
    profilePicture: null,
    guest: false,
    ...overrides,
  };
}

/**
 * Same object as **`createMockUser()`** — used by **`handlers`** and any test that needs the MSW default profile.
 */
export const defaultMockUser = createMockUser();

/** Registered-session tokens after login/register/refresh ( **`AuthResponse`** — no embedded **`user`**; pair with **`User`** in app code). */
export function createMockAuthResponse(
  overrides: Partial<AuthResponse> = {},
): AuthResponse {
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 3600,
    expiresAt: '2026-12-31T23:59:59.000Z',
    ...overrides,
  };
}

/** **`POST /auth/guest`**-shaped payload. */
export function createMockGuestAuthResponse(
  user: User,
  overrides: Partial<GuestAuthResponse> = {},
): GuestAuthResponse {
  return {
    accessToken: 'guest-access-token',
    refreshToken: 'guest-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 1800,
    expiresAt: '2026-12-31T23:59:59.000Z',
    user,
    ...overrides,
  };
}

/** **`POST /auth/verify-email`** success body. */
export function createMockVerifyEmailResponse(
  user: User,
  overrides: Partial<VerifyEmailResponse> = {},
): VerifyEmailResponse {
  return {
    user,
    accessToken: 'verified-access-token',
    refreshToken: 'verified-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 3600,
    ...overrides,
  };
}

/** Typical guest **`User`** row (aligns with **`GuestEntryPage`** integration tests). */
export function createMockGuestUser(overrides: Partial<User> = {}): User {
  return createMockUser({
    id: 'guest-user-test',
    email: null,
    username: 'valid_guest',
    displayName: null,
    emailVerified: false,
    profilePicture: null,
    status: null,
    guest: true,
    ...overrides,
  });
}

export function createEmptyConversationPage(
  overrides: Partial<ConversationPage> = {},
): ConversationPage {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    ...overrides,
  };
}

export function createEmptyMessagePage(
  overrides: Partial<MessagePage> = {},
): MessagePage {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    ...overrides,
  };
}

export function createEmptyMessageReceiptPage(
  overrides: Partial<MessageReceiptPage> = {},
): MessageReceiptPage {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    readCursor: null,
    ...overrides,
  };
}
