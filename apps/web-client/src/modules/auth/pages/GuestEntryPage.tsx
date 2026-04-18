import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createGuestSession } from '../../../common/api/authApi';
import { loadSenderPlaintextIntoRedux } from '../../../common/senderPlaintext/loadSenderPlaintextIntoRedux';
import { ApiErrorAlert } from '../../../common/components/ApiErrorAlert';
import {
  validateGuestEntryForm,
  type GuestEntryFieldKey,
} from '../../../common/utils/formValidation';
import { parseApiError, type ParsedApiError } from '../utils/apiError';
import { applyGuestAuthResponse } from '../utils/applyAuthResponse';
import { useAuth } from '../../../common/hooks/useAuth';
import type { AuthRedirectState } from '../../../routes/postLoginRedirect';
import { getPostLoginRedirectPath } from '../../../routes/postLoginRedirect';
import { ROUTES } from '../../../routes/paths';
import { useAppDispatch } from '../../../store/hooks';

function fieldBorderClass(
  fieldErrors: Partial<Record<GuestEntryFieldKey, string>>,
  key: GuestEntryFieldKey,
): string {
  return fieldErrors[key]
    ? 'border-red-500 dark:border-red-500'
    : 'border-border';
}

/** **`POST /v1/auth/guest`** + **`applyGuestAuthResponse`**; **`401`** recovery target for guests. */
export function GuestEntryPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<GuestEntryFieldKey, string>>
  >({});
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(getPostLoginRedirectPath(location.state as AuthRedirectState), {
        replace: true,
      });
    }
  }, [isAuthenticated, navigate, location.state]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setApiError(null);
    const v = validateGuestEntryForm({ username, displayName });
    if (!v.valid) {
      setFieldErrors(v.fields);
      return;
    }
    setSubmitting(true);
    try {
      const data = await createGuestSession({
        username: username.trim().toLowerCase(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      applyGuestAuthResponse(dispatch, data);
      await loadSenderPlaintextIntoRedux(dispatch, data.user.id);
      navigate(getPostLoginRedirectPath(location.state as AuthRedirectState), {
        replace: true,
      });
    } catch (err) {
      setApiError(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="text-foreground mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Continue as guest</h1>
        <p className="text-muted mt-2 text-sm">
          Pick a username for your temporary session. When it expires, you can sign in again here
          with a new name.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="guest-username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="guest-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={
                fieldErrors.username ? 'guest-username-error' : undefined
              }
              className={`border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm ${fieldBorderClass(fieldErrors, 'username')}`}
            />
            {fieldErrors.username ? (
              <p
                id="guest-username-error"
                className="text-destructive mt-1 text-xs"
                role="alert"
              >
                {fieldErrors.username}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="guest-display" className="text-sm font-medium">
              Display name <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="guest-display"
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(ev) => setDisplayName(ev.target.value)}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={
                fieldErrors.displayName ? 'guest-display-error' : undefined
              }
              className={`border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm ${fieldBorderClass(fieldErrors, 'displayName')}`}
            />
            {fieldErrors.displayName ? (
              <p
                id="guest-display-error"
                className="text-destructive mt-1 text-xs"
                role="alert"
              >
                {fieldErrors.displayName}
              </p>
            ) : null}
          </div>
          {apiError ? <ApiErrorAlert error={apiError} /> : null}
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-50"
          >
            {submitting ? 'Starting…' : 'Start guest session'}
          </button>
        </form>

        <p className="text-muted mt-8 text-sm">
          <Link
            to={ROUTES.login}
            className="text-accent font-medium hover:underline"
          >
            Sign in
          </Link>{' '}
          or{' '}
          <Link
            to={ROUTES.register}
            className="text-accent font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
