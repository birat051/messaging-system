import { describe, expect, it } from 'vitest';
import {
  mapPresenceToSocketLifecycle,
  type PresenceConnectionStatus,
} from './socketBridge';

describe('mapPresenceToSocketLifecycle', () => {
  it.each<[PresenceConnectionStatus, ReturnType<typeof mapPresenceToSocketLifecycle>]>([
    [{ kind: 'idle' }, 'disconnected'],
    [{ kind: 'connecting' }, 'connecting'],
    [{ kind: 'connected', socketId: 's1' }, 'connected'],
    [{ kind: 'disconnected', reason: 'io' }, 'disconnected'],
    [{ kind: 'error', message: 'fail' }, 'disconnected'],
  ])('maps %j → %s', (status, expected) => {
    expect(mapPresenceToSocketLifecycle(status)).toBe(expected);
  });
});
