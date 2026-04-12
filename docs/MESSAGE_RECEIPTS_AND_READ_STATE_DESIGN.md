# Message receipts & read state — 1:1 vs group representation

**Scope:** How to model **delivery** and **read** (“seen”) state for **Feature 12** (sent / delivered / seen ticks), comparing storage shapes for **direct (1:1)** vs **group** threads, and **privacy** (optional read-receipt disable). **Implementation** (MongoDB schemas, Socket.IO events, OpenAPI) is tracked in **`docs/TASK_CHECKLIST.md`** — *Feature 12*.

**Related:** **`last seen`** (Feature 6) is **user-level presence** in Redis/Mongo — **not** the same as **message-level read** state. **Ordering / vocabulary:** **`docs/SEEN_VS_LAST_SEEN_ORDERING.md`**.

---

## 1. Semantics (product ↔ server)

| State | Meaning | Typical trigger |
|-------|---------|-----------------|
| **Sent** | Server **accepted and persisted** the message (MongoDB + ordering). | Successful **`POST /messages`** / **`message:send`** ack. |
| **Delivered** | At least one **recipient client** has **positively acknowledged** receipt (in-app), distinct from transport-only delivery. | Client emits **`message:delivered`** (or batch) after local store + optional UI policy. |
| **Seen** / **Read** | Recipient has **read** the message — e.g. conversation open, or read cursor **at or past** this **`messageId`**. | Client emits **`conversation:read`** / **`message:read`** with cursor or per-message ids. |

**Group nuance:** “Delivered” may mean **delivered to each member’s device** (per-member) or a **weaker** “fan-out completed” signal; this doc assumes **per-member** delivery/read for accurate ticks unless product chooses **aggregate-only** UI.

---

## 2. Representation options

### 2.1 Fields on the message document (`deliveredAt`, `seenAt`, …)

**Shape (illustrative):**

- **1:1:** `deliveredAt` / `seenAt` **nullable timestamps** on **`messages`** (one recipient, one sender — recipient’s state is unambiguous).
- **Group:** **Does not scale** as a **single pair** of fields — **N−1** participants per message. You either:
  - embed **per-recipient** data (see **2.2**), or
  - **do not** use flat `deliveredAt`/`seenAt` on the message row for groups.

**Pros:** Simple queries for **1:1**; one document read for list APIs.  
**Cons:** **Group** requires either **maps** or **separate** structures; **no** single `seenAt` column for groups.

---

### 2.2 Per-recipient map on the message (or nested sub-document)

**Shape (illustrative):**

```text
receiptsByUserId: { [userId: string]: { deliveredAt?: string; seenAt?: string } }
```

- **1:1:** Map has **at most one** other participant’s keys (or two keys if you also track sender-side devices — usually unnecessary for “ticks”).
- **Group:** **One entry per member** who has reported delivery/read.

**Pros:** **Exact** per-message, per-member state for **ticks** and “who read” (if product allows).  
**Cons:** **Document growth** with group size and activity; **hot writes** on popular messages; **indexes** are harder (query “last read for user U in conversation C” often needs **another** structure — see **2.3**).

**When to prefer:** Medium groups **and** product requires **per-message** read receipts in the thread.

---

### 2.3 Read cursor per user per conversation (`lastReadMessageId` / `lastReadAt`)

**Shape (illustrative):** collection or embedded subdocument keyed by **`(userId, conversationId)`**:

```text
{ userId, conversationId, lastReadMessageId, lastReadAt }
```

- **Seen** for a message **M** is derived: **`message.order ≤ cursor`** (or **`createdAt`/`id`** comparison) ⇒ **seen** for that user.
- **Delivered** is **not** fully captured by a cursor alone (delivery can lag read); you **still** need either:
  - **per-message** delivery flags, or
  - a **separate** `lastDeliveredMessageId` per user per conversation (weaker), or
  - **per-message** delivery map (back to **2.2**).

