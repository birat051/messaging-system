# User keypair & E2EE design (prerequisite for encrypted messaging)

**Scope:** Cryptographic choices, sizes, threat model, and **rotation rules** for **per-user** asymmetric keys used before **Feature 1** ciphertext and aligned with **Feature 11** (wire protocol). **Implementation** (MongoDB, OpenAPI, Web Crypto code) is tracked in **`TASK_CHECKLIST.md`** — *Prerequisite — User keypair*.

**Invariant:** The **server never stores, logs, or processes private keys**. Only **public** key material is registered via API and stored in MongoDB.

---

## 0. Protocol requirement: asymmetric cryptographic encryption

End-to-end message confidentiality **must** be built on **asymmetric (public-key) cryptography** for encryption:

- **Recipient binding:** Plaintext (or the content-encryption key) must be recoverable **only** by someone who holds the **recipient’s private key**. The **server** and any party that knows only **public keys** and ciphertext **must not** be able to decrypt message content.
- **Concrete meaning:** Each message uses a **public-key encryption** construction — not a **symmetric-only** scheme (no shared secret pre-agreed out of band without a public-key step). **Session keys** may be derived and then used with AES-GCM, but they **must** be established using **asymmetric** primitives (see **ECIES** below).

**Out of scope for this protocol:** Encrypting traffic with a **single symmetric key** shared by all users (or provisioned only by the server) without a **per-recipient** asymmetric encryption step.

---

## 1. Chosen construction: ECIES (asymmetric encryption on elliptic curves)

The MVP uses **ECIES** — **Elliptic Curve Integrated Encryption Scheme** (ISO/IEC 18033-2 style) — which **is** asymmetric encryption in the standard sense:

1. **Asymmetric encapsulation (KEM):** The sender uses **ECDH** between an **ephemeral** key pair (generated per message or per session) and the **recipient’s long-term public key** to produce a **shared secret** that only the recipient can recompute (using the matching **private** key).
2. **Key derivation:** **HKDF-SHA-256** turns that shared secret into one or more **symmetric keys** (domain-separated `info` strings).
3. **Symmetric data encryption (DEM):** **AES-256-GCM** encrypts the **message body** under the derived key.

Thus **confidentiality** of the payload rests on **asymmetric** key agreement (only the recipient’s **private** key completes the ECDH); AES-GCM is the **data encapsulation** layer, not a replacement for public-key cryptography.

**Alternative asymmetric encryption:** **RSA-OAEP** can encrypt **small** payloads (e.g. a content key) directly with the recipient’s **RSA public key**; for large messages, **RSA-OAEP + AES-GCM hybrid** is equivalent in spirit to ECIES. This stack **does not** use RSA for MVP; **P-256 ECIES** is the default for Web Crypto alignment.

---

## 2. Key roles

| Key | Location | Purpose |
|-----|----------|---------|
| **Long-term identity key pair** (asymmetric) | **Client only** (private); **server** stores **public** only | Recipient’s **public** key in ECIES; sender’s identity may bind to a second key pair for signing (later). |
| **Ephemeral ECDH key pair** (asymmetric) | Generated per message or per session on sender | **Required** for the asymmetric encapsulation step; **only the recipient’s private key** completes the shared secret with the ephemeral public half sent in the ciphertext envelope (Feature 11). |
| **Symmetric content keys** | Derived via HKDF from the ECDH shared secret | **AES-256-GCM** keys and nonces — never sent to the server in plaintext; not a substitute for the asymmetric step above. |

The **long-term private** key is generated in the browser (**Web Crypto API** or an audited WASM binding such as **libsodium** if X25519 is required). It is persisted only on the client (**IndexedDB**, optionally **wrapped** with a passphrase-derived key — see checklist §B).

### 2.1 Local private key persistence (web-client)

