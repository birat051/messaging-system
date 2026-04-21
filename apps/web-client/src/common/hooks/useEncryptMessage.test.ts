import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import { useEncryptMessage } from './useEncryptMessage';

describe('useEncryptMessage', () => {
  it('encryptUtf8Hybrid delegates to hybrid pipeline', async () => {
    const pair = await generateP256EcdhKeyPair();
    const spki = await exportPublicKeySpkiBase64(pair.publicKey);
    const { result } = renderHook(() => useEncryptMessage());
    const hybrid = await result.current.encryptUtf8Hybrid('Hi', [
      { deviceId: 'a', publicKey: spki },
    ]);
    expect(hybrid.algorithm).toBe('aes-256-gcm+p256-hybrid-v1');
    expect(hybrid.body.length).toBeGreaterThan(0);
    expect(hybrid.iv.length).toBeGreaterThan(0);
    expect(hybrid.encryptedMessageKeys.a).toBeDefined();
  });
});
