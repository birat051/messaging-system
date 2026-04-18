import * as notificationAlertSounds from '@/common/notifications/notificationAlertSounds';
import { renderWithProviders } from '@/common/test-utils';
import { appendInboundNotification } from '@/modules/app/stores/notificationsSlice';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';
import { clearInboundToastDedupe } from '@/common/notifications/inboundToastDedupe';

const mockInfo = vi.fn();

vi.mock('@/common/components/toast/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: mockInfo,
    warning: vi.fn(),
  }),
}));

function TestHarness() {
  useNotifications();
  return null;
}

describe('useNotifications', () => {
  beforeEach(() => {
    mockInfo.mockClear();
    clearInboundToastDedupe();
    vi.spyOn(notificationAlertSounds, 'playInboundNotificationSound').mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an info toast for kind message', async () => {
    const { store, unmount } = renderWithProviders(<TestHarness />);

    store.dispatch(
      appendInboundNotification({
        schemaVersion: 1,
        kind: 'message',
        notificationId: 'nid-1',
        occurredAt: '2026-04-12T12:00:00.000Z',
        threadType: 'direct',
        conversationId: 'conv',
        messageId: 'mid',
        senderUserId: 'peer',
        senderDisplayName: 'Sam',
        preview: 'Yo',
      }),
    );

    await waitFor(() => {
      expect(mockInfo).toHaveBeenCalledTimes(1);
    });
    expect(mockInfo).toHaveBeenCalledWith('New message from Sam: Yo');
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
      1,
    );
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledWith(
      'message',
    );

    unmount();
  });

  it('shows an info toast for kind call_incoming', async () => {
    const { store, unmount } = renderWithProviders(<TestHarness />);

    store.dispatch(
      appendInboundNotification({
        schemaVersion: 1,
        kind: 'call_incoming',
        notificationId: 'nid-2',
        occurredAt: '2026-04-12T12:00:00.000Z',
        media: 'audio',
        callScope: 'direct',
        callId: 'call-id-87654321',
        callerUserId: 'caller',
        callerDisplayName: null,
      }),
    );

    await waitFor(() => {
      expect(mockInfo).toHaveBeenCalledTimes(1);
    });
    expect(mockInfo).toHaveBeenCalledWith('Incoming audio call from Someone');
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
      1,
    );
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledWith(
      'call_incoming',
    );

    unmount();
  });

  it('does not append duplicate notificationId to Redux; toast fires once', async () => {
    const { store, unmount } = renderWithProviders(<TestHarness />);

    const payload = {
      schemaVersion: 1 as const,
      kind: 'message' as const,
      notificationId: 'same-id',
      occurredAt: '2026-04-12T12:00:00.000Z',
      threadType: 'direct' as const,
      conversationId: 'c',
      messageId: 'm',
      senderUserId: 'u',
    };

    store.dispatch(appendInboundNotification(payload));
    await waitFor(() => expect(mockInfo).toHaveBeenCalledTimes(1));

    store.dispatch(appendInboundNotification(payload));
    await waitFor(() => {
      /* allow microtasks */
    });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
      1,
    );
    unmount();
  });
});
