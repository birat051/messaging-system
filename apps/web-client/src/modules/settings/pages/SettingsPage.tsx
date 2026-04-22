import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLegalFooter } from '@/common/components/AuthLegalFooter';
import { useToast } from '@/common/components/toast/useToast';
import {
  isAllowedProfileAvatarFile,
  PROFILE_AVATAR_CLIENT_TYPE_ERROR,
  type ProfileAvatarUploadPhase,
  updateCurrentUserProfile,
  uploadProfileAvatarViaPresignedPut,
} from '@/common/api/usersApi';
import { isRateLimitedError, parseApiError } from '../../auth/utils/apiError';
import {
  DISPLAY_NAME_MAX_LENGTH,
  STATUS_MAX_LENGTH,
  validateSettingsFields,
} from '../../../common/utils/formValidation';
import { buildProfileFormData } from '../utils/buildProfileFormData';
import { setUser } from '../../auth/stores/authSlice';
import { syncGuestReauthPreferenceFromUser } from '../../auth/utils/guestSessionPreference';
import { useAuth } from '../../../common/hooks/useAuth';
import { ROUTES } from '../../../routes/paths';
import { useAppDispatch } from '../../../store/hooks';

function submitButtonLabel(
  submitting: boolean,
  hasFile: boolean,
  phase: ProfileAvatarUploadPhase | null,
): string {
  if (!submitting) {
    return 'Save changes';
  }
  if (hasFile && phase) {
    if (phase === 'presign') {
      return 'Preparing upload…';
    }
    if (phase === 'put') {
      return 'Uploading photo…';
    }
    return 'Saving profile…';
  }
  return 'Saving…';
}

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [profileImageError, setProfileImageError] = useState<string | null>(null);
  const [avatarPhase, setAvatarPhase] = useState<ProfileAvatarUploadPhase | null>(null);
  const [putPercent, setPutPercent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const hasPendingFile = Boolean(file && file.size > 0);
  const submitLabel = useMemo(
    () => submitButtonLabel(submitting, hasPendingFile, avatarPhase),
    [submitting, hasPendingFile, avatarPhase],
  );

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setStatus(user.status ?? '');
    }
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    setProfileImageError(null);

    const { formData: fd, hasPart } = buildProfileFormData({
      file: null,
      displayName,
      status,
      previousDisplayName: user?.displayName,
      previousStatus: user?.status,
    });
    const hasFile = hasPendingFile;
    const textParts = hasPart;

    if (!textParts && !hasFile) {
      setClientError(
        'Change your display name, status, or choose a new profile image.',
      );
      return;
    }

    const fieldErr = validateSettingsFields({ displayName, status });
    if (fieldErr) {
      setClientError(fieldErr);
      return;
    }

    if (hasFile && file && !isAllowedProfileAvatarFile(file)) {
      setProfileImageError(PROFILE_AVATAR_CLIENT_TYPE_ERROR);
      return;
    }

    setSubmitting(true);
    setAvatarPhase(null);
    setPutPercent(null);
    try {
      let updated;
      if (hasFile) {
        const initialDn = (user?.displayName ?? '').trim();
        const initialSt = (user?.status ?? '').trim();
        const dn = displayName.trim();
        const st = status.trim();
        const textChanged = dn !== initialDn || st !== initialSt;
        /** Plain JSON **`PATCH`** for **`profilePictureMediaKey`** — not wrapped in message-layer E2EE. */
        updated = await uploadProfileAvatarViaPresignedPut(file!, {
          profilePatch: textChanged
            ? {
                ...(dn !== initialDn ? { displayName: dn } : {}),
                ...(st !== initialSt ? { status: st === '' ? null : st } : {}),
              }
            : undefined,
          onUploadPhase: (phase) => {
            setAvatarPhase(phase);
            if (phase !== 'put') {
              setPutPercent(null);
            }
          },
          onUploadProgress: (pct) => {
            setPutPercent(pct);
          },
        });
      } else {
        updated = await updateCurrentUserProfile(fd);
      }
      dispatch(setUser(updated));
      syncGuestReauthPreferenceFromUser(updated);
      setFile(null);
      setDisplayName(updated.displayName ?? '');
      setStatus(updated.status ?? '');
      toast.success('Profile updated.');
    } catch (err) {
      const parsed = parseApiError(err);
      if (hasFile) {
        setProfileImageError(parsed.message);
      }
      if (!isRateLimitedError(err)) {
        toast.error(parsed.message);
      }
    } finally {
      setSubmitting(false);
      setAvatarPhase(null);
      setPutPercent(null);
    }
  }

  async function onSignOut() {
    setSignOutBusy(true);
    try {
      await logout();
    } finally {
      setSignOutBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="text-foreground mx-auto max-w-md px-6 py-16">
          <p className="text-muted text-sm">Loading profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="text-foreground mx-auto max-w-lg px-6 py-10">
      <div className="mb-8">
        <Link
          to={ROUTES.home}
          className="text-muted hover:text-foreground text-sm hover:underline"
        >
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Profile &amp; settings</h1>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5"
        aria-busy={submitting}
      >
        <div>
          <label htmlFor="settings-display" className="mb-1 block text-sm font-medium">
            Display name
          </label>
          <input
            id="settings-display"
            name="displayName"
            type="text"
            autoComplete="name"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={submitting}
            onChange={(ev) => setDisplayName(ev.target.value)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="settings-status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <input
            id="settings-status"
            name="status"
            type="text"
            maxLength={STATUS_MAX_LENGTH}
            value={status}
            disabled={submitting}
            onChange={(ev) => setStatus(ev.target.value)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-60"
            placeholder="Short line shown on your profile"
          />
        </div>

        <div>
          <label htmlFor="settings-avatar" className="mb-1 block text-sm font-medium">
            Profile image
          </label>
          <input
            id="settings-avatar"
            name="file"
            type="file"
            accept="image/*"
            disabled={submitting}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setProfileImageError(null);
              setFile(f ?? null);
            }}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm disabled:opacity-60"
          />
          {submitting && hasPendingFile && avatarPhase === 'put' && putPercent !== null && (
            <p className="text-muted mt-1 text-xs" aria-live="polite">
              Upload progress: {putPercent}%
            </p>
          )}
          {user.profilePicture && (
            <p className="text-muted mt-1 text-xs">
              Current:{' '}
              <a
                href={user.profilePicture}
                target="_blank"
                rel="noreferrer"
                className="text-accent break-all underline"
              >
                {user.profilePicture}
              </a>
            </p>
          )}
          {profileImageError && (
            <p
              id="settings-profile-image-error"
              className="mt-2 text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {profileImageError}
            </p>
          )}
        </div>

        {clientError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {clientError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60 sm:w-auto"
        >
          {submitLabel}
        </button>
      </form>

      <section
        aria-labelledby="settings-account-heading"
        className="border-border mt-10 border-t pt-8"
      >
        <h2 id="settings-account-heading" className="text-foreground text-sm font-semibold">
          Account
        </h2>
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={submitting || signOutBusy}
          aria-busy={signOutBusy}
          className="border-border bg-background text-foreground hover:bg-surface/80 focus:ring-accent/50 mt-4 rounded-md border px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60"
        >
          {signOutBusy ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <section
        aria-labelledby="settings-legal-heading"
        className="border-border mt-10 border-t pt-8"
      >
        <h2 id="settings-legal-heading" className="text-foreground text-sm font-semibold">
          Legal
        </h2>
        <AuthLegalFooter compact />
      </section>
    </div>
    </div>
  );
}
