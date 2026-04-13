type Props = {
  className?: string;
};

/** Paper-plane send icon — **`aria-hidden`**; use **`aria-label` / `title`** on the control. */
export function SendIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}
