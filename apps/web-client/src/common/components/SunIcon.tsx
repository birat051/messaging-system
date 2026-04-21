type Props = {
  className?: string;
};

/** Day / light theme — **`aria-hidden`**; parent supplies **`aria-label`**. */
export function SunIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="12"
          x2="12"
          y2="5.5"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}
