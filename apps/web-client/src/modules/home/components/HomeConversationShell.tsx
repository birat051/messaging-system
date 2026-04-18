import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import useSWR from 'swr';
import { listConversations } from '@/common/api';
import { useAuth } from '@/common/hooks/useAuth';
import { usePrefetchRecipientPublicKey } from '@/common/hooks/usePrefetchRecipientPublicKey';
import { usePeerPresenceDisplay } from '@/modules/home/hooks/usePeerPresenceDisplay';
import { useSocketWorker } from '@/common/realtime/SocketWorkerProvider';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { useConversation } from '@/modules/home/hooks/useConversation';
import { usePeerMessageDecryption } from '@/modules/home/hooks/usePeerMessageDecryption';
import { useSendMessage } from '@/modules/home/hooks/useSendMessage';
import { resolveMessageDisplayBody } from '@/modules/home/utils/messageDisplayBody';
import {
  conversationListAvatarInitials,
  lastMessagePreviewLine,
} from '@/modules/home/utils/conversationListPreview';
import { peerPresenceTextClassName } from '@/modules/home/utils/peerPresenceDisplay';
import {
  currentUserHasSeenMessage,
  hydratePeerReadDedupeFromReceipts,
} from '@/modules/home/utils/receiptEmitGuards';
import { CallSessionDock } from '@/modules/home/components/CallSessionDock';
import { startOutgoingCall } from '@/modules/home/stores/callSlice';
import {
  setActiveConversationId,
  setSendError,
  type StoredMessage,
} from '@/modules/home/stores/messagingSlice';
import {
  selectOutboundReceiptDisplay,
  type ReceiptTickContext,
} from '@/modules/home/stores/messagingSelectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { ConversationList } from './ConversationList';
import { E2eeMessagingIndicator } from './E2eeMessagingIndicator';
import { ThreadComposer } from './ThreadComposer';
import { ThreadMessageList, type ThreadMessageItem } from './ThreadMessageList';
import { UserSearchPanel } from './UserSearchPanel';

