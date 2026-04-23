# Stable repro: User A → User B → User A (same browser) — Socket.IO reconnect storm on send

This document satisfies **TASK_CHECKLIST.md → Bugfix — User A → B → A same browser (Socket.IO reconnect storm on send) → (1) Stable repro**: fixed steps, **`VITE_*`** matrix, and **`VITE_REVOKE_DEVICE_ON_LOGOUT`** so the **rapid `connectSocket` / `POST /auth/refresh` / socket disconnect loop** after **A returns** can be reproduced while debugging.

**Related:** second-browser Feature 13 flow — **`docs/repro-second-browser-sync.md`** · same-browser decrypt-after-logout — **`docs/repro-decrypt-after-relogin.md`**.

---

## Symptom

After this **exact user order** on **one browser profile**:

1. **User A** is **new on this device** (first registration on this browser).  
2. A sends/receives encrypted 1:1 traffic.  
3. A **logs out**.  
4. **User B** logs in on the **same browser**; B’s account already has a **device id registered from another physical device** (trusted elsewhere).  
5. B completes **Feature 13** sync (or the expected approval path) and sends/receives.  
6. B **logs out**.  
7. **User A** logs in again on the **same browser**.  
8. **Historical messages** for A are visible; **first send** in a thread may trigger **repeated** Socket.IO reconnects (worker **`connectSocket`** generations climbing; server logs show **`POST /v1/auth/refresh`** then **`client namespace disconnect`** then new **`socket.io connected`** in a loop). Sending may still **ack OK** while the storm runs.

---

## Environment matrix

Document which column you used when filing bugs or PRs.

| Role | Variable | Variant **A** (default dev) | Variant **B** (revoke on logout) | Variant **C** (direct API origin) |
|------|-----------|-----------------------------|-----------------------------------|-------------------------------------|
| REST + Socket.IO base | **`VITE_API_BASE_URL`** | **`/v1`** (same origin as SPA; Vite proxies — **`apps/web-client/vite.config.ts`**) | Same as **A** | **`http://localhost:8080/v1`** (browser hits API host directly; bypass Vite proxy) |
| Revoke device on sign-out | **`VITE_REVOKE_DEVICE_ON_LOGOUT`** | **Unset** or **`false`** | **`true`** → **`DELETE /v1/users/me/devices/:deviceId`** on logout (**`logoutDeviceRevocation.ts`**) | Same as **A** or **B** |

**Where to set:** `apps/web-client/.env.development.local` (gitignored), overriding **`apps/web-client/.env.development`**. Restart Vite after changes (`VITE_*` inlined at dev start).

**Backend:** messaging-service (+ deps) per **`README.md`** / **`infra`** so auth, conversations, hybrid send, Feature 13 sync, and Socket.IO all work.

**Record for every run:**

- [ ] **Browser + version** (e.g. Chrome → About).  
- [ ] **`VITE_API_BASE_URL`** (exact string).  
- [ ] **`VITE_REVOKE_DEVICE_ON_LOGOUT`**: absent / `false` / `true`.

---

## Definitions

| Term | Meaning |
|------|---------|
| **Same browser** | One **browser profile** end-to-end (do not mix normal ↔ Incognito). |
| **User A (new on this device)** | First time this account registers **or** first use of this browser profile for A — **device key + `deviceId`** created locally per **Prerequisite — User keypair**. |
| **User B (device elsewhere)** | B has already used the app on **another machine/device** so **`GET /v1/users/me/devices`** shows at least one **other** device before B logs in **here**; after B logs in on **this** browser, B is a **new device** pending Feature 13 sync from A (or equivalent). |

---

## Prerequisites

1. Two accounts **User A** and **User B** that can open a **1:1** conversation.  
2. **Before** the repro, establish **User B** on **another browser or device** so B has a **registered device** not tied to the machine you will use for steps below (matches “device id on a separate device”).  
3. Optional but realistic: exchange at least one encrypted message **between A and B** before A’s first logout so history exists.

---

## Exact steps (single browser profile — “browser X”)

Use **Variant A**, **B**, or **C** from the matrix; restart **`npm run dev`** in **`apps/web-client`** after env changes.

### Phase 1 — User A (new on this device)

