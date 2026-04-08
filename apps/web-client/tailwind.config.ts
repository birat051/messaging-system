import type { Config } from 'tailwindcss';

/**
 * Tailwind v4: design tokens and `@theme` live primarily in `src/index.css`.
 * This file keeps explicit `content` paths for tooling and future extensions.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
} satisfies Config;
