/**
 * Payload from **`ThreadComposer`** to **`useSendMessage`** / **`message:send`**.
 * **`mediaKey`** is the object **`key`** from **`POST /v1/media/upload`** (**`MediaUploadResponse.key`**).
 * **`mediaPreviewUrl`** is client-only (blob or API **`url`**) for optimistic thread display — the socket
 * payload sends **`mediaKey`** only; the key and retrievable URL are encrypted in the hybrid inner plaintext.
 */
export type ThreadComposerSendPayload = {
  text: string;
  mediaKey?: string | null;
  mediaPreviewUrl?: string | null;
  /** HTTPS **`MediaUploadResponse.url`** when present — encrypted as hybrid **`m.u`** (or derived in serializer). */
  mediaRetrievableUrl?: string | null;
};
