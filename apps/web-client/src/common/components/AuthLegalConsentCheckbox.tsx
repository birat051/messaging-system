import { Link } from 'react-router-dom';
import { ROUTES } from '@/routes/paths';

/** Shown when the user submits without checking the consent box. */
export const AUTH_LEGAL_CONSENT_REQUIRED_MESSAGE =
  'You must agree to the Privacy Policy and Terms and Conditions to continue.';

type AuthLegalConsentCheckboxProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** When true, show error styling and optional message (pass **`aria-describedby`** target). */
  invalid?: boolean;
  /** **`id`** of an error paragraph (e.g. **`login-consent-error`**). */
  errorId?: string;
};

/**
 * Mandatory consent before sign-in, register, or guest session — links open in the same tab (**SPA** **`Link`**).
 */
export function AuthLegalConsentCheckbox({
  id,
  checked,
  onChange,
  invalid,
  errorId,
}: AuthLegalConsentCheckboxProps) {
  return (
    <div className="flex gap-3">
      <input
        id={id}
        name="legalConsent"
        type="checkbox"
        checked={checked}
        onChange={(ev) => onChange(ev.target.checked)}
        aria-invalid={invalid}
        aria-describedby={errorId}
        className="border-border text-accent focus:ring-accent/40 mt-0.5 size-4 shrink-0 rounded"
      />
      <label htmlFor={id} className="text-muted text-sm leading-snug">
        I agree to the{' '}
        <Link to={ROUTES.privacy} className="text-accent font-medium hover:underline">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link to={ROUTES.terms} className="text-accent font-medium hover:underline">
          Terms and Conditions
        </Link>
        . <span className="text-foreground">(required)</span>
      </label>
    </div>
  );
}
