import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/authApi';
import { getCurrentUser } from '../api/usersApi';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import {
  parseApiError,
  parseLoginError,
  type ParsedApiError,
} from '../features/auth/apiError';
import { validateLoginForm } from '../lib/formValidation';
import { applyAuthResponse } from '../features/auth/applyAuthResponse';
import { setUser } from '../features/auth/authSlice';
import { useAuth } from '../hooks/useAuth';
import type { AuthRedirectState } from '../routes/postLoginRedirect';
import { getPostLoginRedirectPath } from '../routes/postLoginRedirect';
import { ROUTES } from '../routes/paths';
import { useAppDispatch } from '../store/hooks';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(getPostLoginRedirectPath(location.state), { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [failureKind, setFailureKind] = useState<
    'invalid_credentials' | 'email_not_verified' | 'other' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    setApiError(null);
    setFailureKind(null);
    const client = validateLoginForm(email, password);
    if (client) {
      setClientError(client);
      return;
    }
    setSubmitting(true);
    try {
      const data = await login({
        email: email.trim(),
        password,
      });
      applyAuthResponse(dispatch, data, null);
      const user = await getCurrentUser();
      dispatch(setUser(user));
      navigate(getPostLoginRedirectPath(location.state), { replace: true });
    } catch (err) {
      const parsed = parseLoginError(err);
      setFailureKind(parsed.kind);
      setApiError(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="text-foreground mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted mt-2 text-sm">
        Use the email and password for your account.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            aria-invalid={Boolean(clientError)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            aria-invalid={Boolean(clientError)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>

        {clientError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {clientError}
          </p>
        )}

        {apiError && (
          <div className="space-y-2">
            <ApiErrorAlert error={apiError} />
            {failureKind === 'invalid_credentials' && (
              <p className="text-muted text-xs">
                Double-check your email and password. Use register if you need a new account.
              </p>
            )}
            {failureKind === 'email_not_verified' && (
              <p className="text-muted text-xs">
                <Link
                  to={ROUTES.verifyEmail}
                  state={{
                    email: email.trim(),
                    from: (location.state as AuthRedirectState | null)?.from,
                  }}
                  className="text-accent font-medium hover:underline"
                >
                  Open the verify email page
                </Link>{' '}
                to paste your token or resend the message. Sign-in stays blocked until you verify
                when <code className="text-accent">EMAIL_VERIFICATION_REQUIRED</code> is on.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-muted mt-6 text-center text-sm">
        No account?{' '}
        <Link
          to={ROUTES.register}
          state={location.state}
          className="text-accent font-medium hover:underline"
        >
          Register
        </Link>
      </p>
    </div>
  );
}
