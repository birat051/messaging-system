import sgMail from '@sendgrid/mail';
import type { Env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

function verificationLink(env: Env, verificationToken: string): string | null {
  const base = env.PUBLIC_APP_BASE_URL?.trim().replace(/\/$/, '') ?? '';
  if (!base) {
    return null;
  }
  const path = env.EMAIL_VERIFICATION_WEB_PATH.trim() || '/verify-email';
  const pathWithSlash = path.startsWith('/') ? path : `/${path}`;
  return `${base}${pathWithSlash}?token=${encodeURIComponent(verificationToken)}`;
}

/**
 * Sends verification email via SendGrid when **`SENDGRID_API_KEY`**, **`EMAIL_FROM`**, and **`PUBLIC_APP_BASE_URL`** are set.
 * Otherwise logs a warning and returns without throwing (registration may still succeed).
 */
export async function sendVerificationEmail(
  env: Env,
  options: { to: string; verificationToken: string },
): Promise<void> {
  const apiKey = env.SENDGRID_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    logger.warn(
      { to: options.to },
      'SendGrid not configured (SENDGRID_API_KEY or EMAIL_FROM missing); verification email not sent',
    );
    return;
  }

  const url = verificationLink(env, options.verificationToken);
  if (!url) {
    logger.warn(
      { to: options.to },
      'PUBLIC_APP_BASE_URL not set; verification email not sent (cannot build link)',
    );
    return;
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: options.to,
    from,
    subject: 'Verify your email',
    text: `Verify your email address by opening this link:\n\n${url}\n`,
    html: `<p>Verify your email address:</p><p><a href="${url}">${url}</a></p>`,
  });
  logger.info({ to: options.to }, 'verification email sent');
}
