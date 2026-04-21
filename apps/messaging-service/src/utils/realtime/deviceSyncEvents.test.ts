import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));

vi.mock('../../data/messaging/rabbitmq.js', () => ({
  getMessagingSocketIoServer: () => ({ to: mockTo }),
}));

import {
  emitDeviceSyncComplete,
  emitDeviceSyncRequested,
} from './deviceSyncEvents.js';

describe('emitDeviceSyncRequested', () => {
  beforeEach(() => {
    mockTo.mockClear();
    mockEmit.mockClear();
  });

  it('emits device:sync_requested to the user room with payload', () => {
    emitDeviceSyncRequested({
      userId: 'user-1',
      newDeviceId: 'dev-1',
      newDevicePublicKey: 'spki-b64',
    });
    expect(mockTo).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit).toHaveBeenCalledWith('device:sync_requested', {
      newDeviceId: 'dev-1',
      newDevicePublicKey: 'spki-b64',
    });
  });
});

describe('emitDeviceSyncComplete', () => {
  beforeEach(() => {
    mockTo.mockClear();
    mockEmit.mockClear();
  });

  it('emits device:sync_complete to the user room with targetDeviceId', () => {
    emitDeviceSyncComplete({
      userId: 'user-1',
      targetDeviceId: 'dev-new',
    });
    expect(mockTo).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit).toHaveBeenCalledWith('device:sync_complete', {
      targetDeviceId: 'dev-new',
    });
  });
});
