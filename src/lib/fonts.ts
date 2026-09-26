import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';

/**
 * The three families the design spec names, wired to the CSS variables
 * `globals.css` already points `--font-serif` / `--font-sans` / `--font-mono`
 * at. Without these variables on `<html>` every `font-serif`, `font-sans` and
 * `font-mono` utility silently falls back to Georgia / system-ui / ui-monospace
 * and the whole type scale is wrong, so `fonts.test.ts` pins the variable names
 * against `globals.css`.
 *
 * `vietnamese` is not optional: the entire UI is Vietnamese. The subset list is
 * repeated literally in each call because `next/font` is a compile-time
 * transform and only accepts literals — a shared `const` is a build error.
 */

/** Headings and reading content. Variable font — `opsz` is what makes 32px headings look right. */
export const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  axes: ['opsz'],
  variable: '--font-source-serif',
  display: 'swap',
});

/** UI chrome. */
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

/** Numbers, version labels, keyboard hints. */
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/** `className` for `<html>` — declares all three variables in one place. */
export const fontVariables = `${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable}`;
