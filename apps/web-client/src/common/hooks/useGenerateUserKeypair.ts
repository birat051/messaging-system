import { useCallback } from 'react';
import { generateP256EcdhKeyPair } from '../crypto/keypair';
import { useAuth } from './useAuth';

export type GeneratedUserKeypair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

/**
 * Exposes **`generateKeypair`** only for **authenticated** sessions. Call after login when setting up E2EE.
 */
export function useGenerateUserKeypair(): {
  generateKeypair: () => Promise<GeneratedUserKeypair>;
} {
  const { isAuthenticated } = useAuth();

  const generateKeypair = useCallback(async (): Promise<GeneratedUserKeypair> => {
    if (!isAuthenticated) {
      throw new Error(
        'Cannot generate keypair without an authenticated session',
      );
    }
    return generateP256EcdhKeyPair();
  }, [isAuthenticated]);

  return { generateKeypair };
}
