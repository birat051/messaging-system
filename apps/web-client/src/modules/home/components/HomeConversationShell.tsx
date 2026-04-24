import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import type { components } from '@/generated/api-types';
import useSWR, { useSWRConfig } from 'swr';
import { listConversations } from '@/common/api';
import { NoMessagesIcon } from '@/common/components/NoMessagesIcon';
import { useAuth } from '@/common/hooks/useAuth';
import { useDocumentVisibilityVisible } from '@/common/hooks/useDocumentVisibility';
import { usePrefetchDevicePublicKeys } from '@/common/hooks/usePrefetchDevicePublicKeys';
import { usePeerPublicProfiles } from '@/modules/home/hooks/usePeerPublicProfiles';
import { usePeerPresenceDisplay } from '@/modules/home/hooks/usePeerPresenceDisplay';
import { useSocketWorker } from '@/common/realtime/SocketWorkerProvider';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { useConversation } from '@/modules/home/hooks/useConversation';
import { useUserSearchQuery } from '@/modules/home/hooks/useUserSearchQuery';
import { handleUserSearchSelection } from '@/modules/home/utils/userSearchSelection';
import { usePeerMessageDecryption } from '@/modules/home/hooks/usePeerMessageDecryption';
import { useSendMessage } from '@/modules/home/hooks/useSendMessage';
import { resolveMessageDisplayBody } from '@/modules/home/utils/messageDisplayBody';
import { isPeerDecryptInlineError } from '@/modules/home/utils/peerDecryptInline';
import {
  conversationListAvatarInitials,
  lastMessagePreviewLine,
} from '@/modules/home/utils/conversationListPreview';
import {
  formatMissingPeerProfileLabel,
  formatPendingDirectPeerLabel,
  formatUserPublicLabel,
  isDirectPeerSelf,
  SELF_DIRECT_THREAD_LABEL,
} from '@/modules/home/utils/userPublicLabel';
import { peerPresenceTextClassName } from '@/modules/home/utils/peerPresenceDisplay';
import {
  currentUserHasSeenMessage,
  hydratePeerReadDedupeFromReceipts,
  isOptimisticClientMessageId,
} from '@/modules/home/utils/receiptEmitGuards';
import { CallSessionDock } from '@/modules/home/components/CallSessionDock';
import { RemoteCallEndedToast } from '@/modules/home/components/RemoteCallEndedToast';
import { startOutgoingCall } from '@/modules/home/stores/callSlice';
import {
  setActiveConversationId,
  setPendingDirectPeer,
  setSendError,
  type StoredMessage,
} from '@/modules/home/stores/messagingSlice';
import {
  selectOutboundReceiptDisplay,
  type ReceiptTickContext,
} from '@/modules/home/stores/messagingSelectors';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store/store';
import { ConversationList } from './ConversationList';
import { E2eeMessagingIndicator } from './E2eeMessagingIndicator';
import { NewDirectThreadComposer } from './NewDirectThreadComposer';
import { ThreadComposer } from './ThreadComposer';
import { ThreadMessageList, type ThreadMessageItem } from './ThreadMessageList';
import { UserSearchBar } from './UserSearchBar';
import { UserSearchResultsPane } from './UserSearchResultsPane';

const EMPTY_MESSAGE_IDS: string[] = [];
const EMPTY_USER_IDS: string[] = [];
const EMPTY_THREAD_MESSAGES: ThreadMessageItem[] = [];

type UserSearchResult = components['schemas']['UserSearchResult'];

