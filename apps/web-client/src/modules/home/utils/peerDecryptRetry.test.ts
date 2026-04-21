import { describe, expect, it } from 'vitest';
import {
  PEER_DECRYPT_CRYPTO_FAILED,
  PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
  PEER_DECRYPT_NO_LOCAL_KEY,
} from '@/modules/home/utils/peerDecryptInline';
import { shouldRetryPeerDecryptAfterCachedFailure } from './peerDecryptRetry';

describe('shouldRetryPeerDecryptAfterCachedFailure', () => {
  it('retries when cache is empty', () => {
    expect(shouldRetryPeerDecryptAfterCachedFailure(undefined)).toBe(true);
  });

  it('retries after no-device-key entry so bootstrap can supply deviceId', () => {
    expect(
      shouldRetryPeerDecryptAfterCachedFailure(PEER_DECRYPT_NO_DEVICE_KEY_ENTRY),
    ).toBe(true);
  });

  it('does not retry other cached failures', () => {
    expect(
      shouldRetryPeerDecryptAfterCachedFailure(PEER_DECRYPT_NO_LOCAL_KEY),
    ).toBe(false);
    expect(
      shouldRetryPeerDecryptAfterCachedFailure(PEER_DECRYPT_CRYPTO_FAILED),
    ).toBe(false);
    expect(shouldRetryPeerDecryptAfterCachedFailure('hello')).toBe(false);
  });
});
