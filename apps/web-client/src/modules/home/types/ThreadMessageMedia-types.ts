export type ThreadMessageMediaProps = {
  mediaKey: string;
  /** For stable **`id`** / **`aria-describedby`** hooks. */
  messageId: string;
  /** Own message vs peer — drives attachment **`alt`** / **`aria-label`** context. */
  isOwn: boolean;
};
