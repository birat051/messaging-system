import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/common/components/toast/useToast';
import { registerUser } from '../../../common/api/authApi';
import { getCurrentUser, updateCurrentUserProfile } from '../../../common/api/usersApi';
import { ApiErrorAlert } from '../../../common/components/ApiErrorAlert';
import { parseApiError, type ParsedApiError } from '../utils/apiError';
import {
  PASSWORD_MIN_LENGTH,
  REGISTER_AVATAR_MAX_BYTES,
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
  const toast = useToast();
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
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
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
      profilePictureUrl,
      profileFile,
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
        ...(!profileFile && profilePictureUrl.trim()
          ? { profilePicture: profilePictureUrl.trim() }
          : {}),
      };
      const data = await registerUser(body);
      if (data.accessToken) {
        applyAuthResponse(dispatch, data, null);
        if (profileFile) {
          const fd = new FormData();
          fd.append('file', profileFile);
          await updateCurrentUserProfile(fd);
        }
        const user = await getCurrentUser();
        dispatch(setUser(user));
        if (user.emailVerified === false) {
          if (profileFile) {
            toast.info(
              'Verify your email to finish setup. You can change your photo anytime in Settings.',
            );
          }
          navigate(ROUTES.verifyEmail, {
            replace: true,
            state: verifyEmailState(user.email),
          });
          return;
        }
        navigate(getPostLoginRedirectPath(location.state), { replace: true });
        return;
      }
      if (profileFile) {
        toast.info(
          'Account created. After you verify your email and sign in, add a profile photo from Settings.',
        );
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
        Password at least {PASSWORD_MIN_LENGTH} characters. Optional status (max {STATUS_MAX_LENGTH}{' '}
        chars) and profile photo — upload an image (preferred); or paste a URL in the advanced
        section.
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
          <label htmlFor="register-avatar-file" className="mb-1 block text-sm font-medium">
            Profile photo <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="register-avatar-file"
            name="avatarFile"
            type="file"
            accept="image/*"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setProfileFile(f ?? null);
              if (f) {
                setProfilePictureUrl('');
              }
            }}
            aria-invalid={Boolean(fieldErrors.profilePicture)}
            aria-describedby={fieldErrors.profilePicture ? 'register-avatar-err' : undefined}
            className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm outline-none focus:ring-2 ${fieldBorderClass('profilePicture')}`}
          />
          <p className="text-muted mt-1 text-xs">
            Max {Math.round(REGISTER_AVATAR_MAX_BYTES / (1024 * 1024))} MiB, image types only. Applied
            after sign-up when you receive a session.
          </p>
          {fieldErrors.profilePicture && (
            <p id="register-avatar-err" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {fieldErrors.profilePicture}
            </p>
          )}
        </div>

        <details className="text-sm">
          <summary className="text-muted cursor-pointer select-none hover:text-foreground">
            Or paste image URL instead (advanced)
          </summary>
          <div className="border-border mt-3 rounded-md border p-3">
            <label htmlFor="register-avatar-url" className="mb-1 block font-medium">
              Image URL
            </label>
            <input
              id="register-avatar-url"
              name="profilePictureUrl"
              type="url"
              value={profilePictureUrl}
              onChange={(ev) => {
                setProfilePictureUrl(ev.target.value);
                if (ev.target.value.trim()) {
                  setProfileFile(null);
                }
              }}
              disabled={Boolean(profileFile)}
              className="bg-background ring-ring focus:ring-accent/40 w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-50"
              placeholder="https://…"
            />
            {profileFile ? (
              <p className="text-muted mt-2 text-xs">Clear the file above to use a URL.</p>
            ) : null}
          </div>
        </details>

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
