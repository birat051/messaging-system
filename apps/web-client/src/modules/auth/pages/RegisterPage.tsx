import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { registerUser } from '../../../common/api/authApi';
import { getCurrentUser } from '../../../common/api/usersApi';
import { ApiErrorAlert } from '../../../common/components/ApiErrorAlert';
import { parseApiError, type ParsedApiError } from '../utils/apiError';
import {
  PASSWORD_MIN_LENGTH,
  STATUS_MAX_LENGTH,
  validateRegisterForm,
  type RegisterFieldKey,
} from '../../../common/utils/formValidation';
import { applyAuthResponse } from '../utils/applyAuthResponse';
import { setUser } from '../stores/authSlice';
import { useAuth } from '../../../common/hooks/useAuth';
import type { AuthRedirectState } from '../../../routes/postLoginRedirect';
import { getPostLoginRedirectPath } from '../../../routes/postLoginRedirect';
import { ROUTES } from '../../../routes/paths';
import { useAppDispatch } from '../../../store/hooks';

export function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(getPostLoginRedirectPath(location.state), { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  const authState = location.state as AuthRedirectState | null;

  const verifyEmailState = (email: string): AuthRedirectState => ({
    email,
    from: authState?.from,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RegisterFieldKey, string>>
  >({});
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function fieldBorderClass(key: RegisterFieldKey): string {
    return fieldErrors[key]
      ? 'border-red-500 dark:border-red-500'
      : 'border-border';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setApiError(null);
    const v = validateRegisterForm({
      email,
      password,
      status,
      profilePicture,
    });
    if (!v.valid) {
      setFieldErrors(v.fields);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        email: email.trim(),
        password,
        ...(status.trim() ? { status: status.trim() } : {}),
        ...(profilePicture.trim()
          ? { profilePicture: profilePicture.trim() }
          : {}),
      };
      const data = await registerUser(body);
      if (data.accessToken) {
        applyAuthResponse(dispatch, data, null);
        const user = await getCurrentUser();
        dispatch(setUser(user));
        if (user.emailVerified === false) {
          navigate(ROUTES.verifyEmail, {
            replace: true,
            state: verifyEmailState(user.email),
          });
          return;
        }
        navigate(getPostLoginRedirectPath(location.state), { replace: true });
        return;
      }
      navigate(ROUTES.verifyEmail, {
        replace: true,
        state: verifyEmailState(body.email),
      });
    } catch (err) {
      setApiError(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="text-foreground mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="text-muted mt-2 text-sm">
        Password at least {PASSWORD_MIN_LENGTH} characters. Optional: status (max{' '}
        {STATUS_MAX_LENGTH} chars) and profile picture URL (e.g. after media upload).
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="register-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'register-email-err' : undefined}
            className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('email')}`}
          />
          {fieldErrors.email && (
            <p id="register-email-err" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="register-password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'register-password-err' : undefined}
            className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('password')}`}
          />
          {fieldErrors.password && (
            <p id="register-password-err" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {fieldErrors.password}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="register-status" className="mb-1 block text-sm font-medium">
            Status <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="register-status"
            name="status"
            type="text"
            maxLength={STATUS_MAX_LENGTH}
            value={status}
            onChange={(ev) => setStatus(ev.target.value)}
            aria-invalid={Boolean(fieldErrors.status)}
            aria-describedby={fieldErrors.status ? 'register-status-err' : undefined}
            className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('status')}`}
            placeholder="Short line shown on your profile"
          />
          {fieldErrors.status && (
            <p id="register-status-err" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {fieldErrors.status}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="register-avatar" className="mb-1 block text-sm font-medium">
            Profile picture URL <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="register-avatar"
            name="profilePicture"
            type="url"
            value={profilePicture}
            onChange={(ev) => setProfilePicture(ev.target.value)}
            aria-invalid={Boolean(fieldErrors.profilePicture)}
            aria-describedby={
              fieldErrors.profilePicture ? 'register-avatar-err' : undefined
            }
            className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('profilePicture')}`}
            placeholder="https://…"
          />
          {fieldErrors.profilePicture && (
            <p id="register-avatar-err" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {fieldErrors.profilePicture}
            </p>
          )}
        </div>

        <ApiErrorAlert error={apiError} />

        <button
          type="submit"
          disabled={submitting}
          className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Register'}
        </button>
      </form>

      <p className="text-muted mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link
          to={ROUTES.login}
          state={location.state}
          className="text-accent font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