1. Open **browser X** (Chrome profile, etc.).  
2. **Register / log in** as **User A** (first time on this profile for A).  
3. **Register / log in** as **User B** in a **second** browser or profile (**not** browser X) so you can chat.  
4. On **browser X** as **A**, open **Home**, open or start a **direct thread** with **B**.  
5. Exchange **at least two encrypted lines both ways** (A→B and B→A); confirm plaintext renders.  

6. On **browser X**, **Sign out** (Settings or auth flow).  
   - Optional Network check: **`POST …/v1/auth/logout`**; if **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`**, **`DELETE …/users/me/devices/…`**.

### Phase 2 — User B on browser X (other device exists for B)

7. On **browser X**, **log in as User B**.  
8. Complete **Feature 13** expectations: **New device** banner, **trusted device** (A’s other browser) approves sync if required; wait until **historical** messages decrypt or policy in **`docs/repro-second-browser-sync.md`** is satisfied for your build.  
9. Send and receive **at least one** message as **B** in the thread with **A**.  

10. **Sign out** as **B** on **browser X**.

### Phase 3 — User A returns (repro the storm)

11. On **browser X**, **log in as User A** again.  
12. Open **Home** → open the **same** 1:1 thread with **B**. Confirm **existing** messages render.  
13. Type a **short message** and **Send once**.  

14. **Observe:**  
    - **Browser console:** **`[DEBUG]: auth session write`** ( **`sessionWriteDebug.ts`** ) — token fingerprint / **`source`** per Redux write; repeated pairs → churn. Send-path **`[DEBUG]`** logs were removed (see **Cleanup** in **`TASK_CHECKLIST.md`**).  
    - **Network:** multiple **`POST /v1/auth/refresh`** near the send.  
    - **messaging-service logs:** **`socket.io disconnected`** (**`client namespace disconnect`**) followed by **`socket.io connected`** repeating.  
    - Message may still appear with **server ack OK**.

---

## Correlating timelines (one browser session)

Satisfies **TASK_CHECKLIST** → **(1) Correlate timelines**: line up **client** token-write traces (**`sessionWriteDebug`**), **Network** `POST /auth/refresh`, and **messaging-service** socket lines for a **single** send in **Phase 3** (step 13).

### 1) What to turn on (dev)

- **web-client** dev build (`import.meta.env.DEV`) so **`[DEBUG]: auth session write`** appears (**`apps/web-client/src/modules/auth/utils/sessionWriteDebug.ts`**).
- Open **DevTools → Console**. Optional: **Redux DevTools** — watch **`auth.accessToken`** updates vs send click.

### 2) Client signals (order of interest)

Copy or screenshot **one vertical slice** from **Send click** through **first successful row** in the thread:

| Order (typical) | Source | What it means |
|-----------------|--------|---------------|
| 1 | **`[DEBUG]: auth session write`** | **`source`** (**`httpClient.performRefresh`**, **`sessionBootstrap.*`**, **`auth.login`**, …) + **`accessTokenFingerprint`** — duplicate JWT writes show **`duplicateOfPreviousWrite: true`**. |
| 2 | **Network** | **`GET …/devices/public-keys`** (hybrid encrypt) may precede **`POST …/auth/refresh`** if access JWT expired (**401** → mutex refresh). |
| 3 | **Network** | **`POST …/auth/refresh`** → new access JWT → **`SocketWorkerProvider`** debounced **`updateAccessToken`** (~**350 ms**) → worker **`connectSocket`**. |
| 4 | **Redux / UI** | **`connection.presenceStatus`** may flicker **`connecting`** during reconnect; message can still ack after **`message:send`**. |

**Storm signature:** multiple **`POST /auth/refresh`** rows and repeated **server** **`socket.io disconnected`** → **`socket.io connected`** pairs for one send — usually repeated **`setSession`** / refresh-driven **`update_access_token`**, not **`message:send`** doing auth each time.

### 3) Network tab (same session)

1. **DevTools → Network** → preserve log **on**.  
2. Filter: **`refresh`** or path **`/v1/auth/refresh`**.  
3. For each **`POST …/auth/refresh`**: note **start time** (column), **status** (200), **initiator** (click stack / `httpClient` / fetch).  
4. Optionally filter **`public-keys`** / **`devices`** — hybrid send path hits **`GET …/devices/public-keys`** around the same window; parallel traffic can trigger refresh **before** **`message_send`** reaches the worker.

**Correlation rule:** Each **`POST /auth/refresh`** that applies a **new** JWT to Redux schedules (debounced) **`updateAccessToken`** → worker **`connectSocket`** (~**350 ms+** after the last token write unless coalesced); identical JWT strings are skipped on the main thread (**`lastWorkerAccessTokenRef`**) and in **`authSlice`** when session-shaped state is unchanged.

### 4) messaging-service logs (same wall clock)

Use **structured JSON** logs where **`time`** is comparable to the browser (same machine → same epoch ms).

| Log line (`msg`) | Fields to capture | Matches client |
|------------------|-------------------|----------------|
| **`socket.io disconnected`** | **`socketId`**, **`reason`** (`client namespace disconnect` = client closed socket) | Precedes new **`socket.io connected`** after worker reconnect. |
| **`socket.io connected`** | **`socketId`**, **`hasUserId`**, **`authKind`** | New handshake after **`connect`** in worker. |
| **`request completed`** | **`POST`**, **`url":"/v1/auth/refresh"`**, **`time`**, **`correlationId`** | Pair with Network row by **time** and path. |