| Requirement | Detail |
|-------------|--------|
| **Never send private keys to the server** | PKCS#8 is exported only for **local** storage; REST/OpenAPI must never define private-key fields (see audit checklist). |
| **Storage** | **IndexedDB** database `messaging-client-crypto`, object store `privateKeyMaterial`, keyed by **`userId`** so multiple accounts do not share rows. |
| **Wrapping (default)** | **PBKDF2-HMAC-SHA256** with **310,000** iterations (OWASP-aligned default for PBKDF2-SHA256) + random **16-byte** salt per write; **AES-256-GCM** with a random **12-byte** IV; ciphertext + salt + IV + iteration count stored as Base64-safe fields. **Argon2** is not available in Web Crypto; a future WASM binding could replace the KDF while keeping a versioned payload shape. |
| **Dev-only plaintext** | `storePrivateKeyPkcs8PlaintextDevOnly` / `loadPlaintextPrivateKeyPkcs8DevOnly` are **Vite `import.meta.env.DEV` only** — not for production. |
| **Secure context** | **`SubtleCrypto`** and meaningful crypto require **`window.isSecureContext`** (HTTPS, or `http://localhost` / `http://127.0.0.1`). Plain **`http://`** on a LAN hostname **does not** qualify — key storage helpers call **`assertSecureContextForPrivateKeyOps`** (`apps/web-client/src/common/crypto/secureContext.ts`). Deploy production behind HTTPS. |
| **Implementation** | `apps/web-client/src/common/crypto/privateKeyStorage.ts`, `privateKeyWrap.ts`, `encoding.ts`, `secureContext.ts`. |

---

## 3. Algorithms and parameters (MVP)

### 3.1 Long-term keys (directory / rotation)

- **Curve:** **NIST P-256** (**secp256r1**) — first-class in **Web Crypto** (`EcKeyGenParams` namedCurve `P-256`), broad browser support, straightforward interop testing.
- **Public key on the wire / in API:** **SPKI** (DER) or **uncompressed point** (65 bytes, `0x04 ‖ X ‖ Y`) — pick **one** canonical encoding in OpenAPI; reject ambiguous inputs server-side.

**Alternative (later):** **X25519** for long-term and ephemeral ECDH — common in mobile/libsodium stacks; requires WASM if Web Crypto does not expose X25519 on all targets.

### 3.2 ECIES steps (summary)

- **Ephemeral** key pair: **P-256** (same curve as long-term keys for simpler interop).
- **ECDH** `deriveBits`: shared secret from **ephemeral private** + **recipient public** (or **ephemeral public** + **recipient private** on decrypt).
- **HKDF-SHA-256:** IKM = shared secret; **salt** / **info** domain-separated (e.g. `messaging/v1/ecies` + `conversationId` + `keyVersion`). Exact envelope layout is **Feature 11**.
- **AES-256-GCM:** key from HKDF; **96-bit** nonce per message, unique per key; optional **AAD** for non-secret headers.

### 3.3 Signing (authenticity of origin)

- **Not required** for the first “encrypt-only” milestone if GCM provides integrity and TLS provides transport authenticity — but **sender binding** is stronger with **asymmetric signatures** (**ECDSA** P-256 or **Ed25519**) or **signed prekeys** (Feature 11).
- **Signing keys** are also **asymmetric** and remain **client-only**; never uploaded as private material.

---

## 4. Key sizes (summary)

| Item | Size / format |
|------|----------------|
| P-256 private key (long-term or ephemeral) | 256 bits (scalar) |
| P-256 public key (uncompressed) | 512 bits X‖Y + prefix (65 bytes total) |
| ECDH shared secret (`deriveBits`) | 256 bits (P-256) |
| HKDF-SHA256 output (AES key) | 256 bits |
| AES-GCM key | 256 bits |
| AES-GCM nonce | 96 bits (recommended) |
| `keyVersion` (rotation) | Unsigned integer, monotonic per user (e.g. 32-bit in API) |

Maximum **public key** upload size should be capped in validation (e.g. **≤ 2 KiB** DER or raw) to avoid abuse.

---

## 5. Threat model

### 5.1 In scope (design goals)

- **Confidentiality:** Ciphertext does not reveal message content to the messaging-service **without** the **recipient’s private key** (asymmetric encryption property). Server sees blobs and **public** keys only.
- **Integrity:** AES-GCM authenticates ciphertext; HKDF binds keys to context.
- **Transport:** **HTTPS** / **WSS** required in production; **not** a substitute for E2EE **asymmetric** content encryption.

### 5.2 Explicit non-goals (MVP)

- **Metadata:** Server may still see **who** messages **whom**, timestamps, sizes — unless a separate metadata-protection design is adopted.
- **Active MITM** on first public-key fetch: mitigated with **TOFU**, **fingerprints**, or **out-of-band verification** — product/UX follow-up.
- **Device compromise:** Malware can exfiltrate private keys — **passphrase-wrapped** storage reduces casual theft only.

### 5.3 Server trust boundary

- The server is **trusted to route** messages and store **ciphertext** and **public keys**.
- The server **must not** store or log **private** keys or raw **shared secrets**; API schemas and logs must be reviewed (**`TASK_CHECKLIST.md`** — audit).

