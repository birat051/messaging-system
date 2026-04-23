import { useCallback, useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useStore } from 'react-redux';
import { useToast } from '@/common/components/toast/useToast';
import { listMyDevices, postNotifyTrustedDeviceSyncRequest } from '@/common/api/usersApi';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { evaluateDeviceSyncBootstrapState } from '@/common/crypto/deviceBootstrapSync';
import { revalidateConversationMessagesForUser } from '@/common/realtime/revalidateConversationMessages';
import { selectAuthUser } from '@/modules/auth/stores/selectors';
import {
  selectSyncState,
  selectMessagingDeviceId,
} from '@/modules/crypto/stores/selectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store/store';

function formatDeviceRegisteredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export type NewDeviceSyncBannerPresentation = 'home-inline' | 'blocking-modal';

type NewDeviceSyncBannerProps = {
  /**
   * **`blocking-modal`:** full-screen gate copy (messaging disabled until sync). **`home-inline`** was the old
   * non-blocking strip; reserved for tests / future use.
   */
  presentation?: NewDeviceSyncBannerPresentation;
};

/**
 * New-device **Feature 13** UI. Default **`presentation`** is **`blocking-modal`** when rendered from
 * **`DeviceSyncBlockingGate`** — messaging REST is gated until **`syncState`** leaves **`pending`** / **`in_progress`**.
 *
 * **`GET /v1/users/me/devices`** (SWR), Socket.IO **`device:sync_complete`**, or **`message:new`** with a wrapped key
 * re-runs **`evaluateDeviceSyncBootstrapState`** so **`syncState`** can become **`complete`**.
 */
export function NewDeviceSyncBanner({
  presentation = 'blocking-modal',
}: NewDeviceSyncBannerProps = {}) {
  const toast = useToast();
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const { mutate } = useSWRConfig();
  const user = useAppSelector(selectAuthUser);
  const syncState = useAppSelector(selectSyncState);
  const myDeviceId = useAppSelector(selectMessagingDeviceId)?.trim() ?? '';

  const active = syncState === 'pending' || syncState === 'in_progress';

  const [notifyLoading, setNotifyLoading] = useState(false);

  const { data, error, isLoading } = useSWR(
    user?.id && active ? (['new-device-sync-banner', user.id] as const) : null,
    listMyDevices,
    { revalidateOnFocus: true },
  );

  useEffect(() => {
    if (!user?.id || !active || myDeviceId.length === 0) {
      return;
    }
    const uid = user.id.trim();
    void evaluateDeviceSyncBootstrapState(dispatch, myDeviceId, {
      getState: () => reduxStore.getState().crypto,
      onHistoryMayDecryptNow: () =>
        revalidateConversationMessagesForUser(mutate, uid),
    });
  }, [user?.id, active, myDeviceId, data, error, dispatch, reduxStore, mutate]);

  const handleNotifyTrustedDeviceAgain = useCallback(async () => {
    const did = myDeviceId.trim();
    if (did.length === 0) {
      toast.error('Device id is not ready yet — wait a moment and try again.');
      return;
    }
    setNotifyLoading(true);
    try {
      await postNotifyTrustedDeviceSyncRequest({ deviceId: did });
      toast.success(
        'Sync request sent. Open your other signed-in browser and approve when prompted.',
      );
    } catch (e: unknown) {
      toast.error(parseApiError(e).message);
    } finally {
      setNotifyLoading(false);
    }
  }, [toast, myDeviceId]);

  if (!user || !active) {
    return null;
  }

  const otherDevices =
    data?.items.filter((row) => row.deviceId.trim() !== myDeviceId) ?? [];

  const isBlockingModal = presentation === 'blocking-modal';

  const body = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2
            id="device-sync-blocking-title"
            className="text-sm font-semibold sm:text-base"
          >
            New device — sync required
          </h2>
          <p
            id="device-sync-blocking-desc"
            className="text-foreground mt-1 text-xs leading-relaxed sm:text-sm"
          >
            This device cannot read older encrypted messages by default. Open this account on another browser you
            already use and approve multi-device sync there—only wrapped message keys are copied; your private key
            never leaves each device.
          </p>
          {isBlockingModal ? (
            <p className="text-foreground mt-2 text-xs font-medium sm:text-sm">
              Messaging is unavailable on this device until sync completes or your key appears for existing
              messages.
            </p>
          ) : (
            <p className="text-foreground mt-1 text-xs leading-relaxed sm:text-sm">
              You can still <span className="font-medium">send and receive new messages</span> that include keys for
              this device; older threads stay locked until sync completes.
            </p>
          )}
          {syncState === 'in_progress' ? (
            <div
              data-testid="new-device-sync-spinner"
              className="text-foreground mt-2 flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <span
                className="border-muted-foreground/50 inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
                aria-hidden
              />
              <span className="text-xs font-medium sm:text-sm">Syncing message keys…</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
          Open one of these devices to approve sync
        </h3>
        {error ? (
          <p className="text-destructive mt-2 text-xs sm:text-sm" role="alert">
            Could not load your device list. Check your connection and try again.
          </p>
        ) : isLoading && !data ? (
          <p className="text-muted-foreground mt-2 text-xs sm:text-sm" aria-live="polite">
            Loading registered devices…
          </p>
        ) : (
          <ul
            className="border-border mt-2 max-h-40 divide-y overflow-y-auto rounded-md border sm:max-h-48"
            aria-label="Other registered devices"
          >
            {otherDevices.length === 0 ? (
              <li className="text-muted-foreground px-3 py-2.5 text-xs sm:text-sm">
                No other devices are listed yet. When you sign in on another browser or phone, it will appear
                here after it registers.
              </li>
            ) : (
              otherDevices.map((d) => {
                const label = d.deviceLabel?.trim();
                const primary = label && label.length > 0 ? label : d.deviceId;
                const secondary =
                  label && label.length > 0 ? d.deviceId : formatDeviceRegisteredAt(d.createdAt);
                return (
                  <li
                    key={d.deviceId}
                    className="text-foreground flex flex-col gap-0.5 px-3 py-2 text-xs sm:text-sm"
                  >
                    <span className="font-medium">{primary}</span>
                    {secondary ? (
                      <span className="text-muted-foreground text-[11px] sm:text-xs">{secondary}</span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {isBlockingModal && otherDevices.length > 0 ? (
        <div className="border-border mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs sm:text-sm">
            If the other browser did not show an approval prompt, send the request again.
          </p>
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            data-testid="device-sync-retry-notify"
            disabled={notifyLoading}
            onClick={() => void handleNotifyTrustedDeviceAgain()}
          >
            {notifyLoading ? 'Sending…' : 'Notify other device again'}
          </button>
        </div>
      ) : null}
    </>
  );

  if (isBlockingModal) {
    return (
      <div data-testid="new-device-sync-banner" className="text-foreground">
        {body}
      </div>
    );
  }

  return (
    <section
      className="border-border bg-muted/50 text-foreground mb-4 shrink-0 rounded-lg border px-4 py-3 sm:mb-6 sm:px-5"
      role="region"
      aria-label="New device sync"
      data-testid="new-device-sync-banner"
    >
      {body}
    </section>
  );
}
