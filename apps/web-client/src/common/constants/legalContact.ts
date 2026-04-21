/** Operator contact shown on Privacy Policy and Terms pages (mailto + display name). */
export const LEGAL_CONTACT_NAME = 'Birat Bhattacharjee';
export const LEGAL_CONTACT_EMAIL = 'biratbhattacharjee@gmail.com';

export function legalContactMailtoHref(): string {
  return `mailto:${LEGAL_CONTACT_EMAIL}`;
}
