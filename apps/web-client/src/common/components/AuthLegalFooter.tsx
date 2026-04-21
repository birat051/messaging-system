import { Link } from 'react-router-dom';
import { ROUTES } from '@/routes/paths';

type AuthLegalFooterProps = {
  /** When **`true`**, omit top border and large top margin (e.g. under a **Legal** section heading). */
  compact?: boolean;
};

/** Bottom-of-page legal links for auth surfaces — same-tab navigation via **`Link`**. */
export function AuthLegalFooter({ compact = false }: AuthLegalFooterProps) {
  return (
    <footer
      className={
        compact
          ? 'mt-4 pt-0'
          : 'border-border mt-10 border-t pt-6'
      }
    >
      <nav
        aria-label="Legal policies"
        className="text-muted flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm"
      >
        <Link to={ROUTES.privacy} className="text-accent font-medium hover:underline">
          Privacy Policy
        </Link>
        <span className="text-muted select-none" aria-hidden="true">
          ·
        </span>
        <Link to={ROUTES.terms} className="text-accent font-medium hover:underline">
          Terms and Conditions
        </Link>
      </nav>
    </footer>
  );
}
