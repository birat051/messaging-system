import { logMediaPreview, redactUrlForLog } from '@/common/utils/mediaPreviewDebug';

type Props = {
  /** **`blob:` URL** from **`URL.createObjectURL`** — only for **`image/*`** pending attachments. */
  url: string | null;
};

/**
 * Composer preview for pending **image** attachments — fixed **150×150** px (same as thread thumbnails).
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
        className="border-border h-[150px] w-[150px] shrink-0 rounded-md border object-cover"
        onLoad={(e) => {
          logMediaPreview('composer-strip: <img> load', {
            src: redactUrlForLog(e.currentTarget.currentSrc),
            naturalWidth: e.currentTarget.naturalWidth,
            naturalHeight: e.currentTarget.naturalHeight,
          });
        }}
        onError={(e) => {
          logMediaPreview('composer-strip: <img> error (object URL or URL failed)', {
            src: redactUrlForLog(e.currentTarget.currentSrc || url),
          });
        }}
      />
    </div>
  );
}