**Merge method:** Sort all four sources by **timestamp** into one table (spreadsheet or markdown):

| Monotonic # | Time (ms or ISO) | Source | Event |
|-------------|------------------|--------|--------|
| 1 | … | Browser Network | `POST /auth/refresh` start |
| 2 | … | Console | **`auth session write`** fingerprint / source |
| 3 | … | Server | `socket.io disconnected` id=… |
| 4 | … | Server | `socket.io connected` id=… |
| … | … | … | … |

If **`POST /auth/refresh`** lands **during** **`GET …/public-keys`** / encrypt work **before** the socket **`message:send`** ack, the refresh came from parallel REST (**401** path), not from Socket.IO rejecting each message.

### 5) One-page capture checklist

- [ ] Console: **`auth session write`** lines for the send window (fingerprints + **`source`**).  
- [ ] Optional: Redux DevTools — **`auth.accessToken`** change count during one send.  
- [ ] Network: all **`auth/refresh`** rows in the same window + **Initiator** column.  
- [ ] Server: JSON lines for **`auth/refresh`** + **`socket.io disconnected`** / **`connected`** with **`time`** aligned to the browser session clock.

---

## Map token → socket path (vs `message_send`)

**TASK_CHECKLIST** → **(2) Trace — web-client** → **Map token → socket path**. Code references: **`apps/web-client/src/common/api/httpClient.ts`**, **`modules/auth/stores/authSlice.ts`**, **`common/realtime/SocketWorkerProvider.tsx`**, **`common/realtime/socketBridge.ts`**, **`workers/socketWorker.ts`**.

### Chain (REST refresh → worker reconnect)

1. **`POST /auth/refresh`** succeeds — either **`httpClient.performRefresh`** (401 interceptor + mutex) **`dispatch`**es **`setSession`**, or **`applyAuthResponse`** / **`sessionBootstrap`** does the same after **`refreshTokens`**. Redux **`auth.accessToken`** updates.
2. **`SocketWorkerProvider`** does **not** put **`accessToken`** on the **worker bootstrap** effect deps. Bootstrap is **`useEffect(..., [userId, dispatch, reduxStore])`**: creates **`createSocketWorkerBridge`**, reads **`reduxStore.getState().auth.accessToken`** once as **`initialToken`**, calls **`bridge.connect(...)`**. That runs on **user id change** (login / user switch), not on every JWT rotation.
3. A **second** effect **`useEffect(..., [userId, accessToken])`** schedules **`bridge.updateAccessToken(token)`** after **`DEBOUNCE_MS = 350`** (timer reset on each **`accessToken`** change while signed in).
4. **`socketBridge.updateAccessToken`** → **`worker.postMessage({ type: 'update_access_token', accessToken })`**.
5. **`socketWorker`**: if **`activeConnectParams`** exists and the new token string **`!==`** previous, **`activeConnectParams`** is updated and **`connectSocket(...)`** runs → **`socket.io`** client replaced (new **`socketId`** on the server).

