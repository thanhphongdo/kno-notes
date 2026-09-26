import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `next/font/google` is a build-time transform and cannot be imported under
 * vitest, so this reads the source instead. The point is not style: if a
 * variable name here ever stops matching `globals.css`, every `font-serif` /
 * `font-sans` / `font-mono` utility falls back to Georgia / system-ui /
 * ui-monospace with no error anywhere — exactly the failure that is invisible
 * in tests and obvious on screen.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FONTS = readFileSync(join(ROOT, 'src/lib/fonts.ts'), 'utf8');
const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');

describe('src/lib/fonts.ts', () => {
  it('declares the exact CSS variables globals.css consumes', () => {
    for (const [utility, variable] of [
      ['--font-serif', '--font-source-serif'],
      ['--font-sans', '--font-plex-sans'],
      ['--font-mono', '--font-plex-mono'],
    ] as const) {
      expect(CSS, `globals.css no longer maps ${utility}`).toContain(`${utility}: var(${variable})`);
      expect(FONTS, `fonts.ts no longer defines ${variable}`).toContain(`variable: '${variable}'`);
    }
  });

  it('loads the three families the design spec names', () => {
    expect(FONTS).toContain('Source_Serif_4(');
    expect(FONTS).toContain('IBM_Plex_Sans(');
    expect(FONTS).toContain('IBM_Plex_Mono(');
  });

  it('includes the vietnamese subset — the whole UI is Vietnamese', () => {
    expect(FONTS).toContain("'vietnamese'");
    expect(FONTS).toContain("'latin-ext'");
  });

  it('keeps the optical-size axis on Source Serif 4', () => {
    expect(FONTS).toContain("axes: ['opsz']");
  });

  it('exports a single className carrying all three variables', () => {
    expect(FONTS).toMatch(
      /export const fontVariables = `\$\{sourceSerif\.variable\} \$\{plexSans\.variable\} \$\{plexMono\.variable\}`/,
    );
  });
});
