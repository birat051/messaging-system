type Props = {
  /** **`blob:` URL** from **`URL.createObjectURL`** — only for **`image/*`** pending attachments. */
  url: string | null;
};

/**
 * Small thumbnails **above** the composer input row for pending **image** attachments.
 */
export function ComposerImagePreviewStrip({ url }: Props) {
  if (!url) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="composer-image-preview-strip"
    >
      <img
        src={url}
        alt="Pending attachment preview"
        className="border-border h-16 max-h-16 w-auto max-w-[6.5rem] shrink-0 rounded-md border object-cover"
      />
    </div>
  );
}
