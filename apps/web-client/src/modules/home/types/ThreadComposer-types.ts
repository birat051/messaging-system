/**
 * Payload from **`ThreadComposer`** to **`useSendMessage`** / **`message:send`**.
 * **`mediaKey`** is the object **`key`** from **`POST /v1/media/upload`** (**`MediaUploadResponse.key`**).
 */
export type ThreadComposerSendPayload = {
  text: string;
  mediaKey?: string | null;
};
