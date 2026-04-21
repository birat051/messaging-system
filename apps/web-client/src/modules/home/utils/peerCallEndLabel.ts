/**
 * Label for “who is in this call” / “who ended the call” — **display name** first, else **username**, else a short **user id** hint.
 */
export function formatPeerCallEndLabel(input: {
  userId: string;
  displayName?: string | null;
  username?: string | null;
}): string {
  const dn = input.displayName?.trim();
  if (dn) {
    return dn;
  }
  const un = input.username?.trim();
  if (un) {
    return un;
  }
  const id = input.userId.trim();
  if (id.length === 0) {
    return 'The other participant';
  }
  return id.length > 12 ? `User ${id.slice(0, 8)}…` : `User ${id}`;
}
