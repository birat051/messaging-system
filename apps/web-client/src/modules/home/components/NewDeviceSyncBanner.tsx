import { useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useStore } from 'react-redux';
import { listMyDevices } from '@/common/api/usersApi';
import { evaluateDeviceSyncBootstrapState } from '@/common/crypto/deviceBootstrapSync';
import { revalidateConversationMessagesForUser } from '@/common/realtime/revalidateConversationMessages';
import { selectAuthUser } from '@/modules/auth/stores/selectors';
import {
  selectSyncState,
  selectMessagingDeviceId,
} from '@/modules/crypto/stores/selectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

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

/**
 * **Non-blocking** reminder while **`crypto.syncState`** is **`pending`** or **`in_progress`**.
 * Chat (send / receive) stays usable — only **past** hybrid history may show “cannot decrypt” until keys sync.
 * **`GET /v1/users/me/devices`** polling (this SWR), Socket.IO **`device:sync_complete`**, or **`message:new`**
 * with **`encryptedMessageKeys[myDeviceId]`** re-runs **`evaluateDeviceSyncBootstrapState`** so **`syncState`**
 * can move to **`complete`** and hybrid history re-fetches for decryption.
 */
export function NewDeviceSyncBanner() {
  const dispatch = useAppDispatch();
  const reduxStore = useStore();
  const { mutate } = useSWRConfig();
  const user = useAppSelector(selectAuthUser);
  const syncState = useAppSelector(selectSyncState);
  const myDeviceId = useAppSelector(selectMessagingDeviceId)?.trim() ?? '';

  const active = syncState === 'pending' || syncState === 'in_progress';

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

  if (!user || !active) {
    return null;
  }

  const otherDevices =
    data?.items.filter((row) => row.deviceId.trim() !== myDeviceId) ?? [];

  return (
    <section
      className="border-border bg-muted/50 text-foreground mb-4 shrink-0 rounded-lg border px-4 py-3 sm:mb-6 sm:px-5"
      role="region"
      aria-label="New device sync"
      data-testid="new-device-sync-banner"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold sm:text-base">New device — sync message history</h2>
          <p className="text-foreground mt-1 text-xs leading-relaxed sm:text-sm">
            This is a new device. Open the app on another device you trust to sync your message history.
            You can still <span className="font-medium">send and receive new messages</span> here; older
            encrypted threads may stay locked until sync finishes.
          </p>
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
    </section>
  );
}
