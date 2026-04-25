/**
 * **STUN** / **TURN** URLs for **`RTCPeerConnection`** (`iceServers`).
 * Configure via **`VITE_*`** — see **`README.md`** (WebRTC — ports & ICE); **dev** coturn: **`infra/dev/coturn/`**, **prod** (split stack): **`infra/prod/coturn/`**.
 *
 * **Prod / split data host (coturn):** use **`VITE_WEBRTC_TURN_URLS`** = **`turn:`** (or **`turns:`** if you terminate TLS) pointing at
 * the **public** IP or DNS of TURN (same as **`COTURN_EXTERNAL_IP` / the host browsers reach) and **`:3478`**. Set
 * **`VITE_WEBRTC_TURN_USERNAME`** and **`VITE_WEBRTC_TURN_CREDENTIAL`** to the same long-lived user as **`COTURN_LT_USER`** / **`COTURN_LT_PASS`**
 * in **`infra/prod/coturn/turnserver.prod.template`** (via **`infra/prod/docker-compose.data.yml`**). App origin **`https://ekko.biratbhattacharjee.com`**
 * does not change TURN; ICE must list a reachable **turn:** entry for difficult NATs.
 */

function splitIceUrls(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ICE servers for **`new RTCPeerConnection({ iceServers })`**.
 *
 * - **STUN:** **`VITE_WEBRTC_STUN_URLS`** — comma-separated **`stun:`** URLs. If unset, uses a public
 *   **Google STUN** host for NAT discovery (fine for dev; replace in production if policy requires).
 * - **TURN:** **`VITE_WEBRTC_TURN_URLS`** — comma-separated **`turn:`** / **`turns:`** URLs. Optional
 *   **`VITE_WEBRTC_TURN_USERNAME`** + **`VITE_WEBRTC_TURN_CREDENTIAL`** apply to **every** TURN URL
 *   (matches dev **coturn** `user=` in **`infra/dev/coturn/turnserver.conf`**, and prod **`COTURN_LT_*`** in
 *   **`turnserver.prod.template` / `infra/prod/docker-compose.data.yml`**).
 */
export function getWebRtcIceServers(): RTCIceServer[] {
  const stunRaw = import.meta.env.VITE_WEBRTC_STUN_URLS as string | undefined;
  const stunList = splitIceUrls(stunRaw);
  const stunUrls = stunList.length > 0 ? stunList : ['stun:stun.l.google.com:19302'];

  const servers: RTCIceServer[] = [
    { urls: stunUrls.length === 1 ? stunUrls[0]! : stunUrls },
  ];

  const turnUrls = splitIceUrls(import.meta.env.VITE_WEBRTC_TURN_URLS as string | undefined);
  const turnUser = (import.meta.env.VITE_WEBRTC_TURN_USERNAME as string | undefined)?.trim() ?? '';
  const turnCred = (import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL as string | undefined)?.trim() ?? '';
  const useTurnAuth = turnUser.length > 0 && turnCred.length > 0;

  for (const u of turnUrls) {
    if (useTurnAuth) {
      servers.push({ urls: u, username: turnUser, credential: turnCred });
    } else {
      servers.push({ urls: u });
    }
  }

  return servers;
}
