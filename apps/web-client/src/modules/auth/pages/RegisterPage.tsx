import { type FormEvent, useEffect, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE,
  AuthLegalConsentCheckbox,
} from '@/common/components/AuthLegalConsentCheckbox';
import { AuthLegalFooter } from '@/common/components/AuthLegalFooter';
import { BrandedPageHeading } from '@/common/components/BrandedPageHeading';
import { useToast } from '@/common/components/toast/useToast';
import { registerUser } from '../../../common/api/authApi';
import {
  getCurrentUser,
  uploadProfileAvatarViaPresignedPut,
} from '../../../common/api/usersApi';
import { ApiErrorAlert } from '../../../common/components/ApiErrorAlert';
import { parseApiError, type ParsedApiError } from '../utils/apiError';
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REGISTER_AVATAR_MAX_BYTES,
  STATUS_MAX_LENGTH,
  validateRegisterForm,
  type RegisterFieldKey,
} from '../../../common/utils/formValidation';
import { loadSenderPlaintextIntoRedux } from '../../../common/senderPlaintext/loadSenderPlaintextIntoRedux';
import { applyAuthResponse } from '../utils/applyAuthResponse';
import { syncGuestReauthPreferenceFromUser } from '../utils/guestSessionPreference';
import { setUser } from '../stores/authSlice';
import { useAuth } from '../../../common/hooks/useAuth';
import type { AuthRedirectState } from '../../../routes/postLoginRedirect';
import { getPostLoginRedirectPath } from '../../../routes/postLoginRedirect';
import {
  REGISTER_FROM_GUEST_QUERY_KEY,
  REGISTER_FROM_GUEST_QUERY_VALUE,
  ROUTES,
} from '../../../routes/paths';
import { useAppDispatch } from '../../../store/hooks';

