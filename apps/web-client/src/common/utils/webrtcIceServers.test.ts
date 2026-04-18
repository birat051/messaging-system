import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWebRtcIceServers } from './webrtcIceServers';

describe('webrtcIceServers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to public STUN when VITE_WEBRTC_STUN_URLS is unset', () => {
    vi.stubEnv('VITE_WEBRTC_STUN_URLS', '');
    vi.stubEnv('VITE_WEBRTC_TURN_URLS', '');
    const ice = getWebRtcIceServers();
    expect(ice[0]).toEqual({ urls: 'stun:stun.l.google.com:19302' });
    expect(ice).toHaveLength(1);
  });

  it('uses custom STUN URLs', () => {
    vi.stubEnv('VITE_WEBRTC_STUN_URLS', 'stun:a:1,stun:b:2');
    vi.stubEnv('VITE_WEBRTC_TURN_URLS', '');
    const ice = getWebRtcIceServers();
    expect(ice[0]).toEqual({ urls: ['stun:a:1', 'stun:b:2'] });
  });

  it('adds TURN with username and credential', () => {
    vi.stubEnv('VITE_WEBRTC_STUN_URLS', '');
    vi.stubEnv('VITE_WEBRTC_TURN_URLS', 'turn:127.0.0.1:3478');
    vi.stubEnv('VITE_WEBRTC_TURN_USERNAME', 'dev');
    vi.stubEnv('VITE_WEBRTC_TURN_CREDENTIAL', 'turnsecret');
    const ice = getWebRtcIceServers();
    expect(ice).toHaveLength(2);
    expect(ice[1]).toEqual({
      urls: 'turn:127.0.0.1:3478',
      username: 'dev',
      credential: 'turnsecret',
    });
  });

  it('adds TURN without credential fields when user/pass omitted', () => {
    vi.stubEnv('VITE_WEBRTC_TURN_URLS', 'turn:example:443');
    vi.stubEnv('VITE_WEBRTC_TURN_USERNAME', '');
    vi.stubEnv('VITE_WEBRTC_TURN_CREDENTIAL', '');
    const ice = getWebRtcIceServers();
    expect(ice[1]).toEqual({ urls: 'turn:example:443' });
  });
});
