import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { UserDocument } from '../data/users/users.collection.js';
import { rejectGuestUserMiddleware } from './rejectGuestUser.js';

function mockRes(): Response {
  return {} as Response;
}

describe('rejectGuestUserMiddleware', () => {
  it('calls next with error when authUser is guest', () => {
    const req = {
      authUser: { id: 'g1', isGuest: true } as UserDocument,
    } as Request;
    const next = vi.fn();
    rejectGuestUserMiddleware()(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as { code: string };
    expect(err.code).toBe('GUEST_ACTION_FORBIDDEN');
  });

  it('calls next() when authUser is registered', () => {
    const req = {
      authUser: { id: 'u1', isGuest: false } as UserDocument,
    } as Request;
    const next = vi.fn();
    rejectGuestUserMiddleware()(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next() when authUser is undefined', () => {
    const req = {
      authUser: undefined,
    } as Request;
    const next = vi.fn();
    rejectGuestUserMiddleware()(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