**Pros:** **Compact** for **“read up to here”** in **groups**; **fast** “mark entire thread read”; **indexes** friendly (`userId + conversationId`).  
**Cons:** **Does not** give **per-message** “seen” for old messages **without** re-deriving from history; **delivered** usually needs **extra** fields or events.

**When to prefer:** **Group** “read up to” UX (WhatsApp-style **double tick** aggregate) and **reducing** MongoDB churn on **every** message row.

---

## 3. Recommended direction (phased)

| Phase | Mode | Suggested model | Notes |
|-------|------|-----------------|-------|
| **A — 1:1 MVP** | Direct | **Optional** `deliveredAt` / `seenAt` on **`messages`** **only for the peer’s** state (or **small** `receiptsByUserId` with one peer id) | Aligns with **two** parties; easy to expose in API. |
| **B — Groups** | Group | **Primary:** **`lastReadMessageId` (or monotonic cursor)** per **`(userId, conversationId)`** in a **`conversation_reads`** (or membership) document; **plus** optional **per-message** `receiptsByUserId` **only if** product needs **“read by list”** | Avoids **O(N)** writes on **every** message for large groups. |
| **C — Delivery** | Both | **Delivered** via **client ack** + **server** either **updates** a **per-message** map entry **or** **emits** events only (ephemeral) and **materializes** in **2.2** / **2.3** for history | **Idempotent** upserts **per** `(messageId, userId)`. |

**Rule of thumb:**  
- **1:1:** **flat** or **single** map entry **per message** is fine.  
- **Group:** **cursor** for **read** + **sparse** delivery map **or** **events** for **delivered** until scale requires denormalization.

---

## 4. Privacy: read receipts off (optional follow-up)

**Product:** Allow a user setting **“Send read receipts”** / **“See read receipts”** (often split **inbound** vs **outbound**).

**Server behavior (sketch):**

- Store **`readReceiptsEnabled`** (or two flags) on **`User`** or **settings** document.
- **Outbound:** If **disabled**, **do not persist** **seen** timestamps **that** **originate** from this user **for** others (or persist **server-only** coarse state if policy allows — **default** is **no** exposure to peers).
- **Inbound:** If **disabled**, **do not** **show** peers’ read state to **this** user (or **receive** events — **client** may still send **read cursor** for **unread counts** **without** revealing **seen** to others — **product** choice).

**Implications:**  
- **Cursor**-based read state may still be **needed** for **badge** counts **without** sharing **seen** with senders — **separate** **private** cursor vs **shared** receipt events.  
- **Document** in OpenAPI when the setting exists.

---

## 5. Access patterns & indexes (MongoDB)

- **Query:** “Latest read state for **me** in conversation **C**” → **`(userId, conversationId)`** unique index on **`conversation_reads`** (or equivalent).
- **Query:** “Receipts for **message** **M**” → **`messageId`** or **inline** on **`messages`** if **map** embedded.
- **Writes:** **Idempotent** **`$set`** on **receipt** fields; **rate limits** on receipt floods (**`TASK_CHECKLIST.md`**).

Follow **`PROJECT_GUIDELINES.md`** §2.0 (access-pattern-first) when adding collections.

---

## 6. Wire protocol (non-normative)

- **Socket.IO:** **`message:delivered`**, **`message:read`**, **`conversation:read`** with **`messageId`**, **`conversationId`**, **`userId`**; **idempotent** handlers; fan-out to **sender** and **relevant peers** (see checklist).
- **Cross-node:** Same **event** **shape** whether **RabbitMQ** is involved for **fan-out** or **not**; **receipt** **persistence** is **authoritative** in **MongoDB**.

---

## 7. References

- **`docs/TASK_CHECKLIST.md`** — **Feature 12**
- **`docs/SEEN_VS_LAST_SEEN_ORDERING.md`** — **seen** (message) vs **last seen** (presence)
- **`docs/PROJECT_PLAN.md`** — §3.2.1 (group vs direct routing)
- **`docs/PROJECT_GUIDELINES.md`** — §2.0 MongoDB access patterns
