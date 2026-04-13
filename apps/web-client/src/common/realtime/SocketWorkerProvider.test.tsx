import { renderWithProviders } from '@/common/test-utils';
import { defaultMockUser } from '@/common/mocks/handlers';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocketWorkerBridge } from './socketBridge';
import { SocketWorkerProvider } from './SocketWorkerProvider';
import type { WorkerToMainMessage } from './socketWorkerProtocol';

vi.mock('./socketBridge', () => ({
  createSocketWorkerBridge: vi.fn(),
}));

const mockEmitReceipt = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockTerminate = vi.fn();

let bridgeHandler: ((msg: WorkerToMainMessage) => void) | null = null;

describe('SocketWorkerProvider — message:new receive path', () => {
  beforeEach(() => {
    bridgeHandler = null;
    mockEmitReceipt.mockClear();
    vi.mocked(createSocketWorkerBridge).mockImplementation((onMessage) => {
      bridgeHandler = onMessage;
      return {
        connect: mockConnect,
        sendMessage: vi.fn(),
        emitReceipt: mockEmitReceipt,
        disconnect: mockDisconnect,
        terminate: mockTerminate,
      };
    });
  });

  it('forwards parsed message to Redux; peer message triggers message:delivered emit', async () => {
    const { store, unmount } = renderWithProviders(
      <SocketWorkerProvider>
        <div />
      </SocketWorkerProvider>,
      {
        preloadedState: {
          auth: {
            user: defaultMockUser,
            accessToken: 'test-access-token',
          },
        },
      },
    );

    await waitFor(() => {
      expect(bridgeHandler).not.toBeNull();
    });

    expect(mockConnect).toHaveBeenCalledWith(
      expect.any(String),
      defaultMockUser.id,
      'test-access-token',
    );

    const peerMessage = {
      id: 'm-srv-1',
      conversationId: 'conv-abc',
      senderId: 'peer-other-user',
      body: 'hello',
      mediaKey: null,
      createdAt: '2026-04-12T12:00:00.000Z',
    };

    bridgeHandler!({ type: 'message_new', payload: peerMessage });

    expect(store.getState().messaging.messagesById['m-srv-1']).toMatchObject(
      peerMessage,
    );
    expect(mockEmitReceipt).toHaveBeenCalledWith('message:delivered', {
      messageId: 'm-srv-1',
      conversationId: 'conv-abc',
    });

    unmount();
  });

  it('does not emit message:delivered for own message (senderId === current user)', async () => {
    const { unmount } = renderWithProviders(
      <SocketWorkerProvider>
        <div />
      </SocketWorkerProvider>,
      {
        preloadedState: {
          auth: {
            user: defaultMockUser,
            accessToken: 'tok',
          },
        },
      },
    );

    await waitFor(() => {
      expect(bridgeHandler).not.toBeNull();
    });

    mockEmitReceipt.mockClear();

    bridgeHandler!({
      type: 'message_new',
      payload: {
        id: 'm-own',
        conversationId: 'conv-x',
        senderId: defaultMockUser.id,
        body: 'me',
        mediaKey: null,
        createdAt: '2026-04-12T12:00:00.000Z',
      },
    });

    expect(mockEmitReceipt).not.toHaveBeenCalled();
    unmount();
  });

  it('logs in dev when payload fails parseMessageNewPayload', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { store, unmount } = renderWithProviders(
      <SocketWorkerProvider>
        <div />
      </SocketWorkerProvider>,
      {
        preloadedState: {
          auth: {
            user: defaultMockUser,
            accessToken: 'tok',
          },
        },
      },
    );

    await waitFor(() => {
      expect(bridgeHandler).not.toBeNull();
    });

    const beforeKeys = Object.keys(store.getState().messaging.messagesById);

    bridgeHandler!({ type: 'message_new', payload: { id: 'bad' } });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[message:new] dropped invalid payload'),
      { id: 'bad' },
    );
    expect(Object.keys(store.getState().messaging.messagesById)).toEqual(
      beforeKeys,
    );

    warnSpy.mockRestore();
    unmount();
  });
});
