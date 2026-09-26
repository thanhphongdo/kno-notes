import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `--spacing` is `1px` and the radius / font-size scales are literal pixel
 * numbers (`rounded-10`, `text-13`), none of which exist in stock Tailwind.
 * Without teaching tailwind-merge about them:
 *   • `rounded-9 rounded-8` would keep BOTH (last one loses the cascade coin toss), and
 *   • `text-13` would be parsed as a *colour* and silently evict `text-muted`.
 * The scales below mirror `@theme inline` in `src/app/globals.css` exactly.
 */
const RADIUS_SCALE = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', 'circle'];
const TEXT_SCALE = [
  '11', '12', '13', '14', '15', '16', '17', '18', '20', '22',
  '26', '28', '30', '32', '36', '38', '44', '52', '64', 'fs',
];

const ROUNDED_GROUPS = [
  'rounded', 'rounded-s', 'rounded-e', 'rounded-t', 'rounded-r', 'rounded-b', 'rounded-l',
  'rounded-ss', 'rounded-se', 'rounded-ee', 'rounded-es',
  'rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl',
] as const;

const twMerge = extendTailwindMerge({
  override: {
    // Stock tailwind-merge makes `font-size` evict `leading-*`, because
    // Tailwind's `text-lg/7` shorthand sets both. We never use that shorthand
    // (verified across src/), and our sizes are literal pixels, so the rule
    // only ever silently drops a line-height — it rendered the quiz question
    // at 1.5 instead of the 1.35 the design spec requires.
    conflictingClassGroups: { 'font-size': [] },
  },
  extend: {
    classGroups: {
      'font-size': [{ text: TEXT_SCALE }],
      ...Object.fromEntries(
        ROUNDED_GROUPS.map((group) => [group, [{ [group]: RADIUS_SCALE }]]),
      ),
    },
  },
});

/**
 * The single class-name helper for the whole app.
 * ALWAYS import as: `import { cn } from '@/lib/utils'`
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
