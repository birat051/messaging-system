type Props = {
  className?: string;
};

/** Night / dark theme — **`aria-hidden`**; parent supplies **`aria-label`**. */
export function MoonIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
