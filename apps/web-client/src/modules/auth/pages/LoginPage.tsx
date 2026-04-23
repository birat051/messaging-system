import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE,
  AuthLegalConsentCheckbox,
} from '@/common/components/AuthLegalConsentCheckbox';
import { AuthLegalFooter } from '@/common/components/AuthLegalFooter';
import { BrandedPageHeading } from '@/common/components/BrandedPageHeading';
import { login } from '../../../common/api/authApi';
import { getCurrentUser } from '../../../common/api/usersApi';
import { ApiErrorAlert } from '../../../common/components/ApiErrorAlert';
import {
  parseApiError,
  parseLoginError,
  type ParsedApiError,
} from '../utils/apiError';
import { validateLoginForm } from '../../../common/utils/formValidation';
import { loadSenderPlaintextIntoRedux } from '../../../common/senderPlaintext/loadSenderPlaintextIntoRedux';
import { applyAuthResponse } from '../utils/applyAuthResponse';
import { syncGuestReauthPreferenceFromUser } from '../utils/guestSessionPreference';
import { setUser } from '../stores/authSlice';
import { useAuth } from '../../../common/hooks/useAuth';
import type { AuthRedirectState } from '../../../routes/postLoginRedirect';
import { getPostLoginRedirectPath } from '../../../routes/postLoginRedirect';
import { ROUTES } from '../../../routes/paths';
import { useAppDispatch } from '../../../store/hooks';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  /**
   * Guests keep this screen; only **registered** sessions redirect. Requiring **`user !== null`**
   * avoids bouncing when a token exists but profile is not yet hydrated.
   */
  useEffect(() => {
    const isRegisteredSession =
      isAuthenticated && user !== null && user.guest === false;
    if (isRegisteredSession) {
      navigate(getPostLoginRedirectPath(location.state), { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.state]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [failureKind, setFailureKind] = useState<
    'invalid_credentials' | 'email_not_verified' | 'other' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    setApiError(null);
    setFailureKind(null);
    setConsentError(null);
    const client = validateLoginForm(email, password);
    if (client) {
      setClientError(client);
      return;
    }
    if (!acceptedLegal) {
      setConsentError(AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      const data = await login({
        email: email.trim(),
        password,
      });
      applyAuthResponse(dispatch, data, null, 'auth.login');
      const user = await getCurrentUser();
      dispatch(setUser(user));
      syncGuestReauthPreferenceFromUser(user);
      await loadSenderPlaintextIntoRedux(dispatch, user.id);
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="text-foreground mx-auto max-w-md px-6 py-16">
        <BrandedPageHeading
          horizontal={false}
          titleRowClassName="justify-center"
        ></BrandedPageHeading>
        <p className="text-muted mt-2 text-sm">
          Use the email and password for your account.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1 block text-sm font-medium"
            >
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
            <label
              htmlFor="login-password"
              className="mb-1 block text-sm font-medium"
            >
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

          <div>
            <AuthLegalConsentCheckbox
              id="login-legal-consent"
              checked={acceptedLegal}
              onChange={(next) => {
                setAcceptedLegal(next);
                if (next) {
                  setConsentError(null);
                }
              }}
              invalid={Boolean(consentError)}
              errorId={consentError ? 'login-consent-error' : undefined}
            />
            {consentError ? (
              <p
                id="login-consent-error"
                className="text-destructive mt-2 text-sm"
                role="alert"
              >
                {consentError}
              </p>
            ) : null}
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
                  Double-check your email and password. Use register if you need
                  a new account.
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
                  to paste your token or resend the message. Sign-in stays
                  blocked until you verify when{' '}
                  <code className="text-accent">
                    EMAIL_VERIFICATION_REQUIRED
                  </code>{' '}
                  is on.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <Link
          to={ROUTES.guest}
          state={location.state}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 mt-4 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none"
        >
          Continue as guest
        </Link>

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

        <AuthLegalFooter />
      </div>
    </div>
  );
}
