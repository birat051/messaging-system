import { describe, expect, it } from 'vitest';
import { defaultMockUser } from '@/common/mocks/handlers';
import { authReducer, setSession } from './authSlice';

describe('authReducer setSession coalescing', () => {
  it('skips mutation when token, expiry, and user identity are unchanged', () => {
    let state = authReducer(
      undefined,
      setSession({
        user: defaultMockUser,
        accessToken: 'jwt-a',
        accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const snap = state;
    state = authReducer(
      state,
      setSession({
        user: { ...defaultMockUser },
        accessToken: 'jwt-a',
        accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(state).toBe(snap);
  });

  it('still applies when user id becomes available with the same token string', () => {
    let state = authReducer(
      undefined,
      setSession({
        user: null,
        accessToken: 'jwt-a',
        accessTokenExpiresAt: null,
      }),
    );
    expect(state.user).toBeNull();
    state = authReducer(
      state,
      setSession({
        user: defaultMockUser,
        accessToken: 'jwt-a',
        accessTokenExpiresAt: null,
      }),
    );
    expect(state.user?.id).toBe(defaultMockUser.id);
  });
});
