/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API base including `/v1`, e.g. `http://localhost:8080/v1` */
  readonly VITE_API_BASE_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
