import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { listConversations } from '@/common/api';
import { useAuth } from '@/common/hooks/useAuth';
import { useSocketWorker } from '@/common/realtime/SocketWorkerProvider';
import { parseApiError } from '@/modules/auth/utils/apiError';
import { useConversation } from '@/modules/home/hooks/useConversation';
import { useSendMessage } from '@/modules/home/hooks/useSendMessage';
import { setActiveConversationId, setSendError } from '@/modules/home/stores/messagingSlice';
import {
  selectOutboundReceiptDisplay,
  type ReceiptTickContext,
} from '@/modules/home/stores/messagingSelectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { ConversationList } from './ConversationList';
import { E2eeMessagingIndicator } from './E2eeMessagingIndicator';
import { ThreadComposer } from './ThreadComposer';
import { ThreadMessageList, type ThreadMessageItem } from './ThreadMessageList';

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

  const conversationReadCursorKeyRef = useRef<string>('');
  const messageReadEmittedRef = useRef(new Set<string>());

  const activeConversationId = useAppSelector(
    (s) => s.messaging.activeConversationId,
  );

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

  useEffect(() => {
    conversationReadCursorKeyRef.current = '';
    messageReadEmittedRef.current.clear();
  }, [activeConversationId]);

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
      out.push({
        id: m.id,
        body: m.body ?? '',
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
  }, [activeConversationId, messagesLoading, messageIdsForActive, emitReceipt]);

  const onPeerMessageVisible = useCallback(
    (messageId: string) => {
      if (!activeConversationId || !emitReceipt) {
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
    [activeConversationId, emitReceipt],
  );

  const { sendText } = useSendMessage({
    conversationId: activeConversationId,
    peerUserId: selectedPeerUserId,
  });

  const parsedError = error ? parseApiError(error) : null;
  const messagesParsedError = conversationMessagesError
    ? parseApiError(conversationMessagesError).message
    : null;

  const items = useMemo(() => {
    if (!data?.items) {
      return [];
    }
    return data.items.map((c) => ({
      id: c.id,
      title: c.title ?? (c.isGroup ? 'Group' : 'Direct message'),
      subtitle: formatConversationListSubtitle(c.updatedAt),
    }));
  }, [data]);

  const composerDisabled =
    messagesLoading ||
    isGroupThread ||
    (!isGroupThread &&
      (selectedPeerUserId == null || selectedPeerUserId === ''));

  return (
    <div
      className="border-border bg-surface/40 flex min-h-[min(18rem,50vh)] flex-col overflow-hidden rounded-xl border md:min-h-[min(22rem,55vh)] md:flex-row"
      data-testid="home-conversation-shell"
    >
      <div className="border-border md:bg-background/30 md:w-80 md:shrink-0 md:border-r">
        <ConversationList
          items={items}
          isLoading={isLoading}
          errorMessage={parsedError?.message ?? null}
          selectedId={activeConversationId}
          onSelect={(id) => dispatch(setActiveConversationId(id))}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeConversationId ? (
          <section
            className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3"
            role="region"
            aria-label="Conversation thread"
          >
            <div className="min-h-0 flex-1 overflow-hidden">
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
                onSend={sendText}
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
            role="region"
            aria-label="Conversation thread"
            className="text-muted flex flex-1 flex-col justify-center p-4 text-sm md:min-w-0"
            aria-live="polite"
          >
            <p role="status">Select a conversation to open the thread.</p>
          </section>
        )}
      </div>
    </div>
  );
}
