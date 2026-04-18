/**
 * Builds the **Socket.IO** **`webrtc:candidate`** body shape expected by **messaging-service**.
 */
export function serializeIceCandidateForSignaling(
  cand: RTCIceCandidate | null,
): {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
} {
  if (!cand) {
    return {};
  }
  const init = cand.toJSON();
  return {
    candidate: init.candidate,
    sdpMid: init.sdpMid,
    sdpMLineIndex: init.sdpMLineIndex,
  };
}
