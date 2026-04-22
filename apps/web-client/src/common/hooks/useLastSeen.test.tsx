import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE_HEARTBEAT_COMPACT_MS } from '@/common/utils/presenceCadence';
import { createTestStore } from '@/common/test-utils';
import { useLastSeen } from './useLastSeen';

const mockGetLastSeen = vi.hoisted(() => vi.fn());
const socketState = vi.hoisted(() => ({ connected: true }));

vi.mock('../realtime/SocketWorkerProvider', () => ({
  useSocketWorker: () => ({
    getLastSeen: mockGetLastSeen,
    status: socketState.connected
      ? { kind: 'connected' as const, socketId: 'sk-1' }
      : { kind: 'disconnected' as const, reason: 'io' },
    sendMessage: vi.fn(),
    emitReceipt: vi.fn(),
    emitWebRtcSignaling: vi.fn(),
    setPresenceHeartbeatMode: vi.fn(),
    setWebRtcInboundHandler: vi.fn(),
  }),
}));

function makeWrapper() {
  const store = createTestStore();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, Wrapper };
}

describe('useLastSeen', () => {
  beforeEach(() => {
    mockGetLastSeen.mockReset();
    socketState.connected = true;
  });

  it('returns idle when targetUserId is empty', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLastSeen(null), { wrapper: Wrapper });
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('returns idle when socket is not connected', async () => {
    socketState.connected = false;
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLastSeen('user-z'), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'idle' });
    });
    expect(mockGetLastSeen).not.toHaveBeenCalled();
  });

  it('maps ok ack', async () => {
    mockGetLastSeen.mockResolvedValueOnce({
      status: 'ok',
      source: 'mongodb',
      lastSeenAt: '2026-04-12T12:00:00.000Z',
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLastSeen('user-a'), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'ok',
        source: 'mongodb',
        lastSeenAt: '2026-04-12T12:00:00.000Z',
      });
    });
    expect(mockGetLastSeen).toHaveBeenCalledWith('user-a');
  });

  it('maps not_available', async () => {
    mockGetLastSeen.mockResolvedValueOnce({ status: 'not_available' });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLastSeen('user-b'), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'not_available' });
    });
  });

  it('maps rejected getLastSeen to error', async () => {
    mockGetLastSeen.mockRejectedValueOnce(new Error('Socket not connected'));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLastSeen('user-c'), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'error',
        message: 'Socket not connected',
      });
    });
  });

  it('liveRefresh polls getLastSeen on a compact interval', async () => {
    vi.useFakeTimers();
    try {
      mockGetLastSeen.mockResolvedValue({
        status: 'ok',
        source: 'redis',
        lastSeenAt: '2026-04-12T12:00:00.000Z',
      });
      const { Wrapper } = makeWrapper();
      renderHook(() => useLastSeen('user-live', { liveRefresh: true }), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      const afterMount = mockGetLastSeen.mock.calls.length;
      expect(afterMount).toBeGreaterThanOrEqual(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_COMPACT_MS);
      });
      expect(mockGetLastSeen.mock.calls.length).toBeGreaterThan(afterMount);
    } finally {
      vi.useRealTimers();
    }
  });
});
