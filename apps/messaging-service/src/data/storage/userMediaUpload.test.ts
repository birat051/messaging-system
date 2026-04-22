import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.js';
import {
  isUserMediaObjectKeyOwnedByUser,
  userMediaKeyPrefixForUser,
} from './userMediaUpload.js';

describe('userMediaKeyPrefixForUser / isUserMediaObjectKeyOwnedByUser', () => {
  it('matches keys under users/{id}/', () => {
    const env = { S3_KEY_PREFIX: undefined } as unknown as Env;
    expect(userMediaKeyPrefixForUser(env, 'u1')).toBe('users/u1/');
    expect(
      isUserMediaObjectKeyOwnedByUser(
        env,
        'u1',
        'users/u1/550e8400-e29b-41d4-a716-446655440000-photo.png',
      ),
    ).toBe(true);
    expect(isUserMediaObjectKeyOwnedByUser(env, 'u1', 'users/u2/x')).toBe(false);
  });

  it('respects S3_KEY_PREFIX', () => {
    const env = { S3_KEY_PREFIX: 'app/prod' } as unknown as Env;
    expect(userMediaKeyPrefixForUser(env, 'u1')).toBe('app/prod/users/u1/');
    expect(
      isUserMediaObjectKeyOwnedByUser(
        env,
        'u1',
        'app/prod/users/u1/550e8400-e29b-41d4-a716-446655440000-photo.png',
      ),
    ).toBe(true);
  });
});