function formatConversationListSubtitle(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Authenticated **home** shell: **`useConversation`** (REST **`listMessages`**) + **`useSendMessage`** (**Socket.IO** send + optimistic rows).
 */
export function HomeConversationShell() {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const { mutate } = useSWRConfig();
  const { user } = useAuth();
  const searchShellId = useId();
  const userSearchHeadingId = `user-search-heading-${searchShellId}`;
  const userSearchInputId = `user-search-query-${searchShellId}`;
  const userSearch = useUserSearchQuery();
  const isGuestUserSearch = user?.guest === true;

  const socketWorker = useSocketWorker();
  const emitReceipt = socketWorker?.emitReceipt;
  const socketConnected = socketWorker?.status.kind === 'connected';

  const conversationReadCursorKeyRef = useRef<string>('');
  const messageReadEmittedRef = useRef(new Set<string>());

  const activeConversationId = useAppSelector(
    (s) => s.messaging.activeConversationId,
  );
  const pendingDirectPeer = useAppSelector(
    (s) => s.messaging.pendingDirectPeer,
  );
  const callPhase = useAppSelector((s) => s.call.phase);

  const sendPending = useAppSelector((s) => {
    const id = s.messaging.activeConversationId;
    return id ? (s.messaging.sendPendingByConversationId[id] ?? false) : false;
  });

  const sendError = useAppSelector((s) => {
    const id = s.messaging.activeConversationId;
    return id ? (s.messaging.sendErrorByConversationId[id] ?? null) : null;
  });

  const messageIdsForActive = useAppSelector((state) => {
    const id = state.messaging.activeConversationId;
    if (!id) {
      return EMPTY_MESSAGE_IDS;
    }
    return state.messaging.messageIdsByConversationId[id] ?? EMPTY_MESSAGE_IDS;
  });

  const messaging = useAppSelector((state) => state.messaging);

  usePeerMessageDecryption(activeConversationId, messageIdsForActive);

  const { data, error, isLoading } = useSWR(
    user?.id ? (['conversations', user.id] as const) : null,
    () => listConversations(),
    { revalidateOnFocus: false },
  );

  const peerUserIdsForPublicLabels = useMemo(() => {
    if (!data?.items) {
      return [];
    }
    return data.items
      .filter(
        (c) =>
          c.isGroup !== true &&
          Boolean(c.peerUserId?.trim()) &&
          !c.title?.trim(),
      )
      .map((c) => c.peerUserId!.trim());
  }, [data?.items]);

  const {
    data: peerProfilesById,
    isLoading: peerProfilesLoading,
  } = usePeerPublicProfiles(peerUserIdsForPublicLabels);

  const selectedConversation = useMemo(
    () => data?.items?.find((c) => c.id === activeConversationId) ?? null,
    [data?.items, activeConversationId],
  );

  const isGroupThread = selectedConversation?.isGroup === true;

  const selectedPeerUserId = useMemo(() => {
    if (pendingDirectPeer) {
      return pendingDirectPeer.userId;
    }
    if (!activeConversationId || !data?.items) {
      return null;
    }
    return (
      data.items.find((c) => c.id === activeConversationId)?.peerUserId ?? null
    );
  }, [pendingDirectPeer, data, activeConversationId]);

  usePrefetchDevicePublicKeys(
    !isGroupThread &&
      selectedPeerUserId &&
      !isDirectPeerSelf(selectedPeerUserId, user?.id)
      ? selectedPeerUserId
      : null,
  );

  const threadParticipantUserIds = useMemo(() => {
    if (!user?.id) {
      return EMPTY_USER_IDS;
    }
    const s = new Set<string>();
    for (const mid of messageIdsForActive) {
      const m = messaging.messagesById[mid];
      if (m?.senderId !== user.id) {
        s.add(m.senderId);
      }
    }
    return [...s];
  }, [messageIdsForActive, messaging.messagesById, user?.id]);

  const recipientUserIdsForGroup = useMemo(() => {
    if (!user?.id || !isGroupThread) {
      return EMPTY_USER_IDS;
    }
    const fromApi =
      selectedConversation?.memberIds?.filter((id) => id !== user.id) ?? [];
    if (fromApi.length > 0) {
      return fromApi;
    }
    return threadParticipantUserIds;
  }, [
    user?.id,
    isGroupThread,
    selectedConversation?.memberIds,
    threadParticipantUserIds,
  ]);

  const receiptContext: ReceiptTickContext = useMemo(() => {
    if (isGroupThread) {
      return { kind: 'group', recipientUserIds: recipientUserIdsForGroup };
    }
    return { kind: 'direct', peerUserId: selectedPeerUserId };
  }, [isGroupThread, recipientUserIdsForGroup, selectedPeerUserId]);

  useLayoutEffect(() => {
    conversationReadCursorKeyRef.current = '';
    messageReadEmittedRef.current.clear();
  }, [activeConversationId]);

  useLayoutEffect(() => {
    const { peerMessageIdsSeen, conversationReadCursorKey } =
      hydratePeerReadDedupeFromReceipts({
        activeConversationId,
        messageIds: messageIdsForActive,
        messagesById: messaging.messagesById,
        receiptsByMessageId: messaging.receiptsByMessageId,
        currentUserId: user?.id,
      });
    for (const id of peerMessageIdsSeen) {
      messageReadEmittedRef.current.add(id);
    }
    if (conversationReadCursorKey !== null) {
      conversationReadCursorKeyRef.current = conversationReadCursorKey;
    }
  }, [
    activeConversationId,
    messageIdsForActive,
    messaging.messagesById,
    messaging.receiptsByMessageId,
    user?.id,
  ]);

  const threadMessages = useMemo((): ThreadMessageItem[] => {
    if (!activeConversationId || !user?.id) {
      return EMPTY_THREAD_MESSAGES;
    }
    const out: ThreadMessageItem[] = [];
    for (const mid of messageIdsForActive) {
      const m = messaging.messagesById[mid];
      if (!m) {
        continue;
      }
      const isOwn = m.senderId === user.id;
      const receipt = isOwn
        ? selectOutboundReceiptDisplay(messaging, m.id, user.id, receiptContext)
        : null;
      const stored = m as StoredMessage;
      const body = resolveMessageDisplayBody(
        m,
        isOwn,
        messaging.senderPlaintextByMessageId,
        messaging.decryptedBodyByMessageId,
      );
      out.push({
        id: m.id,
        body,
        ...(!isOwn && isPeerDecryptInlineError(body)
          ? { bodyPresentation: 'decrypt_error' as const }
          : {}),
        mediaKey: (() => {
          const w = m.mediaKey?.trim();
          if (w) {
            return w;
          }
          const d = messaging.decryptedAttachmentKeyByMessageId[m.id]?.trim();
          return d && d.length > 0 ? d : null;
        })(),
        mediaPreviewUrl: (() => {
          const u = messaging.decryptedAttachmentUrlByMessageId[m.id]?.trim() ?? '';
          if (u.length > 0) {
            return u;
          }
          return stored.mediaPreviewUrl ?? null;
        })(),
        isOwn,
        createdAt: m.createdAt,
        outboundReceipt: receipt?.state,
        groupReceiptProgress: receipt?.groupProgress ?? undefined,
        groupReceiptSubtitle: receipt?.groupSubtitle ?? undefined,
      });
    }
    return out.length === 0 ? EMPTY_THREAD_MESSAGES : out;
  }, [
    activeConversationId,
    messageIdsForActive,
    messaging,
    receiptContext,
    user?.id,
  ]);

  const {
    isLoading: messagesLoading,
    isValidating: messagesValidating,
    error: conversationMessagesError,
  } = useConversation(activeConversationId);

  useEffect(() => {
    if (!activeConversationId || messagesLoading || !emitReceipt) {
      return;
    }
    if (messageIdsForActive.length === 0) {
      return;
    }
    const uid = user?.id?.trim() ?? '';
    /** Receipt APIs require acting on a **peer** message — not your own (`messageReceiptOps.assertRecipientNotSender`). */
    let lastPeerMessageId: string | null = null;
    for (let i = messageIdsForActive.length - 1; i >= 0; i--) {
      const mid = messageIdsForActive[i];
      if (!mid || isOptimisticClientMessageId(mid)) {
        continue;
      }
      const m = messaging.messagesById[mid];
      if (m && uid && m.senderId !== uid) {
        lastPeerMessageId = mid;
        break;
      }
    }
    if (!lastPeerMessageId) {
      return;
    }
    const key = `${activeConversationId}:${lastPeerMessageId}`;
    const lastPeerMsg = messaging.messagesById[lastPeerMessageId];
    if (
      !lastPeerMsg ||
      lastPeerMsg.senderId.trim() === uid ||
      !uid
    ) {
      return;
    }
    if (
      currentUserHasSeenMessage(
        messaging.receiptsByMessageId,
        lastPeerMessageId,
        uid,
      )
    ) {
      conversationReadCursorKeyRef.current = key;
      return;
    }
    if (conversationReadCursorKeyRef.current === key) {
      return;
    }
    conversationReadCursorKeyRef.current = key;
    void emitReceipt('conversation:read', {
      messageId: lastPeerMessageId,
      conversationId: activeConversationId,
    }).catch(() => {
      if (conversationReadCursorKeyRef.current === key) {
        conversationReadCursorKeyRef.current = '';
      }
    });
  }, [
    activeConversationId,
    messagesLoading,
    messageIdsForActive,
    emitReceipt,
    user?.id,
    messaging.messagesById,
    messaging.receiptsByMessageId,
  ]);

  const onPeerMessageVisible = useCallback(
    (messageId: string) => {
      if (isOptimisticClientMessageId(messageId)) {
        return;
      }
      if (!activeConversationId || !emitReceipt || !user?.id) {
        return;
      }
      const uid = user.id;
      const row = reduxStore.getState().messaging.messagesById[messageId];
      if (!row || row.senderId.trim() === uid.trim()) {
        return;
      }
      if (currentUserHasSeenMessage(messaging.receiptsByMessageId, messageId, uid)) {
        messageReadEmittedRef.current.add(messageId);
        return;
      }
      if (messageReadEmittedRef.current.has(messageId)) {
        return;
      }
      messageReadEmittedRef.current.add(messageId);
      void emitReceipt('message:read', {
        messageId,
        conversationId: activeConversationId,
      }).catch(() => {
        messageReadEmittedRef.current.delete(messageId);
      });
    },
    [
      activeConversationId,
      emitReceipt,
      messaging.receiptsByMessageId,
      reduxStore,
      user?.id,
    ],
  );

  const { sendMessage } = useSendMessage({
    conversationId: activeConversationId,
    peerUserId: selectedPeerUserId,
  });

  const parsedError = error ? parseApiError(error) : null;
  const messagesParsedError = conversationMessagesError
    ? parseApiError(conversationMessagesError).message
    : null;

  const items = useMemo(() => {
    if (!data?.items || !user?.id) {
      return [];
    }
    const uid = user.id;
    return data.items.map((c) => {
      let title: string;
      if (c.isGroup === true) {
        title = c.title?.trim() || 'Group';
        } else {
          const explicit = c.title?.trim();
          if (explicit) {
            title = explicit;
          } else {
            const pid = c.peerUserId?.trim();
            if (!pid) {
              title = 'Chat';
            } else if (isDirectPeerSelf(pid, uid)) {
              title = SELF_DIRECT_THREAD_LABEL;
            } else if (peerProfilesById === undefined && peerProfilesLoading) {
              title = '…';
            } else {
              const prof = peerProfilesById?.[pid];
              title = prof
                ? formatUserPublicLabel(prof)
                : formatMissingPeerProfileLabel(pid);
            }
          }
        }
      const ids = messaging.messageIdsByConversationId[c.id] ?? [];
      const lastId = ids.length > 0 ? ids[ids.length - 1]! : null;
      const lastMsg = lastId ? messaging.messagesById[lastId] : null;
      let subtitle: string;
      if (lastMsg) {
        const preview = lastMessagePreviewLine(
          lastMsg,
          uid,
          messaging.senderPlaintextByMessageId,
          messaging.decryptedBodyByMessageId,
          messaging.decryptedAttachmentKeyByMessageId,
        );
        subtitle = preview || formatConversationListSubtitle(c.updatedAt);
      } else {
        subtitle = formatConversationListSubtitle(c.updatedAt);
      }
      return {
        id: c.id,
        title,
        subtitle,
        avatarInitials: conversationListAvatarInitials(title),
      };
    });
  }, [
    data,
    messaging,
    user?.id,
    peerProfilesById,
    peerProfilesLoading,
  ]);

  const composerDisabled =
    messagesLoading ||
    !socketConnected ||
    isGroupThread ||
    (!isGroupThread &&
      (selectedPeerUserId == null || selectedPeerUserId === ''));

  const threadHeaderDisplay = useMemo(() => {
    if (pendingDirectPeer) {
      if (isDirectPeerSelf(pendingDirectPeer.userId, user?.id)) {
        return { text: SELF_DIRECT_THREAD_LABEL, loading: false };
      }
      return {
        text: formatPendingDirectPeerLabel(pendingDirectPeer),
        loading: false,
      };
    }
    if (isGroupThread) {
      return {
        text: selectedConversation?.title?.trim() || 'Group',
        loading: false,
      };
    }
    const explicit = selectedConversation?.title?.trim();
    if (explicit) {
      return { text: explicit, loading: false };
    }
    const pid = selectedPeerUserId?.trim();
    if (!pid) {
      return { text: 'Direct message', loading: false };
    }
    if (isDirectPeerSelf(pid, user?.id)) {
      return { text: SELF_DIRECT_THREAD_LABEL, loading: false };
    }
    if (peerProfilesById === undefined && peerProfilesLoading) {
      return { text: 'Loading…', loading: true };
    }
    const prof = peerProfilesById?.[pid];
    if (prof) {
      return { text: formatUserPublicLabel(prof), loading: false };
    }
    return { text: formatMissingPeerProfileLabel(pid), loading: false };
  }, [
    pendingDirectPeer,
    isGroupThread,
    selectedConversation,
    selectedPeerUserId,
    peerProfilesById,
    peerProfilesLoading,
    user?.id,
  ]);

  const threadPaneOpen = Boolean(activeConversationId || pendingDirectPeer);
  const tabVisible = useDocumentVisibilityVisible();

  const headerPresencePeerUserId = useMemo(() => {
    if (isGroupThread) {
      return null;
    }
    const p = selectedPeerUserId?.trim();
    if (!p || isDirectPeerSelf(p, user?.id)) {
      return null;
    }
    return p;
  }, [isGroupThread, selectedPeerUserId, user?.id]);

  const presenceThreadLiveBoost =
    threadPaneOpen && Boolean(headerPresencePeerUserId) && tabVisible;

  useEffect(() => {
    const sw = socketWorker;
    if (!sw?.setPresenceHeartbeatMode) {
      return;
    }
    sw.setPresenceHeartbeatMode(
      presenceThreadLiveBoost ? 'active_thread' : 'default',
    );
  }, [socketWorker, presenceThreadLiveBoost]);

  const headerPeerPresence = usePeerPresenceDisplay(headerPresencePeerUserId, {
    liveRefresh: presenceThreadLiveBoost,
  });

  const handleSearchSelectUser = useCallback(
    (hit: UserSearchResult) => {
      handleUserSearchSelection(hit, {
        onOpenConversation: (conversationId) => {
          dispatch(setActiveConversationId(conversationId));
        },
        onStartDirectFromSearch: (u) => {
          dispatch(
            setPendingDirectPeer({
              userId: u.userId,
              displayName: u.displayName ?? null,
              username: u.username ?? null,
              profilePicture: u.profilePicture ?? null,
              guest: u.guest === true,
            }),
          );
        },
        resetAfterNavigate: userSearch.resetSearch,
      });
    },
    [dispatch, userSearch.resetSearch],
  );

  return (
    <div
      className="border-border bg-surface/40 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border md:flex-row"
      data-testid="home-conversation-shell"
    >
      {/*
        Thread pane (messages): first on mobile, **right** on md+ — WhatsApp-style list+search is **left**.
      */}
      <div
        className={`border-border relative flex min-h-0 min-w-0 flex-1 flex-col md:order-2 md:min-h-0 md:min-w-[min(100%,18rem)] lg:min-w-[22rem] ${
          threadPaneOpen ? 'order-1 max-md:min-h-0' : 'order-2'
        }`}
      >
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          role="region"
          aria-label="Conversation thread"
        >
          {threadPaneOpen ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3">
              <div className="border-border flex shrink-0 items-center gap-2 border-b pb-2">
              <button
                type="button"
                data-testid="thread-mobile-back"
                className="border-border text-foreground hover:bg-surface/80 focus:ring-accent/50 min-h-11 min-w-11 shrink-0 rounded-md border px-3 text-sm font-medium outline-none focus:ring-2 md:hidden"
                aria-label="Back to conversations"
                onClick={() => {
                  if (pendingDirectPeer) {
                    dispatch(setPendingDirectPeer(null));
                    return;
                  }
                  dispatch(setActiveConversationId(null));
                }}
              >
                ←
              </button>
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                <span
                  data-testid="thread-header-title"
                  className={`truncate text-sm font-medium ${
                    threadHeaderDisplay.loading ? 'text-muted' : 'text-foreground'
                  }`}
                  aria-busy={threadHeaderDisplay.loading || undefined}
                >
                  {threadHeaderDisplay.text}
                </span>
                {!isGroupThread &&
                headerPeerPresence.variant !== 'hidden' &&
                headerPeerPresence.text ? (
                  <span
                    data-testid="thread-header-presence"
                    className={`truncate text-xs ${peerPresenceTextClassName(headerPeerPresence.variant)}`}
                  >
                    {headerPeerPresence.text}
                  </span>
                ) : null}
              </div>
              {!isGroupThread &&
              selectedPeerUserId &&
              !isDirectPeerSelf(selectedPeerUserId, user?.id) ? (
                <button
                  type="button"
                  data-testid="thread-start-call"
                  className="border-border bg-surface text-foreground hover:bg-surface/80 focus:ring-accent/50 shrink-0 rounded-md border px-3 py-2 text-sm font-medium outline-none focus:ring-2 disabled:pointer-events-none disabled:opacity-50"
                  disabled={callPhase !== 'idle' || !socketConnected}
                  title={
                    !socketConnected
                      ? 'Waiting for chat connection before calling.'
                      : undefined
                  }
                  aria-label="Start voice or video call"
                  onClick={() => {
                    const peerDisplayName =
                      (!threadHeaderDisplay.loading
                        ? threadHeaderDisplay.text
                        : pendingDirectPeer?.displayName?.trim()) ||
                      selectedConversation?.title?.trim() ||
                      null;
                    const peerUsername = pendingDirectPeer?.username?.trim() ?? null;
                    dispatch(
                      startOutgoingCall({
                        peerUserId: selectedPeerUserId,
                        peerDisplayName,
                        peerUsername,
                      }),
                    );
                  }}
                >
                  Call
                </button>
              ) : null}
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {/*
                **`conversationScrollKey`** = **`activeConversationId`** drives §6.4 pin-to-bottom reset on thread
                switch ( **`ThreadMessageList`** ); §6 **`scrollTarget*`** is read inside the list from Redux.
              */}
              <ThreadMessageList
                conversationScrollKey={activeConversationId}
                messages={
                  activeConversationId ? threadMessages : EMPTY_THREAD_MESSAGES
                }
                isLoading={activeConversationId ? messagesLoading : false}
                isValidating={activeConversationId ? messagesValidating : false}
                errorMessage={
                  activeConversationId ? (messagesParsedError ?? null) : null
                }
                onPeerMessageVisible={
                  activeConversationId && emitReceipt
                    ? onPeerMessageVisible
                    : undefined
                }
              />
              </div>
              <div className="border-border shrink-0 space-y-2 border-t pt-2">
              <E2eeMessagingIndicator />
              {activeConversationId ? (
                <ThreadComposer
                  onSend={sendMessage}
                  disabled={composerDisabled || sendPending}
                  errorMessage={sendError}
                  onExternalErrorClear={() => {
                    if (activeConversationId) {
                      dispatch(
                        setSendError({
                          conversationId: activeConversationId,
                          error: null,
                        }),
                      );
                    }
                  }}
                  placeholder={
                    messagesLoading
                      ? 'Loading messages…'
                      : isGroupThread
                        ? 'Group chat is not available in this client yet.'
                        : !socketConnected
                          ? 'Waiting for chat connection…'
                          : composerDisabled
                            ? 'Cannot send until the thread is ready.'
                            : isDirectPeerSelf(selectedPeerUserId, user?.id)
                              ? 'Message yourself…'
                              : undefined
                  }
                />
              ) : pendingDirectPeer ? (
                <NewDirectThreadComposer
                  recipient={{
                    userId: pendingDirectPeer.userId,
                    displayName: pendingDirectPeer.displayName,
                    username: pendingDirectPeer.username,
                    profilePicture: pendingDirectPeer.profilePicture,
                    conversationId: null,
                    guest: pendingDirectPeer.guest,
                  }}
                  onConversationIdStored={(cid) => {
                    dispatch(setActiveConversationId(cid));
                    const uid = user?.id?.trim();
                    if (uid) {
                      void mutate(['conversations', uid]);
                    }
                  }}
                />
              ) : null}
              </div>
            </div>
          ) : (
            <div
              data-testid="thread-empty-placeholder"
              className="text-muted flex min-h-0 w-full flex-1 flex-col items-center justify-center px-4 py-6 md:min-h-0 md:min-w-0 md:flex-1 md:py-8"
              aria-live="polite"
            >
              <div className="flex max-w-md flex-row flex-wrap items-center justify-center gap-3 text-center text-sm">
                <NoMessagesIcon className="size-10 shrink-0 opacity-90" />
                <p role="status" className="max-w-[16rem] text-pretty sm:max-w-none">
                  Choose a conversation to view messages
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      {/*
        Left column (WhatsApp-style): **search on top**, chats or search hits below. On md+ this is the
        leading column; on mobile it stacks under the thread when both visible, or full-width when no thread.
      */}
      <aside
        className={`border-border flex min-h-0 flex-col border-t md:order-1 md:h-full md:w-80 md:shrink-0 md:border-r md:border-t-0 md:bg-background/30 ${
          threadPaneOpen
            ? 'order-2 max-md:hidden'
            : 'order-1 min-h-0 min-w-0 flex-1 md:flex-none'
        }`}
      >
        <div className="border-border bg-surface/95 supports-[backdrop-filter]:bg-surface/90 sticky top-0 z-20 shrink-0 border-b backdrop-blur-sm">
          <UserSearchBar
            headingId={userSearchHeadingId}
            inputId={userSearchInputId}
            isGuest={isGuestUserSearch}
            query={userSearch.query}
            onQueryChange={userSearch.setQuery}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
          {userSearch.canSearch ? (
            <UserSearchResultsPane
              idPrefix={`home-user-search-${searchShellId}`}
              isGuest={isGuestUserSearch}
              canSearch={userSearch.canSearch}
              showLoading={userSearch.showLoading}
              parsedError={userSearch.parsedError}
              data={userSearch.data}
              selectedUserId={null}
              onSelectUser={handleSearchSelectUser}
            />
          ) : (
            <ConversationList
              className="flex-1 rounded-none border-0 bg-transparent p-0 shadow-none"
              items={items}
              isLoading={isLoading}
              errorMessage={parsedError?.message ?? null}
              selectedId={activeConversationId}
              onSelect={(id) => dispatch(setActiveConversationId(id))}
            />
          )}
        </div>
      </aside>
      <CallSessionDock
        activeConversationId={activeConversationId}
        isGroupThread={isGroupThread}
        selectedPeerUserId={selectedPeerUserId}
        peerDisplayName={
          threadHeaderDisplay.loading
            ? pendingDirectPeer?.displayName?.trim() ?? null
            : threadHeaderDisplay.text
        }
      />
      <RemoteCallEndedToast />
    </div>
  );
}
