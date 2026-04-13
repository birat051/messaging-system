import { http, HttpResponse } from 'msw';
import { API_PATHS } from '../api/paths';
import type { components } from '../../generated/api-types';

type User = components['schemas']['User'];
type UserSearchResult = components['schemas']['UserSearchResult'];
type UserPublicKeyResponse = components['schemas']['UserPublicKeyResponse'];

/** Default profile used by **`PATCH /v1/users/me`** when tests do not override handlers. */
export const defaultMockUser: User = {
  id: 'test-user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  status: 'Hello',
  profilePicture: null,
};

/**
 * REST handlers aligned with **`docs/openapi/openapi.yaml`** — paths are **`/v1/...`** relative to origin.
 * Path patterns use a host wildcard so tests work regardless of **`window.location.origin`** (Vitest jsdom).
 */
export const handlers = [
  http.get(`*/v1${API_PATHS.conversations.list}`, () =>
    HttpResponse.json({
      items: [],
      nextCursor: null,
      hasMore: false,
    }),
  ),
  http.get('*/v1/conversations/:conversationId/messages', () =>
    HttpResponse.json({
      items: [],
      nextCursor: null,
      hasMore: false,
    }),
  ),
  http.get('*/v1/conversations/:conversationId/message-receipts', () =>
    HttpResponse.json({
      items: [],
      nextCursor: null,
      hasMore: false,
      readCursor: null,
    }),
  ),
  http.get('*/v1/users/search', ({ request }) => {
    const url = new URL(request.url);
    const email = url.searchParams.get('email')?.trim().toLowerCase() ?? '';
    if (!email) {
      return HttpResponse.json(
        { code: 'INVALID_REQUEST', message: 'email required' },
        { status: 400 },
      );
    }
    /** Substring match on stored email (same idea as messaging-service). */
    const mockByStoredEmail: Array<{ storedEmail: string; row: UserSearchResult }> = [
      {
        storedEmail: 'found@example.com',
        row: {
          userId: 'user-found-1',
          displayName: 'Found User',
          profilePicture: null,
          conversationId: 'conv-7a3f9e2b-4411-4c0d-9e8a',
        },
      },
      {
        storedEmail: 'newonly@example.com',
        row: {
          userId: 'user-new-1',
          displayName: 'New Contact',
          profilePicture: null,
          conversationId: null,
        },
      },
    ];
    const results: UserSearchResult[] = mockByStoredEmail
      .filter(({ storedEmail }) => storedEmail.includes(email))
      .map(({ row }) => row);
    return HttpResponse.json(results);
  }),
  http.get('*/v1/users/:userId/public-key', ({ params }) => {
    const userId = params.userId as string;
    if (userId !== defaultMockUser.id) {
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'No public key registered' },
        { status: 404 },
      );
    }
    const body: UserPublicKeyResponse = {
      userId: defaultMockUser.id,
      publicKey:
        'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEeWtZ0jiCzy6i7c1fhDNcct9WUer1FC9027TeJwYmimeYcCDeAauszT90CsuigDh12qwCJ3yFUDcZurT22BWJrJA',
      keyVersion: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    return HttpResponse.json(body);
  }),
  http.patch('*/v1/users/me', async ({ request }) => {
    let next: User = { ...defaultMockUser };
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('multipart/form-data')) {
      const fd = await request.formData();
      const dn = fd.get('displayName');
      const st = fd.get('status');
      if (typeof dn === 'string' && dn.trim() !== '') {
        next = { ...next, displayName: dn.trim() };
      }
      if (typeof st === 'string') {
        next = { ...next, status: st.trim() || null };
      }
      // Optional file part is ignored in mock (no MinIO in unit tests).
    }
    return HttpResponse.json(next);
  }),
];
