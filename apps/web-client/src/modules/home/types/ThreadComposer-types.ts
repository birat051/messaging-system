/**
 * Payload from **`ThreadComposer`** to **`useSendMessage`** / **`message:send`**.
 * **`mediaKey`** is the object **`key`** from **`POST /v1/media/upload`** (**`MediaUploadResponse.key`**).
 * **`mediaPreviewUrl`** is client-only (blob or API **`url`**) for optimistic thread display — the socket
 * payload still sends **`mediaKey`** only (**no** browser S3).
 */
export type ThreadComposerSendPayload = {
  text: string;
  mediaKey?: string | null;
  mediaPreviewUrl?: string | null;
};