### Ordering vs **`message_send`** (encrypt window)

Main thread (**`useSendEncryptedMessage`** / **`useSendMessage`**): hybrid encrypt + parallel REST (**e.g.** **`GET …/devices/public-keys`**) may return **401** → **`performRefresh`** → **`setSession`** **before** **`socketBridge.sendMessage`** posts **`message_send`** to the worker. That refresh is **session-layer** and independent of Socket.IO until step (3–5).

| Phase | Where | Notes |
|-------|--------|--------|
| Encrypt + REST | Main | May trigger **multiple** **`setSession`** / **`POST /auth/refresh`** while building the payload. Each change **resets** the **350 ms** debounce for **`updateAccessToken`**. Identical JWT + user id + expiry are **no-ops** in **`authSlice.setSession`** (no subscriber churn). |
| **`message_send` posted** | Main → worker | **`socketBridge.sendMessage`** → **`postMessage({ type: 'message_send', ... })`**. |
| Worker handling | **`socketWorker`** | Messages are processed **sequentially**. **`update_access_token`** and **`message_send`** are ordered by **delivery** from the main thread. |
| If socket not connected | **`tryMessageSendOrQueue`** | **`message_send`** is **queued** until **`socket.connected`**, then flushed — or fails after **30 s** timeout. |
| If **`update_access_token`** runs **`connectSocket`** | Worker | Reconnect tears down the previous socket; **`generation`** guards drop stale events. Sends during reconnect typically **queue** until the new **`connect`**. |

**Typical intent:** debounce lets **`message_send`** land while the socket is still connected if encrypt finishes **within** the debounce window after the last token write; repeated refreshes **extend** the window and increase the chance **`connectSocket`** runs **around** the send (server logs: disconnect → connect), even though **`message:send`** itself does not re-check JWT per packet.

**Main-thread dedupe:** **`SocketWorkerProvider`** keeps **`lastWorkerAccessTokenRef`** (string last passed to **`connect`** / **`updateAccessToken`**). After the debounce fires, if Redux **`accessToken`** equals that ref, **`updateAccessToken`** is skipped — the worker already ignores identical tokens (**`socketWorker`** **`update_access_token`**), but this avoids useless **`postMessage`** and timer churn.

### Optional future — reconnect only on socket auth failure (not implemented)

**Idea:** drive reconnect from **Socket.IO** rejection (**401** / **`connect_error`**) instead of every Redux JWT change — fewer reconnects when REST refreshes frequently but the existing socket handshake is still acceptable until expiry.

**Tradeoffs:**

| Pros | Cons |
|------|------|
| Fewer **`connectSocket`** cycles during refresh storms | Socket auth may lag REST until reconnect — depends on server accepting prior handshake for **`message:send`** / emits |
| Less UI churn | Requires well-defined server rules (when socket requires new JWT vs REST-only rotation) |
| | More branching: intercept refresh on socket failure, retry, avoid double reconnect with **`httpClient`** refresh |

Staying with **“Redux token changed → debounced worker update”** keeps REST and socket credentials aligned whenever the SPA receives a new access JWT; use this table when evaluating a tighter policy.

---

## Server-side pairing (`POST /auth/refresh` vs Socket.IO)

**TASK_CHECKLIST** → **(3) Trace — messaging-service** → **Confirm server-side pairing**.

### Code check (no server-initiated disconnect on refresh)

**`POST /v1/auth/refresh`** (**`postRefresh`** in **`apps/messaging-service/src/controllers/auth.ts`**) validates the refresh token, rotates tokens, **`res.status(200).json({ accessToken, refreshToken, … })`**, and returns. It does **not** reference **`Socket.IO`**, **`io`**, **`socket.disconnect`**, or disconnect any live namespace connection.

Socket lifecycle is wired only in **`apps/messaging-service/src/utils/realtime/socket.ts`**: **`socket.on('disconnect', …)`** logs **`socket.io disconnected`** with **`reason`** from the engine (e.g. **`client namespace disconnect`** when the browser client closes the socket). There is **no** handler that listens to HTTP refresh completion and kicks sockets.