export function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { isAuthenticated, user } = useAuth();

  const openedFromGuestIntent =
    searchParams.get(REGISTER_FROM_GUEST_QUERY_KEY) ===
    REGISTER_FROM_GUEST_QUERY_VALUE;

  /**
   * Guests keep this screen; only **registered** sessions redirect. Requiring **`user !== null`**
   * avoids bouncing when a token exists but profile is not yet hydrated (e.g. refresh edge cases).
   */
  useEffect(() => {
    const isRegisteredSession =
      isAuthenticated && user !== null && user.guest === false;
    if (isRegisteredSession) {
      navigate(getPostLoginRedirectPath(location.state), { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.state]);

  const authState = location.state as AuthRedirectState | null;

  const verifyEmailState = (email: string): AuthRedirectState => ({
    email,
    from: authState?.from,
  });
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RegisterFieldKey, string>>
  >({});
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  function fieldBorderClass(key: RegisterFieldKey): string {
    return fieldErrors[key]
      ? 'border-red-500 dark:border-red-500'
      : 'border-border';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setApiError(null);
    setConsentError(null);
    const v = validateRegisterForm({
      email,
      displayName,
      username,
      password,
      status,
      profilePictureUrl,
      profileFile,
    });
    if (!v.valid) {
      setFieldErrors(v.fields);
      return;
    }
    if (!acceptedLegal) {
      setConsentError(AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        email: email.trim(),
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        password,
        ...(status.trim() ? { status: status.trim() } : {}),
        ...(!profileFile && profilePictureUrl.trim()
          ? { profilePicture: profilePictureUrl.trim() }
          : {}),
      };
      const data = await registerUser(body);
      if (data.accessToken) {
        applyAuthResponse(dispatch, data, null, 'auth.register');
        if (profileFile) {
          await uploadProfileAvatarViaPresignedPut(profileFile);
        }
        const user = await getCurrentUser();
        dispatch(setUser(user));
        syncGuestReauthPreferenceFromUser(user);
        await loadSenderPlaintextIntoRedux(dispatch, user.id);
        if (user.emailVerified === false) {
          if (profileFile) {
            toast.info(
              'Verify your email to finish setup. You can change your photo anytime in Settings.',
            );
          }
          navigate(ROUTES.verifyEmail, {
            replace: true,
            state: verifyEmailState(user.email ?? body.email),
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
      const parsed = parseApiError(err);
      if (parsed.code === 'EMAIL_ALREADY_REGISTERED') {
        setFieldErrors({ email: parsed.message });
        setApiError(null);
      } else if (parsed.code === 'USERNAME_TAKEN') {
        setFieldErrors({ username: parsed.message });
        setApiError(null);
      } else {
        setApiError(parsed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-register-from-guest={openedFromGuestIntent ? 'true' : undefined}
    >
      <div className="text-foreground mx-auto max-w-md px-6 py-16">
        <BrandedPageHeading
          horizontal={false}
          titleRowClassName="justify-center"
        ></BrandedPageHeading>
        <p className="text-muted mt-2 text-sm">
          Add your display name and a unique username (letters, digits,
          underscores). Password at least {PASSWORD_MIN_LENGTH} characters.
          Optional status (max {STATUS_MAX_LENGTH} chars) and profile photo —
          upload an image (preferred); or paste a URL in the advanced section.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="register-email"
              className="mb-1 block text-sm font-medium"
            >
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
              aria-describedby={
                fieldErrors.email ? 'register-email-err' : undefined
              }
              className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('email')}`}
            />
            {fieldErrors.email && (
              <p
                id="register-email-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="register-display-name"
              className="mb-1 block text-sm font-medium"
            >
              Display name
            </label>
            <input
              id="register-display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              required
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              value={displayName}
              onChange={(ev) => setDisplayName(ev.target.value)}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={
                fieldErrors.displayName
                  ? 'register-display-name-err'
                  : undefined
              }
              className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('displayName')}`}
              placeholder="How you want to appear"
            />
            {fieldErrors.displayName && (
              <p
                id="register-display-name-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.displayName}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="register-username"
              className="mb-1 block text-sm font-medium"
            >
              Username
            </label>
            <input
              id="register-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={
                fieldErrors.username ? 'register-username-err' : undefined
              }
              className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('username')}`}
              placeholder="your_handle"
            />
            {fieldErrors.username && (
              <p
                id="register-username-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.username}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="register-password"
              className="mb-1 block text-sm font-medium"
            >
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
              aria-describedby={
                fieldErrors.password ? 'register-password-err' : undefined
              }
              className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('password')}`}
            />
            {fieldErrors.password && (
              <p
                id="register-password-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="register-status"
              className="mb-1 block text-sm font-medium"
            >
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
              aria-describedby={
                fieldErrors.status ? 'register-status-err' : undefined
              }
              className={`bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${fieldBorderClass('status')}`}
              placeholder="Short line shown on your profile"
            />
            {fieldErrors.status && (
              <p
                id="register-status-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.status}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-avatar-file"
              className="mb-1 block text-sm font-medium"
            >
              Profile photo{' '}
              <span className="text-muted font-normal">(optional)</span>
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
              aria-describedby={
                fieldErrors.profilePicture ? 'register-avatar-err' : undefined
              }
              className={`bg-background ring-ring focus:ring-accent/40 file:bg-surface w-full rounded-md border px-3 py-2 text-sm outline-none file:mr-3 file:rounded file:border-0 file:px-3 file:py-1 file:text-sm focus:ring-2 ${fieldBorderClass('profilePicture')}`}
            />
            <p className="text-muted mt-1 text-xs">
              Max {Math.round(REGISTER_AVATAR_MAX_BYTES / (1024 * 1024))} MiB,
              image types only. Applied after sign-up when you receive a
              session.
            </p>
            {fieldErrors.profilePicture && (
              <p
                id="register-avatar-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.profilePicture}
              </p>
            )}
          </div>

          <details className="text-sm">
            <summary className="text-muted hover:text-foreground cursor-pointer select-none">
              Or paste image URL instead (advanced)
            </summary>
            <div className="border-border mt-3 rounded-md border p-3">
              <label
                htmlFor="register-avatar-url"
                className="mb-1 block font-medium"
              >
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
                className="bg-background ring-ring focus:ring-accent/40 border-border w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-50"
                placeholder="https://…"
              />
              {profileFile ? (
                <p className="text-muted mt-2 text-xs">
                  Clear the file above to use a URL.
                </p>
              ) : null}
            </div>
          </details>

          <div>
            <AuthLegalConsentCheckbox
              id="register-legal-consent"
              checked={acceptedLegal}
              onChange={(next) => {
                setAcceptedLegal(next);
                if (next) {
                  setConsentError(null);
                }
              }}
              invalid={Boolean(consentError)}
              errorId={consentError ? 'register-consent-error' : undefined}
            />
            {consentError ? (
              <p
                id="register-consent-error"
                className="text-destructive mt-2 text-sm"
                role="alert"
              >
                {consentError}
              </p>
            ) : null}
          </div>

          <ApiErrorAlert error={apiError} />

          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
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
        <p className="text-muted mt-4 text-center text-sm">
          No email yet?{' '}
          <Link
            to={ROUTES.guest}
            state={location.state}
            className="text-accent font-medium hover:underline"
          >
            Continue as guest
          </Link>
        </p>

        <AuthLegalFooter />
      </div>
    </div>
  );
}
