import { renderWithProviders } from '@/common/test-utils';
import * as deviceBootstrapSync from '@/common/crypto/deviceBootstrapSync';
import { defaultMockUser } from '@/common/mocks/handlers';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocketWorkerBridge } from './socketBridge';
import { SocketWorkerProvider } from './SocketWorkerProvider';
vi.mock('./socketBridge', () => ({
  createSocketWorkerBridge: vi.fn(),
}));

const mockEmitReceipt = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockTerminate = vi.fn();

let bridgeHandler: Parameters<typeof createSocketWorkerBridge>[0] | null = null;

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
        emitWebRtcSignaling: vi.fn().mockResolvedValue(undefined),
        getLastSeen: vi.fn().mockResolvedValue({ status: 'not_available' }),
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

  it('dispatches syncRequested when another device requests sync', async () => {
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
          crypto: {
            registeredOnServer: true,
            keyVersion: 1,
            deviceId: 'dev-trusted',
            registeredPublicKeySpki: 'mine',
            lastUpdatedAt: '2026-01-01T00:00:00.000Z',
            status: 'succeeded',
            error: null,
            syncState: 'idle',
            pendingSyncFromDeviceId: null,
            pendingSyncFromDevicePublicKey: null,
            syncCompletedForNewDeviceId: null,
          },
        },
      },
    );

    await waitFor(() => {
      expect(bridgeHandler).not.toBeNull();
    });

    bridgeHandler!({
      type: 'device_sync_requested',
      payload: {
        newDeviceId: 'dev-new',
        newDevicePublicKey: 'peer-spki',
      },
    });

    expect(store.getState().crypto.pendingSyncFromDeviceId).toBe('dev-new');
    expect(store.getState().crypto.pendingSyncFromDevicePublicKey).toBe(
      'peer-spki',
    );

    unmount();
  });

  it('does not dispatch syncRequested when newDeviceId is this device', async () => {
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
          crypto: {
            registeredOnServer: true,
            keyVersion: 1,
            deviceId: 'dev-self',
            registeredPublicKeySpki: 'mine',
            lastUpdatedAt: '2026-01-01T00:00:00.000Z',
            status: 'succeeded',
            error: null,
            syncState: 'idle',
            pendingSyncFromDeviceId: null,
            pendingSyncFromDevicePublicKey: null,
            syncCompletedForNewDeviceId: null,
          },
        },
      },
    );

    await waitFor(() => {
      expect(bridgeHandler).not.toBeNull();
    });

    bridgeHandler!({
      type: 'device_sync_requested',
      payload: {
        newDeviceId: 'dev-self',
        newDevicePublicKey: 'mine',
      },
    });

    expect(store.getState().crypto.pendingSyncFromDeviceId).toBeNull();
    expect(store.getState().crypto.pendingSyncFromDevicePublicKey).toBeNull();

    unmount();
  });

  it('re-evaluates device sync when device_sync_complete targets this device', async () => {
    const spy = vi
      .spyOn(deviceBootstrapSync, 'evaluateDeviceSyncBootstrapState')
      .mockResolvedValue('complete');

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
          crypto: {
            registeredOnServer: true,
            keyVersion: 1,
            deviceId: 'dev-new',
            registeredPublicKeySpki: 'mine',
            lastUpdatedAt: '2026-01-01T00:00:00.000Z',
            status: 'succeeded',
            error: null,
            syncState: 'pending',
            pendingSyncFromDeviceId: null,
            pendingSyncFromDevicePublicKey: null,
            syncCompletedForNewDeviceId: null,
          },
        },
      },
    );

    await waitFor(() => {
      expect(bridgeHandler).not.toBeNull();
    });

    bridgeHandler!({
      type: 'device_sync_complete',
      payload: { targetDeviceId: 'dev-new' },
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.any(Function),
        'dev-new',
        expect.objectContaining({
          getState: expect.any(Function),
          onHistoryMayDecryptNow: expect.any(Function),
        }),
      );
    });

    spy.mockRestore();
    unmount();
  });
});
