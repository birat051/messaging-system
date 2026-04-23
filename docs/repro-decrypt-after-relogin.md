# Stable repro: decrypt failure after sign out → same-browser login

This document satisfies **TASK_CHECKLIST.md → Bugfix — Sign out then relogin → (1) Stable repro**: fixed steps, browser guidance, and **`VITE_*`** environment matrix so the **“Can’t decrypt on this device…”** / **no encryption key for this browser** symptom can be reproduced consistently while debugging.

---

## Symptom

After **signup** → **1:1 encrypted** traffic (send and receive) → **Sign out** (Settings) → **Log in again** as the **same user** in the **same browser profile**, message rows show decryption errors for **both**:

- Messages **you sent** earlier in that session, and  
- Messages **you received** from the peer.

---

## Environment matrix (run each column until failure is consistent)

Document which column you used when filing bugs or PRs.

| Role | Variable | Variant **A** (default dev) | Variant **B** (revoke on logout) | Variant **C** (direct API origin) |
|------|-----------|-----------------------------|-----------------------------------|-------------------------------------|
| REST + Socket.IO base | **`VITE_API_BASE_URL`** | **`/v1`** (same origin as SPA; Vite proxies to backend — see **`apps/web-client/vite.config.ts`**) | Same as **A** | **`http://localhost:8080/v1`** (browser calls API host directly; use when bypassing Vite proxy) |
| Revoke device on sign-out | **`VITE_REVOKE_DEVICE_ON_LOGOUT`** | **Unset** or **`false`** | **`true`** → client calls **`DELETE /v1/users/me/devices/:deviceId`** during logout (**`logoutDeviceRevocation.ts`**) | Same as **A** or **B** (isolate API URL vs revoke) |

**Where to set:** `apps/web-client/.env.development.local` (gitignored) overriding **`apps/web-client/.env.development`**, or export before `npm run dev`. Rebuild/restart Vite after changes (Vite inlines `VITE_*` at build/dev start).

**Backend:** messaging-service (and deps) running per **`README.md`** / **`infra`** so **`POST /auth/login`**, **`GET /users/me`**, **`GET /conversations`**, **`GET …/messages`**, and encrypted send/receive paths work.

---

## Browser

- **Recommended:** **Google Chrome** or **Chromium** (stable channel) — IndexedDB and Network tabs match the instructions below.  
- **Same browser profile** throughout one repro (no incognito ↔ normal mixing).  
- Optionally record **version** (e.g. Chrome → About Google Chrome) when attaching reports.

---

## Prerequisites

1. Two distinct accounts that can open a **1:1 conversation** (e.g. **User A** and **User B**), both **email verified** if your deployment requires it.  
2. **User A** uses only **one** machine/browser profile for the steps below.

---

## Exact steps (User A’s browser)

1. **Configure** web-client env for the variant you are testing (**A**, **B**, or **C** above). Restart **`npm run dev`** in **`apps/web-client`**.

2. **Register** **User A** (signup flow to completion).  
3. **Register / log in** **User B** in a **second** browser or profile (so A and B can chat).  
4. As **User A**, open **Home**, start or open a **direct thread** with **User B**.  
5. Exchange **at least two encrypted lines** in **both directions** (A→B and B→A), waiting until messages **render as normal text** (not decrypt errors).