---

## 6. Rotation rules

### 6.1 Versioning

- Each user has a **`keyVersion`** (integer, monotonically increasing on **user-initiated rotation**).
- **Public key** documents in MongoDB collection **`user_public_keys`**: `{ userId, publicKey, keyVersion?, updatedAt }` — unique index on **`userId`**; **no** device-level rows (`apps/messaging-service/src/userPublicKeys/`).
- Senders fetch the recipient’s **current** `publicKey` + `keyVersion` before encrypting **new** messages with **ECIES** to that key.

### 6.2 User-initiated rotation

1. Client generates a **new** ECDH key pair.
2. Client calls **`POST /v1/users/me/public-key/rotate`** with the **new** public key (SPKI); the server assigns the next **`keyVersion`** and persists the new directory row (**`user_public_keys`**).
3. **Private key** material never leaves the client; the server only sees the new **public** key.

### 6.3 Decrypting old messages (product decision)

| Option | Behaviour |
|--------|-----------|
| **A — Retain old private keys locally** | Client keeps a **keyring** (version → private key material) in IndexedDB; can decrypt history after rotation. |
| **B — Single active key** | After rotation, **drop** old private key; **cannot** decrypt old ciphertext **without** restoring the old key from backup. |

**Product decision for this codebase:** adopt **Option A** as the **default** behaviour for **user-initiated rotation**.

- **Rationale:** Rotation is often triggered for security hygiene or device compromise concerns; users still expect **conversation history** to remain readable on that device. **Option A** matches that expectation. **Option B** remains a valid **alternative** (e.g. “wipe old keys” advanced flow or high-assurance mode) if product later adds an explicit UX and warnings.

**Implications:**

| Topic | Option A (default) | Option B |
|--------|-------------------|--------|
| **Old ciphertext** | Decrypt with the **private key** matching the **recipient key version** stamped on the message (or envelope — see **Feature 11**). Older versions stay in the local keyring. | Unreadable on this device unless the user **restores** a backup that contains the old private key. |
| **New sends** | Other users fetch the **current** `publicKey` + `keyVersion` from the server; **new** messages use the new key only. | Same. |
| **Server role** | Stores one row per user with **current** public key + version; **does not** help decrypt history and **cannot** recover lost private keys. | Same. |

### 6.4 Operational: user flow and support expectations

**End-user flow (rotation):**

1. User opens **encryption / security** settings (exact UI is web-client work — **`TASK_CHECKLIST.md`** *Prerequisite — User keypair* §B).
2. User chooses **Rotate key** (or equivalent). Client generates a new P-256 key pair in the browser.
3. Client calls **`POST /v1/users/me/public-key/rotate`** with the new public key; server returns **`UserPublicKeyResponse`** with incremented **`keyVersion`**.
4. Under **Option A**, client **appends** the new private key to the local **keyring** (by version) and **retains** prior private keys needed for decrypting messages encrypted to older versions.

**Decrypting old messages after rotation:**

- Each stored message (or ECIES envelope — **Feature 11**) must carry enough metadata to select the correct private key — typically **recipient key version** at send time. Decryption uses **`privateKey[keyVersion]`** from the keyring, not only the “current” key.
- If the user **deletes** the app data / loses IndexedDB **without** backup, **Option A** and **B** both imply **no server-side recovery** of plaintext; operators should document that **backup / export** is the only recovery path for history.

**Operational / support note:** field “I rotated and my old messages won’t decrypt” → verify local keyring vs **Option B** path; verify backup restore; **not** fixable by resetting the password on the server alone.

### 6.5 Server coercion / key replacement

- If an attacker **replaces** a user’s public key on the server, senders might encrypt to the wrong key — mitigate with **fingerprints**, **key transparency**, or **multi-device** consistency (**Feature 11** / ops).

---

## 7. Related documents

- **`TASK_CHECKLIST.md`** — *Prerequisite — User keypair*; **Feature 11** — full wire protocol and group wrapping.
- **`PROJECT_PLAN.md`** — product architecture (cross-reference when wire format is fixed).

---

## 8. Revision

| Date | Note |
|------|------|
| 2026-04-02 | §6.3–6.4: **Option A** chosen as default for rotation; operational flow and old-message decrypt impact documented. |
| 2026-04-12 | §2.1: IndexedDB + PBKDF2/AES-GCM client private key storage; secure-context requirement. |

When algorithms or encodings change, bump a **doc revision** note here and regenerate **OpenAPI** / client types in the same PR as code changes.
