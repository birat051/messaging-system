export type ThreadMessageMediaProps = {
  mediaKey: string;
  /** For stable **`id`** / **`aria-describedby`** hooks. */
  messageId: string;
  /** Own message vs peer — drives attachment **`alt`** / **`aria-label`** context. */
  isOwn: boolean;
  /**
   * **`blob:`** or **`http(s):`** from composer upload — used before **`getMediaPublicObjectUrl(mediaKey)`**
   * resolves (no AWS SDK in the browser).
   */
  previewUrlOverride?: string | null;
  /**
   * When **`true`** (default), the thumbnail opens a **`<dialog>`** lightbox with the same **`src`** (API/CDN/blob).
   * Set **`false`** to disable the lightbox (still **`loading="lazy"`** + **`alt`** on the inline **`<img>`**).
   */
  lightboxEnabled?: boolean;
};
