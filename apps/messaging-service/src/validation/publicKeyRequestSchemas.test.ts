import { describe, expect, it } from 'vitest';
import {
  putPublicKeyRequestSchema,
  rotatePublicKeyRequestSchema,
} from './schemas.js';

describe('public key request schemas', () => {
  it('rejects unknown keys such as privateKey (strict)', () => {
    const bad = {
      publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      privateKey: 'must-not-be-accepted',
    };
    expect(putPublicKeyRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rotate rejects unknown keys', () => {
    const bad = {
      publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      privateKey: 'x',
    };
    expect(rotatePublicKeyRequestSchema.safeParse(bad).success).toBe(false);
  });
});
