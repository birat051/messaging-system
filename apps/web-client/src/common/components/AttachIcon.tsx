type Props = {
  className?: string;
};

/** Paperclip attach icon — **`aria-hidden`**; use **`aria-label` / `title`** on the control. */
export function AttachIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.5 6v11.5c0 2.485-2.015 4.5-4.5 4.5S7.5 19.985 7.5 17.5V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S5 2.79 5 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
    </svg>
  );
}
