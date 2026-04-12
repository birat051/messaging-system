import { isTransientHttpRetryableError } from '../../modules/auth/utils/apiError';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries **`fn`** on transient failures (network, **429**, **5xx**). Does **not** retry **4xx** validation/auth errors.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown, attemptIndex: number) => boolean;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const shouldRetry =
    options.shouldRetry ??
    ((error: unknown, attemptIndex: number) => {
      void attemptIndex;
      return isTransientHttpRetryableError(error);
    });

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === maxAttempts - 1 || !shouldRetry(e, attempt)) {
        throw e;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
