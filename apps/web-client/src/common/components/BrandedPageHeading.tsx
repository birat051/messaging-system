import type { ReactNode } from 'react';
import ekkoIconUrl from '@/assets/ekko-icon.svg?url';

type Props = {
  children?: ReactNode;
  /** Typography on the title row — the logo uses **`1em`** so it matches this font size. Default matches auth pages. */
  titleRowClassName?: string;
  horizontal?: boolean;
};

/**
 * **Ekko** mark + **`h1`**: horizontal row, **`items-center`**, icon height tracks title **`em`**.
 */
export function BrandedPageHeading({
  children,
  titleRowClassName = 'text-2xl font-semibold tracking-tight',
  horizontal = true,
}: Props) {
  return (
    <div
      className={`${horizontal ? 'flex' : 'flex w-full flex-col'} items-center gap-2 sm:gap-2.5 ${titleRowClassName} `}
    >
      <img
        src={ekkoIconUrl}
        alt=""
        width={horizontal ? 32 : 72}
        height={horizontal ? 32 : 72}
        className="shrink-0 rounded-[0.9em] border-1 border-white object-contain"
        aria-hidden
      />
      <h1 className="text-foreground leading-tight">{children}</h1>
    </div>
  );
}
