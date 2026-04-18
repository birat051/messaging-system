import { Link } from 'react-router-dom';
import { ROUTES } from '../../../routes/paths';

export function LandingPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="text-foreground mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Messaging</h1>
        <p className="text-muted mt-2 text-sm">
          Try the app with a temporary guest session, or sign in with a full account.
        </p>
        <div className="mt-8">
          <Link
            to={ROUTES.guest}
            className="bg-accent text-accent-foreground hover:bg-accent/90 focus:ring-accent/50 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none"
          >
            Continue as guest
          </Link>
        </div>
        <p className="text-muted mt-6 text-center text-sm">
          <Link
            to={ROUTES.login}
            className="text-accent font-medium hover:underline"
          >
            Sign in
          </Link>
          <span aria-hidden="true" className="text-muted px-1">
            ·
          </span>
          <Link
            to={ROUTES.register}
            className="text-accent font-medium hover:underline"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