### What to expect when correlating logs

| Observation | Interpretation |
|-------------|----------------|
| **`POST /auth/refresh`** **200** shortly before **`socket.io disconnected`** with **`reason`** indicating **client leave** (**`client namespace disconnect`**, **`transport close`** from reconnect, etc.) followed by **`socket.io connected`** with a **new `socketId`** | Matches **web-client** token apply → **`update_access_token`** → **`connectSocket`** replacing the client — **focus on reducing duplicate refresh / reconnect on the SPA**, not a server kill. |
| **`POST /auth/refresh`** **200** with **no** nearby disconnect | Normal when Redux dedupes (**`lastWorkerAccessTokenRef`**) or worker skips identical JWT — server did nothing to the socket either. |
| Disconnect reasons like **`ping timeout`**, **`transport error`** without a refresh line | Network / idle — separate from refresh storms. |

So **pairing refresh (200) with disconnect→connect** under load indicates the **client** replaced Socket.IO after receiving new JWTs; the **refresh handler does not** tear down sockets. Debugging **storms** stays on **client refresh frequency** and debounce/dedupe, not server-side **`postRefresh`** side effects.

---

## Stop the storm — causes & mitigations

**TASK_CHECKLIST** → **Bugfix … (4) Fix implementation** → **Stop the storm**.

### Why **`setSession`** may fire repeatedly after **A** returns

| Source | Behaviour |
|--------|-----------|
| **`bootstrapSessionIfNeeded`** | **`refreshTokens`** → **`applyAuthResponse`**, optional second **`refreshTokens`** with **`sourceDeviceId`** → **`applyAuthResponse`** — **two logical JWT** issues if IndexedDB exposes a device id (**`sessionBootstrap.refresh`** / **`sessionBootstrap.deviceBoundRefresh`**). |
| **`httpClient`** **401** mutex | **`performRefresh`** runs once for concurrent REST failures; **`setSession`** once **per successful refresh response** — parallel **401**s do **not** each refresh independently. |
| Duplicate **`dispatch`** | Same JWT + user id + expiry replayed by multiple callers → **`authSlice.setSession`** no-op when **`authSessionEquivalent`** (no Redux churn → **`auth.accessToken`** stable → socket debounce **not** reset). |
| **`SocketWorkerProvider`** | **`lastWorkerAccessTokenRef`** skips **`postMessage`** when Redux matches what was already **`connect`** / **`update`**’d — worker still dedupes **`update_access_token`** string equality. **`DEBOUNCE_MS`** **350** reduces reconnect overlap with encrypt / **`public-keys`** bursts. |

Profile-only **`User`** updates should prefer **`setUser`** so **`setSession`** coalescing doesn’t suppress intentional user field changes while keeping the same JWT.

---

## User-switch hygiene (logout → B → logout B → login A)

**TASK_CHECKLIST** → **(2) Trace — web-client** → **User-switch hygiene**. Goal: **`logout`** → **`login as B`** → **`logout B`** → **`login as A`** — Redux **`cryptoSlice`** / **`devicePublicKeys`**, **`auth`**, **`SocketWorkerProvider`** behaviour; **one worker bootstrap per signed-in user id** (not one React mount per login); **no orphaned debounce timers** for **`updateAccessToken`**.

### Shell mount order (`main.tsx`)

| Layer | Role |
|-------|------|
| **`SessionRestore`** | Runs **`bootstrapSessionIfNeeded`** once on mount ( **`[dispatch]`** only). Subsequent logins (**LoginPage** **`applyAuthResponse`**) do **not** re-run this effect — new sessions use form responses + **`localStorage`** refresh token writes. Gates children until **`sessionReady`** and **`useSenderKeypairBootstrap`** (encryption gate when signed in + secure context). |
| **`SocketWorkerProvider`** | Always the **same** React instance for the SPA lifetime — **not** tied to **`/login`** routing. Mounted under **`SessionRestore`** only after the gate passes (see **`useSenderKeypairBootstrap`**). |

### Redux on **`logout`** (**`useAuth`** → **`dispatch(logout())`**)

All use **`auth/logout`** **`extraReducer`** hooks:

