/**
 * Human-readable time until **`expiresAt`** (ISO 8601). Used by **`GuestSessionBanner`**.
 */
export function formatGuestSessionTimeRemaining(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): string {
  const end = Date.parse(expiresAtIso);
  if (Number.isNaN(end)) return '';
  const sec = Math.max(0, Math.floor((end - nowMs) / 1000));
  if (sec < 90) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
