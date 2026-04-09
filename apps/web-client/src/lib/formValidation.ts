/**
 * Client-side checks aligned with **`docs/openapi/openapi.yaml`** (`RegisterRequest`, `UpdateProfileRequest`, etc.).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const STATUS_MAX_LENGTH = 280;
export const DISPLAY_NAME_MAX_LENGTH = 200;

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  return EMAIL_RE.test(s);
}

export function isValidHttpsOrHttpUrl(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export type RegisterFieldKey = 'email' | 'password' | 'status' | 'profilePicture';

export function validateRegisterForm(input: {
  email: string;
  password: string;
  status: string;
  profilePicture: string;
}):
  | { valid: true }
  | { valid: false; fields: Partial<Record<RegisterFieldKey, string>> } {
  const fields: Partial<Record<RegisterFieldKey, string>> = {};
  const email = input.email.trim();
  if (!email) {
    fields.email = 'Email is required.';
  } else if (!isValidEmail(email)) {
    fields.email = 'Enter a valid email address.';
  }
  if (!input.password) {
    fields.password = 'Password is required.';
  } else if (input.password.length < PASSWORD_MIN_LENGTH) {
    fields.password = `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`;
  }
  const st = input.status.trim();
  if (st.length > STATUS_MAX_LENGTH) {
    fields.status = `Status must be at most ${STATUS_MAX_LENGTH} characters.`;
  }
  const pic = input.profilePicture.trim();
  if (pic && !isValidHttpsOrHttpUrl(pic)) {
    fields.profilePicture = 'Use a valid http(s) URL or leave this blank.';
  }
  if (Object.keys(fields).length > 0) {
    return { valid: false, fields };
  }
  return { valid: true };
}

export function validateLoginForm(email: string, password: string): string | null {
  if (!email.trim()) {
    return 'Email is required.';
  }
  if (!isValidEmail(email)) {
    return 'Enter a valid email address.';
  }
  if (!password) {
    return 'Password is required.';
  }
  return null;
}

export function validateResendEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Enter the email you used to register.';
  }
  if (!isValidEmail(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validateSettingsFields(input: {
  displayName: string;
  status: string;
}): string | null {
  if (input.displayName.trim().length > DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }
  if (input.status.trim().length > STATUS_MAX_LENGTH) {
    return `Status must be at most ${STATUS_MAX_LENGTH} characters.`;
  }
  return null;
}
