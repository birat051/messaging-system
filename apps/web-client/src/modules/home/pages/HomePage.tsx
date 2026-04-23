import { Link, Navigate, useLocation } from 'react-router-dom';
import { BrandedPageHeading } from '@/common/components/BrandedPageHeading';
import { PRODUCT_DISPLAY_NAME } from '@/common/constants/product';
import { ThemeToggle } from '../../../common/components/ThemeToggle';
import { useAuth } from '../../../common/hooks/useAuth';
import { registerPathFromGuest, ROUTES } from '../../../routes/paths';
import { ConnectionStatusIndicator } from '../components/ConnectionStatusIndicator';
import { GuestSessionBanner } from '../components/GuestSessionBanner';
import { HomeConversationShell } from '../components/HomeConversationShell';
import { DeviceSyncApprovalBanner } from '../components/DeviceSyncApprovalBanner';

export function HomePage() {
  const { user, emailVerified } = useAuth();
  const location = useLocation();

  if (user && !user.guest && emailVerified === false) {
    return (
      <Navigate
        to={ROUTES.verifyEmail}
        replace
        state={{ email: user.email, from: location }}
      />
    );
  }

  return (
    <div
      data-testid="home-page-shell"
      className="flex min-h-0 w-full min-w-0 max-w-none flex-1 flex-col overflow-hidden pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] md:pl-[max(2rem,env(safe-area-inset-left))] md:pr-[max(2rem,env(safe-area-inset-right))] md:pt-[max(2.5rem,env(safe-area-inset-top))] md:pb-[max(2.5rem,env(safe-area-inset-bottom))]"
    >
        <GuestSessionBanner />
        <header className="mb-6 flex shrink-0 flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandedPageHeading titleRowClassName="text-xl font-semibold tracking-tight sm:text-2xl">
              {PRODUCT_DISPLAY_NAME}
            </BrandedPageHeading>
            {user && (
              <p className="mt-2">
                {user.guest ? (
                  <Link
                    to={registerPathFromGuest()}
                    className="text-accent inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                  >
                    Create account
                  </Link>
                ) : (
                  <Link
                    to={ROUTES.settings}
                    className="text-accent inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                  >
                    Profile &amp; settings
                  </Link>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            {user ? <ConnectionStatusIndicator /> : null}
            <ThemeToggle />
          </div>
        </header>
        {user ? <DeviceSyncApprovalBanner /> : null}
        <main className="border-border bg-surface shadow-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-card border p-4 sm:p-6">
          {user ? <HomeConversationShell /> : null}
        </main>
    </div>
  );
}
