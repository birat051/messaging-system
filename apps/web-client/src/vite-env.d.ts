/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API base including `/v1`, e.g. `http://localhost:8080/v1` */
  readonly VITE_API_BASE_URL: string | undefined;
  /** Same as **`messaging-service`** **`S3_PUBLIC_BASE_URL`** (no trailing slash) for public object URLs. */
  readonly VITE_S3_PUBLIC_BASE_URL: string | undefined;
  /** Same as **`messaging-service`** **`S3_BUCKET`** — used with **`VITE_S3_PUBLIC_BASE_URL`** to resolve **`Message.mediaKey`**. */
  readonly VITE_S3_BUCKET: string | undefined;
  /**
   * Optional page size (**1–100**) for **`GET /users/me/sync/message-keys`** during **`useDeviceKeySync`** approve flow.
   * Omit for default **100**.
   */
  readonly VITE_DEVICE_KEY_SYNC_PAGE_LIMIT: string | undefined;
  /** Set **`true`** in dev to **`console.debug`** inbound peer decrypt branches (**`usePeerMessageDecryption`**). */
  readonly VITE_DEBUG_PEER_DECRYPT: string | undefined;
  /** Set **`true`** in dev to **`console.debug`** when **`resolveMessageDisplayBody`** suppresses opaque **`body`**. */
  readonly VITE_DEBUG_MESSAGE_DISPLAY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
