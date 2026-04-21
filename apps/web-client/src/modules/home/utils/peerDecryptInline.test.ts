import { describe, expect, it } from 'vitest';
import {
  isPeerDecryptInlineError,
  neutralizeDecryptErrorForListPreview,
  PEER_DECRYPT_CRYPTO_FAILED,
  PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
  PEER_DECRYPT_NO_LOCAL_KEY,
} from './peerDecryptInline';

describe('peerDecryptInline', () => {
  it('detects known decrypt failure copy', () => {
    expect(isPeerDecryptInlineError(PEER_DECRYPT_NO_DEVICE_KEY_ENTRY)).toBe(
      true,
    );
    expect(isPeerDecryptInlineError(PEER_DECRYPT_NO_LOCAL_KEY)).toBe(true);
    expect(isPeerDecryptInlineError(PEER_DECRYPT_CRYPTO_FAILED)).toBe(true);
    expect(isPeerDecryptInlineError(` ${PEER_DECRYPT_NO_LOCAL_KEY} `)).toBe(
      true,
    );
    expect(isPeerDecryptInlineError('Hello')).toBe(false);
  });

  it('neutralizes decrypt errors for list preview', () => {
    expect(
      neutralizeDecryptErrorForListPreview(PEER_DECRYPT_NO_DEVICE_KEY_ENTRY),
    ).toBe('Encrypted message');
    expect(neutralizeDecryptErrorForListPreview('Hi')).toBe('Hi');
  });
});
