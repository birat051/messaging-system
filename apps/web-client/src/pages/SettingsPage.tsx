import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { updateCurrentUserProfile } from '../api/usersApi';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import { parseApiError, type ParsedApiError } from '../features/auth/apiError';
import {
  DISPLAY_NAME_MAX_LENGTH,
  STATUS_MAX_LENGTH,
  validateSettingsFields,
} from '../lib/formValidation';
import { setUser } from '../features/auth/authSlice';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../routes/paths';
import { useAppDispatch } from '../store/hooks';

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim();
}

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ParsedApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setStatus(user.status ?? '');
    }
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    setApiError(null);
    setSuccess(null);

    const fd = new FormData();
    let hasPart = false;

    if (file && file.size > 0) {
      fd.append('file', file);
      hasPart = true;
    }

    const dn = normalize(displayName);
    const st = normalize(status);
    const initialDn = normalize(user?.displayName);
    const initialSt = normalize(user?.status);

    if (dn !== initialDn) {
      fd.append('displayName', dn);
      hasPart = true;
    }
    if (st !== initialSt) {
      fd.append('status', st);
      hasPart = true;
    }

    if (!hasPart) {
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

    setSubmitting(true);
    try {
      const updated = await updateCurrentUserProfile(fd);
      dispatch(setUser(updated));
      setFile(null);
      setDisplayName(updated.displayName ?? '');
      setStatus(updated.status ?? '');
      setSuccess('Profile updated.');
    } catch (err) {
      setApiError(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="text-foreground mx-auto max-w-md px-6 py-16">
        <p className="text-muted text-sm">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="text-foreground mx-auto max-w-lg px-6 py-10">
      <div className="mb-8">
        <Link
          to={ROUTES.home}
          className="text-muted hover:text-foreground text-sm hover:underline"
        >
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Profile &amp; settings</h1>
        <p className="text-muted mt-2 text-sm">
          Update your display name, status, or profile photo. Uses{' '}
          <code className="text-accent text-xs">PATCH /users/me</code> (multipart).
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
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
            onChange={(ev) => setDisplayName(ev.target.value)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
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
            onChange={(ev) => setStatus(ev.target.value)}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
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
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setFile(f ?? null);
            }}
            className="border-border bg-background ring-ring focus:ring-accent/40 w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm"
          />
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
        </div>

        {clientError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {clientError}
          </p>
        )}
        <ApiErrorAlert error={apiError} />
        {success && (
          <p className="text-muted text-sm" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 w-full rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-60 sm:w-auto"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
