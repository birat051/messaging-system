import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: programmatic E2EE must not depend on **`modules/settings`** (profile-only module per **`PROJECT_PLAN.md`**).
 */
/** `apps/web-client` root (this file lives under `src/common/crypto/`). */
const webClientRoot = join(import.meta.dirname, '../../..');

const KEY_LIFECYCLE_SOURCES = [
  'src/modules/crypto/stores/cryptoSlice.ts',
  'src/common/crypto/ensureMessagingKeypair.ts',
  'src/common/crypto/messageHybrid.ts',
  'src/common/hooks/useKeypairStatus.ts',
  'src/common/hooks/useRegisterDevice.ts',
  'src/common/hooks/useRestorePrivateKey.ts',
  'src/common/hooks/useSendEncryptedMessage.ts',
  'src/common/hooks/useDevEnsureMessagingKeys.ts',
] as const;

describe('E2EE key lifecycle import policy', () => {
  it.each(KEY_LIFECYCLE_SOURCES)('%s does not import modules/settings', (relativePath) => {
    const abs = join(webClientRoot, relativePath);
    const src = readFileSync(abs, 'utf8');
    expect(src).not.toMatch(/['"]@\/modules\/settings/);
    expect(src).not.toMatch(/['"]\.\.\/.*modules\/settings/);
    expect(src).not.toMatch(/from\s+['"][^'"]*modules\/settings/);
  });
});
