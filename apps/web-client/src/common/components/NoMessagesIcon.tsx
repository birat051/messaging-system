type Props = {
  className?: string;
};

/** Chat bubble with slash — empty / no messages — **`aria-hidden`**; pair with visible text. */
export function NoMessagesIcon({ className }: Props) {
  return (
    <svg
      width="100%"
      viewBox="0 0 680 480"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer bubble */}
      <rect
        x={210}
        y={100}
        width={260}
        height={170}
        rx={24}
        fill="none"
        stroke="#999"
        strokeWidth={4}
        opacity={0.4}
      />

      {/* Bubble tail */}
      <path
        d="M255 270 L240 305 L290 270 Z"
        fill="none"
        stroke="#999"
        strokeWidth={4}
        strokeLinejoin="round"
        opacity={0.4}
      />

      {/* Message lines */}
      <line
        x1={248}
        y1={158}
        x2={432}
        y2={158}
        stroke="#999"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.25}
      />
      <line
        x1={248}
        y1={185}
        x2={390}
        y2={185}
        stroke="#999"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.25}
      />
      <line
        x1={248}
        y1={212}
        x2={410}
        y2={212}
        stroke="#999"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.25}
      />

      {/* Slash circle background */}
      <circle cx={390} cy={290} r={52} fill="white" />

      {/* Slash circle */}
      <circle
        cx={390}
        cy={290}
        r={48}
        fill="none"
        stroke="#999"
        strokeWidth={4}
        opacity={0.5}
      />

      {/* Slash line */}
      <line
        x1={356}
        y1={256}
        x2={424}
        y2={324}
        stroke="#999"
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.5}
      />
    </svg>
  );
}
