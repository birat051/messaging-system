import { http, HttpResponse } from 'msw';
import { API_PATHS } from '../api/paths';
import type { components } from '../../generated/api-types';
import {
  createEmptyConversationPage,
  createEmptyMessagePage,
  createEmptyMessageReceiptPage,
  defaultMockUser,
} from './__fixtures__';

export { defaultMockUser } from './__fixtures__';

type User = components['schemas']['User'];
type UserSearchResult = components['schemas']['UserSearchResult'];
type DevicePublicKeyListResponse =
  components['schemas']['DevicePublicKeyListResponse'];

/**
 * REST handlers aligned with **`docs/openapi/openapi.yaml`** — paths are **`/v1/...`** relative to origin.
 * Path patterns use a host wildcard so tests work regardless of **`window.location.origin`** (Vitest jsdom).
 */
export const handlers = [
  http.get(`*/v1${API_PATHS.conversations.list}`, () =>
    HttpResponse.json(createEmptyConversationPage()),
  ),
  http.get('*/v1/conversations/:conversationId/messages', () =>
    HttpResponse.json(createEmptyMessagePage()),
  ),
  http.get('*/v1/conversations/:conversationId/message-receipts', () =>
    HttpResponse.json(createEmptyMessageReceiptPage()),
  ),
  http.get('*/v1/users/search', ({ request }) => {
    const url = new URL(request.url);
    const qRaw =
      url.searchParams.get('q')?.trim() ??
      url.searchParams.get('email')?.trim() ??
      '';
    const q = qRaw.toLowerCase();
    if (!q) {
      return HttpResponse.json(
        { code: 'INVALID_REQUEST', message: 'q or email required' },
        { status: 400 },
      );
    }
    /** Substring match on stored email and username (same idea as messaging-service). */
    const mockRows: Array<{
      storedEmail: string;
      storedUsername: string;
      row: UserSearchResult;
    }> = [
      {
        storedEmail: 'found@example.com',
        storedUsername: 'found_user',
        row: {
          userId: 'user-found-1',
          username: 'found_user',
          displayName: 'Found User',
          profilePicture: null,
          conversationId: 'conv-7a3f9e2b-4411-4c0d-9e8a',
          guest: false,
        },
      },
      {
        storedEmail: 'newonly@example.com',
        storedUsername: 'new_contact',
        row: {
          userId: 'user-new-1',
          username: 'new_contact',
          displayName: 'New Contact',
          profilePicture: null,
          conversationId: null,
          guest: false,
        },
      },
    ];
    const results: UserSearchResult[] = mockRows
      .filter(
        ({ storedEmail, storedUsername }) =>
          storedEmail.includes(q) || storedUsername.includes(q),
      )
      .map(({ row }) => row);
    return HttpResponse.json(results);
  }),
  http.get('*/v1/users/:userId/devices/public-keys', ({ params }) => {
    const userId = params.userId as string;
    if (userId !== defaultMockUser.id && userId !== 'me') {
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'No device keys' },
        { status: 404 },
      );
    }
    const body: DevicePublicKeyListResponse = {
      items: [
        {
          deviceId: 'default',
          publicKey:
            'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEeWtZ0jiCzy6i7c1fhDNcct9WUer1FC9027TeJwYmimeYcCDeAauszT90CsuigDh12qwCJ3yFUDcZurT22BWJrJA',
          keyVersion: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    return HttpResponse.json(body);
  }),
  http.get('*/v1/users/me', () => HttpResponse.json(defaultMockUser)),
  http.get('*/v1/users/:userId', ({ params }) => {
    const id = params.userId as string;
    return HttpResponse.json({
      id,
      guest: false,
      displayName: null,
      profilePicture: null,
      status: null,
    });
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
