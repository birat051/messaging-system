/**
 * Persistent **product** cue that direct messages use **client-side encryption** (ECIES-style hybrid envelopes
 * and user-level public keys; private keys stay on device — see **`docs/USER_KEYPAIR_AND_E2EE_DESIGN.md`**).
 * Payloads are **opaque** on Socket.IO / RabbitMQ; the server **routes** without content visibility
 * (**`docs/PROJECT_PLAN.md`** §3). Not a substitute for Settings-based key management (there is none in the default UX).
 */
export function E2eeMessagingIndicator() {
  return (
    <div
      role="status"
      data-testid="e2ee-messaging-indicator"
      className="text-muted flex items-center gap-2 px-0.5 text-xs"
      title="Messages are encrypted on your device before they are sent. The service stores and routes ciphertext only—your message content is not visible to the server."
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="size-3.5 shrink-0 opacity-90"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
          clipRule="evenodd"
        />
      </svg>
      <span>End-to-end encrypted</span>
    </div>
  );
}
