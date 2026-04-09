import type { z } from 'zod';

/**
 * Safe client-facing summary of Zod issues (aligned with OpenAPI `ErrorResponse.message`).
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : 'request';
      return `${path}: ${i.message}`;
    })
    .slice(0, 5)
    .join('; ');
}