const EMPTY_MESSAGE_IDS: string[] = [];
const EMPTY_USER_IDS: string[] = [];
const EMPTY_THREAD_MESSAGES: ThreadMessageItem[] = [];

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
  const { user } = useAuth();
  const socketWorker = useSocketWorker();
  const emitReceipt = socketWorker?.emitReceipt;
  const socketConnected = socketWorker?.status.kind === 'connected';

  const conversationReadCursorKeyRef = useRef<string>('');
  const messageReadEmittedRef = useRef(new Set<string>());

  const activeConversationId = useAppSelector(
    (s) => s.messaging.activeConversationId,
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

  const selectedConversation = useMemo(
    () => data?.items?.find((c) => c.id === activeConversationId) ?? null,
    [data?.items, activeConversationId],
  );

  const isGroupThread = selectedConversation?.isGroup === true;

  const selectedPeerUserId = useMemo(() => {
    if (!activeConversationId || !data?.items) {
      return null;
    }
    return (
      data.items.find((c) => c.id === activeConversationId)?.peerUserId ?? null
    );
  }, [data, activeConversationId]);

  usePrefetchRecipientPublicKey(
    !isGroupThread ? selectedPeerUserId : null,
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
      out.push({
        id: m.id,
        body: resolveMessageDisplayBody(
          m,
          isOwn,
          messaging.senderPlaintextByMessageId,
          messaging.decryptedBodyByMessageId,
        ),
        mediaKey: m.mediaKey ?? null,
        mediaPreviewUrl: stored.mediaPreviewUrl ?? null,
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
    const lastId = messageIdsForActive[messageIdsForActive.length - 1];
    if (!lastId) {
      return;
    }
    const key = `${activeConversationId}:${lastId}`;
    const uid = user?.id?.trim() ?? '';
    const lastMsg = messaging.messagesById[lastId];
    if (
      uid &&
      lastMsg &&
      lastMsg.senderId !== uid &&
      currentUserHasSeenMessage(
        messaging.receiptsByMessageId,
        lastId,
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
      messageId: lastId,
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
      if (!activeConversationId || !emitReceipt || !user?.id) {
        return;
      }
      const uid = user.id;
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
      const title = c.title ?? (c.isGroup ? 'Group' : 'Direct message');
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
        peerUserId: c.isGroup === true ? null : (c.peerUserId ?? null),
      };
    });
  }, [data, messaging, user?.id]);

  const composerDisabled =
    messagesLoading ||
    isGroupThread ||
    (!isGroupThread &&
      (selectedPeerUserId == null || selectedPeerUserId === ''));

  const threadTitle =
    selectedConversation?.title?.trim() ||
    (selectedConversation?.isGroup ? 'Group' : 'Direct message');

  const headerPeerPresence = usePeerPresenceDisplay(
    !isGroupThread ? selectedPeerUserId : null,
  );

  return (
    <div
      className="border-border bg-surface/40 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border md:flex-row"
      data-testid="home-conversation-shell"
    >
      {/* Left: search + list — full width on phone; hidden on small screens when a thread is open (master/detail). */}
      <div
        className={`border-border flex min-h-0 flex-col md:h-full md:w-80 md:shrink-0 md:border-r md:bg-background/30 ${
          activeConversationId ? 'max-md:hidden' : 'w-full max-md:flex-1'
        }`}
      >
        <div className="border-border shrink-0 border-b">
          <UserSearchPanel embedInSidebar />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
          <ConversationList
            className="flex-1 rounded-none border-0 bg-transparent p-0 shadow-none"
            items={items}
            isLoading={isLoading}
            errorMessage={parsedError?.message ?? null}
            selectedId={activeConversationId}
            onSelect={(id) => dispatch(setActiveConversationId(id))}
          />
        </div>
      </div>
      {/* Right: thread — hidden on phone until a chat is selected; min width on md+ for readable pane. */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col md:min-w-[min(100%,18rem)] lg:min-w-[22rem] ${
          activeConversationId ? 'max-md:min-h-0' : 'max-md:hidden'
        }`}
      >
        {activeConversationId ? (
          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3"
            role="region"
            aria-label="Conversation thread"
          >
            <div className="border-border flex shrink-0 items-center gap-2 border-b pb-2">
              <button
                type="button"
                data-testid="thread-mobile-back"
                className="border-border text-foreground hover:bg-surface/80 focus:ring-accent/50 min-h-11 min-w-11 shrink-0 rounded-md border px-3 text-sm font-medium outline-none focus:ring-2 md:hidden"
                aria-label="Back to conversations"
                onClick={() => {
                  dispatch(setActiveConversationId(null));
                }}
              >
                ←
              </button>
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                <span className="text-foreground truncate text-sm font-medium">
                  {threadTitle}
                </span>
                {!isGroupThread &&
                headerPeerPresence.variant !== 'hidden' &&
                headerPeerPresence.text ? (
                  <span
                    className={`truncate text-xs ${peerPresenceTextClassName(headerPeerPresence.variant)}`}
                  >
                    {headerPeerPresence.text}
                  </span>
                ) : null}
              </div>
              {!isGroupThread && selectedPeerUserId ? (
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
                    dispatch(startOutgoingCall(selectedPeerUserId));
                  }}
                >
                  Call
                </button>
              ) : null}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <ThreadMessageList
                messages={threadMessages}
                isLoading={messagesLoading}
                isValidating={messagesValidating}
                errorMessage={messagesParsedError ?? null}
                onPeerMessageVisible={
                  emitReceipt ? onPeerMessageVisible : undefined
                }
              />
            </div>
            <div className="border-border shrink-0 space-y-2 border-t pt-2">
              <E2eeMessagingIndicator />
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
                      ? 'Group messaging is not available in this client yet.'
                      : composerDisabled
                        ? 'Cannot send until the thread is ready.'
                        : undefined
                }
              />
            </div>
          </section>
        ) : (
          <section
            data-testid="thread-empty-placeholder"
            role="region"
            aria-label="Conversation thread"
            className="text-muted flex min-h-0 w-full flex-1 flex-col items-center justify-center p-4 text-center text-sm md:min-w-0"
            aria-live="polite"
          >
            <p role="status" className="max-w-sm">
              Select a conversation to open the thread.
            </p>
          </section>
        )}
      </div>
      <CallSessionDock
        activeConversationId={activeConversationId}
        isGroupThread={isGroupThread}
        selectedPeerUserId={selectedPeerUserId}
        peerDisplayName={threadTitle}
      />
    </div>
  );
}
