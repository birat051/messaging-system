import { type FormEvent, useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { resendVerificationEmail, verifyEmail } from '../../../common/api/authApi';
import { ApiErrorAlert } from '../../../common/components/ApiErrorAlert';
import { parseApiError, type ParsedApiError } from '../utils/apiError';
import { validateResendEmail } from '../../../common/utils/formValidation';
import { applyVerifyEmailResponse } from '../utils/applyAuthResponse';
import type { AuthRedirectState } from '../../../routes/postLoginRedirect';
import { getPostLoginRedirectPath } from '../../../routes/postLoginRedirect';
import { ROUTES } from '../../../routes/paths';
import { useAppDispatch } from '../../../store/hooks';
import { useAuth } from '../../../common/hooks/useAuth';

export function VerifyEmailPage() {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token')?.trim() ?? '';

  const state = location.state as AuthRedirectState | null;
  const emailFromState = state?.email?.trim() ?? '';
  const emailFromQuery = searchParams.get('email')?.trim() ?? '';

  const [tokenManual, setTokenManual] = useState('');
  const [resendEmail, setResendEmail] = useState(
    emailFromState || emailFromQuery,
  );
  const [verifyError, setVerifyError] = useState<ParsedApiError | null>(null);
  const [resendClientError, setResendClientError] = useState<string | null>(null);
  const [resendApiError, setResendApiError] = useState<ParsedApiError | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [submittingVerify, setSubmittingVerify] = useState(false);
  const [submittingResend, setSubmittingResend] = useState(false);

  useEffect(() => {
    if (tokenFromUrl) {
      setTokenManual(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  async function onSubmitVerify(e: FormEvent) {
    e.preventDefault();
    setVerifyError(null);
    const t = tokenManual.trim();
    if (!t) {
      setVerifyError({
        code: null,
        message: 'Paste the verification token from your email.',
      });
      return;
    }
    setSubmittingVerify(true);
    try {
      const data = await verifyEmail({ token: t });
      applyVerifyEmailResponse(dispatch, data);
      navigate(getPostLoginRedirectPath(location.state), { replace: true });
    } catch (err) {
      setVerifyError(parseApiError(err));
    } finally {
      setSubmittingVerify(false);
    }
  }

  async function onResend(e: FormEvent) {
    e.preventDefault();
    setResendClientError(null);
    setResendApiError(null);
    setResendMessage(null);
    const em = resendEmail.trim();
    const client = validateResendEmail(em);
    if (client) {
      setResendClientError(client);
      return;
    }
    setSubmittingResend(true);
    try {
      await resendVerificationEmail({ email: em });
      setResendMessage(
        'If an unverified account exists for that address, we sent another email.',
      );
    } catch (err) {
      setResendApiError(parseApiError(err));
    } finally {
      setSubmittingResend(false);
    }
  }

  if (user?.guest) {
    return <Navigate to={ROUTES.home} replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="text-foreground mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Verify email</h1>
      <p className="text-muted mt-2 text-sm">
        Open the link we sent you (it fills the token below), or paste the token
        manually. You can resend the email if needed.
      </p>

      <form onSubmit={onSubmitVerify} className="mt-8 space-y-4">
        <div>
          <label htmlFor="verify-token" className="mb-1 block text-sm font-medium">
            Verification token
          </label>
          <textarea
            id="verify-token"
            name="token"
            rows={4}
            value={tokenManual}
            onChange={(ev) => setTokenManual(ev.target.value)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 font-mono text-xs outline-none focus:ring-2"
            placeholder="JWT from the verification link"
          />
        </div>
        {verifyError && <ApiErrorAlert error={verifyError} />}
        <button
          type="submit"
          disabled={submittingVerify}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
        >
          {submittingVerify ? 'Verifying…' : 'Verify email'}
        </button>
      </form>

      <div className="border-border mt-10 border-t pt-8">
        <h2 className="text-foreground text-sm font-semibold">Resend email</h2>
        <form onSubmit={onResend} className="mt-4 space-y-4">
          <div>
            <label htmlFor="resend-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="resend-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={resendEmail}
              onChange={(ev) => setResendEmail(ev.target.value)}
              aria-invalid={Boolean(resendClientError)}
              className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            />
          </div>
          {resendMessage && (
            <p className="text-muted text-sm" role="status">
              {resendMessage}
            </p>
          )}
          {resendClientError && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {resendClientError}
            </p>
          )}
          <ApiErrorAlert error={resendApiError} />
          <button
            type="submit"
            disabled={submittingResend}
            className="border-border bg-surface text-foreground hover:bg-background focus:ring-accent/50 w-full rounded-md border px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
          >
            {submittingResend ? 'Sending…' : 'Resend verification email'}
          </button>
        </form>
      </div>

      <p className="text-muted mt-8 text-center text-sm">
        <Link
          to={ROUTES.login}
          state={location.state}
          className="text-accent font-medium hover:underline"
        >
          Back to sign in
        </Link>
        {' · '}
        <Link
          to={ROUTES.register}
          state={location.state}
          className="text-accent font-medium hover:underline"
        >
          Register
        </Link>
      </p>
    </div>
    </div>
  );
}
