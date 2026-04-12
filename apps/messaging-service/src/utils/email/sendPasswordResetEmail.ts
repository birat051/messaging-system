import sgMail from '@sendgrid/mail';
import type { Env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

function resetLink(env: Env, token: string): string | null {
  const base = env.PUBLIC_APP_BASE_URL?.trim().replace(/\/$/, '') ?? '';
  if (!base) {
    return null;
  }
  const path = env.PASSWORD_RESET_WEB_PATH.trim() || '/reset-password';
  const pathWithSlash = path.startsWith('/') ? path : `/${path}`;
  return `${base}${pathWithSlash}?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(
  env: Env,
  options: { to: string; token: string },
): Promise<void> {
  const apiKey = env.SENDGRID_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    logger.warn(
      { to: options.to },
      'SendGrid not configured; password reset email not sent',
    );
    return;
  }
  const url = resetLink(env, options.token);
  if (!url) {
    logger.warn(
      { to: options.to },
      'PUBLIC_APP_BASE_URL not set; password reset email not sent',
    );
    return;
  }
  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: options.to,
    from,
    subject: 'Reset your password',
    text: `Reset your password by opening this link:\n\n${url}\n`,
    html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
  });
  logger.info({ to: options.to }, 'password reset email sent');
}
