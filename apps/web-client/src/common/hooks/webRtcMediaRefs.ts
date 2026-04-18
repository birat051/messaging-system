import type { RefObject } from 'react';

export type WebRtcMediaRefs = {
  remoteAudioRef: RefObject<HTMLAudioElement>;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  localVideoRef: RefObject<HTMLVideoElement>;
};
