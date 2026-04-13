/**
 * Client-side checks aligned with **`docs/openapi/openapi.yaml`** (`RegisterRequest`, `UpdateProfileRequest`, etc.).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const STATUS_MAX_LENGTH = 280;
export const DISPLAY_NAME_MAX_LENGTH = 200;

/** Align with **`MEDIA_MAX_BYTES`** default on messaging-service (30 MiB). */
export const REGISTER_AVATAR_MAX_BYTES = 31457280;

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Align with **`GET /users/search`** `email` query (min 3 default, max 254, charset). */
export const USER_SEARCH_EMAIL_QUERY_MIN_LENGTH = 3;
export const USER_SEARCH_EMAIL_QUERY_MAX_LENGTH = 254;

const USER_SEARCH_EMAIL_QUERY_RE = /^[a-z0-9@._+-]+$/;

/**
 * Whether **`normalized`** (trimmed, lowercased) is valid for user search.
 * Callers should pass **`value.trim().toLowerCase()`** after the user pauses typing (debounced).
 */
export function isValidUserSearchEmailQuery(normalized: string): boolean {
  if (
    normalized.length < USER_SEARCH_EMAIL_QUERY_MIN_LENGTH ||
    normalized.length > USER_SEARCH_EMAIL_QUERY_MAX_LENGTH
  ) {
    return false;
  }
  return USER_SEARCH_EMAIL_QUERY_RE.test(normalized);
}

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
  /** Used only when **`profileFile`** is not set (optional advanced path). */
  profilePictureUrl: string;
  /** Preferred: image file → upload after register via **`PATCH /users/me`**. */
  profileFile: File | null;
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

  if (input.profileFile) {
    if (!input.profileFile.type.startsWith('image/')) {
      fields.profilePicture = 'Choose an image file (e.g. PNG or JPEG).';
    } else if (input.profileFile.size > REGISTER_AVATAR_MAX_BYTES) {
      fields.profilePicture = `Image must be at most ${Math.round(REGISTER_AVATAR_MAX_BYTES / (1024 * 1024))} MiB.`;
    }
  } else {
    const pic = input.profilePictureUrl.trim();
    if (pic && !isValidHttpsOrHttpUrl(pic)) {
      fields.profilePicture = 'Use a valid http(s) URL or leave this blank.';
    }
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
