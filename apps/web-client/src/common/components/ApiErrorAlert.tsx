import type { ParsedApiError } from '../../modules/auth/utils/apiError';

type Props = {
  error: ParsedApiError | null;
  className?: string;
};

/**
 * Shows **`ErrorResponse.message`** with optional **`code`** + HTTP status for support / debugging.
 */
export function ApiErrorAlert({ error, className = '' }: Props) {
  if (!error) {
    return null;
  }
  return (
    <div role="alert" className={`space-y-1 ${className}`.trim()}>
      <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
      {(error.code != null || error.httpStatus != null) && (
        <p className="text-muted text-xs">
          {error.code != null && (
            <>
              Code: <code className="text-accent">{error.code}</code>
            </>
          )}
          {error.code != null && error.httpStatus != null && ' · '}
          {error.httpStatus != null && <>HTTP {error.httpStatus}</>}
        </p>
      )}
    </div>
  );
}
