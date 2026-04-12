/**
 * Application error with stable `code` and HTTP status for API responses.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
