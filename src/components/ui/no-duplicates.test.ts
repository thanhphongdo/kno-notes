import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const APP_DIR = join(ROOT, 'src/app');
const UI_DIR = join(ROOT, 'src/components/ui');
const SHARED_DIR = join(ROOT, 'src/components/shared');
const FEATURES_DIR = join(ROOT, 'src/components/features');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function componentNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''));
}

describe('SPEC §5 shared-component rule', () => {
  it('every ui/ and shared/ component is re-exported from its barrel', () => {
    for (const [dir, barrel] of [
      [UI_DIR, join(UI_DIR, 'index.ts')],
      [SHARED_DIR, join(SHARED_DIR, 'index.ts')],
    ] as const) {
      const source = readFileSync(barrel, 'utf8');
      for (const name of componentNames(dir)) {
        expect(source, `${name} is missing from ${barrel}`).toContain(`'./${name}'`);
      }
    }
  });

  it('pages never deep-import a component file', () => {
    for (const file of walk(APP_DIR)) {
      const source = readFileSync(file, 'utf8');
      const deep = source.match(/from ['"]@\/components\/(ui|shared)\/[^'"]+['"]/g);
      expect(deep, `${file} must import from the barrel, not ${deep?.join(', ')}`).toBeNull();
    }
  });

  it('pages never use a native <select>', () => {
    for (const file of walk(APP_DIR)) {
      expect(readFileSync(file, 'utf8'), `${file} uses a native <select>`).not.toMatch(/<select[\s>]/);
    }
  });

  it('no design-system source file contains an emoji', () => {
    // Extended_Pictographic covers emoji; the typographic glyphs we do use
    // (B I U S ¶ • ❝ — ↶ ↷ ✓ ✕ #) are NOT in this class.
    for (const file of [...walk(UI_DIR), ...walk(SHARED_DIR), ...walk(FEATURES_DIR)]) {
      const source = readFileSync(file, 'utf8');
      expect(/\p{Extended_Pictographic}/u.test(source), `${file} contains an emoji`).toBe(false);
    }
  });

  it('no component hard-codes a hex colour outside globals.css', () => {
    const allowed = new Set([
      // Theme-independent scrim/placeholder colours from the prototype's lightbox.
      'lightbox.tsx',
    ]);
    for (const file of [...walk(UI_DIR), ...walk(SHARED_DIR)]) {
      if (allowed.has(file.split('/').pop() ?? '')) continue;
      const source = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{6}\b/.test(source), `${file} hard-codes a hex colour`).toBe(false);
    }
  });
});
