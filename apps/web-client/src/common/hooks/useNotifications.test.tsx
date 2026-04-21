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

describe('useNotifications — message vs call_incoming', () => {
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

  it('plays message chime for kind message but does not show a toast (E2EE-safe)', async () => {
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
      expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
        1,
      );
    });
    expect(mockInfo).not.toHaveBeenCalled();
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledWith(
      'message',
    );

    unmount();
  });

  it('call_incoming: sound only, no toast (CallSessionDock is the UI)', async () => {
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
      expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
        1,
      );
    });
    expect(mockInfo).not.toHaveBeenCalled();
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledWith(
      'call_incoming',
    );

    unmount();
  });

  it('sequential message then call: both sound-only, no toasts', async () => {
    const { store, unmount } = renderWithProviders(<TestHarness />);

    store.dispatch(
      appendInboundNotification({
        schemaVersion: 1,
        kind: 'message',
        notificationId: 'm1',
        occurredAt: '2026-04-12T12:00:00.000Z',
        threadType: 'direct',
        conversationId: 'c1',
        messageId: 'x1',
        senderUserId: 'u1',
        preview: 'secret',
      }),
    );
    await waitFor(() =>
      expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledWith(
        'message',
      ),
    );
    expect(mockInfo).not.toHaveBeenCalled();

    store.dispatch(
      appendInboundNotification({
        schemaVersion: 1,
        kind: 'call_incoming',
        notificationId: 'c2',
        occurredAt: '2026-04-12T12:00:01.000Z',
        media: 'video',
        callScope: 'direct',
        callId: 'call-abc',
        callerUserId: 'peer',
        callerDisplayName: 'Alex',
      }),
    );
    await waitFor(() =>
      expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(2),
    );
    expect(mockInfo).not.toHaveBeenCalled();
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenNthCalledWith(
      2,
      'call_incoming',
    );

    unmount();
  });

  it('does not append duplicate notificationId to Redux; chime fires once, no toasts for message', async () => {
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
    await waitFor(() =>
      expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
        1,
      ),
    );

    store.dispatch(appendInboundNotification(payload));
    await waitFor(() => {
      /* allow microtasks */
    });

    expect(mockInfo).not.toHaveBeenCalled();
    expect(notificationAlertSounds.playInboundNotificationSound).toHaveBeenCalledTimes(
      1,
    );
    unmount();
  });
});
