# Seen vs last seen — ordering (Feature 12 vs Feature 6)

**Purpose:** Fix vocabulary and expectations so **message-level read (“seen”)** is not confused with **user presence (“last seen”)**. They are **related in the product** (both describe “when”) but **distinct in data and code paths**.

---

## 1. Concepts

| | Message **seen** / read (**Feature 12**) | User **last seen** (**Feature 6**) |
|---|-------------------------------------------|-------------------------------------|
| **Question answered** | Has this user read **this message** (or moved the read cursor past it)? | When was this user **last active** in the app (socket heartbeats / session end)? |
| **Primary storage** | MongoDB: `messages.receiptsByUserId`, `conversation_reads` | Redis: `presence:lastSeen:{userId}`; durable mirror: `users.lastSeenAt` on disconnect |
| **Typical triggers** | Client **`message:read`**, **`conversation:read`**; materialized in Mongo; narrow REST **`GET /v1/conversations/{id}/message-receipts`** | Client **`presence:heartbeat`** (~5s); flush to Mongo on **disconnect** |
| **Typical UI** | Ticks on message bubbles, thread read state | “Last seen …”, chat list / profile subtitle, “online” heuristics |

---

## 2. Independence — no merge, no implied ordering

The server **does not** derive one signal from the other:

- **Presence / last seen** is updated only by the **presence pipeline** (heartbeat throttle, Redis TTL, **`flushLastSeenToMongo`**). It is **not** updated inside read-receipt or **`conversation_reads`** handlers.
- **Seen / read receipts** are updated only by **Feature 12** handlers and persistence. They are **not** triggered by **`presence:heartbeat`**.

**Therefore:**

- There is **no guaranteed ordering** between “last seen at time *T*” and “read message *M* at time *T′*”. Either can be newer than the other in real usage.
- **High last seen** does **not** mean “has read all messages” (e.g. app open, heartbeats running, user has not scrolled or acknowledged read).
- **Read cursor advanced** does **not** imply **last seen** was updated at the same moment (different sockets, offline flush, etc.).

Product or client logic may **choose** to correlate them (e.g. only show “typing” when presence is fresh); that remains **optional policy**, not a server invariant today.

---

## 3. UI and copy

- Use **“Last active”** / **“Last seen …”** for **Feature 6** presence.
- Use **“Read”**, **“Seen”**, or **tick icons** for **Feature 12** per-message state.
- Avoid one ambiguous word **“seen”** for both profile presence and message ticks (hurts accessibility and support).

---

## 4. References

| Area | Location |
|------|----------|
| Receipts & read models | **`docs/MESSAGE_RECEIPTS_AND_READ_STATE_DESIGN.md`** |
| Presence algorithm (locked) | **`docs/TASK_CHECKLIST.md`** — **Feature 6** |
| Implementation (presence) | **`apps/messaging-service/src/presence/`**, **`presence:heartbeat`** in **`apps/messaging-service/src/utils/realtime/socket.ts`** |
| Implementation (receipts) | **`apps/messaging-service/src/data/messages/messageReceiptOps.ts`**, **`conversationReads/`**, **`receiptSocketHandlers.ts`** |
