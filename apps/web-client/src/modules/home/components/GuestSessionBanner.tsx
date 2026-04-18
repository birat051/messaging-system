import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  selectAccessTokenExpiresAt,
  selectAuthUser,
} from '../../auth/stores/selectors';
import { ROUTES } from '../../../routes/paths';
import { useAppSelector } from '../../../store/hooks';
import { formatGuestSessionTimeRemaining } from '../utils/guestSessionTimeRemaining';

const TICK_MS = 30_000;

/**
 * Persistent guest notice on the home shell — session copy, **Create account**, optional countdown.
 */
export function GuestSessionBanner() {
  const user = useAppSelector(selectAuthUser);
  const expiresAt = useAppSelector(selectAccessTokenExpiresAt);
  const [remainingLabel, setRemainingLabel] = useState('');

  useEffect(() => {
    if (!user?.guest || !expiresAt) {
      setRemainingLabel('');
      return;
    }
    const deadline = expiresAt;
    function tick() {
      setRemainingLabel(formatGuestSessionTimeRemaining(deadline));
    }
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [user?.guest, expiresAt]);

  if (!user?.guest) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Guest session"
      className="border-border bg-muted/40 text-foreground mb-6 shrink-0 rounded-md border px-4 py-3 text-sm"
    >
      <p className="font-medium">
        You&apos;re using a temporary guest session.
        {expiresAt && remainingLabel ? (
          <>
            {' '}
            <span className="text-muted font-normal">
              Session ends in ~{remainingLabel}.
            </span>
          </>
        ) : null}
      </p>
      <p className="text-muted mt-2 text-sm leading-snug">
        Search only shows other guests—you can message them here.{' '}
        <Link
          to={ROUTES.register}
          className="text-accent font-medium underline-offset-4 hover:underline"
        >
          Create account
        </Link>{' '}
        to reach the full directory and registered users.
      </p>
    </div>
  );
}
