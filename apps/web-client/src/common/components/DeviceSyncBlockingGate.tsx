import { type ReactNode } from 'react';
import { selectAuthUser } from '@/modules/auth/stores/selectors';
import { selectSyncState } from '@/modules/crypto/stores/selectors';
import { NewDeviceSyncBanner } from '@/modules/home/components/NewDeviceSyncBanner';
import { useAppSelector } from '@/store/hooks';

/**
 * While **`crypto.syncState`** is **`pending`** or **`in_progress`** (registered users only), blocks the **main app**
 * shell with a modal so **conversation / messaging REST** is not triggered from **`HomeConversationShell`**.
 * **`SocketWorkerProvider`** stays mounted **outside** this gate so **`device:sync_complete`** can still arrive.
 */
export function DeviceSyncBlockingGate({ children }: { children: ReactNode }) {
  const user = useAppSelector(selectAuthUser);
  const syncState = useAppSelector(selectSyncState);

  const blocking =
    !!user &&
    user.guest !== true &&
    (syncState === 'pending' || syncState === 'in_progress');

  if (!blocking) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-sm"
        aria-modal="true"
        role="alertdialog"
        aria-labelledby="device-sync-blocking-title"
        aria-describedby="device-sync-blocking-desc"
        data-testid="device-sync-blocking-overlay"
      >
        <div className="border-border bg-muted/50 text-foreground w-full max-w-lg rounded-xl border px-4 py-5 shadow-xl sm:px-6 sm:py-6">
          <NewDeviceSyncBanner presentation="blocking-modal" />
        </div>
      </div>
    </>
  );
}
