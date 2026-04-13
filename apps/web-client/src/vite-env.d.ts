/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API base including `/v1`, e.g. `http://localhost:8080/v1` */
  readonly VITE_API_BASE_URL: string | undefined;
  /** Same as **`messaging-service`** **`S3_PUBLIC_BASE_URL`** (no trailing slash) for public object URLs. */
  readonly VITE_S3_PUBLIC_BASE_URL: string | undefined;
  /** Same as **`messaging-service`** **`S3_BUCKET`** — used with **`VITE_S3_PUBLIC_BASE_URL`** to resolve **`Message.mediaKey`**. */
  readonly VITE_S3_BUCKET: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