6. As **User A**, open **Settings** (`/settings`).  
7. Click **Sign out**. Confirm **Network** contains **`POST …/v1/auth/logout`** (and, if **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`**, **`DELETE …/v1/users/me/devices/<id>`**).

8. On **User A’s** browser only, **log in again** with **User A’s** credentials (same profile as steps 2–5).

9. Navigate to **Home** and open the **same** thread with **User B**.

10. **Observe:** thread shows **“Can’t decrypt on this device…”** (or equivalent) on **prior sent and received** messages — note exact strings from the UI.

---

## Consistency checklist

- [ ] Failure appears on **both** directions (sent + received) for **User A** after step 9.  
- [ ] Re-running steps 6–9 in the **same** env variant reproduces the same UI.  
- [ ] You recorded: **browser + version**, **`VITE_API_BASE_URL`**, **`VITE_REVOKE_DEVICE_ON_LOGOUT`** (present/absent/value).

---

## Optional captures for follow-up tasks

These support **TASK_CHECKLIST** items *(Network audit)*, *(three identifiers)*, and *(message inspection)*:

- **Network:** HAR or screenshots for logout (**`POST /auth/logout`**) and optional **`DELETE …/devices/…`**.  
- **Application → IndexedDB** (Chrome DevTools): databases used by the app origin for **`deviceId`** / key storage (**`privateKeyStorage`** / related stores).  
- **Redux DevTools** (if enabled): **`cryptoSlice.deviceId`** after relogin.  
- **API:** **`GET /v1/users/me/devices`** response after relogin (devices listed vs client expectations).

---

## Network audit on logout

**Confirmed from source** (`apps/web-client/src/common/hooks/useAuth.ts`, **`logoutDeviceRevocation.ts`**, **`common/api/authApi.ts`**, **`usersApi.deleteMyDevice`**). Use DevTools → **Network** while clicking **Sign out** on `/settings` to verify the same behaviour in your build.

### Order of operations (`useAuth` → **`logout`**)

1. **`revokeCurrentDeviceOnServerBeforeLogout`** — may issue **`DELETE`** (see below). Runs **before** Redux session is cleared so the **access token** is still attached by **`httpClient`**.
2. **`POST /v1/auth/logout`** — runs **only if** **`readRefreshToken()`** returns a non-empty refresh token from **`localStorage`**; body **`{ refreshToken }`**. Errors are swallowed; local sign-out still proceeds (**`clearRefreshToken`**, **`dispatch(logout())`**).

### `POST /v1/auth/logout`

| Condition | Behaviour |
|-----------|------------|
| Refresh token present in storage | Request is sent (**`authApi.logout`**, **`skipAuthRefresh: true`**). Expect **204** when the server revokes the token. |
| No refresh token (missing / already cleared) | **No request** — server revoke of refresh token is skipped entirely. |

**Full URL:** `{VITE_API_BASE_URL}/auth/logout` (per **`API_PATHS.auth.logout`**, **`getApiBaseUrl()`**).

### `DELETE /v1/users/me/devices/:deviceId`

| Condition | Behaviour |
|-----------|------------|
| **`VITE_REVOKE_DEVICE_ON_LOGOUT`** is **`'true'`** (string) **and** `auth.user?.id`, `auth.accessToken` present **and** `deviceId` resolved (`cryptoSlice.deviceId` **or** IndexedDB **`getStoredDeviceId(userId)**`) | **`deleteMyDevice(deviceId)`** → **`DELETE …/users/me/devices/<deviceId>`**. Failures are logged in **DEV** only; sign-out continues. |
| **`VITE_REVOKE_DEVICE_ON_LOGOUT`** unset / not **`true`** | **Never called** — default dev (**`.env.development`** comments this out). |
| Revoke enabled but missing **user**, **token**, or **deviceId** | **No DELETE**. |

### What to look for in Network (filter examples)

- **`logout`** → method **POST**, path **`…/auth/logout`** — present whenever a refresh token existed at sign-out.
- **`devices`** → method **DELETE**, path **`…/users/me/devices/<uuid>`** — present only when **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`** and prerequisites above hold.

---

## After relogin: capture three identifiers

Complete this **immediately after** User A logs back in and **before** or **while** opening the broken thread — same browser profile as the repro.

**Implementation references:** **`getStoredDeviceId`** (`apps/web-client/src/common/crypto/privateKeyStorage.ts`, store **`deviceIdentity`**), **`cryptoSlice.deviceId`** (`apps/web-client/src/modules/crypto/stores/cryptoSlice.ts`), **`listMyDevices`** → **`GET /v1/users/me/devices`** (`usersApi.ts`, **`DeviceListResponse.items[].deviceId`**).

### Record sheet (copy → paste into bug notes)

| Source | How to read | `deviceId`(s) / notes |
|--------|-------------|------------------------|
| **(a) IndexedDB** | See below | single string from **`deviceIdentity`** row |
| **(b) Redux `cryptoSlice`** | See below | `state.crypto.deviceId` |
| **(c) Server `GET /v1/users/me/devices`** | See below | list every **`items[].deviceId`** |

**Mismatch examples to flag**

- **IDB = UUID-A**, **Redux = UUID-A**, **server list = only UUID-B** → local browser still thinks it is **A** after relogin; server registered **B** (typical after **`POST /users/me/devices`** minting a new row).
- **IDB ≠ Redux** → hydration bug or timing (capture timestamp / screenshot).
- **Server has multiple rows** → note which **`deviceId`** matches IDB vs which appears in **`encryptedMessageKeys`** on messages.

### (a) IndexedDB — `deviceId` / keyring

- **Database:** **`messaging-client-crypto`** (`privateKeyStorage.ts` **`DB_NAME`**).
- **Object store for stable device id:** **`deviceIdentity`** (`STORE_DEVICE_IDENTITY`), key **`userId`**, row shape **`DeviceIdentityRow`** with field **`deviceId`**.
- **Private key material (separate):** **`privateKeyKeyring`** (`STORE_KEYRING`) — compound key **`[userId, keyVersion]`**; used for decrypt, not the same record as **`deviceIdentity`**, but both are under the same DB.

**Chrome UI path:** DevTools → **Application** → **IndexedDB** → **`messaging-client-crypto`** → **`deviceIdentity`** → open the row whose key is User A’s **`userId`** → copy **`deviceId`**.

**Console (same origin as the app, secure context)** — replace **`USER_ID_HERE`**:

```js
(async () => {
  const userId = 'USER_ID_HERE';
  const req = indexedDB.open('messaging-client-crypto');
  const db = await new Promise((res, rej) => {
    req.onerror = () => rej(req.error);
    req.onsuccess = () => res(req.result);
  });
  const row = await new Promise((res, rej) => {
    const tx = db.transaction('deviceIdentity', 'readonly');
    const os = tx.objectStore('deviceIdentity');
    const g = os.get(userId);
    g.onerror = () => rej(g.error);
    g.onsuccess = () => res(g.result);
  });
  db.close();
  console.log('IDB deviceIdentity.deviceId:', row?.deviceId ?? null);
})();
```

### (b) Redux — **`cryptoSlice.deviceId`**

- **Path in state:** **`state.crypto.deviceId`** (nullable string).
- **Redux DevTools:** enable the browser extension → select the store → **`State`** tab → expand **`crypto`** → **`deviceId`**.
- If DevTools are unavailable, take a screenshot after opening **Home** post-login or note **`hydrateMessagingDeviceId`** timing from a **DEBUG** build (optional).

### (c) **`GET /v1/users/me/devices`** — server-registered devices

- **Client helper:** **`listMyDevices()`** (`usersApi.ts`).
- **Network:** after relogin, filter **`devices`** → **`GET`** → **`…/v1/users/me`** (path **`/users/me/devices`**). Open **Response** JSON.
- **Shape:** **`{ items: DeviceListItem[] }`** — copy **every** **`deviceId`** (and optionally **`createdAt`**) into the record sheet. Compare to **(a)** and **(b)**.

**Authenticated:** request runs with **`Authorization: Bearer`** from the active session.

---

## Message inspection (one failing hybrid message)

Pick **one** message that still fails in the thread after relogin. Goal: compare **`Object.keys(message.encryptedMessageKeys)`** to the session’s **`myDeviceId`**, then map the failure to **missing wrapped key** vs **unwrap/AES failure** vs **no local private key** — as implemented in **`usePeerMessageDecryption`** (`apps/web-client/src/modules/home/hooks/usePeerMessageDecryption.ts`) and copy in **`peerDecryptInline.ts`**.

### A. Pull the wire message (REST or DB)

**REST (preferred):** DevTools → **Network** → reload thread or navigate so **`GET …/v1/conversations/{conversationId}/messages`** runs → **Response** → find a **`Message`** object whose UI still shows an error or **`…`**.

**MongoDB (optional):** `messages` document for that **`id`** — read nested **`encryptedMessageKeys`** (object keyed by **`deviceId`**).

Record:

| Field | Value |
|--------|--------|
| **`message.id`** | |
| **`senderId`** | (peer vs own — see below) |
| **`encryptedMessageKeys`** | full object, or at least **`Object.keys(...)`** |
| **`myDeviceId`** | same as [**IndexedDB `deviceIdentity`**](#after-relogin-capture-three-identifiers) — note: inbound decrypt uses **`getStoredDeviceId(userId)`** for the map lookup (must match the persisted row). |

### B. Compare keys vs `myDeviceId`

Let **`K`** = **`Object.keys(message.encryptedMessageKeys ?? {})`**. Let **`d`** = **`myDeviceId`** trimmed.

| Check | Interpretation |
|--------|----------------|
| **`d`** is empty / null | Cannot look up a wrapped key; treated like missing entry (**`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** path). |
| **`d`** ∉ **`K`** | **Missing map entry** — sender never wrapped for this device id (e.g. new **`deviceId`** after re-register). **Decrypt body is not run.** |
| **`d`** ∈ **`K`** | Wrapped key exists — client runs **`decryptHybridMessageToUtf8`** (`unwrapMessageKey` → **`decryptMessageBody`**). Failure **throws** → **crypto** path. |

### C. Client-side failure mode → UI copy (peer / inbound hybrid)

Inbound peer messages use **`usePeerMessageDecryption`**. Constants are in **`peerDecryptInline.ts`**:

| Condition | Classification | Typical UI string |
|-----------|----------------|-------------------|
| **`loadMessagingEcdhPrivateKey`** returns **`null`** | No local ECDH material | **`Can't decrypt on this device. No encryption key for this browser.`** (**`PEER_DECRYPT_NO_LOCAL_KEY`**) |
| No **`deviceId`** or **`!encryptedMessageKeys[deviceId]`** | **Missing map entry** (decrypt skipped) | **`Can't decrypt on this device.`** (**`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** — same sentence as generic unavailable) |
| Wrapped key present but **`decryptHybridMessageToUtf8`** throws | **Unwrap / AES-GCM failure** | **`Can't decrypt on this device. The ciphertext could not be decoded.`** (**`PEER_DECRYPT_CRYPTO_FAILED`**) |

So: distinguish **missing entry** (**no second sentence**) vs **no local key** (**“No encryption key for this browser”**) vs **crypto** (**“could not be decoded”**).

**Dev logging:** set **`VITE_DEBUG_PEER_DECRYPT=true`** (restart dev server). Console shows **`hybrid: missing deviceId or encryptedMessageKeys[deviceId]`** vs **`unwrap or decryptMessageBody threw`** — see **`debugPeerDecrypt`** calls in **`usePeerMessageDecryption`**.

### D. “Sent” vs “received” rows (same thread)

- **Received (peer) hybrid:** classified entirely by **`usePeerMessageDecryption`** + table **C**.
- **Sent (own) hybrid:** **`resolveMessageDisplayBody`** uses **`senderPlaintextByMessageId`**, not peer decrypt — if plaintext cache is empty after reload, the bubble may show **`…`** until **`senderPlaintextLocalStore`** / Redux hydration repopulates. That is **orthogonal** to **`encryptedMessageKeys[myDeviceId]`** for **reading your own send** — still inspect **`encryptedMessageKeys`** on the wire: your **`deviceId`** should appear in **`K`** if the send path wrapped for this device.

---

## UI errors → code paths (`usePeerMessageDecryption`, `resolveMessageDisplayBody`, `isPeerDecryptInlineError`)

**Goal:** Map thread copy to **missing `encryptedMessageKeys[myDeviceId]`** vs **missing local private key** vs **unwrap/decrypt failure**, and show where **`resolveMessageDisplayBody`** / **`isPeerDecryptInlineError`** fit.

### Pipeline (inbound **peer** hybrid)

1. **`usePeerMessageDecryption`** (`apps/web-client/src/modules/home/hooks/usePeerMessageDecryption.ts`) — for each peer **`Message`** that **`isHybridE2eeMessage(m)`**, loads key from **`loadMessagingEcdhPrivateKey`**, **`getStoredDeviceId`**, then either skips decrypt, **`decryptHybridMessageToUtf8`**, or **`catch`**. Dispatches **`setPeerDecryptedBody`** → Redux **`messaging.decryptedBodyByMessageId[messageId]`** (plaintext or error string).
2. **`resolveMessageDisplayBody`** (`messageDisplayBody.ts`) — for **`isOwn === false`** and wire E2EE, returns **`decryptedBodyByMessageId[m.id]`** if set, else **`…`** (U+2026).
3. **`HomeConversationShell`** — builds **`ThreadMessageItem`**; for **peer** rows only, **`isPeerDecryptInlineError(body)`** sets **`bodyPresentation: 'decrypt_error'`** for styling (**`HomeConversationShell.tsx`** ~274–276).

### Classification (the three decrypt-failure modes + loading)

| Root cause | **`usePeerMessageDecryption`** branch | **`peerDecryptInline`** constant | User-visible line (peer row) |
|------------|----------------------------------------|-----------------------------------|------------------------------|
| **No `encryptedMessageKeys[myDeviceId]`** (or no **`deviceId`** in IDB) | **`!deviceId \|\| !m.encryptedMessageKeys[deviceId]`** → dispatch without calling decrypt (~130–147) | **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** (= **`PEER_DECRYPT_INLINE_UNAVAILABLE`**) | **`Can't decrypt on this device.`** (short form only) |
| **Missing local ECDH private key** | **`loadMessagingEcdhPrivateKey`** → **`null`** (~105–120) | **`PEER_DECRYPT_NO_LOCAL_KEY`** | **`Can't decrypt on this device. No encryption key for this browser.`** |
| **Crypto failure** (unwrap / AES-GCM) | **`decryptHybridMessageToUtf8`** throws → **`catch`** (~174–186) | **`PEER_DECRYPT_CRYPTO_FAILED`** | **`Can't decrypt on this device. The ciphertext could not be decoded.`** |
| **Still loading / pending decrypt** | — (no **`setPeerDecryptedBody`** yet) | — | **`…`** ellipsis until async path finishes |

**Ambiguity:** **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** and **`PEER_DECRYPT_INLINE_UNAVAILABLE`** are the **same string** (**`peerDecryptInline.ts`** ~7–10). **`isPeerDecryptInlineError`** returns **true** for both — you **cannot** tell “missing map entry” from “unclassified opaque body” **by text alone**; use **`GET …/messages`** / **`encryptedMessageKeys`** or **`VITE_DEBUG_PEER_DECRYPT`**.

### Outside **`usePeerMessageDecryption`** (still affects **`resolveMessageDisplayBody`**)

| Situation | Path | Peer UI |
|-----------|------|--------|
| **`!isMessageWireE2ee(m)`** but **`body`** looks opaque | **`resolveMessageDisplayBody`** → **`PEER_DECRYPT_INLINE_UNAVAILABLE`** (~43–49) | **`Can't decrypt on this device.`** — **`usePeerMessageDecryption`** does **not** run (`!isHybridE2eeMessage`). |
| Wire E2EE peer, decrypt not finished | **`decryptedBodyByMessageId`** unset | **`…`** — **`isPeerDecryptInlineError`** → **false** |

### **`isPeerDecryptInlineError`**

**`peerDecryptInline.ts`** — returns **true** iff **`text`** is exactly one of the four known strings (**`INLINE_ERROR_MESSAGES`**): both short-form lines (**unavailable** + **no device key entry**), **`NO_LOCAL_KEY`**, **`CRYPTO_FAILED`**.

### Own sends (**`isOwn === true`**)

**`resolveMessageDisplayBody`** uses **`senderPlaintextByMessageId`** only — **`…`** while missing; **not** the peer-decrypt constants above. **`HomeConversationShell`** does **not** apply **`isPeerDecryptInlineError`** styling for **own** rows (~274 **`!isOwn`**).

---

## Second-session bootstrap trace (code-confirmed)

**Question:** Does a **second** **`POST /v1/users/me/devices`** after sign-out → login mint a **new** **`deviceId`** while historical messages only have **`encryptedMessageKeys`** for the **first** device?

**Answer (nominal paths):** **No.** When IndexedDB still holds **`deviceIdentity.deviceId`** and the keyring has rows, **`ensureUserKeypairReadyForMessaging`** re-registers with **that same client-supplied `deviceId`**. The server (**`registerOrUpdateDevice`**) uses the client’s **`deviceId`** when provided (**`apps/messaging-service/src/data/userPublicKeys/repo.ts`**) — it does **not** replace it with a random UUID on re-insert after **`DELETE`**. A **new random UUID** is minted **only** on the **first-time device** branch (no keyring yet — **`crypto.randomUUID()`** in **`ensureMessagingKeypair.ts`**).

### Call chain (second login, same browser)

1. **`SessionRestore`** (`apps/web-client/src/modules/auth/components/SessionRestore.tsx`)  
   - **`bootstrapSessionIfNeeded(dispatch)`** → if **`localStorage`** refresh token exists: **`POST /auth/refresh`** → **`applyAuthResponse`** (tokens) → **`GET /users/me`** → **`setUser`** → **`hydrateMessagingDeviceId(did)`** only when **`getStoredDeviceId(uid)`** returns a value (**`sessionBootstrap.ts`**).

2. **`useSenderKeypairBootstrap(sessionReady)`** (`useSenderKeypairBootstrap.ts`)  
   - After **`sessionReady`**, calls **`ensureUserKeypairReadyForMessaging(userId, dispatch)`** (not the **`useRegisterDevice`** hook directly — registration is **`dispatch(registerDevice(...))`** inside **`ensureMessagingKeypair.ts`**).

3. **`ensureUserKeypairReadyForMessaging`** (`apps/web-client/src/common/crypto/ensureMessagingKeypair.ts`)  
   - Immediately **`hydrateMessagingDeviceId(persistedDeviceId)`** when **`getStoredDeviceId(userId)`** returns (**lines 54–57**).  
   - Loads directory **`listUserDevicePublicKeys('me')`** (404 → empty list).  
   - **If keyring exists** (`versions.length > 0`): finds server row **`entry`** for **`storedDeviceId`**.  
     - **`mustRegister = storedDeviceId == null || entry == null`** (**lines 83–89**).  
     - After logout **revoked** the server row but IDB still has **`storedDeviceId`**: **`entry`** is missing → **`mustRegister` true** → **`POST`** body **`{ publicKey: localSpki, deviceId: storedDeviceId }`** (**lines 92–98**) — **same id as before**.  
     - Response **`result.deviceId`** is persisted again via **`setStoredDeviceId`** (**line 98**); server returns the **same** **`deviceId`** string for the new row.

4. **`registerDevice`** thunk (**`cryptoSlice`**) → **`registerMyDevice`** → **`POST /v1/users/me/devices`**.

### When would **`deviceId`** actually change?

| Scenario | Behaviour |
|----------|-----------|
| First install / empty keyring, empty server directory | **`generateP256EcdhKeyPair`**, **`clientDeviceId = crypto.randomUUID()`**, **`POST`** — **new** UUID (**`ensureMessagingKeypair.ts`** ~141–147). |
| **`POST`** with **omitted** **`deviceId`** | Server uses **`randomUUID()`** (**`repo.ts`** ~177–178). Client **always** sends **`deviceId`** on the re-register branch when **`storedDeviceId`** is set. |
| Keyring exists, server row exists, SPKI matches | **No `POST`** — **`setPublicKeyMeta`** only (**lines 121–131**). |

### Implication for “can't decrypt after relogin”

If **`deviceId`** is stable across sessions, **missing `encryptedMessageKeys[myDeviceId]`** on old messages is **not** explained by “server minted a second UUID” **on that re-register path**. Investigate instead **local key load** (**`PEER_DECRYPT_NO_LOCAL_KEY`**), **sender plaintext** cache for **own** rows, or **messages that never included this device’s key** (send-time fan-out).

---

## Logout side effects (`useAuth` → **`logout`**)

**Source:** **`apps/web-client/src/common/hooks/useAuth.ts`**, **`authSlice`**, slices that listen to **`logout`**, **`authStorage.ts`**, **`guestSessionPreference.ts`**. **IndexedDB** is **not** cleared anywhere in this path — aligns with **Prerequisite — User keypair** (“retain private key” / recovery).

### Before Redux **`dispatch(logout())`** (async)

| Step | Effect |
|------|--------|
| **`revokeCurrentDeviceOnServerBeforeLogout`** | Optional **`DELETE /v1/users/me/devices/:deviceId`** when **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`** (**`logoutDeviceRevocation.ts`**). Does **not** touch browser storage. |
| **`POST /v1/auth/logout`** | Best-effort server revoke of refresh token (**`authApi.logout`**). |
| **`clearRefreshToken()`** | Removes **`messaging-refresh-token`** from **`localStorage`** (**`authStorage.ts`**). |
| **`clearGuestReauthPreference()`** | Removes guest re-auth flag from **`sessionStorage`** (**`guestSessionPreference.ts`**). |

### Redux **`logout`** action (**`authSlice.logout`**)

Clears **in-memory auth** only:

- **`user`** → **`null`**
- **`accessToken`** → **`null`**
- **`accessTokenExpiresAt`** → **`null`**

Access token was never persisted to **`localStorage`** (session-only).

### Other slices reset by the same **`logout`** action

The **`logout`** action from **`authSlice`** is handled in **`extraReducers`** as follows (all reset to initial state for that slice):

| Slice | On **`logout`** |
|-------|-------------------|
| **`cryptoSlice`** | Full reset — **`deviceId`**, **`registeredOnServer`**, **`keyVersion`**, sync fields, etc. (**`cryptoSlice.ts`** → **`() => ({ ...initialState })`**) |
| **`messagingSlice`** | Full reset — threads, **`messagesById`**, **`senderPlaintextByMessageId`**, **`decryptedBodyByMessageId`**, etc. |
| **`devicePublicKeysSlice`** | Cached peer device public keys cleared |
| **`presenceSlice`** | Presence map cleared |

Slices **without** a **`logout`** listener (e.g. **`callSlice`**, **`connectionSlice`**, **`app`**) keep prior values until next navigation or explicit actions — not part of the checklist focus.

### What **persists** after sign-out (same browser profile)

| Storage | Content | Cleared on logout? |
|---------|---------|---------------------|
| **IndexedDB `messaging-client-crypto`** | **`deviceIdentity`** (**`deviceId`** per **`userId`**), **`privateKeyKeyring`** / legacy key material (**`privateKeyStorage.ts`**) | **No** |
| **IndexedDB sender plaintext DB** (**`senderPlaintextLocalStore`**) | Own-send plaintext keyed by **`userId`**, **`messageId`** (written by **`senderPlaintextPersistListener`**) | **No** |
| **`localStorage`** refresh token | — | **Yes** (**`clearRefreshToken`**) |
| **`sessionStorage`** guest preference | — | **Yes** (**`clearGuestReauthPreference`**) |

After the next login, **`sessionBootstrap`** / **`ensureUserKeypairReadyForMessaging`** rehydrate **`cryptoSlice`** and **`deviceId`** from IndexedDB; **`loadSenderPlaintextIntoRedux`** repopulates sender-plaintext overlays from IndexedDB (**`sessionBootstrap.ts`**).

**Net:** Sign-out wipes **session tokens** and **Redux** conversational/crypto cache; **cryptographic identity** (**private key**, **`deviceIdentity.deviceId`**) remains on disk until explicitly removed (not implemented on logout).

---

## Server revoke on logout vs IndexedDB retention

**Question:** If logout **revokes** the device **server-side** (**`DELETE /v1/users/me/devices/:deviceId`**) but the client **keeps** the prior **private key** + **`deviceId`** in **IndexedDB**, is that state **reachable** in “production” configuration? Does it match **product intent**? (Ideal: **private key** and **`deviceId`** remain in IndexedDB after logout.)

### Reachability

| Configuration | **`DELETE …/devices/:deviceId` on sign-out?** |
|---------------|-----------------------------------------------|
| **Default dev** (**`apps/web-client/.env.development`**) | **No** — **`VITE_REVOKE_DEVICE_ON_LOGOUT`** is commented out / unset (**`logoutDeviceRevocation.ts`** requires **`=== 'true'`**). |
| **Default production bundle** (**`apps/web-client/.env.production`**) | **No** — the variable is **not** set in the committed file; Vite inlines **`undefined`** / falsy unless you add **`.env.production.local`** or CI injects **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`** at **build** time. |
| **Explicit opt-in** | **Yes** — set **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`** for **`vite dev`** / **`vite build`** so **`revokeCurrentDeviceOnServerBeforeLogout`** runs (**`useAuth`**). |

So: **server revoke on logout is off by default** in shipped env files; the **“revoked on server, full key material still in IDB”** combination is **reachable** whenever operators **turn the flag on**. It is **not** the default production behaviour unless the deploy pipeline sets it.

### IndexedDB always survives sign-out (including when revoke runs)

**`useAuth`** never calls **`deleteStoredPrivateKey`**, **`clear`-style IDB wipes**, or removal of **`deviceIdentity`**. **`logoutDeviceRevocation`** only performs the optional **`DELETE`** HTTP call — **no** browser storage mutation (**`logoutDeviceRevocation.ts`** comments: IndexedDB **not** cleared).

Therefore **product intent for “keys stay on device after logout”** is satisfied: **private key** + **`deviceId`** **do** remain in IndexedDB after logout **whether or not** server revoke is enabled — matching the **Prerequisite — User keypair** note that private keys are retained for recovery / re-registration (**`docs/TASK_CHECKLIST.md`**, **`useAuth`** JSDoc).

### Intent of optional server revoke + local retention

- **Server:** remove **`(userId, deviceId)`** from the device registry so other parties / directory views treat this device as inactive; refresh/logout tokens still invalidated separately (**`POST /auth/logout`**).
- **Client:** keep material so the **same browser** can **re-`POST /users/me/devices`** with the **same** **`deviceId`** + SPKI during **`ensureUserKeypairReadyForMessaging`** (**second-session bootstrap trace**).

That pairing (**revoke row, keep IDB**) is **deliberate** for recovery: no requirement to wipe the browser keystore on sign-out. If decrypt issues appear after relogin, root-cause elsewhere (e.g. **local key not loading** — **`PEER_DECRYPT_NO_LOCAL_KEY`**) rather than “IDB was cleared by logout” under current code.

---

## Alignment: revoke + IndexedDB (“stale” server registry)

**Task:** Choose how to align behavior when logout **revokes** the server device row but the browser **keeps** **`deviceIdentity`** + keyring — options: clear local identity on logout, stop revoking, or re-register so **`deviceId`** stays consistent with **`encryptedMessageKeys`**.

### Adopted alignment (no further code change required)

| Strategy | Decision |
|----------|----------|
| **Re-register public key with the same `deviceId`** | **Shipped.** **`ensureUserKeypairReadyForMessaging`** (`ensureMessagingKeypair.ts`): when the keyring exists but **`listUserDevicePublicKeys('me')`** has **no** row for **`getStoredDeviceId(userId)`** (`entry == null`), **`mustRegister`** runs **`POST /v1/users/me/devices`** with **`{ publicKey, deviceId: storedDeviceId }`**. Server **`registerOrUpdateDevice`** inserts **`(userId, deviceId)`** using the **client-supplied** id — **`encryptedMessageKeys[deviceId]`** on historical messages **still match** this browser after re-login. |
| **Stop revoking on logout** | **Default product posture:** **`VITE_REVOKE_DEVICE_ON_LOGOUT`** is **unset** in committed **`.env.development`** / **`.env.production`** — optional **`DELETE`** is **off** unless operators enable it. Reduces server/client divergence for same-browser sessions. |
| **Clear local device identity when server revokes** | **Not adopted.** Would wipe **`deviceIdentity`** / keyring on logout after **`DELETE`** — contradicts **`docs/PROJECT_PLAN.md`** §7.1 (**same-browser sign-out** = same device, retain IndexedDB) and destroys **offline recovery** without **Feature 13**. Could be revisited only for a separate “forget this device” UX (not sign-out alone). |

**Net:** The **revoke + retained IndexedDB** combination is resolved on **next login** by **automatic re-registration** with the **same** **`deviceId`** — alignment with **`encryptedMessageKeys`** is **by design**, not by clearing storage.

---

## New `deviceId` without sync (Feature 13 vs keyring retention)

**Task:** If the “mismatch” is a **new** **`deviceId`** without **Feature 13** key re-sharing — ensure **Feature 13** bootstrap runs for true new registration, **or** ensure the client **never** mints / replaces **`deviceId`** when a **usable private key** + **`deviceIdentity`** already exist in **IndexedDB**.

### 1. Send / bootstrap path does **not** replace `deviceId` when keyring exists

**`ensureUserKeypairReadyForMessaging`** (`ensureMessagingKeypair.ts`):

- **Keyring present** (`listKeyringVersions` / `versions.length > 0`): **never** calls **`crypto.randomUUID()`**. Uses **`getStoredDeviceId` → re-register** with **`{ publicKey, deviceId: storedDeviceId }`** or **verifies** server **SPKI** match. A new random id is **not** generated on this branch.
- **First device in an empty profile** (no keyring, **and** **no** server directory rows for this user’s “me” list in the check at 135): generates **one** **`clientDeviceId = randomUUID()`**, registers, stores keyring + **`setStoredDeviceId`**. This is the only “new uuid” path.
- **No keyring but server already has device(s):** **throws** — *“An encryption key is registered for this account, but this browser has no key material. Restore from a backup.”* — **no** silent new **`deviceId`**; avoids a second random id on a “same account, another device exists” machine without a restore path.

**`useSendEncryptedMessage`** calls **`ensureUserKeypairReadyForMessaging(senderId, dispatch)`** before send — same rules.

**Conclusion:** **“Usable private key in IDB + `deviceIdentity`”** (non-empty keyring) **→** client **reuses** stored **`deviceId`**; the send path does **not** overwrite it with a new UUID.

### 2. Feature 13 bootstrap after **any** successful `POST /users/me/devices`

**`evaluateDeviceSyncBootstrapState`** (`deviceBootstrapSync.ts`) runs at the end of **all** successful register / re-register paths in **`ensureUserKeypairReadyForMessaging`** (after **`registerDevice.fulfilled`** / meta update).

- **`listMyDevices()`** returns **> 1** device **and** the first page of **`listMySyncMessageKeys({ deviceId, limit: 1 })`** has **no** wrapped key for this device → **`syncState: 'pending'`** (multi-device sync needed for **history**).
- Otherwise **`idle`** / **`complete`** per prior state.

So a **new** **`deviceId`** created on the **greenfield branch** (`randomUUID` + first keyring row), when another device already existed on the account, should **fail earlier** at line 135–138 **unless** directory listing for **`listUserDevicePublicKeys('me')`** is empty in edge cases — in the **successful** greenfield registration after account truly has zero directory rows first, **`evaluateDeviceSyncBootstrapState`** still runs; when a **second** device registers later from another browser, **>1 devices** triggers **pending** sync as intended.

*(Operators debugging “new id, no sync”: confirm whether the account had **another** registered device row and whether **`syncState`** moved to **`pending`** in Redux / UI.)*

### 3. No code change required for nominal product paths

Existing logic already: **(a)** avoids new **`deviceId`** when keyring exists, **(b)** runs **Feature 13** bootstrap classification after registration. Documented here as the **executed** alignment for this checklist item.

---

## Related docs

- **Second browser / Feature 13 sync repro** (different profile or browser, same account): **`docs/repro-second-browser-sync.md`**.

## Related checklist

**`docs/TASK_CHECKLIST.md`** → **Bugfix — Sign out then relogin (same browser)**.
