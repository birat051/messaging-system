import { Link, Navigate, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../../../common/components/ThemeToggle';
import { getApiBaseUrl } from '../../../common/utils/apiConfig';
import { useAuth } from '../../../common/hooks/useAuth';
import { usePresenceConnection } from '@/common/hooks/usePresenceConnection';
import { presenceLabel } from '../../../common/utils/presenceLabel';
import { ROUTES } from '../../../routes/paths';
import { UserSearchPanel } from '../components/UserSearchPanel';

export function HomePage() {
  const { user, emailVerified } = useAuth();
  const location = useLocation();
  const presence = usePresenceConnection(user?.id ?? null);

  if (user && emailVerified === false) {
    return (
      <Navigate
        to={ROUTES.verifyEmail}
        replace
        state={{ email: user.email, from: location }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              Messaging
            </h1>
            <p className="text-muted mt-1 text-sm">
              web-client — Vite, React, TypeScript, Tailwind
            </p>
            {user && (
              <p className="mt-2">
                <Link
                  to={ROUTES.settings}
                  className="text-accent text-sm font-medium hover:underline"
                >
                  Profile &amp; settings
                </Link>
              </p>
            )}
          </div>
          <ThemeToggle />
        </header>
        <main className="rounded-card border-border bg-surface shadow-card space-y-6 border p-6">
          <UserSearchPanel />
          <p className="text-foreground">
            Semantic tokens: <code className="text-accent">background</code>,{' '}
            <code className="text-accent">surface</code>,{' '}
            <code className="text-accent">accent</code> — switch theme with the
            control above.
          </p>
          <dl className="text-muted space-y-1 text-sm">
            <div>
              <dt className="font-medium text-foreground">API base</dt>
              <dd>
                <code className="text-accent">VITE_API_BASE_URL</code> →{' '}
                <code className="break-all">{getApiBaseUrl()}</code>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Socket.IO</dt>
              <dd className="text-foreground">{presenceLabel(presence)}</dd>
            </div>
          </dl>
        </main>
    </div>
  );
}