| Slice | Effect |
|-------|--------|
| **`auth`** | **`user`** / **`accessToken`** cleared. |
| **`crypto`** | Reset to **`initialState`** (**`registeredOnServer`**, **`deviceId`**, **`syncState`**, pending sync fields, …). IndexedDB keys are **not** wiped (**`useAuth`** comment — recovery / re-registration). |
| **`devicePublicKeys`** | **`byUserId`** map cleared (**`devicePublicKeysInitialState`**). |
| **`messaging`** | Conversation/message UI state reset. |
| **`presence`** | Presence cache reset. **`connection.presenceStatus`** is **not** on **`logout`** — **`SocketWorkerProvider`** overwrites via **`setPresenceStatus`** when **`userId`** clears (see below). |

### **`SocketWorkerProvider`** per step

**Auth hook:** **`userId = user?.id ?? null`** from **`useAuth()`**.

1. **Logout (A or B):** **`userId`** becomes **`null`**.  
   - **Bootstrap `useEffect([userId, …])`**: **`disconnect`** + **`terminate`** previous worker bridge; **`bridgeRef = null`**; UI + Redux **`presenceStatus`** → **`idle`**.  
   - **Debounced token `useEffect([userId, accessToken])`**: branch **`!userId`** **`clearTimeout`** **`accessTokenWorkerApplyTimerRef`** → **no pending** **`updateAccessToken`** after logout.

2. **Login as B:** **`applyAuthResponse`** sets **`auth.user`** + **`accessToken`**. **`userId`** → B.  
   - Bootstrap effect runs **once** for this **`userId`**: new **`createSocketWorkerBridge`**, **`connect`** with **`initialToken`** from store.  
   - Token effect schedules **`updateAccessToken`** **350 ms** after last **`accessToken`** change.

3. **Logout B:** same as (1).

4. **Login as A:** same pattern as (2) for A’s id — prior session’s worker was already torn down in (3).

**Single bootstrap per login:** For each transition to a **non-empty** **`userId`**, the bootstrap effect body runs **one logical “connect” sequence** (new bridge + **`connect`**). **`accessToken`** rotation **does not** re-run this effect — only **`updateAccessToken`** (debounced).

**React `StrictMode` (development):** React 18 may **mount → unmount → remount** and **re-run effects** once to surface side effects — you may see **paired** teardown + connect in **dev** only. Production runs each effect once per **`userId`** commitment.

### Orphan **`updateAccessToken`** timers

The debounced effect **always** clears **`accessTokenWorkerApplyTimerRef`** when:

- **`userId`** becomes empty (logout), or  
- **`userId`** / **`accessToken`** changes (cleanup before rescheduling), or  
- the component **unmounts** (cleanup return).

So no timer continues to fire **`updateAccessToken`** after sign-out or user switch **unless** a **`setTimeout`** was already queued — on logout the **`!userId`** branch clears it **before** returning.

---

## Consistency checklist

- [ ] Storm appears only after **Phase 3** send (not merely after step 11).  
- [ ] Re-running from **Phase 3** (logout A, repeat B-phase, relogin A) reproduces in the **same** env column.  
- [ ] Logged: **browser + version**, **`VITE_API_BASE_URL`**, **`VITE_REVOKE_DEVICE_ON_LOGOUT`**, and **column A/B/C**.

---

## Optional captures (for TASK_CHECKLIST trace tasks)

- **HAR** or filtered Network export around the send: **`/auth/refresh`**, **`/devices/public-keys`**, **`message:send`** (if logged).  
- **Server** JSON lines: **`POST /auth/refresh`**, **`socket.io disconnected`**, **`socket.io connected`** timestamps vs client send.  
- **Redux DevTools:** **`auth.accessToken`** updates count during one send.  
- **Application → IndexedDB:** **`deviceId`** / crypto stores for **User A** after step 11 vs first-time A in Phase 1.

---

## TASK_CHECKLIST pointer

Continue with **Bugfix — User A → B → A same browser (Socket.IO reconnect storm on send)** → **(1) Correlate timelines**, **(2) Trace — web-client**, **(4) Fix implementation**, **(5) Verification** in **`docs/TASK_CHECKLIST.md`**.
