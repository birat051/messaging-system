import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAuthUser } from '@/modules/auth/stores/selectors';
import { syncDismissed } from '@/modules/crypto/stores/cryptoSlice';
import { selectPendingSync } from '@/modules/crypto/stores/selectors';
import { useDeviceKeySync } from '@/modules/crypto/hooks/useDeviceKeySync';

/**
 * Shown on a **trusted** device when Socket.IO **`device:sync_requested`** is received (**`selectPendingSync`**).
 * Approve runs **`executeApproveDeviceKeySync`** — only re-wrapped per-message keys are uploaded; the long-term private key stays local.
 */
export function DeviceSyncApprovalBanner() {
  const user = useAppSelector(selectAuthUser);
  const request = useAppSelector(selectPendingSync);
  const dispatch = useAppDispatch();
  const { approveDeviceKeySync, isApproving } = useDeviceKeySync();

  if (!user || user.guest || !request) {
    return null;
  }

  return (
    <section
      className="border-border bg-muted/50 text-foreground mb-4 shrink-0 rounded-lg border px-4 py-3 sm:mb-6 sm:px-5"
      role="region"
      aria-label="Device sync approval"
      data-testid="device-sync-approval-banner"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-foreground min-w-0 flex-1 text-xs leading-relaxed sm:text-sm">
          A new device is requesting access to your message history. Approve to sync encrypted keys.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={isApproving}
            onClick={() => {
              void approveDeviceKeySync(request);
            }}
          >
            {isApproving ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            className="border-input bg-background hover:bg-accent/50 focus-visible:ring-ring inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={isApproving}
            onClick={() => {
              dispatch(syncDismissed());
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
