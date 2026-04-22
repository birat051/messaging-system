/**
 * Client-side checks aligned with **`docs/openapi/openapi.yaml`** (`RegisterRequest`, `UpdateProfileRequest`, etc.).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const STATUS_MAX_LENGTH = 280;
export const DISPLAY_NAME_MAX_LENGTH = 200;

/** Align with **`MEDIA_MAX_BYTES`** default on messaging-service (100 MiB). */
export const REGISTER_AVATAR_MAX_BYTES = 104857600;

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Align with **`GET /users/search`** **`q`** query (min 3 default, max 254, charset). */
export const USER_SEARCH_QUERY_MIN_LENGTH = 3;
export const USER_SEARCH_QUERY_MAX_LENGTH = 254;

/** @deprecated Use **`USER_SEARCH_QUERY_MIN_LENGTH`**. */
export const USER_SEARCH_EMAIL_QUERY_MIN_LENGTH = USER_SEARCH_QUERY_MIN_LENGTH;
/** @deprecated Use **`USER_SEARCH_QUERY_MAX_LENGTH`**. */
export const USER_SEARCH_EMAIL_QUERY_MAX_LENGTH = USER_SEARCH_QUERY_MAX_LENGTH;

/** Includes **`_`** for username fragments — align with **`GET /users/search`** server validation. */
const USER_SEARCH_QUERY_RE = /^[a-z0-9@._+_-]+$/;

/**
 * Whether **`normalized`** (trimmed, lowercased) is valid for user search (**`q`**).
 * Callers should pass **`value.trim().toLowerCase()`** after the user pauses typing (debounced).
 */
export function isValidUserSearchQuery(normalized: string): boolean {
  if (
    normalized.length < USER_SEARCH_QUERY_MIN_LENGTH ||
    normalized.length > USER_SEARCH_QUERY_MAX_LENGTH
  ) {
    return false;
  }
  return USER_SEARCH_QUERY_RE.test(normalized);
}

/** @deprecated Use **`isValidUserSearchQuery`**. */
export function isValidUserSearchEmailQuery(normalized: string): boolean {
  return isValidUserSearchQuery(normalized);
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

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export type RegisterFieldKey =
  | 'email'
  | 'displayName'
  | 'username'
  | 'password'
  | 'status'
  | 'profilePicture';

export function validateRegisterForm(input: {
  email: string;
  displayName: string;
  username: string;
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
  const displayName = input.displayName.trim();
  if (!displayName) {
    fields.displayName = 'Display name is required.';
  } else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fields.displayName = `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }
  const username = input.username.trim();
  if (!username) {
    fields.username = 'Username is required.';
  } else if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    fields.username = `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  } else if (!USERNAME_RE.test(username)) {
    fields.username =
      'Use only letters, digits, and underscores (no spaces).';
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

export type GuestEntryFieldKey = 'username' | 'displayName';

/** Align with **`GuestRequest`** / register **`username`** rules. */
export function validateGuestEntryForm(input: {
  username: string;
  displayName: string;
}):
  | { valid: true }
  | { valid: false; fields: Partial<Record<GuestEntryFieldKey, string>> } {
  const fields: Partial<Record<GuestEntryFieldKey, string>> = {};
  const username = input.username.trim();
  if (!username) {
    fields.username = 'Username is required.';
  } else if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    fields.username = `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  } else if (!USERNAME_RE.test(username)) {
    fields.username =
      'Use only letters, digits, and underscores (no spaces).';
  }
  const displayName = input.displayName.trim();
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fields.displayName = `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
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
