import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { AuthLegalFooter } from '@/common/components/AuthLegalFooter';
import { PencilEditIcon } from '@/common/components/PencilEditIcon';
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
  const avatarDialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputId = useId();
  const avatarDialogTitleId = useId();
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] = useState<
    string | null
  >(null);
  const [avatarPhotoLoadError, setAvatarPhotoLoadError] = useState(false);
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

  useEffect(() => {
    if (!file) {
      setPendingAvatarPreviewUrl(null);
      return;
    }
    if (typeof URL.createObjectURL !== 'function') {
      setPendingAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPendingAvatarPreviewUrl(url);
    return () => {
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    };
  }, [file]);

  const displayedAvatarSrc = pendingAvatarPreviewUrl ?? user?.profilePicture ?? null;

  useEffect(() => {
    setAvatarPhotoLoadError(false);
  }, [displayedAvatarSrc]);

  function openAvatarDialog() {
    avatarDialogRef.current?.showModal();
  }

  function closeAvatarDialog() {
    avatarDialogRef.current?.close();
  }

  function onChooseNewPhotoFromDialog() {
    fileInputRef.current?.click();
    closeAvatarDialog();
  }

  function discardPendingAvatar() {
    setFile(null);
    setProfileImageError(null);
    closeAvatarDialog();
  }

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
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={openAvatarDialog}
            aria-haspopup="dialog"
            aria-label="Change profile photo"
            className="border-border focus:ring-accent/50 relative h-28 w-28 shrink-0 rounded-full border-2 bg-surface focus:ring-2 focus:outline-none disabled:opacity-60"
          >
            <span className="block h-full w-full overflow-hidden rounded-full">
              {displayedAvatarSrc && !avatarPhotoLoadError ? (
                <img
                  src={displayedAvatarSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarPhotoLoadError(true)}
                />
              ) : (
                <span
                  className="bg-muted/35 block h-full w-full rounded-full"
                  aria-hidden
                />
              )}
            </span>
            <span
              className="border-border bg-background text-foreground pointer-events-none absolute right-1 bottom-1 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm"
              aria-hidden
            >
              <PencilEditIcon className="h-4 w-4 opacity-90" />
            </span>
          </button>
          <label htmlFor={avatarInputId} className="sr-only">
            Profile image
          </label>
          <input
            ref={fileInputRef}
            id={avatarInputId}
            name="file"
            type="file"
            accept="image/*"
            disabled={submitting}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setProfileImageError(null);
              setFile(f ?? null);
              ev.target.value = '';
            }}
            className="sr-only"
          />
          {submitting && hasPendingFile && avatarPhase === 'put' && putPercent !== null && (
            <p className="text-muted text-xs" aria-live="polite">
              Upload progress: {putPercent}%
            </p>
          )}
          {profileImageError && (
            <p
              id="settings-profile-image-error"
              className="text-center text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {profileImageError}
            </p>
          )}
        </div>

        <dialog
          ref={avatarDialogRef}
          aria-labelledby={avatarDialogTitleId}
          className="border-border bg-background text-foreground [&::backdrop]:bg-foreground/40 fixed top-1/2 left-1/2 z-50 w-[min(100vw-2rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-4 shadow-lg"
        >
          <h2 id={avatarDialogTitleId} className="text-base font-semibold">
            Profile photo
          </h2>
          <p className="text-muted mt-1 text-sm">
            Choose a new image to replace your picture, or cancel to keep your current one
            {file ? ' (including an unsaved selection).' : '.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onChooseNewPhotoFromDialog}
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-accent/50 rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:outline-none"
            >
              Choose new photo
            </button>
            {file ? (
              <button
                type="button"
                onClick={discardPendingAvatar}
                className="border-border bg-background text-foreground hover:bg-surface/80 focus:ring-accent/50 rounded-md border px-3 py-2 text-sm font-medium focus:ring-2 focus:outline-none"
              >
                Discard unsaved photo
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeAvatarDialog}
              className="border-border bg-background text-foreground hover:bg-surface/80 focus:ring-accent/50 rounded-md border px-3 py-2 text-sm font-medium focus:ring-2 focus:outline-none"
            >
              Cancel
            </button>
          </div>
        </dialog>

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
