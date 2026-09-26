# Kno-Notes Part 1 — Design System & Shared Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js 15 + Tailwind v4 + shadcn-convention foundation and build every shared UI primitive and composite component listed in `docs/SPEC.md` §5, pixel-identical to the prototype, so that all later plans (pages, data, auth, quiz, PWA, MCP) only import components and never write raw markup.

**Architecture:** Runtime CSS custom properties (exactly the prototype's names) live in `globals.css` under `:root`, `[data-theme="dark"]`, and `[data-accent="…"]`. Tailwind v4's `@theme inline` maps every one of them to a utility namespace (`bg-surface`, `text-muted`, `border-line`, …) so utilities emit `var(--token)` and theme switching stays a single attribute flip on `<html>`. `--spacing` is redefined to `1px` so every Tailwind numeric utility is literally the prototype's pixel value (`h-46`, `px-14`, `rounded-10`, `gap-6`). We take **Radix UI primitives** for behavior (Popover, Tooltip, Slider, Separator) and hand-write 100% of the styling — we do **not** paste shadcn/ui's default styled components, because their class strings assume the default 4px spacing scale and would silently drift from the prototype. Components are `cva`-variant driven; no component is ever forked to express a variant.

**Tech Stack:** Next.js 15 (App Router, TypeScript strict), React 19, Tailwind CSS v4 (`@tailwindcss/postcss`), `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-popover`, `@radix-ui/react-tooltip`, `@radix-ui/react-separator`, `next/font/google` (Source Serif 4 / IBM Plex Sans / IBM Plex Mono), Vitest + `@testing-library/react` + `@testing-library/user-event` + jsdom.

**Spec:**
- `docs/SPEC.md` (source of truth)
- `docs/reference/Design Spec.dc.html` (tokens, type, spacing, component specs, icon set, microcopy)
- `docs/reference/So Lam Sang.dc.html` (interactive prototype — exact inline styles)

---

## Global Constraints

Every task's requirements implicitly include everything in this section.

- **SHARED COMPONENT RULE (SPEC §5, absolute):** No duplicated component markup anywhere. Any UI used in ≥2 places — or plausibly reusable — lives in `src/components/ui/` (primitive) or `src/components/shared/` (business composite). Pages import; pages never re-implement. Before writing any JSX, search `src/components/`. Variants are expressed with `cva`, never by forking a component.
- **No native `<select>` anywhere.** `Select` is a custom popover-backed listbox (SPEC §1.2 #16).
- **No emoji.** Icons are inline SVG via the `Icon` component only. The glyphs `B I U S H2 H3 ¶ • 1. ❝ — ↶ ↷ ✓ ✕` are *typographic characters* used as toolbar/quiz labels per Design Spec §05 ("Không dùng emoji; ký tự … trên toolbar là chữ") — they are allowed and are not emoji.
- **Every numeric value matches the prototype exactly.** Heights in use: 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 18. Radii in use: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 999px, 50%. Stroke widths: 1.6, 1.7, 1.8, 2, 2.2, 2.6.
- **Dark mode is `data-theme="dark"` on `<html>`**, never Tailwind's `.dark` class strategy. `@custom-variant dark` is declared so `dark:` utilities still work and resolve against `[data-theme="dark"]`.
- **Accent is `data-accent` on `<html>`**: absent/`teal` (default), `indigo`, `plum`.
- **Prose font size is `--fs` on `<html>`**, integer 14–22, default 17.
- **Single breakpoint: 820px.** `<820` is mobile. Use `max-[819px]:` / `min-[820px]:` — no other breakpoints.
- **TypeScript strict.** No `any`. Every component exports its props interface.
- **UI language is Vietnamese.** Microcopy is copied verbatim from Design Spec §09, except app-name strings, which are `Kno-Notes`. Brand mark letter is `K`.
- **Commit after every task**, conventional commits, e.g. `feat(ui): add Button and IconButton`.
- `npm run build`, `tsc --noEmit`, `eslint`, and `vitest run` must be clean at the end of every task.

## Review Focus

Five conditions the spec implies but that no obvious task exercises. Each gets a test in the task that owns the code.

1. **Theme/font-size flash and hydration mismatch** — server HTML has no `data-theme`; the pre-paint inline script sets it, and React must never overwrite it during hydration. A reload in dark mode must not flash light. → tested in **Task D3**.
2. **Out-of-range or corrupt `--fs`** — a stale or hand-edited preference of `0`, `99`, `"abc"`, or `null` must clamp to 14–22 and never render prose at 0px or `NaN`. → tested in **Task D3**.
3. **Custom `Select` keyboard and dismissal** — because native `<select>` is banned, nothing else provides keyboard operation: ArrowUp/ArrowDown/Home/End move the active option, Enter/Space commit, Escape closes and restores focus to the trigger, outside `mousedown` closes. → tested in **Task D9**.
4. **Unbreakable long strings** — a title or tag with no spaces (a pasted URL, a 60-character Vietnamese tag) must ellipsis/clamp inside `NoteCard`, `NoteListRow` and `TagChip` and must not widen the grid column or cause horizontal page scroll. → tested in **Task D15**.
5. **Empty and zero-valued data** — 0 notes, 1 page, 0 images, 0 comments, and a quiz with `total === 0` must render without `NaN%`, without a division by zero, and without an empty bordered shell. → tested in **Task D11** (Pagination/EmptyState) and **Task D19** (QuizResult).

---

## File Structure

```
src/
  app/
    layout.tsx                  root html/body, fonts, theme script
    globals.css                 runtime tokens + @theme inline + [data-prose]
  lib/
    utils.ts                    cn()
    fonts.ts                    next/font/google instances
    theme.ts                    Theme/Accent types, FS_MIN/FS_MAX, clampFontSize, applyPrefs
    z.ts                        Z-index scale constant
  components/
    ui/                         primitives
      icon.tsx  button.tsx  icon-button.tsx  input.tsx  textarea.tsx  label.tsx
      badge.tsx  chip.tsx  pill.tsx  kbd.tsx  separator.tsx  skeleton.tsx  spinner.tsx
      avatar.tsx  popover.tsx  select.tsx  segmented.tsx  toggle.tsx  slider.tsx
      toast.tsx  tooltip.tsx  scroll-area.tsx
      index.ts                  barrel
    shared/                     business composites
      app-shell.tsx  sidebar.tsx  sidebar-section.tsx  sidebar-nav-item.tsx  app-header.tsx
      search-box.tsx  search-suggestions.tsx  settings-popover.tsx  theme-switch.tsx
      font-size-control.tsx  note-card.tsx  note-list-row.tsx  note-grid.tsx  note-list.tsx
      priority.tsx             PriorityDot/PriorityPill/PriorityLabel/PrioritySegmented
      tag-chip.tsx  tag-input.tsx  tag-suggestions.tsx  filter-chips.tsx  sort-select.tsx
      view-toggle.tsx  pagination.tsx  empty-state.tsx  prose.tsx  rich-text-editor.tsx
      editor-toolbar.tsx  image-dropzone.tsx  image-grid.tsx  image-thumb.tsx  lightbox.tsx
      comment-list.tsx  comment-composer.tsx  version-timeline.tsx  version-banner.tsx
      delete-confirm-banner.tsx  quiz-modal.tsx  quiz-option.tsx  quiz-feedback.tsx
      quiz-result.tsx  quiz-history-list.tsx  highlight-popup.tsx  highlight-list.tsx
      info-grid.tsx  section-label.tsx  rail.tsx
      index.ts                  barrel
CLAUDE.md                       shared-component rule (SPEC §5.6)
components.json                 shadcn CLI config
vitest.config.ts  vitest.setup.ts
```

---

### Task D1: Next.js 15 scaffold, fonts, and the CLAUDE.md shared-component rule

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `src/lib/fonts.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `CLAUDE.md`
- Test: none (verified by `npm run build`)

**Interfaces:**
- Consumes: nothing.
- Produces: `sourceSerif`, `plexSans`, `plexMono` from `@/lib/fonts` (each a `NextFontWithVariable` exposing `.variable`); CSS variables `--font-source-serif`, `--font-plex-sans`, `--font-plex-mono` on `<html>`; path alias `@/*` → `src/*`.

- [ ] **Step 1: Initialize git and the package manifest**

```bash
cd /Users/spt/Documents/kno-notes
git init
```

Create `package.json`:

```json
{
  "name": "kno-notes",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "15.5.4",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@types/node": "22.10.5",
    "@types/react": "19.1.8",
    "@types/react-dom": "19.1.6",
    "eslint": "9.18.0",
    "eslint-config-next": "15.5.4",
    "typescript": "5.7.3"
  }
}
```

- [ ] **Step 2: Install and add TypeScript / Next config**

```bash
npm install
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "types": ["vitest/globals"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
```

Create `.gitignore`:

```
node_modules
.next
out
.env*.local
*.tsbuildinfo
next-env.d.ts
coverage
```

- [ ] **Step 3: Add the ESLint config**

Create `eslint.config.mjs`:

```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
];
```

```bash
npm install -D @eslint/eslintrc
```

- [ ] **Step 4: Create the font module**

Create `src/lib/fonts.ts`:

```ts
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';

/** Serif: page/note titles, prose body, quiz questions, brand, score. 400/600/700, opsz 8–60. */
export const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  axes: ['opsz'],
  variable: '--font-source-serif',
  display: 'swap',
});

/** Sans: all UI chrome, prose h2/h3, tables. 400/500/600. */
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

/** Mono: counts, vN, page numbers, shortcuts, "CÂU 1 / 5", usernames. 400/500. */
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const fontVariables = `${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable}`;
```

- [ ] **Step 5: Create the root layout and a placeholder page**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import { fontVariables } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kno-Notes',
  description: 'Sổ tay kiến thức cá nhân.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1112' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme="light" suppressHydrationWarning className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function Page() {
  return <main />;
}
```

Create an empty `src/app/globals.css` (filled in Task D2):

```css
/* filled in Task D2 */
```

- [ ] **Step 6: Write CLAUDE.md with the shared-component rule**

Create `CLAUDE.md`:

```markdown
# Kno-Notes — Working Rules

Source of truth: `docs/SPEC.md`. Design truth: `docs/reference/Design Spec.dc.html`
and `docs/reference/So Lam Sang.dc.html`. Plans: `docs/superpowers/plans/`.

## ⚠️ SHARED COMPONENT RULE — ABSOLUTE (SPEC §5)

**Writing the same component markup twice is forbidden.**

Any UI element used in ≥ 2 places — or that could plausibly be reused — MUST live in
`src/components/ui/` (primitive) or `src/components/shared/` (business composite), and
pages/features MUST import it.

1. Before writing ANY JSX: search `src/components/`. If it exists, use it, or extend it
   with a prop or a `cva` variant. If it does not exist, create the shared component FIRST,
   then use it.
2. Copy-pasting markup between pages is forbidden.
3. Hard-coding a color or a size in a page is forbidden when a token or variant exists.
4. Every variant is a `cva` variant. Never a new component.
5. Barrels: import from `@/components/ui` and `@/components/shared`.

## Other absolutes

- No native `<select>` — use `Select` from `@/components/ui`.
- No emoji. Icons are inline SVG via `<Icon name="…" />` only.
  (`B I U S H2 H3 ¶ • 1. ❝ — ↶ ↷ ✓ ✕` are typographic glyphs, not emoji — allowed.)
- Dark mode is `data-theme="dark"` on `<html>`, not a `.dark` class.
- Accent is `data-accent="teal|indigo|plum"` on `<html>`.
- Prose size is `--fs` on `<html>`, integer 14–22.
- One breakpoint: 820px (`max-[819px]:` / `min-[820px]:`).
- Tailwind `--spacing` is `1px`: `h-46` IS 46px, `gap-6` IS 6px, `rounded-10` IS 10px.
- UI language is Vietnamese. App name is `Kno-Notes`; brand mark is `K`.
- Every numeric value must match `So Lam Sang.dc.html` exactly.
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: compiles; `/` renders.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript strict, fonts, CLAUDE.md shared-component rule"
```

---

### Task D2: Tailwind v4 theme — every design token, both themes, three accents

**Files:**
- Create: `src/lib/theme.ts`, `src/lib/z.ts`
- Modify: `src/app/globals.css`, `postcss.config.mjs`, `package.json`
- Test: `src/lib/theme.test.ts`

**Interfaces:**
- Consumes: `fontVariables` (Task D1).
- Produces:
  - Color utilities: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`, `border-line2`, `text-text`/`bg-text`, `text-muted`, `text-faint`, `bg-accent`/`text-accent`/`border-accent`, `text-accent-ink`, `bg-accent-soft`, `text-hi`/`bg-hi`/`border-hi`, `bg-hi-soft`, `text-med`/`bg-med`, `bg-med-soft`, `text-low`/`bg-low`, `bg-low-soft`, `text-ok`/`bg-ok`/`border-ok`, `bg-ok-soft`, `bg-hl`, `bg-hl2`.
  - Shadows: `shadow-card` (= `--shadow`), `shadow-seg` (segmented active).
  - Fonts: `font-serif`, `font-sans`, `font-mono`.
  - Radii: `rounded-2 3 4 5 6 7 8 9 10 11 12 14`, `rounded-full` (999px), `rounded-circle` (50%).
  - Text sizes: `text-11 12 13 14 15 16 17 18 20 22 26 28 30 32 36 38 44 52 64`, plus `text-fs` (= `var(--fs)`).
  - Spacing: `--spacing: 1px` → every numeric utility is a literal pixel value.
  - `dark:` variant bound to `[data-theme="dark"]`.
  - `src/lib/theme.ts`: `export type Theme = 'light' | 'dark'`, `export type Accent = 'teal' | 'indigo' | 'plum'`, `export const FS_MIN = 14`, `export const FS_MAX = 22`, `export const FS_DEFAULT = 17`, `export function clampFontSize(v: unknown): number`, `export function applyPrefs(p: { theme?: Theme; accent?: Accent; fontSize?: number }): void`, `export const PREFS_KEY = 'kno-notes-prefs'`.
  - `src/lib/z.ts`: `export const Z` with numeric members.

- [ ] **Step 1: Install Tailwind v4**

```bash
npm install tailwindcss@4 @tailwindcss/postcss@4
```

Create `postcss.config.mjs`:

```js
const config = { plugins: { '@tailwindcss/postcss': {} } };
export default config;
```

- [ ] **Step 2: Write the runtime token layer into globals.css**

Replace `src/app/globals.css` with (this block only — the `@theme` block is Step 3, prose is Task D3):

```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* ── Runtime tokens: exact names and values from So Lam Sang.dc.html ───────── */
:root {
  --bg: #f6f6f3;
  --surface: #ffffff;
  --surface2: #f0f0ec;
  --line: #e5e4df;
  --line2: #d3d2cb;
  --text: #1a1c1e;
  --muted: #63676c;
  --faint: #989ca1;
  --accent: #17756b;
  --accent-ink: #ffffff;
  --accent-soft: #e2efec;
  --hi: #b3382e;
  --hi-soft: #f8e7e4;
  --med: #9c630f;
  --med-soft: #f5ecda;
  --low: #5a6670;
  --low-soft: #eceeef;
  --ok: #23794a;
  --ok-soft: #e3f2e8;
  --hl: #fbe9a6;
  --hl2: #f6db78;
  --shadow: 0 1px 2px rgba(20, 20, 20, .04), 0 10px 30px rgba(20, 20, 20, .07);
  --seg-shadow: 0 1px 2px rgba(0, 0, 0, .12);
  --fs: 17px;
}

[data-theme="dark"] {
  --bg: #0f1112;
  --surface: #16191a;
  --surface2: #1d2122;
  --line: #252a2b;
  --line2: #343a3c;
  --text: #e6e7e5;
  --muted: #9ca1a5;
  --faint: #6b7175;
  --accent: #5cc3b3;
  --accent-ink: #0c1a18;
  --accent-soft: #15302c;
  --hi: #f0897e;
  --hi-soft: #391f1c;
  --med: #e2b35f;
  --med-soft: #342a17;
  --low: #a4aeb5;
  --low-soft: #242a2d;
  --ok: #6cc98f;
  --ok-soft: #173022;
  --hl: rgba(226, 179, 95, .28);
  --hl2: rgba(226, 179, 95, .42);
  --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 10px 30px rgba(0, 0, 0, .35);
  --seg-shadow: 0 1px 2px rgba(0, 0, 0, .4);
}

/* ── Accent variants (Design Spec §01) ─────────────────────────────────────── */
[data-accent="indigo"] { --accent: #4351a6; --accent-soft: #e8eaf6; --accent-ink: #ffffff; }
[data-accent="plum"]   { --accent: #8a3e74; --accent-soft: #f5e7f0; --accent-ink: #ffffff; }
[data-theme="dark"][data-accent="indigo"] { --accent: #9ea8f2; --accent-soft: #1f2340; --accent-ink: #0c1a18; }
[data-theme="dark"][data-accent="plum"]   { --accent: #dc9cc8; --accent-soft: #34202e; --accent-ink: #0c1a18; }

/* ── Z-index scale (Design Spec §04) ───────────────────────────────────────── */
:root {
  --z-toolbar: 5;
  --z-sort-backdrop: 20;
  --z-sort-menu: 21;
  --z-header: 30;
  --z-sug-backdrop: 31;
  --z-sug-box: 32;
  --z-sug-panel: 33;
  --z-drawer-backdrop: 40;
  --z-sidebar: 50;
  --z-settings-backdrop: 60;
  --z-settings-popover: 61;
  --z-highlight-popup: 80;
  --z-toast: 90;
  --z-quiz: 95;
  --z-lightbox: 100;
}
```

- [ ] **Step 3: Append the `@theme inline` mapping to globals.css**

```css
/* ── Tailwind theme: `inline` so utilities emit var(--token), keeping runtime
      theme switching working with a single attribute flip. ─────────────────── */
@theme inline {
  /* 1px spacing base: every numeric utility is a literal pixel value. */
  --spacing: 1px;

  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface2: var(--surface2);
  --color-line: var(--line);
  --color-line2: var(--line2);
  --color-text: var(--text);
  --color-muted: var(--muted);
  --color-faint: var(--faint);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --color-accent-soft: var(--accent-soft);
  --color-hi: var(--hi);
  --color-hi-soft: var(--hi-soft);
  --color-med: var(--med);
  --color-med-soft: var(--med-soft);
  --color-low: var(--low);
  --color-low-soft: var(--low-soft);
  --color-ok: var(--ok);
  --color-ok-soft: var(--ok-soft);
  --color-hl: var(--hl);
  --color-hl2: var(--hl2);

  --shadow-card: var(--shadow);
  --shadow-seg: var(--seg-shadow);

  --font-serif: var(--font-source-serif), Georgia, serif;
  --font-sans: var(--font-plex-sans), system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;

  --radius-2: 2px;
  --radius-3: 3px;
  --radius-4: 4px;
  --radius-5: 5px;
  --radius-6: 6px;
  --radius-7: 7px;
  --radius-8: 8px;
  --radius-9: 9px;
  --radius-10: 10px;
  --radius-11: 11px;
  --radius-12: 12px;
  --radius-14: 14px;
  --radius-full: 999px;
  --radius-circle: 50%;

  --text-11: 11px;
  --text-12: 12px;
  --text-13: 13px;
  --text-14: 14px;
  --text-15: 15px;
  --text-16: 16px;
  --text-17: 17px;
  --text-18: 18px;
  --text-20: 20px;
  --text-22: 22px;
  --text-26: 26px;
  --text-28: 28px;
  --text-30: 30px;
  --text-32: 32px;
  --text-36: 36px;
  --text-38: 38px;
  --text-44: 44px;
  --text-52: 52px;
  --text-64: 64px;
  --text-fs: var(--fs);
}
```

- [ ] **Step 4: Append the base layer to globals.css**

```css
@layer base {
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-plex-sans), system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    transition: background .2s;
  }
  input, textarea, button, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  ::placeholder { color: var(--faint); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  input[type=range] { accent-color: var(--accent); }
  @keyframes qpulse { 0%, 100% { opacity: .45 } 50% { opacity: 1 } }
}
```

- [ ] **Step 5: Write the failing test for `clampFontSize`**

Create `src/lib/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FS_DEFAULT, FS_MAX, FS_MIN, clampFontSize } from './theme';

describe('clampFontSize', () => {
  it('passes through in-range integers', () => {
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize(17)).toBe(17);
    expect(clampFontSize(22)).toBe(22);
  });

  it('clamps out-of-range numbers to the 14–22 bounds', () => {
    expect(clampFontSize(0)).toBe(FS_MIN);
    expect(clampFontSize(-5)).toBe(FS_MIN);
    expect(clampFontSize(99)).toBe(FS_MAX);
  });

  it('falls back to the default for non-numbers, NaN and null', () => {
    expect(clampFontSize('abc')).toBe(FS_DEFAULT);
    expect(clampFontSize(Number.NaN)).toBe(FS_DEFAULT);
    expect(clampFontSize(null)).toBe(FS_DEFAULT);
    expect(clampFontSize(undefined)).toBe(FS_DEFAULT);
  });

  it('rounds fractional values', () => {
    expect(clampFontSize(17.6)).toBe(18);
  });
});
```

- [ ] **Step 6: Write `src/lib/theme.ts` and `src/lib/z.ts`**

Create `src/lib/theme.ts`:

```ts
export const PREFS_KEY = 'kno-notes-prefs';

export type Theme = 'light' | 'dark';
export type Accent = 'teal' | 'indigo' | 'plum';

export const FS_MIN = 14;
export const FS_MAX = 22;
export const FS_DEFAULT = 17;

export const THEMES: readonly Theme[] = ['light', 'dark'];
export const ACCENTS: readonly Accent[] = ['teal', 'indigo', 'plum'];

/** Clamp any untrusted value to an integer font size in [14, 22]. */
export function clampFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return FS_DEFAULT;
  return Math.min(FS_MAX, Math.max(FS_MIN, Math.round(n)));
}

export interface Prefs {
  theme?: Theme;
  accent?: Accent;
  fontSize?: number;
}

/** Apply prefs to <html>. Safe to call on every change; idempotent. */
export function applyPrefs(prefs: Prefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = prefs.theme === 'dark' ? 'dark' : 'light';
  root.dataset.accent = prefs.accent && prefs.accent !== 'teal' ? prefs.accent : 'teal';
  root.style.setProperty('--fs', `${clampFontSize(prefs.fontSize)}px`);
}
```

Create `src/lib/z.ts`:

```ts
/** Z-index scale — Design Spec §04. Mirrors the --z-* custom properties. */
export const Z = {
  toolbar: 5,
  sortBackdrop: 20,
  sortMenu: 21,
  header: 30,
  sugBackdrop: 31,
  sugBox: 32,
  sugPanel: 33,
  drawerBackdrop: 40,
  sidebar: 50,
  settingsBackdrop: 60,
  settingsPopover: 61,
  highlightPopup: 80,
  toast: 90,
  quiz: 95,
  lightbox: 100,
} as const;

export type ZLayer = keyof typeof Z;
```

- [ ] **Step 7: Verify the build compiles the theme**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(theme): map every design token to Tailwind v4 @theme inline for both themes and 3 accents"
```

---

### Task D3: `[data-prose]` stylesheet, theme script, and no-flash hydration

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/theme-script.tsx`
- Test: `src/components/theme-script.test.tsx`

**Interfaces:**
- Consumes: `clampFontSize`, `PREFS_KEY` from `@/lib/theme`.
- Produces: `<ThemeScript />` (renders a blocking inline `<script>` in `<head>`); `themeScriptSource: string` exported for testing; the `[data-prose]` CSS contract used by `Prose` (Task D16) and `RichTextEditor` (Task D17).

- [ ] **Step 1: Append the prose stylesheet to globals.css (ported 1:1 from the prototype)**

```css
/* ── [data-prose] — ported verbatim from So Lam Sang.dc.html ───────────────── */
[data-prose] {
  font-family: var(--font-source-serif), Georgia, serif;
  font-size: var(--fs);
  line-height: 1.72;
  color: var(--text);
  outline: none;
  word-wrap: break-word;
}
[data-prose] > *:first-child { margin-top: 0; }
[data-prose] p { margin: 0 0 .9em; }
[data-prose] h2 {
  font-family: var(--font-plex-sans), system-ui, sans-serif;
  font-size: 1.12em;
  font-weight: 600;
  letter-spacing: -.005em;
  margin: 1.9em 0 .6em;
}
[data-prose] h3 {
  font-family: var(--font-plex-sans), system-ui, sans-serif;
  font-size: .98em;
  font-weight: 600;
  margin: 1.5em 0 .4em;
}
[data-prose] ul, [data-prose] ol { padding-left: 1.35em; margin: 0 0 1em; }
[data-prose] li { margin: .28em 0; padding-left: .2em; }
[data-prose] li::marker { color: var(--accent); }
[data-prose] blockquote {
  margin: 1.3em 0;
  padding: .1em 0 .1em 1.1em;
  border-left: 2px solid var(--accent);
  color: var(--muted);
  font-style: italic;
}
[data-prose] hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
[data-prose] img {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  display: block;
  margin: 1.3em 0;
  cursor: zoom-in;
}
[data-prose] strong, [data-prose] b { font-weight: 600; }
[data-prose] table {
  border-collapse: collapse;
  width: 100%;
  font-family: var(--font-plex-sans), system-ui, sans-serif;
  font-size: .86em;
  margin: 1em 0 1.4em;
}
[data-prose] th, [data-prose] td {
  border-bottom: 1px solid var(--line);
  padding: .55em .7em;
  text-align: left;
  vertical-align: top;
}
[data-prose] th { color: var(--muted); font-weight: 500; }
[data-prose] mark {
  background: var(--hl);
  color: inherit;
  border-radius: 3px;
  padding: .05em .1em;
  cursor: pointer;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
[data-prose] mark:hover { background: var(--hl2); }
[data-prose][contenteditable="true"]:empty:before {
  content: attr(data-ph);
  color: var(--faint);
}
```

- [ ] **Step 2: Write the failing test for the theme script**

Create `src/components/theme-script.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { PREFS_KEY } from '@/lib/theme';
import { themeScriptSource } from './theme-script';

function runScript() {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(themeScriptSource)();
}

describe('themeScriptSource', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
    document.documentElement.style.removeProperty('--fs');
  });

  it('defaults to light / teal / 17px with no stored prefs', () => {
    runScript();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('17px');
  });

  it('restores a stored dark theme, accent and font size before paint', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: 'dark', accent: 'plum', fontSize: 21 }));
    runScript();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.accent).toBe('plum');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('21px');
  });

  it('clamps a corrupt font size instead of rendering 0px or NaN', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: 0 }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('14px');

    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: 'abc' }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('17px');

    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: 99 }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('22px');
  });

  it('survives unparseable storage and still sets light', () => {
    localStorage.setItem(PREFS_KEY, '{not json');
    runScript();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('rejects an unknown theme value', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: 'neon' }));
    runScript();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/theme-script.test.tsx`
Expected: FAIL — cannot resolve `./theme-script`. (Vitest itself is configured in Task D4; if `vitest` is not yet installed, do Task D4 Steps 1–4 first, then return. The plan orders D3 before D4 only because the CSS contract is needed by D4's smoke test.)

- [ ] **Step 4: Write the theme script**

Create `src/components/theme-script.tsx`:

```tsx
import { PREFS_KEY } from '@/lib/theme';

/**
 * Runs before first paint, in <head>. Must not import anything at runtime —
 * it is serialized as a string. Keeps <html> attributes authoritative so React
 * hydration never overwrites them (layout renders data-theme="light" as the
 * SSR default and <html> carries suppressHydrationWarning).
 */
export const themeScriptSource = `(function(){
  var d = document.documentElement;
  var theme = 'light', accent = 'teal', fs = 17;
  try {
    var p = JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)}) || '{}');
    if (p.theme === 'dark') theme = 'dark';
    if (p.accent === 'indigo' || p.accent === 'plum') accent = p.accent;
    var n = Number(p.fontSize);
    fs = isFinite(n) ? Math.min(22, Math.max(14, Math.round(n))) : 17;
  } catch (e) {}
  d.setAttribute('data-theme', theme);
  d.setAttribute('data-accent', accent);
  d.style.setProperty('--fs', fs + 'px');
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />;
}
```

- [ ] **Step 5: Mount `ThemeScript` in the root layout**

Modify `src/app/layout.tsx` — replace the `return` block:

```tsx
  return (
    <html lang="vi" data-theme="light" data-accent="teal" suppressHydrationWarning className={fontVariables}>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
```

and add the import at the top: `import { ThemeScript } from '@/components/theme-script';`

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/theme-script.test.tsx src/lib/theme.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(theme): port [data-prose] 1:1 and add pre-paint theme script with font-size clamping"
```

---

### Task D4: `cn()`, cva, shadcn config, Vitest + Testing Library

**Files:**
- Create: `src/lib/utils.ts`, `src/lib/utils.test.ts`, `components.json`, `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: **`import { cn } from '@/lib/utils'`** — `export function cn(...inputs: ClassValue[]): string`. This is the canonical import path for every component in every later plan. Also `cva` / `type VariantProps` re-exported from `class-variance-authority` directly (components import from the package, not from `utils`).

- [ ] **Step 1: Install runtime and test dependencies**

```bash
npm install clsx tailwind-merge class-variance-authority \
  @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-separator
npm install -D vitest@3 @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Write the failing test for `cn`**

Create `src/lib/utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets a later Tailwind utility win over an earlier conflicting one', () => {
    expect(cn('h-36', 'h-40')).toBe('h-40');
    expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('h-36 rounded-9', 'px-12')).toBe('h-36 rounded-9 px-12');
  });
});
```

- [ ] **Step 3: Create the Vitest config and setup**

Create `vitest.config.ts`:

```ts
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
```

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-accent');
  document.documentElement.style.removeProperty('--fs');
});

// jsdom has no matchMedia; several components read it for the 820px breakpoint.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// jsdom has no ResizeObserver; Radix popper uses it.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: FAIL — `Failed to resolve import "./utils"`.

- [ ] **Step 5: Write `cn`**

Create `src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The single class-name helper for the whole app.
 * ALWAYS import as: `import { cn } from '@/lib/utils'`
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Add the shadcn config (convention only — we hand-write styles)**

Create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "none",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Add to `CLAUDE.md` under "Other absolutes":

```markdown
- shadcn/ui: we use its CLI layout, `cn()` convention and Radix primitives for
  BEHAVIOR only. We never paste shadcn's default styled components — their class
  strings assume a 4px spacing scale and `--spacing` here is `1px`. Adopt from
  shadcn/Radix: Popover, Tooltip, Separator, Slider. Hand-write everything else.
```

- [ ] **Step 8: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add -A
git commit -m "feat(lib): add cn() helper, shadcn config, Vitest + Testing Library setup"
```

---

### Task D5: `Icon` — the complete typed inline SVG set

**Files:**
- Create: `src/components/ui/icon.tsx`
- Test: `src/components/ui/icon.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces:

```ts
export type IconName =
  | 'search' | 'star' | 'plus' | 'sidebar-open' | 'sidebar-collapse' | 'edit' | 'trash'
  | 'quiz' | 'highlight' | 'history' | 'comment' | 'image' | 'grid' | 'list'
  | 'sun' | 'moon' | 'logout'
  | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'check' | 'close';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: IconName;
  /** Rendered px size (width = height). Default 16. */
  size?: number;
  /** Overrides the per-icon default stroke width. */
  strokeWidth?: number;
  /** Fills the shape with currentColor. Only meaningful for `star`. Default false. */
  filled?: boolean;
  className?: string;
}

export const ICON_NAMES: readonly IconName[];
export function Icon(props: IconProps): React.JSX.Element;
```

All icons: `viewBox="0 0 24 24"`, `fill` = `none` (or `currentColor` when `filled`), `stroke="currentColor"`, `stroke-linecap`/`stroke-linejoin` `round`, `aria-hidden="true"`, `focusable="false"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/icon.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon, type IconName } from './icon';

describe('Icon', () => {
  it('exposes exactly the 22 names from Design Spec §05', () => {
    expect([...ICON_NAMES].sort()).toEqual(
      [
        'check', 'chevron-down', 'chevron-left', 'chevron-right', 'close', 'comment',
        'edit', 'grid', 'highlight', 'history', 'image', 'list', 'logout', 'moon',
        'plus', 'quiz', 'search', 'sidebar-collapse', 'sidebar-open', 'star', 'sun', 'trash',
      ].sort(),
    );
  });

  it.each(ICON_NAMES)('renders %s with a 24x24 viewBox and currentColor stroke', (name: IconName) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path, rect, circle')).not.toBeNull();
  });

  it('defaults to 16px and honours an explicit size', () => {
    const { container, rerender } = render(<Icon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
    rerender(<Icon name="search" size={17} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '17');
    expect(container.querySelector('svg')).toHaveAttribute('height', '17');
  });

  it('uses the per-icon default stroke width unless overridden', () => {
    const { container, rerender } = render(<Icon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.8');
    rerender(<Icon name="close" strokeWidth={2.6} />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '2.6');
    rerender(<Icon name="check" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '2.2');
  });

  it('fills the star when filled is set', () => {
    const { container, rerender } = render(<Icon name="star" />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none');
    rerender(<Icon name="star" filled />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
  });

  it('labels the icon when a title is given, otherwise hides it', () => {
    render(<Icon name="trash" aria-label="Xoá" />);
    expect(screen.getByLabelText('Xoá')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/icon.test.tsx`
Expected: FAIL — cannot resolve `./icon`.

- [ ] **Step 3: Write the Icon component**

Create `src/components/ui/icon.tsx`:

```tsx
import type { JSX, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export type IconName =
  | 'search' | 'star' | 'plus' | 'sidebar-open' | 'sidebar-collapse' | 'edit' | 'trash'
  | 'quiz' | 'highlight' | 'history' | 'comment' | 'image' | 'grid' | 'list'
  | 'sun' | 'moon' | 'logout'
  | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'check' | 'close';

interface IconDef {
  /** Default stroke width, exactly as specified in Design Spec §05. */
  sw: number;
  cap: boolean;
  join: boolean;
  paths: JSX.Element;
}

const STAR_D = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';
const SIDEBAR_D = 'M9.5 4.5v15';

const ICONS: Record<IconName, IconDef> = {
  search: { sw: 1.8, cap: true, join: false, paths: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>) },
  star: { sw: 1.6, cap: false, join: true, paths: <path d={STAR_D} /> },
  plus: { sw: 2, cap: true, join: false, paths: <path d="M12 5v14M5 12h14" /> },
  'sidebar-open': { sw: 1.7, cap: true, join: true, paths: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d={SIDEBAR_D} /></>) },
  'sidebar-collapse': { sw: 1.7, cap: true, join: true, paths: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15M16 10l-2 2 2 2" /></>) },
  edit: { sw: 1.8, cap: false, join: true, paths: <path d="M4 20h4L19 9l-4-4L4 16z" /> },
  trash: { sw: 1.7, cap: true, join: true, paths: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /> },
  quiz: { sw: 1.8, cap: true, join: true, paths: (<><path d="M9 11l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="3" /></>) },
  highlight: { sw: 1.8, cap: true, join: true, paths: (<><path d="M14.5 4.5l5 5L10 19H5v-5z" /><path d="M4 22h16" /></>) },
  history: { sw: 1.8, cap: true, join: false, paths: (<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>) },
  comment: { sw: 1.7, cap: false, join: true, paths: <path d="M4 5h16v11H9l-5 4z" /> },
  image: { sw: 1.7, cap: false, join: true, paths: (<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8" /></>) },
  grid: { sw: 1.8, cap: false, join: true, paths: (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>) },
  list: { sw: 1.8, cap: true, join: false, paths: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> },
  sun: { sw: 1.8, cap: true, join: false, paths: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) },
  moon: { sw: 1.8, cap: true, join: true, paths: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /> },
  logout: { sw: 1.7, cap: true, join: true, paths: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /> },
  'chevron-left': { sw: 1.8, cap: true, join: true, paths: <path d="M15 6l-6 6 6 6" /> },
  'chevron-right': { sw: 1.8, cap: true, join: true, paths: <path d="M9 6l6 6-6 6" /> },
  'chevron-down': { sw: 2, cap: true, join: true, paths: <path d="M6 9l6 6 6-6" /> },
  check: { sw: 2.2, cap: true, join: true, paths: <path d="M5 12l5 5 9-10" /> },
  close: { sw: 1.8, cap: true, join: false, paths: <path d="M6 6l12 12M18 6L6 18" /> },
};

export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth, filled = false, className, ...rest }: IconProps) {
  const def = ICONS[name];
  const labelled = rest['aria-label'] != null || rest['aria-labelledby'] != null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth ?? def.sw}
      strokeLinecap={def.cap ? 'round' : undefined}
      strokeLinejoin={def.join ? 'round' : undefined}
      aria-hidden={labelled ? undefined : 'true'}
      role={labelled ? 'img' : undefined}
      focusable="false"
      className={cn('shrink-0', className)}
      {...rest}
    >
      {def.paths}
    </svg>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/icon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): add typed inline SVG Icon set (22 icons, exact viewBox/stroke per Design Spec §05)"
```

---

### Task D6: `Button` and `IconButton`

**Files:**
- Create: `src/components/ui/button.tsx`, `src/components/ui/icon-button.tsx`
- Test: `src/components/ui/button.test.tsx`, `src/components/ui/icon-button.test.tsx`

**Interfaces:**
- Consumes: `cn` (`@/lib/utils`), `Icon`, `IconName` (`./icon`).
- Produces:

```ts
export type ButtonVariant =
  | 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'
  | 'warn' | 'warnGhost' | 'link';
export type ButtonSize = '46' | '44' | '42' | '40' | '38' | '36' | '32' | '30' | 'auto';
export type Radius = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'|'14'|'full'|'circle';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // default 'secondary'
  size?: ButtonSize;         // default '36'
  radius?: Radius;           // overrides the size default
  icon?: IconName;           // leading icon
  iconSize?: number;         // default 15
  iconFilled?: boolean;
  trailingIcon?: IconName;
  fullWidth?: boolean;
}
export const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export const buttonVariants: (props?: …) => string;

export type IconButtonVariant = 'ghost' | 'bordered' | 'soft' | 'overlay' | 'lightbox';
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  label: string;             // REQUIRED — becomes title + aria-label
  variant?: IconButtonVariant; // default 'ghost'
  size?: 40|36|34|32|30|24|22|18; // default 32
  radius?: Radius;           // default '8'
  iconSize?: number;         // default = round(size * 0.53) → override explicitly
  iconFilled?: boolean;
  strokeWidth?: number;
  tone?: 'default' | 'hi' | 'med' | 'faint' | 'accent'; // colour of the glyph
  hoverTone?: 'none' | 'hi' | 'text' | 'accent';
}
export const IconButton: React.ForwardRefExoticComponent<IconButtonProps & React.RefAttributes<HTMLButtonElement>>;
```

**Size → default radius/padding/text pairs (from the prototype):**

| size | h | px | rounded | text | used by |
|---|---|---|---|---|---|
| 46 | 46 | 14 | 10 | 15 | Login submit |
| 44 | 44 | 22 | 10 | 15 | Quiz "Câu tiếp theo" |
| 42 | 42 | 18 | 10 | 14 | Quiz result actions |
| 40 | 40 | 16 | 10 | 14 | Header "Ghi chú mới" (mobile px-11 via className) |
| 38 | 38 | 18 | 9 | 14 | Editor "Lưu vN" |
| 36 | 36 | 12 | 9 | 13 | Detail secondary actions (ink uses px-14) |
| 32 | 32 | 14 | 8 | 13 | "Gửi" comment, banner actions (px-12) |
| 30 | 30 | 8 | full | 13 | Filter chip row |
| auto | — | 0 | 8 | 13 | `link` variant |

- [ ] **Step 1: Write the failing Button test**

Create `src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Chỉnh sửa</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the primary variant tokens', () => {
    render(<Button variant="primary" size="40">Ghi chú mới</Button>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('bg-accent');
    expect(el.className).toContain('text-accent-ink');
    expect(el.className).toContain('h-40');
    expect(el.className).toContain('rounded-10');
    expect(el.className).toContain('text-14');
  });

  it('applies the ink variant tokens', () => {
    render(<Button variant="ink" size="46">Đăng nhập</Button>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('bg-text');
    expect(el.className).toContain('text-bg');
    expect(el.className).toContain('h-46');
    expect(el.className).toContain('text-15');
  });

  it('lets radius override the size default', () => {
    render(<Button size="36" radius="8">Xoá bộ lọc</Button>);
    expect(screen.getByRole('button').className).toContain('rounded-8');
    expect(screen.getByRole('button').className).not.toContain('rounded-9');
  });

  it('renders a leading icon without an accessible name of its own', () => {
    const { container } = render(<Button icon="plus" variant="primary">Ghi chú mới</Button>);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button')).toHaveAccessibleName('Ghi chú mới');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Gửi</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Huỷ</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: FAIL — cannot resolve `./button`.

- [ ] **Step 3: Write `Button`**

Create `src/components/ui/button.tsx`:

```tsx
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';

export const RADIUS_CLASS = {
  '2': 'rounded-2', '3': 'rounded-3', '4': 'rounded-4', '5': 'rounded-5',
  '6': 'rounded-6', '7': 'rounded-7', '8': 'rounded-8', '9': 'rounded-9',
  '10': 'rounded-10', '11': 'rounded-11', '12': 'rounded-12', '14': 'rounded-14',
  full: 'rounded-full', circle: 'rounded-circle',
} as const;
export type Radius = keyof typeof RADIUS_CLASS;

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-6 whitespace-nowrap border-0 font-medium select-none transition-[opacity,background-color,border-color,color] duration-150 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:opacity-90 disabled:opacity-35',
        ink: 'bg-text text-bg hover:opacity-[.88] disabled:opacity-40',
        secondary:
          'border border-line bg-surface text-text font-normal hover:border-line2 disabled:opacity-40',
        ghost: 'bg-transparent text-muted font-normal hover:bg-surface2 hover:text-text',
        danger: 'bg-hi text-surface hover:opacity-90',
        dangerGhost: 'bg-transparent text-hi font-normal hover:bg-hi-soft',
        warn: 'bg-med text-surface hover:opacity-90',
        warnGhost: 'bg-transparent text-med font-normal hover:bg-med-soft',
        link: 'bg-transparent p-0 text-accent hover:underline',
      },
      size: {
        '46': 'h-46 px-14 rounded-10 text-15',
        '44': 'h-44 px-22 rounded-10 text-15',
        '42': 'h-42 px-18 rounded-10 text-14',
        '40': 'h-40 px-16 rounded-10 text-14',
        '38': 'h-38 px-18 rounded-9 text-14',
        '36': 'h-36 px-12 rounded-9 text-13',
        '32': 'h-32 px-14 rounded-8 text-13',
        '30': 'h-30 px-8 rounded-full text-13',
        auto: 'rounded-8 text-13',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: '36', fullWidth: false },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  radius?: Radius;
  icon?: IconName;
  iconSize?: number;
  iconFilled?: boolean;
  trailingIcon?: IconName;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, radius, icon, iconSize = 15, iconFilled, trailingIcon, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), radius && RADIUS_CLASS[radius], className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={iconSize} filled={iconFilled} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </button>
  );
});
```

- [ ] **Step 4: Run the Button test to verify it passes**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing IconButton test**

Create `src/components/ui/icon-button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './icon-button';

describe('IconButton', () => {
  it('exposes the label as both accessible name and tooltip title', () => {
    render(<IconButton icon="trash" label="Xoá" />);
    const el = screen.getByRole('button', { name: 'Xoá' });
    expect(el).toHaveAttribute('title', 'Xoá');
  });

  it('is square at the requested size', () => {
    render(<IconButton icon="close" label="Đóng" size={40} radius="10" />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('h-40');
    expect(el.className).toContain('w-40');
    expect(el.className).toContain('rounded-10');
  });

  it('applies the bordered variant tokens', () => {
    render(<IconButton icon="chevron-left" label="Trang trước" variant="bordered" size={36} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-line');
    expect(el.className).toContain('bg-surface');
  });

  it('applies the tone to the glyph colour', () => {
    render(<IconButton icon="star" label="Yêu thích" tone="med" iconFilled />);
    expect(screen.getByRole('button').className).toContain('text-med');
  });

  it('fires onClick and stops nothing by default', async () => {
    const onClick = vi.fn();
    render(<IconButton icon="star" label="Yêu thích" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Write `IconButton`**

Create `src/components/ui/icon-button.tsx`:

```tsx
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { RADIUS_CLASS, type Radius } from './button';
import { Icon, type IconName } from './icon';

const iconButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center border-0 p-0 transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        ghost: 'bg-transparent hover:bg-surface2',
        bordered: 'border border-line bg-surface hover:border-line2',
        soft: 'bg-surface2 hover:bg-line',
        overlay: 'bg-[rgba(0,0,0,.55)] text-white',
        lightbox: 'bg-[rgba(255,255,255,.1)] text-white',
      },
      size: {
        40: 'h-40 w-40', 36: 'h-36 w-36', 34: 'h-34 w-34', 32: 'h-32 w-32',
        30: 'h-30 w-30', 24: 'h-24 w-24', 22: 'h-22 w-22', 18: 'h-18 w-18',
      },
      tone: {
        default: 'text-text',
        muted: 'text-muted',
        faint: 'text-faint',
        hi: 'text-hi',
        med: 'text-med',
        accent: 'text-accent',
      },
      hoverTone: {
        none: '',
        text: 'hover:text-text',
        hi: 'hover:text-hi',
        accent: 'hover:text-accent',
      },
    },
    defaultVariants: { variant: 'ghost', size: 32, tone: 'muted', hoverTone: 'none' },
  },
);

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'>,
    VariantProps<typeof iconButtonVariants> {
  icon: IconName;
  /** Required: becomes both `title` and `aria-label`. */
  label: string;
  radius?: Radius;
  iconSize?: number;
  iconFilled?: boolean;
  strokeWidth?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant, size, tone, hoverTone, radius = '8', iconSize = 16, iconFilled, strokeWidth, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size, tone, hoverTone }), RADIUS_CLASS[radius], className)}
      {...rest}
    >
      <Icon name={icon} size={iconSize} filled={iconFilled} strokeWidth={strokeWidth} />
    </button>
  );
});
```

- [ ] **Step 7: Run both tests**

Run: `npx vitest run src/components/ui/button.test.tsx src/components/ui/icon-button.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): add Button and IconButton with cva variants matching prototype heights/radii"
```

---

### Task D7: `Input`, `Textarea`, `Label`, `Kbd`, `Separator`, `Skeleton`, `Spinner`

**Files:**
- Create: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/label.tsx`, `src/components/ui/kbd.tsx`, `src/components/ui/separator.tsx`, `src/components/ui/skeleton.tsx`, `src/components/ui/spinner.tsx`
- Test: `src/components/ui/input.test.tsx`, `src/components/ui/skeleton.test.tsx`

**Interfaces:**
- Consumes: `cn`, `RADIUS_CLASS`/`Radius` (`./button`).
- Produces:

```ts
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputSize?: '46' | '42' | '40'; // default '40'
  tone?: 'default' | 'strong' | 'ghost'; // border-line | border-line2 | borderless
  invalid?: boolean;
}
export const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  tone?: 'comment' | 'desc';  // 15/1.55 min-h-48 resize-y | 17/1.55 muted resize-none
}
export const Textarea: …;

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> { stacked?: boolean }
export const Label: …;   // 13/500 text-muted; stacked → flex-col gap-6

export interface KbdProps extends React.HTMLAttributes<HTMLElement> { bare?: boolean }
export const Kbd: …;     // mono 11 faint; bordered r5 px-6 py-1 unless `bare`

export interface SeparatorProps { orientation?: 'horizontal' | 'vertical'; className?: string }
export const Separator: …;

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> { radius?: Radius }
export const Skeleton: …;                // bg-surface2
export const SkeletonGroup: …;           // wraps children in the qpulse animation

export interface SpinnerProps { size?: number; className?: string }
export const Spinner: …;
```

- [ ] **Step 1: Write the failing Input test**

Create `src/components/ui/input.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('renders a controlled value and reports changes', async () => {
    const onChange = vi.fn();
    render(<Input value="bacsi" onChange={onChange} aria-label="Tên đăng nhập" />);
    const el = screen.getByLabelText('Tên đăng nhập');
    expect(el).toHaveValue('bacsi');
    await userEvent.type(el, 'x');
    expect(onChange).toHaveBeenCalled();
  });

  it('applies the 46px login geometry with the strong border', () => {
    render(<Input inputSize="46" tone="strong" aria-label="Mật khẩu" />);
    const el = screen.getByLabelText('Mật khẩu');
    expect(el.className).toContain('h-46');
    expect(el.className).toContain('px-14');
    expect(el.className).toContain('rounded-10');
    expect(el.className).toContain('border-line2');
    expect(el.className).toContain('text-15');
  });

  it('applies the 40px default geometry', () => {
    render(<Input aria-label="Ghi chú phiên bản" />);
    const el = screen.getByLabelText('Ghi chú phiên bản');
    expect(el.className).toContain('h-40');
    expect(el.className).toContain('px-12');
    expect(el.className).toContain('text-13');
    expect(el.className).toContain('border-line');
  });

  it('drops the frame entirely in ghost tone (editor title)', () => {
    render(<Input tone="ghost" aria-label="Tiêu đề ghi chú" />);
    const el = screen.getByLabelText('Tiêu đề ghi chú');
    expect(el.className).toContain('border-0');
    expect(el.className).toContain('bg-transparent');
  });

  it('marks invalid inputs for assistive tech', () => {
    render(<Input invalid aria-label="Tên đăng nhập" />);
    expect(screen.getByLabelText('Tên đăng nhập')).toHaveAttribute('aria-invalid', 'true');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/input.test.tsx`
Expected: FAIL — cannot resolve `./input`.

- [ ] **Step 3: Write `Input` and `Textarea`**

Create `src/components/ui/input.tsx`:

```tsx
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'w-full min-w-0 text-text outline-none transition-colors duration-150 placeholder:text-faint',
  {
    variants: {
      inputSize: {
        '46': 'h-46 px-14 rounded-10 text-15',
        '42': 'h-42 px-12 rounded-10 text-14',
        '40': 'h-40 px-12 rounded-10 text-13',
      },
      tone: {
        default: 'border border-line bg-surface focus:border-accent',
        strong: 'border border-line2 bg-surface focus:border-accent',
        ghost: 'border-0 bg-transparent px-0',
      },
    },
    defaultVariants: { inputSize: '40', tone: 'default' },
  },
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize, tone, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid ? 'true' : undefined}
      className={cn(inputVariants({ inputSize, tone }), invalid && 'border-hi', className)}
      {...rest}
    />
  );
});
```

Create `src/components/ui/textarea.tsx`:

```tsx
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'w-full min-w-0 border-0 bg-transparent p-0 text-text outline-none placeholder:text-faint',
  {
    variants: {
      tone: {
        /** Comment composer: 15/1.55, min-height 48, vertical resize. */
        comment: 'min-h-48 resize-y text-15 leading-[1.55]',
        /** Editor description: 17/1.55 muted, no resize. */
        desc: 'resize-none text-17 leading-[1.55] text-muted',
      },
    },
    defaultVariants: { tone: 'comment' },
  },
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, tone, rows = 2, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(textareaVariants({ tone }), className)} {...rest} />;
});
```

- [ ] **Step 4: Write `Label`, `Kbd`, `Separator`, `Spinner`**

Create `src/components/ui/label.tsx`:

```tsx
import type { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Wraps its control below the text with a 6px gap (login form pattern). */
  stacked?: boolean;
}

export function Label({ className, stacked = false, ...rest }: LabelProps) {
  return (
    <label
      className={cn('text-13 font-medium text-muted', stacked && 'flex flex-col gap-6', className)}
      {...rest}
    />
  );
}
```

Create `src/components/ui/kbd.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** No border/background — used for the "Enter" hint in the search panel. */
  bare?: boolean;
}

export function Kbd({ className, bare = false, ...rest }: KbdProps) {
  return (
    <span
      className={cn(
        'font-mono text-11 text-faint',
        !bare && 'rounded-5 border border-line px-6 py-1',
        className,
      )}
      {...rest}
    />
  );
}
```

Create `src/components/ui/separator.tsx`:

```tsx
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    />
  );
}
```

Create `src/components/ui/spinner.tsx`:

```tsx
import { cn } from '@/lib/utils';

export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Not present in the prototype — used only for async states the prototype does
 * not cover (e.g. a save in flight). Quiz loading uses SkeletonGroup instead.
 */
export function Spinner({ size = 16, className, label = 'Đang tải' }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
      className={cn('animate-spin text-accent', className)}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".2" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 5: Write the failing Skeleton test**

Create `src/components/ui/skeleton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonGroup } from './skeleton';

describe('Skeleton', () => {
  it('paints with surface2 and the requested radius', () => {
    render(<Skeleton radius="12" className="h-52" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.className).toContain('bg-surface2');
    expect(el.className).toContain('rounded-12');
    expect(el.className).toContain('h-52');
  });

  it('hides itself from assistive tech', () => {
    render(<Skeleton data-testid="s" />);
    expect(screen.getByTestId('s')).toHaveAttribute('aria-hidden', 'true');
  });

  it('SkeletonGroup carries the qpulse animation and a busy status', () => {
    render(
      <SkeletonGroup label="Đang soạn câu hỏi…">
        <Skeleton className="h-22 w-[80%]" radius="6" />
      </SkeletonGroup>,
    );
    const group = screen.getByRole('status', { name: 'Đang soạn câu hỏi…' });
    expect(group.className).toContain('animate-[qpulse_1.4s_ease-in-out_infinite]');
    expect(group).toHaveAttribute('aria-busy', 'true');
  });
});
```

- [ ] **Step 6: Write `Skeleton` and `SkeletonGroup`**

Create `src/components/ui/skeleton.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RADIUS_CLASS, type Radius } from './button';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: Radius;
}

export function Skeleton({ className, radius = '6', ...rest }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('bg-surface2', RADIUS_CLASS[radius], className)} {...rest} />;
}

export interface SkeletonGroupProps {
  children: ReactNode;
  label: string;
  className?: string;
}

/** The prototype animates the WRAPPER, not each bar: `qpulse 1.4s ease-in-out infinite`. */
export function SkeletonGroup({ children, label, className }: SkeletonGroupProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn('flex flex-col gap-10 animate-[qpulse_1.4s_ease-in-out_infinite]', className)}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components/ui/input.test.tsx src/components/ui/skeleton.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): add Input, Textarea, Label, Kbd, Separator, Skeleton, Spinner primitives"
```

---

### Task D8: `Badge`, `Chip`, `Pill`, `Avatar`, and the priority family

**Files:**
- Create: `src/components/ui/badge.tsx`, `src/components/ui/chip.tsx`, `src/components/ui/pill.tsx`, `src/components/ui/avatar.tsx`, `src/components/shared/priority.tsx`, `src/components/shared/tag-chip.tsx`
- Test: `src/components/shared/priority.test.tsx`, `src/components/shared/tag-chip.test.tsx`, `src/components/ui/avatar.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Icon`, `IconButton`, `RADIUS_CLASS`.
- Produces:

```ts
// badge.tsx — mono counters in the sidebar, card footer, comment heading
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { tone?: 'faint' | 'muted' }
export function Badge(props: BadgeProps): JSX.Element;   // font-mono text-12 text-faint

// chip.tsx — removable filter chip (dashboard)
export interface ChipProps { label: string; onRemove: () => void; removeLabel?: string; className?: string }
export function Chip(props: ChipProps): JSX.Element;
// h-30 pl-12 pr-8 rounded-full border border-line bg-surface text-13 gap-6, hover:border-line2
// trailing Icon name="close" size 12 strokeWidth 2.2 text-faint

// pill.tsx — tone-coloured 26px pill
export type PillTone = 'hi' | 'med' | 'low' | 'ok' | 'accent' | 'neutral';
export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> { tone?: PillTone; dot?: boolean }
export function Pill(props: PillProps): JSX.Element;   // h-26 px-10 rounded-full text-12 font-medium

// avatar.tsx
export interface AvatarProps { name: string; size?: 32 | 30; className?: string }
export function Avatar(props: AvatarProps): JSX.Element;
export function initialsOf(name: string): string;   // first 2 letters, uppercased, locale 'vi'

// shared/priority.tsx
export type Priority = 'high' | 'medium' | 'low';
export const PRIORITY_ORDER: Record<Priority, number>;           // high 0, medium 1, low 2
export const PRIORITY_LABEL: Record<Priority, string>;           // Cao / Trung bình / Thấp
export const PRIORITY_CLASS: Record<Priority, { dot: string; text: string; pill: string }>;
export interface PriorityDotProps { priority: Priority; size?: 6 | 7 | 8; className?: string }
export function PriorityDot(props: PriorityDotProps): JSX.Element;
export interface PriorityLabelProps { priority: Priority; className?: string }
export function PriorityLabel(props: PriorityLabelProps): JSX.Element;   // dot 7 + "Cao", text-12/500, coloured
export interface PriorityPillProps { priority: Priority; className?: string }
export function PriorityPill(props: PriorityPillProps): JSX.Element;     // "Ưu tiên cao", dot 6, h-26

// shared/tag-chip.tsx
export interface TagChipProps {
  name: string;
  size?: 'card' | 'md';            // py-3 px-9 | h-26 px-10   (default 'md')
  tone?: 'neutral' | 'soft' | 'dashed'; // surface2/muted | accent-soft/accent | dashed line2
  hash?: boolean;                  // prefix "#"  (default false)
  onClick?: () => void;            // renders a <button>, else a <span>
  onRemove?: () => void;           // adds the 18px round remove button (editor tags)
  count?: number;                  // mono faint suffix (search suggestions)
  className?: string;
}
export function TagChip(props: TagChipProps): JSX.Element;
```

- [ ] **Step 1: Write the failing priority test**

Create `src/components/shared/priority.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRIORITY_LABEL, PRIORITY_ORDER, PriorityDot, PriorityLabel, PriorityPill } from './priority';

describe('priority family', () => {
  it('keeps the prototype ordering high → medium → low', () => {
    expect(PRIORITY_ORDER).toEqual({ high: 0, medium: 1, low: 2 });
  });

  it('uses the Vietnamese labels from the design spec', () => {
    expect(PRIORITY_LABEL).toEqual({ high: 'Cao', medium: 'Trung bình', low: 'Thấp' });
  });

  it('PriorityDot is a coloured 8px circle by default', () => {
    render(<PriorityDot priority="high" size={8} data-testid="dot" />);
    const el = screen.getByTestId('dot');
    expect(el.className).toContain('bg-hi');
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-8');
    expect(el.className).toContain('rounded-circle');
  });

  it('PriorityLabel shows the bare label in the priority colour', () => {
    render(<PriorityLabel priority="medium" />);
    const el = screen.getByText('Trung bình');
    expect(el.className).toContain('text-med');
    expect(el.className).toContain('text-12');
  });

  it('PriorityPill prefixes "Ưu tiên" and lower-cases the label', () => {
    render(<PriorityPill priority="low" />);
    expect(screen.getByText('Ưu tiên thấp')).toBeInTheDocument();
  });

  it('PriorityPill paints the soft background for its tone', () => {
    const { container } = render(<PriorityPill priority="high" />);
    expect(container.firstElementChild?.className).toContain('bg-hi-soft');
    expect(container.firstElementChild?.className).toContain('text-hi');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shared/priority.test.tsx`
Expected: FAIL — cannot resolve `./priority`.

- [ ] **Step 3: Write `Badge`, `Pill`, `Chip`, `Avatar`**

Create `src/components/ui/badge.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'faint' | 'muted';
}

/** Mono counter: sidebar counts, card version label, comment count. */
export function Badge({ className, tone = 'faint', ...rest }: BadgeProps) {
  return (
    <span
      className={cn('font-mono text-12', tone === 'faint' ? 'text-faint' : 'text-muted', className)}
      {...rest}
    />
  );
}
```

Create `src/components/ui/pill.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'hi' | 'med' | 'low' | 'ok' | 'accent' | 'neutral';

const TONE: Record<PillTone, string> = {
  hi: 'bg-hi-soft text-hi',
  med: 'bg-med-soft text-med',
  low: 'bg-low-soft text-low',
  ok: 'bg-ok-soft text-ok',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-surface2 text-muted',
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

export function Pill({ className, tone = 'neutral', ...rest }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-26 items-center gap-6 rounded-full px-10 text-12 font-medium',
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
```

Create `src/components/ui/chip.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Icon } from './icon';

export interface ChipProps {
  label: string;
  onRemove: () => void;
  /** Accessible name for the remove affordance. Defaults to `Gỡ bộ lọc {label}`. */
  removeLabel?: string;
  className?: string;
}

/** Removable dashboard filter chip: h30, pl 12 / pr 8, rounded-full, 1px line. */
export function Chip({ label, onRemove, removeLabel, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={removeLabel ?? `Gỡ bộ lọc ${label}`}
      className={cn(
        'inline-flex h-30 items-center gap-6 rounded-full border border-line bg-surface pl-12 pr-8 text-13 text-text transition-colors duration-150 hover:border-line2',
        className,
      )}
    >
      {label}
      <Icon name="close" size={12} strokeWidth={2.2} className="text-faint" />
    </button>
  );
}
```

Create `src/components/ui/avatar.tsx`:

```tsx
import { cn } from '@/lib/utils';

/** First two letters of the display name, uppercased with Vietnamese locale rules. */
export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toLocaleUpperCase('vi-VN');
}

export interface AvatarProps {
  name: string;
  /** 32 = sidebar footer, 30 = comment list. */
  size?: 32 | 30;
  className?: string;
}

export function Avatar({ name, size = 32, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-circle bg-surface2 font-semibold text-muted',
        size === 32 ? 'h-32 w-32 text-13' : 'h-30 w-30 text-11',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
```

- [ ] **Step 4: Write `shared/priority.tsx`**

Create `src/components/shared/priority.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { Pill } from '@/components/ui/pill';

export type Priority = 'high' | 'medium' | 'low';

export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

export const PRIORITY_CLASS: Record<Priority, { dot: string; text: string; pill: string }> = {
  high: { dot: 'bg-hi', text: 'text-hi', pill: 'bg-hi-soft text-hi' },
  medium: { dot: 'bg-med', text: 'text-med', pill: 'bg-med-soft text-med' },
  low: { dot: 'bg-low', text: 'text-low', pill: 'bg-low-soft text-low' },
};

const DOT_SIZE = { 6: 'h-6 w-6', 7: 'h-7 w-7', 8: 'h-8 w-8' } as const;

export interface PriorityDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  priority: Priority;
  size?: 6 | 7 | 8;
}

export function PriorityDot({ priority, size = 8, className, ...rest }: PriorityDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-circle', DOT_SIZE[size], PRIORITY_CLASS[priority].dot, className)}
      {...rest}
    />
  );
}

export interface PriorityLabelProps {
  priority: Priority;
  className?: string;
}

/** Card header: 7px dot + "Cao" in the priority colour, 12/500. */
export function PriorityLabel({ priority, className }: PriorityLabelProps) {
  return (
    <span className={cn('inline-flex items-center gap-6 text-12 font-medium', PRIORITY_CLASS[priority].text, className)}>
      <PriorityDot priority={priority} size={7} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export interface PriorityPillProps {
  priority: Priority;
  className?: string;
}

/** Detail header: "Ưu tiên cao" on the soft background, 6px dot, h26. */
export function PriorityPill({ priority, className }: PriorityPillProps) {
  return (
    <Pill className={cn(PRIORITY_CLASS[priority].pill, className)}>
      <PriorityDot priority={priority} size={6} />
      {`Ưu tiên ${PRIORITY_LABEL[priority].toLocaleLowerCase('vi-VN')}`}
    </Pill>
  );
}
```

- [ ] **Step 5: Write the failing TagChip test**

Create `src/components/shared/tag-chip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagChip } from './tag-chip';

describe('TagChip', () => {
  it('renders as a span when there is no handler', () => {
    const { container } = render(<TagChip name="Cấp cứu" size="card" />);
    expect(container.querySelector('button')).toBeNull();
    expect(screen.getByText('Cấp cứu')).toBeInTheDocument();
  });

  it('uses the card geometry: px-9 py-3 rounded-full surface2/muted', () => {
    const { container } = render(<TagChip name="Tim mạch" size="card" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('px-9');
    expect(el.className).toContain('py-3');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('bg-surface2');
    expect(el.className).toContain('text-muted');
  });

  it('uses the 26px geometry by default', () => {
    const { container } = render(<TagChip name="Tim mạch" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('h-26');
  });

  it('becomes a button and fires onClick', async () => {
    const onClick = vi.fn();
    render(<TagChip name="Cấp cứu" hash onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: '#Cấp cứu' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the accent-soft tone with an 18px remove button', async () => {
    const onRemove = vi.fn();
    const { container } = render(<TagChip name="Nội tiết" tone="soft" onRemove={onRemove} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-accent-soft');
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ thẻ Nội tiết' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows a mono count when given one', () => {
    render(<TagChip name="Cấp cứu" hash count={4} onClick={() => {}} />);
    expect(screen.getByText('4').className).toContain('font-mono');
  });

  it('never wraps: long tags ellipsis instead of breaking the row', () => {
    const { container } = render(<TagChip name={'a'.repeat(80)} size="card" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('whitespace-nowrap');
  });
});
```

- [ ] **Step 6: Write `shared/tag-chip.tsx`**

Create `src/components/shared/tag-chip.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

export interface TagChipProps {
  name: string;
  /** `card` = py-3 px-9 (note card / list row); `md` = h-26 px-10 (everywhere else). */
  size?: 'card' | 'md';
  /** `neutral` surface2/muted · `soft` accent-soft/accent (editor) · `dashed` suggestion. */
  tone?: 'neutral' | 'soft' | 'dashed';
  hash?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  count?: number;
  className?: string;
}

export function TagChip({
  name, size = 'md', tone = 'neutral', hash = false, onClick, onRemove, count, className,
}: TagChipProps) {
  const label = hash ? `#${name}` : name;

  const base = cn(
    'inline-flex max-w-full items-center gap-6 overflow-hidden rounded-full text-12 whitespace-nowrap text-ellipsis',
    size === 'card' ? 'px-9 py-3' : 'h-26 px-10',
    tone === 'neutral' && 'bg-surface2 text-muted',
    tone === 'soft' && 'bg-accent-soft font-medium text-accent',
    tone === 'dashed' && 'border border-dashed border-line2 bg-transparent text-muted',
    onClick && 'transition-colors duration-150 hover:text-accent',
    tone === 'dashed' && onClick && 'hover:border-accent',
    onRemove && 'gap-4 pr-4',
    className,
  );

  const body = (
    <>
      <span className="overflow-hidden text-ellipsis">{label}</span>
      {count != null ? <span className="font-mono text-faint">{count}</span> : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Gỡ thẻ ${name}`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex h-18 w-18 shrink-0 items-center justify-center rounded-circle border-0 bg-transparent p-0 text-inherit"
        >
          <Icon name="close" size={10} strokeWidth={2.6} />
        </button>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'border-0')}>
        {body}
      </button>
    );
  }
  return <span className={base}>{body}</span>;
}
```

- [ ] **Step 7: Write the failing Avatar test and run everything**

Create `src/components/ui/avatar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, initialsOf } from './avatar';

describe('Avatar', () => {
  it('takes the first two letters, uppercased', () => {
    expect(initialsOf('Bác sĩ')).toBe('BÁ');
    expect(initialsOf('an')).toBe('AN');
  });

  it('falls back to ? for an empty name', () => {
    expect(initialsOf('   ')).toBe('?');
  });

  it('renders 32px in the sidebar and 30px in comments', () => {
    const { container, rerender } = render(<Avatar name="Bác sĩ" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('h-32');
    rerender(<Avatar name="Bác sĩ" size={30} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('h-30');
  });

  it('is decorative, not announced', () => {
    const { container } = render(<Avatar name="Bác sĩ" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
```

Run: `npx vitest run src/components/shared/priority.test.tsx src/components/shared/tag-chip.test.tsx src/components/ui/avatar.test.tsx`
Expected: PASS (17 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): add Badge, Chip, Pill, Avatar, TagChip and the priority dot/label/pill family"
```

---

### Task D9: `Popover`, custom `Select` (never `<select>`), `Segmented`, `Toggle`, `SortSelect`, `ViewToggle`, `PrioritySegmented`

**Files:**
- Create: `src/components/ui/popover.tsx`, `src/components/ui/select.tsx`, `src/components/ui/segmented.tsx`, `src/components/ui/toggle.tsx`, `src/components/shared/sort-select.tsx`, `src/components/shared/view-toggle.tsx`
- Modify: `src/components/shared/priority.tsx` (append `PrioritySegmented`)
- Test: `src/components/ui/select.test.tsx`, `src/components/ui/segmented.test.tsx`, `src/components/shared/sort-select.test.tsx`, `src/components/shared/view-toggle.test.tsx`

**Decision — why not Radix here:** Radix Popover/Select portal to `document.body` and position with floating-ui, which cannot reproduce the prototype's exact `top:42px; right:0` / `top:48px; right:0` offsets and its explicit `z-index` pairs (20/21, 60/61, 31/33). `Popover` is therefore hand-written with the prototype's own pattern — a `fixed inset-0` click-catcher plus an `absolute` panel inside a `relative` wrapper. Radix is kept only for `Tooltip` and `Separator`.

**Interfaces:**
- Consumes: `cn`, `Icon`, `Z` (`@/lib/z`), `Button`.
- Produces:

```ts
// ui/popover.tsx
export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';       // left-0 | right-0        default 'end'
  offset?: number;               // panel `top` in px       default 48
  width?: number;                // fixed px width
  minWidth?: number;
  panelClassName?: string;
  backdropZ: number;             // e.g. Z.settingsBackdrop
  panelZ: number;                // e.g. Z.settingsPopover
  panelLabel: string;            // aria-label on the panel
  wrapperClassName?: string;
}
export function Popover(props: PopoverProps): JSX.Element;

// ui/select.tsx  ← NEVER a native <select>
export interface SelectOption<T extends string = string> { value: T; label: string; disabled?: boolean }
export interface SelectProps<T extends string = string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  prefixLabel?: string;          // muted text before the value, e.g. "Sắp xếp"
  align?: 'start' | 'end';       // default 'end'
  menuMinWidth?: number;         // default 200
  offset?: number;               // default 42
  disabled?: boolean;
  className?: string;
}
export function Select<T extends string = string>(props: SelectProps<T>): JSX.Element;

// ui/segmented.tsx
export interface SegmentedOption<T extends string = string> {
  value: T; label?: React.ReactNode; icon?: IconName; iconSize?: number;
  dotClassName?: string; title?: string;
}
export interface SegmentedProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** 'track'   = p-4 gap-4 bg-surface2 rounded-10, items h-34 rounded-7 (theme, priority)
   *  'bordered'= p-3 gap-2 border-line bg-surface rounded-9, items h-28 w-30 rounded-6 (view toggle) */
  variant?: 'track' | 'bordered';
  columns?: number;              // grid-cols-N; omit for a flex row
  className?: string;
}
export function Segmented<T extends string = string>(props: SegmentedProps<T>): JSX.Element;

// ui/toggle.tsx  — single pressed/unpressed icon button
export interface ToggleProps extends Omit<IconButtonProps, 'aria-pressed'> { pressed: boolean }
export function Toggle(props: ToggleProps): JSX.Element;

// shared/sort-select.tsx
export type SortKey = 'updated' | 'priority' | 'title';
export const SORT_OPTIONS: readonly SelectOption<SortKey>[];   // Mới cập nhật · Ưu tiên · Tên A–Z
export interface SortSelectProps { value: SortKey; onChange: (v: SortKey) => void; className?: string }
export function SortSelect(props: SortSelectProps): JSX.Element;

// shared/view-toggle.tsx
export type ViewMode = 'grid' | 'list';
export interface ViewToggleProps { value: ViewMode; onChange: (v: ViewMode) => void; className?: string }
export function ViewToggle(props: ViewToggleProps): JSX.Element;

// shared/priority.tsx (appended)
export interface PrioritySegmentedProps { value: Priority; onChange: (p: Priority) => void; className?: string }
export function PrioritySegmented(props: PrioritySegmentedProps): JSX.Element;
```

- [ ] **Step 1: Write `Popover`**

Create `src/components/ui/popover.tsx`:

```tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  offset?: number;
  width?: number;
  minWidth?: number;
  panelClassName?: string;
  backdropZ: number;
  panelZ: number;
  panelLabel: string;
  wrapperClassName?: string;
}

/**
 * The prototype's popover pattern: a full-screen transparent click-catcher at
 * `backdropZ` plus an absolutely positioned panel at `panelZ`, both inside a
 * `relative` wrapper. Escape closes.
 */
export function Popover({
  open, onOpenChange, trigger, children, align = 'end', offset = 48,
  width, minWidth, panelClassName, backdropZ, panelZ, panelLabel, wrapperClassName,
}: PopoverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <div className={cn('relative', wrapperClassName)}>
      {trigger}
      {open ? (
        <>
          <div
            aria-hidden="true"
            onClick={() => onOpenChange(false)}
            className="fixed inset-0"
            style={{ zIndex: backdropZ }}
          />
          <div
            role="dialog"
            aria-label={panelLabel}
            className={cn(
              'absolute rounded-12 border border-line bg-surface shadow-card',
              align === 'end' ? 'right-0' : 'left-0',
              panelClassName,
            )}
            style={{ top: offset, zIndex: panelZ, width, minWidth }}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Write the failing `Select` test (covers Review Focus #3)**

Create `src/components/ui/select.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select, type SelectOption } from './select';

type K = 'updated' | 'priority' | 'title';
const OPTIONS: readonly SelectOption<K>[] = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'priority', label: 'Ưu tiên' },
  { value: 'title', label: 'Tên A–Z' },
];

function setup(value: K = 'updated') {
  const onChange = vi.fn();
  render(<Select options={OPTIONS} value={value} onChange={onChange} ariaLabel="Sắp xếp" prefixLabel="Sắp xếp" />);
  return { onChange, trigger: screen.getByRole('combobox', { name: 'Sắp xếp' }) };
}

describe('Select', () => {
  it('is never a native <select>', () => {
    const { container } = render(
      <Select options={OPTIONS} value="updated" onChange={() => {}} ariaLabel="Sắp xếp" />,
    );
    expect(container.querySelector('select')).toBeNull();
  });

  it('shows the current label and marks itself collapsed', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Mới cập nhật');
  });

  it('opens a listbox and marks the selected option', async () => {
    const { trigger } = setup('priority');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', { name: 'Sắp xếp' });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ưu tiên' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Tên A–Z' })).toHaveAttribute('aria-selected', 'false');
  });

  it('commits a click and closes', async () => {
    const { onChange, trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: 'Tên A–Z' }));
    expect(onChange).toHaveBeenCalledWith('title');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves the active option with ArrowDown/ArrowUp and commits with Enter', async () => {
    const { onChange, trigger } = setup('updated');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('priority');
  });

  it('jumps to first/last with Home and End', async () => {
    const { onChange, trigger } = setup('updated');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{End}');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('title');
  });

  it('commits with Space as well as Enter', async () => {
    const { onChange, trigger } = setup('updated');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('title');
  });

  it('closes on Escape and returns focus to the trigger without committing', async () => {
    const { onChange, trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('select-backdrop'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', async () => {
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="updated" onChange={onChange} ariaLabel="Sắp xếp" disabled />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Sắp xếp' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/components/ui/select.test.tsx`
Expected: FAIL — cannot resolve `./select`.

- [ ] **Step 4: Write the custom `Select`**

Create `src/components/ui/select.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from './icon';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  prefixLabel?: string;
  align?: 'start' | 'end';
  menuMinWidth?: number;
  offset?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Custom listbox. SPEC §1.2 #16 forbids a native <select> anywhere in the app.
 * Trigger: h36, pl-12 pr-10, 1px --line, r9, --surface, 13px, gap 8.
 * Menu: top 42, min-width 200, p-6, r12, shadow, items h36 px-10 r8.
 */
export function Select<T extends string = string>({
  options, value, onChange, ariaLabel, prefixLabel,
  align = 'end', menuMinWidth = 200, offset = 42, disabled = false, className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close(true);
    },
    [options, onChange, close],
  );

  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') { close(false); }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className="flex h-36 items-center gap-8 rounded-9 border border-line bg-surface pl-12 pr-10 text-13 text-text transition-colors duration-150 hover:border-line2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {prefixLabel ? <span className="text-faint">{prefixLabel}</span> : null}
        <span className="font-medium">{current?.label ?? ''}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn('text-faint transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <>
          <div
            data-testid="select-backdrop"
            aria-hidden="true"
            onClick={() => close(false)}
            className="fixed inset-0"
            style={{ zIndex: Z.sortBackdrop }}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={cn(
              'absolute flex flex-col gap-2 rounded-12 border border-line bg-surface p-6 shadow-card',
              align === 'end' ? 'right-0' : 'left-0',
            )}
            style={{ top: offset, minWidth: menuMinWidth, zIndex: Z.sortMenu }}
          >
            {options.map((opt, i) => {
              const selected = opt.value === value;
              return (
                <li key={opt.value} role="presentation">
                  <button
                    id={`${listId}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => commit(i)}
                    className={cn(
                      'flex h-36 w-full items-center justify-between gap-12 rounded-8 border-0 px-10 text-left text-13 text-text',
                      selected ? 'bg-surface2 font-medium' : 'bg-transparent font-normal',
                      i === activeIndex && !selected && 'bg-surface2',
                      'hover:bg-surface2 disabled:opacity-40',
                    )}
                  >
                    <span>{opt.label}</span>
                    <Icon name="check" size={14} className={cn('text-accent', selected ? 'opacity-100' : 'opacity-0')} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the Select test to verify it passes**

Run: `npx vitest run src/components/ui/select.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 6: Write the failing `Segmented` test**

Create `src/components/ui/segmented.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from './segmented';

const OPTS = [
  { value: 'light', label: 'Sáng', icon: 'sun' as const },
  { value: 'dark', label: 'Tối', icon: 'moon' as const },
];

describe('Segmented', () => {
  it('renders a radiogroup with one checked radio', () => {
    render(<Segmented options={OPTS} value="light" onChange={() => {}} ariaLabel="Giao diện" columns={2} />);
    expect(screen.getByRole('radiogroup', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sáng' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'false');
  });

  it('emits the value on click', async () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTS} value="light" onChange={onChange} ariaLabel="Giao diện" columns={2} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('track variant: p-4 gap-4 bg-surface2 rounded-10, items h-34 rounded-7', () => {
    const { container } = render(
      <Segmented options={OPTS} value="light" onChange={() => {}} ariaLabel="Giao diện" columns={2} />,
    );
    const track = container.firstElementChild as HTMLElement;
    expect(track.className).toContain('bg-surface2');
    expect(track.className).toContain('rounded-10');
    expect(track.className).toContain('p-4');
    expect(track.className).toContain('gap-4');
    expect(screen.getByRole('radio', { name: 'Sáng' }).className).toContain('h-34');
    expect(screen.getByRole('radio', { name: 'Sáng' }).className).toContain('rounded-7');
  });

  it('gives the selected item the surface lift shadow', () => {
    render(<Segmented options={OPTS} value="light" onChange={() => {}} ariaLabel="Giao diện" columns={2} />);
    const on = screen.getByRole('radio', { name: 'Sáng' });
    expect(on.className).toContain('bg-surface');
    expect(on.className).toContain('shadow-seg');
    expect(screen.getByRole('radio', { name: 'Tối' }).className).toContain('bg-transparent');
  });

  it('bordered variant: 30x28 items with rounded-6 inside a 1px frame', () => {
    const { container } = render(
      <Segmented
        variant="bordered"
        options={[{ value: 'grid', icon: 'grid', title: 'Dạng lưới' }, { value: 'list', icon: 'list', title: 'Dạng danh sách' }]}
        value="grid"
        onChange={() => {}}
        ariaLabel="Hiển thị"
      />,
    );
    const track = container.firstElementChild as HTMLElement;
    expect(track.className).toContain('border-line');
    expect(track.className).toContain('rounded-9');
    expect(track.className).toContain('p-3');
    const item = screen.getByRole('radio', { name: 'Dạng lưới' });
    expect(item.className).toContain('h-28');
    expect(item.className).toContain('w-30');
    expect(item.className).toContain('rounded-6');
  });
});
```

- [ ] **Step 7: Write `Segmented` and `Toggle`**

Create `src/components/ui/segmented.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label?: React.ReactNode;
  icon?: IconName;
  iconSize?: number;
  /** Tailwind bg-* class for the leading 7px dot (priority segmented). */
  dotClassName?: string;
  /** Accessible name when there is no text label. */
  title?: string;
}

export interface SegmentedProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: 'track' | 'bordered';
  columns?: number;
  className?: string;
}

export function Segmented<T extends string = string>({
  options, value, onChange, ariaLabel, variant = 'track', columns, className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        columns ? 'grid' : 'flex',
        variant === 'track' && 'gap-4 rounded-10 bg-surface2 p-4',
        variant === 'bordered' && 'gap-2 rounded-9 border border-line bg-surface p-3',
        className,
      )}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        const name = opt.title ?? (typeof opt.label === 'string' ? opt.label : opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={opt.title ?? undefined}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            data-value={opt.value}
            data-name={name}
            className={cn(
              'flex items-center justify-center gap-6 border-0 font-medium transition-colors duration-150',
              variant === 'track' && 'h-34 rounded-7 text-13',
              variant === 'bordered' && 'h-28 w-30 rounded-6',
              on
                ? variant === 'track'
                  ? 'bg-surface text-text shadow-seg'
                  : 'bg-surface2 text-text'
                : variant === 'track'
                  ? 'bg-transparent text-muted'
                  : 'bg-transparent text-faint',
            )}
          >
            {opt.dotClassName ? (
              <span aria-hidden="true" className={cn('h-7 w-7 shrink-0 rounded-circle', opt.dotClassName)} />
            ) : null}
            {opt.icon ? <Icon name={opt.icon} size={opt.iconSize ?? 15} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

Create `src/components/ui/toggle.tsx`:

```tsx
'use client';

import { forwardRef } from 'react';
import { IconButton, type IconButtonProps } from './icon-button';

export interface ToggleProps extends Omit<IconButtonProps, 'aria-pressed'> {
  pressed: boolean;
}

/** A single on/off icon button — e.g. the favourite star on cards and rows. */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle({ pressed, ...rest }, ref) {
  return <IconButton ref={ref} aria-pressed={pressed} {...rest} />;
});
```

- [ ] **Step 8: Write `SortSelect`, `ViewToggle`, `PrioritySegmented`**

Create `src/components/shared/sort-select.tsx`:

```tsx
'use client';

import { Select, type SelectOption } from '@/components/ui/select';

export type SortKey = 'updated' | 'priority' | 'title';

/** Labels verbatim from the prototype's SORTS array. */
export const SORT_OPTIONS: readonly SelectOption<SortKey>[] = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'priority', label: 'Ưu tiên' },
  { value: 'title', label: 'Tên A–Z' },
];

export interface SortSelectProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
  className?: string;
}

export function SortSelect({ value, onChange, className }: SortSelectProps) {
  return (
    <Select
      options={SORT_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Sắp xếp"
      prefixLabel="Sắp xếp"
      align="end"
      offset={42}
      menuMinWidth={200}
      className={className}
    />
  );
}
```

Create `src/components/shared/view-toggle.tsx`:

```tsx
'use client';

import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

export type ViewMode = 'grid' | 'list';

const OPTIONS: readonly SegmentedOption<ViewMode>[] = [
  { value: 'grid', icon: 'grid', iconSize: 15, title: 'Dạng lưới' },
  { value: 'list', icon: 'list', iconSize: 15, title: 'Dạng danh sách' },
];

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <Segmented
      variant="bordered"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Hiển thị"
      className={className}
    />
  );
}
```

Append to `src/components/shared/priority.tsx`:

```tsx
'use client';
// (add at the top of the file when appending the client component below)

import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

export interface PrioritySegmentedProps {
  value: Priority;
  onChange: (value: Priority) => void;
  className?: string;
}

const PRIORITY_SEGMENTS: readonly SegmentedOption<Priority>[] = PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABEL[p],
  dotClassName: PRIORITY_CLASS[p].dot,
}));

/** Editor panel: 3-column track, gap 4, p 4, --surface2, r10; items h34 r7. */
export function PrioritySegmented({ value, onChange, className }: PrioritySegmentedProps) {
  return (
    <Segmented
      options={PRIORITY_SEGMENTS}
      value={value}
      onChange={onChange}
      ariaLabel="Mức ưu tiên"
      columns={3}
      className={className}
    />
  );
}
```

- [ ] **Step 9: Write the SortSelect and ViewToggle tests**

Create `src/components/shared/sort-select.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SORT_OPTIONS, SortSelect } from './sort-select';

describe('SortSelect', () => {
  it('offers exactly the three prototype sorts, in order', () => {
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['Mới cập nhật', 'Ưu tiên', 'Tên A–Z']);
  });

  it('shows the "Sắp xếp" prefix and the active label', () => {
    render(<SortSelect value="priority" onChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Sắp xếp' });
    expect(trigger).toHaveTextContent('Sắp xếp');
    expect(trigger).toHaveTextContent('Ưu tiên');
  });

  it('emits the chosen key', async () => {
    const onChange = vi.fn();
    render(<SortSelect value="updated" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Sắp xếp' }));
    await userEvent.click(screen.getByRole('option', { name: 'Tên A–Z' }));
    expect(onChange).toHaveBeenCalledWith('title');
  });
});
```

Create `src/components/shared/view-toggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewToggle } from './view-toggle';

describe('ViewToggle', () => {
  it('marks the current mode', () => {
    render(<ViewToggle value="list" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Dạng danh sách' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dạng lưới' })).toHaveAttribute('aria-checked', 'false');
  });

  it('emits the other mode on click', async () => {
    const onChange = vi.fn();
    render(<ViewToggle value="grid" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Dạng danh sách' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
```

- [ ] **Step 10: Run all four test files**

Run: `npx vitest run src/components/ui/select.test.tsx src/components/ui/segmented.test.tsx src/components/shared/sort-select.test.tsx src/components/shared/view-toggle.test.tsx`
Expected: PASS (20 tests).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(ui): add Popover, custom Select (no native select), Segmented, Toggle, SortSelect, ViewToggle, PrioritySegmented"
```

---

### Task D10: `Toast`/`Toaster`, `Tooltip`, `ScrollArea`, `Slider`

**Files:**
- Create: `src/components/ui/toast.tsx`, `src/components/ui/tooltip.tsx`, `src/components/ui/scroll-area.tsx`, `src/components/ui/slider.tsx`
- Test: `src/components/ui/toast.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Z`.
- Produces:

```ts
// toast.tsx
export const TOAST_DURATION_MS = 2200;
export interface ToastProps { message: string; className?: string }
export function Toast(props: ToastProps): JSX.Element;        // presentational only
export interface ToastContextValue { flash: (message: string) => void }
export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useToast(): ToastContextValue;                // throws outside the provider
export function Toaster(): JSX.Element | null;                // rendered by ToastProvider

// tooltip.tsx — Radix; used only where a `title` attribute is not enough
export interface TooltipProps { content: string; children: React.ReactElement; side?: 'top'|'right'|'bottom'|'left'; delayDuration?: number }
export function Tooltip(props: TooltipProps): JSX.Element;
export function TooltipRoot({ children }: { children: React.ReactNode }): JSX.Element;  // Radix Provider

// scroll-area.tsx — native overflow, matching the prototype's plain `overflow-y:auto`
export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> { maxHeight?: string }
export function ScrollArea(props: ScrollAreaProps): JSX.Element;

// slider.tsx — native <input type=range>, accent-color from --accent (prototype)
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> { }
export const Slider: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLInputElement>>;
```

- [ ] **Step 1: Write the failing Toast test**

Create `src/components/ui/toast.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, ToastProvider, useToast } from './toast';

function Trigger() {
  const { flash } = useToast();
  return <button type="button" onClick={() => flash('Đã lưu · phiên bản v2')}>go</button>;
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a message and hides it after 2200ms', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider><Trigger /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu · phiên bản v2');

    act(() => { vi.advanceTimersByTime(TOAST_DURATION_MS - 1); });
    expect(screen.queryByRole('status')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses the prototype geometry', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider><Trigger /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'go' }));
    const el = screen.getByRole('status');
    expect(el.className).toContain('bottom-28');
    expect(el.className).toContain('rounded-10');
    expect(el.className).toContain('bg-text');
    expect(el.className).toContain('text-bg');
    expect(el.className).toContain('py-11');
    expect(el.className).toContain('px-18');
  });

  it('restarts the timer when a second message arrives', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider><Trigger /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'go' }));
    act(() => { vi.advanceTimersByTime(2000); });
    await user.click(screen.getByRole('button', { name: 'go' }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('status')).not.toBeNull();
  });

  it('throws when useToast is called outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/toast.test.tsx`
Expected: FAIL — cannot resolve `./toast`.

- [ ] **Step 3: Write `Toast`**

Create `src/components/ui/toast.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';

export const TOAST_DURATION_MS = 2200;

export interface ToastProps {
  message: string;
  className?: string;
}

/** Presentational toast: fixed, bottom 28, centred, 11/18 padding, r10, --text on --bg. */
export function Toast({ message, className }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-28 left-1/2 -translate-x-1/2 rounded-10 bg-text px-18 py-11 text-14 text-bg shadow-card',
        className,
      )}
      style={{ zIndex: Z.toast }}
    >
      {message}
    </div>
  );
}

export interface ToastContextValue {
  flash: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const value = useMemo(() => ({ flash }), [flash]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message === null ? null : <Toast message={message} />}
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 4: Write `Tooltip`, `ScrollArea`, `Slider`**

Create `src/components/ui/tooltip.tsx`:

```tsx
'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export function TooltipRoot({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={400}>{children}</TooltipPrimitive.Provider>;
}

export interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

/**
 * The prototype uses the native `title` attribute almost everywhere — IconButton
 * already does that. Use this only where a styled, delayed tooltip is required.
 */
export function Tooltip({ content, children, side = 'top', delayDuration }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[90] rounded-8 bg-text px-10 py-6 text-12 text-bg shadow-card"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
```

Create `src/components/ui/scroll-area.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** CSS max-height, e.g. `min(480px, 72vh)` for the search suggestion panel. */
  maxHeight?: string;
}

/**
 * Native overflow, matching the prototype's plain `overflow-y:auto`. Deliberately
 * NOT Radix ScrollArea — Radix replaces the OS scrollbar and would not match.
 */
export function ScrollArea({ className, maxHeight, style, ...rest }: ScrollAreaProps) {
  return <div className={cn('min-h-0 overflow-y-auto', className)} style={{ maxHeight, ...style }} {...rest} />;
}
```

Create `src/components/ui/slider.tsx`:

```tsx
'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

/** Native range input — `accent-color: var(--accent)` comes from the base layer. */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider({ className, ...rest }, ref) {
  return <input ref={ref} type="range" className={cn('flex-1', className)} {...rest} />;
});
```

- [ ] **Step 5: Run the Toast test to verify it passes**

Run: `npx vitest run src/components/ui/toast.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add Toast/Toaster (2200ms), Tooltip, ScrollArea and Slider primitives"
```

---

### Task D11: `SectionLabel`, `EmptyState`, `InfoGrid`, `Rail`, `FilterChips`, `Pagination`

**Files:**
- Create: `src/components/shared/section-label.tsx`, `src/components/shared/empty-state.tsx`, `src/components/shared/info-grid.tsx`, `src/components/shared/rail.tsx`, `src/components/shared/filter-chips.tsx`, `src/components/shared/pagination.tsx`
- Test: `src/components/shared/pagination.test.tsx`, `src/components/shared/empty-state.test.tsx`, `src/components/shared/filter-chips.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Button`, `IconButton`, `Chip`.
- Produces:

```ts
export interface SectionLabelProps extends React.HTMLAttributes<HTMLDivElement> { size?: 11 | 12 }
export function SectionLabel(props: SectionLabelProps): JSX.Element;
// uppercase, font-semibold, tracking-[.08em], text-faint; 11 = sidebar, 12 = rail/editor/quiz

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;

export interface InfoGridProps { items: readonly { key: string; value: React.ReactNode }[]; className?: string }
export function InfoGrid(props: InfoGridProps): JSX.Element;   // grid-cols-[auto_1fr] gap-y-8 gap-x-16 text-13

export interface RailProps extends React.HTMLAttributes<HTMLElement> { sticky?: boolean; basis?: 260 | 280 }
export function Rail(props: RailProps): JSX.Element;

export interface RailSectionProps { label: string; action?: React.ReactNode; children: React.ReactNode; first?: boolean; className?: string }
export function RailSection(props: RailSectionProps): JSX.Element;

export interface FilterChipDescriptor { id: string; label: string; onRemove: () => void }
export interface FilterChipsProps { chips: readonly FilterChipDescriptor[]; onClearAll: () => void; className?: string }
export function FilterChips(props: FilterChipsProps): JSX.Element | null;

export interface PaginationProps {
  page: number;          // 1-based
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}
export function Pagination(props: PaginationProps): JSX.Element | null;
// range text: `Hiển thị {from}–{to} trên {total}`
```

- [ ] **Step 1: Write the failing Pagination test (covers Review Focus #5)**

Create `src/components/shared/pagination.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('renders the Vietnamese range sentence', () => {
    render(<Pagination page={1} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByText('Hiển thị 1–6 trên 14')).toBeInTheDocument();
  });

  it('clamps the upper bound on the last, partial page', () => {
    render(<Pagination page={3} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByText('Hiển thị 13–14 trên 14')).toBeInTheDocument();
  });

  it('renders nothing at all when there are no results', () => {
    const { container } = render(<Pagination page={1} pageCount={1} total={0} pageSize={6} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the range but no page buttons when there is a single page', () => {
    render(<Pagination page={1} pageCount={1} total={4} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByText('Hiển thị 1–4 trên 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trang 1' })).toBeNull();
  });

  it('marks the current page and emits others', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} total={14} pageSize={6} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Trang 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables prev on the first page and next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).not.toBeDisabled();
    rerender(<Pagination page={3} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('renders page numbers in mono, current on --text / --bg', () => {
    render(<Pagination page={1} pageCount={2} total={12} pageSize={6} onPageChange={() => {}} />);
    const current = screen.getByRole('button', { name: 'Trang 1' });
    expect(current.className).toContain('font-mono');
    expect(current.className).toContain('bg-text');
    expect(current.className).toContain('text-bg');
    expect(current.className).toContain('min-w-36');
    expect(current.className).toContain('h-36');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shared/pagination.test.tsx`
Expected: FAIL — cannot resolve `./pagination`.

- [ ] **Step 3: Write `SectionLabel`, `InfoGrid`, `Rail`**

Create `src/components/shared/section-label.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  /** 11 = sidebar group headings; 12 = detail rail / editor panel / quiz. */
  size?: 11 | 12;
}

export function SectionLabel({ className, size = 12, ...rest }: SectionLabelProps) {
  return (
    <div
      className={cn(
        'font-semibold uppercase tracking-[.08em] text-faint',
        size === 11 ? 'text-11' : 'text-12',
        className,
      )}
      {...rest}
    />
  );
}
```

Create `src/components/shared/info-grid.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InfoGridItem {
  key: string;
  value: ReactNode;
}

export interface InfoGridProps {
  items: readonly InfoGridItem[];
  className?: string;
}

/** Detail rail "Thông tin": grid auto/1fr, gap 8 × 16, 13px, keys faint. */
export function InfoGrid({ items, className }: InfoGridProps) {
  return (
    <dl className={cn('m-0 grid grid-cols-[auto_1fr] gap-x-16 gap-y-8 text-13', className)}>
      {items.map((item) => (
        <div key={item.key} className="contents">
          <dt className="text-faint">{item.key}</dt>
          <dd className="m-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

Create `src/components/shared/rail.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionLabel } from './section-label';

export interface RailProps extends HTMLAttributes<HTMLElement> {
  /** Detail rail is sticky at top 88 on desktop; editor rail is static. */
  sticky?: boolean;
  /** flex-basis: 260 = detail, 280 = editor. */
  basis?: 260 | 280;
}

export function Rail({ className, sticky = false, basis = 260, children, ...rest }: RailProps) {
  return (
    <aside
      className={cn(
        'flex min-w-0 flex-col gap-28',
        basis === 260 ? 'flex-[1_1_260px]' : 'flex-[1_1_280px]',
        'max-[819px]:static max-[819px]:max-w-full',
        sticky ? 'min-[820px]:sticky min-[820px]:top-88 min-[820px]:max-w-300' : 'min-[820px]:max-w-300',
        className,
      )}
      {...rest}
    >
      {children}
    </aside>
  );
}

export interface RailSectionProps {
  label: string;
  /** Right-aligned affordance next to the label, e.g. the "+ Làm bài" link. */
  action?: ReactNode;
  children: ReactNode;
  /** The first section has no top divider. */
  first?: boolean;
  className?: string;
}

export function RailSection({ label, action, children, first = false, className }: RailSectionProps) {
  return (
    <section className={cn('flex flex-col gap-10', !first && 'border-t border-line pt-20', className)}>
      {action ? (
        <div className="flex items-center justify-between">
          <SectionLabel>{label}</SectionLabel>
          {action}
        </div>
      ) : (
        <SectionLabel>{label}</SectionLabel>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Write `EmptyState` and `FilterChips`**

Create `src/components/shared/empty-state.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/** py-80 px-24, 1px dashed --line2, r14; title Serif 22/600; action h36 px-14 r8 bordered. */
export function EmptyState({ title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-10 rounded-14 border border-dashed border-line2 px-24 py-80 text-center',
        className,
      )}
    >
      <div className="font-serif text-22 font-semibold">{title}</div>
      {description ? <div className="text-14 text-muted">{description}</div> : null}
      {actionLabel && onAction ? (
        <Button
          variant="secondary"
          size="36"
          radius="8"
          onClick={onAction}
          className="mt-8 border-line2 px-14"
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
```

Create `src/components/shared/filter-chips.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';

export interface FilterChipDescriptor {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface FilterChipsProps {
  chips: readonly FilterChipDescriptor[];
  onClearAll: () => void;
  className?: string;
}

export function FilterChips({ chips, onClearAll, className }: FilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-8', className)}>
      {chips.map((chip) => (
        <Chip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
      ))}
      <Button variant="link" size="30" onClick={onClearAll} className="px-6">
        Xoá bộ lọc
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Write `Pagination`**

Create `src/components/shared/pagination.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';

export interface PaginationProps {
  /** 1-based. */
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageCount, total, pageSize, onPageChange, className }: PaginationProps) {
  if (total <= 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-16 pt-8', className)}>
      <div className="text-13 text-muted">{`Hiển thị ${from}–${to} trên ${total}`}</div>
      {pageCount > 1 ? (
        <nav aria-label="Phân trang" className="flex items-center gap-4">
          <IconButton
            icon="chevron-left"
            label="Trang trước"
            variant="bordered"
            size={36}
            radius="8"
            tone="default"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={cn(page <= 1 && 'opacity-35')}
          />
          {pages.map((n) => {
            const current = n === page;
            return (
              <button
                key={n}
                type="button"
                aria-label={`Trang ${n}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => onPageChange(n)}
                className={cn(
                  'h-36 min-w-36 rounded-8 border-0 px-6 font-mono text-13 font-medium',
                  current ? 'bg-text text-bg' : 'bg-transparent text-muted hover:outline hover:outline-1 hover:outline-line2',
                )}
              >
                {n}
              </button>
            );
          })}
          <IconButton
            icon="chevron-right"
            label="Trang sau"
            variant="bordered"
            size={36}
            radius="8"
            tone="default"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className={cn(page >= pageCount && 'opacity-35')}
          />
        </nav>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Write the EmptyState and FilterChips tests**

Create `src/components/shared/empty-state.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the dashed frame with the serif title', () => {
    const { container } = render(<EmptyState title="Không tìm thấy ghi chú" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('border-dashed');
    expect(el.className).toContain('border-line2');
    expect(el.className).toContain('rounded-14');
    expect(el.className).toContain('py-80');
    expect(screen.getByText('Không tìm thấy ghi chú').className).toContain('font-serif');
  });

  it('omits the action when no handler is supplied', () => {
    render(<EmptyState title="Không tìm thấy ghi chú" actionLabel="Xoá bộ lọc" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires the action', async () => {
    const onAction = vi.fn();
    render(<EmptyState title="Không tìm thấy ghi chú" actionLabel="Xoá bộ lọc" onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/components/shared/filter-chips.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterChips } from './filter-chips';

describe('FilterChips', () => {
  it('renders nothing when there are no chips', () => {
    const { container } = render(<FilterChips chips={[]} onClearAll={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a chip per filter and a clear-all link', () => {
    render(
      <FilterChips
        chips={[
          { id: 'q', label: '“sốc”', onRemove: () => {} },
          { id: 'tag', label: '#Cấp cứu', onRemove: () => {} },
        ]}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Gỡ bộ lọc “sốc”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gỡ bộ lọc #Cấp cứu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('emits removal and clear-all', async () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    render(<FilterChips chips={[{ id: 'q', label: '“sốc”', onRemove }]} onClearAll={onClearAll} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ bộ lọc “sốc”' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Run all three test files**

Run: `npx vitest run src/components/shared/pagination.test.tsx src/components/shared/empty-state.test.tsx src/components/shared/filter-chips.test.tsx`
Expected: PASS (13 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): add SectionLabel, EmptyState, InfoGrid, Rail, FilterChips, Pagination"
```

---

### Task D12: `useIsMobile`, `AppShell`, `Sidebar`, `SidebarSection`, `SidebarNavItem`, `AppHeader`

**Files:**
- Create: `src/hooks/use-is-mobile.ts`, `src/components/shared/app-shell.tsx`, `src/components/shared/sidebar.tsx`, `src/components/shared/sidebar-section.tsx`, `src/components/shared/sidebar-nav-item.tsx`, `src/components/shared/app-header.tsx`
- Test: `src/hooks/use-is-mobile.test.tsx`, `src/components/shared/sidebar.test.tsx`, `src/components/shared/app-header.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Z`, `Icon`, `IconButton`, `Button`, `Badge`, `Avatar`, `SectionLabel`.
- Produces — **these signatures are consumed by every page in later plans:**

```ts
// hooks/use-is-mobile.ts
export const MOBILE_BREAKPOINT = 820;                 // `window.innerWidth < 820`
export function useIsMobile(): boolean;               // false during SSR/first render, syncs on mount

// shared/app-shell.tsx
export interface AppShellProps {
  sidebar: React.ReactNode;       // <Sidebar>…</Sidebar>
  children: React.ReactNode;      // <AppHeader/> followed by the page container
  drawerOpen: boolean;
  onDrawerClose: () => void;
  className?: string;
}
export function AppShell(props: AppShellProps): JSX.Element;

// shared/sidebar.tsx
export interface SidebarUser { displayName: string; username: string }
export interface SidebarProps {
  collapsed: boolean;             // desktop: margin-left -256px + visibility hidden
  drawerOpen: boolean;            // mobile: translateX(0) vs translateX(-102%)
  isMobile: boolean;
  onCollapse: () => void;         // the 34px collapse button inside the sidebar
  onBrandClick?: () => void;
  user: SidebarUser;
  onLogout: () => void;
  children: React.ReactNode;      // SidebarSection groups, in order
  className?: string;
}
export const APP_NAME = 'Kno-Notes';
export const BRAND_MARK = 'K';
export function Sidebar(props: SidebarProps): JSX.Element;

// shared/sidebar-section.tsx
export interface SidebarSectionProps {
  label?: string;                 // SectionLabel size 11, px-10
  scroll?: boolean;               // tag list: flex-1 min-h-0 overflow-y-auto
  children: React.ReactNode;
  className?: string;
}
export function SidebarSection(props: SidebarSectionProps): JSX.Element;

// shared/sidebar-nav-item.tsx
export interface SidebarNavItemProps {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  variant?: 'nav' | 'priority' | 'tag';   // h38 | h34 | h32   (default 'nav')
  dotClassName?: string;                  // 8px priority dot
  hash?: boolean;                         // mono "#" prefix for tags
  className?: string;
}
export function SidebarNavItem(props: SidebarNavItemProps): JSX.Element;

// shared/app-header.tsx
export interface AppHeaderProps {
  showMenuButton: boolean;        // isMobile || sidebarCollapsed
  onMenuClick: () => void;
  search: React.ReactNode;        // <SearchBox/>
  settings: React.ReactNode;      // <SettingsPopover/>
  onNewNote: () => void;
  isMobile: boolean;              // hides the "Ghi chú mới" label, px 16 → 11
  className?: string;
}
export function AppHeader(props: AppHeaderProps): JSX.Element;
export const HEADER_PAD_X = { desktop: 40, mobile: 16 } as const;
```

- [ ] **Step 1: Write the failing `useIsMobile` test**

Create `src/hooks/use-is-mobile.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MOBILE_BREAKPOINT, useIsMobile } from './use-is-mobile';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('useIsMobile', () => {
  it('uses 820 as the single breakpoint', () => {
    expect(MOBILE_BREAKPOINT).toBe(820);
  });

  it('is true strictly below 820', () => {
    setWidth(819);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('is false at exactly 820', () => {
    setWidth(820);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('reacts to resize', () => {
    setWidth(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => setWidth(390));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Write `useIsMobile`**

Create `src/hooks/use-is-mobile.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/** The app's ONE breakpoint. `window.innerWidth < 820` is mobile. */
export const MOBILE_BREAKPOINT = 820;

/**
 * SSR-safe: returns false on the server and on the very first client render, then
 * syncs in an effect so hydration never mismatches.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}
```

- [ ] **Step 3: Run to verify the hook test passes**

Run: `npx vitest run src/hooks/use-is-mobile.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 4: Write `AppShell`, `SidebarSection`, `SidebarNavItem`**

Create `src/components/shared/app-shell.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';

export interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  className?: string;
}

/** Outer frame: min-h-screen flex, drawer backdrop rgba(10,12,14,.45) at z40. */
export function AppShell({ sidebar, children, drawerOpen, onDrawerClose, className }: AppShellProps) {
  return (
    <div className={cn('flex min-h-screen bg-bg text-text', className)}>
      {drawerOpen ? (
        <div
          aria-hidden="true"
          onClick={onDrawerClose}
          className="fixed inset-0 bg-[rgba(10,12,14,.45)]"
          style={{ zIndex: Z.drawerBackdrop }}
        />
      ) : null}
      {sidebar}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
```

Create `src/components/shared/sidebar-section.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionLabel } from './section-label';

export interface SidebarSectionProps {
  label?: string;
  /** The tag list scrolls independently and absorbs the remaining height. */
  scroll?: boolean;
  children: ReactNode;
  className?: string;
}

export function SidebarSection({ label, scroll = false, children, className }: SidebarSectionProps) {
  return (
    <div className={cn('flex flex-col', label ? 'gap-6' : 'gap-2', scroll && 'min-h-0 flex-1', className)}>
      {label ? <SectionLabel size={11} className="px-10">{label}</SectionLabel> : null}
      <div className={cn('flex flex-col gap-2', scroll && 'min-h-0 overflow-y-auto')}>{children}</div>
    </div>
  );
}
```

Create `src/components/shared/sidebar-nav-item.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface SidebarNavItemProps {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  /** nav h38 · priority h34 · tag h32 — exactly as in the prototype. */
  variant?: 'nav' | 'priority' | 'tag';
  dotClassName?: string;
  hash?: boolean;
  className?: string;
}

export function SidebarNavItem({
  label, count, active = false, onClick, variant = 'nav', dotClassName, hash = false, className,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center rounded-8 border-0 px-10 text-left text-14 hover:bg-surface2',
        variant === 'nav' && 'h-38 justify-between',
        variant === 'priority' && 'h-34 gap-10',
        variant === 'tag' && 'h-32 gap-8',
        active ? 'bg-surface2 font-medium text-text' : 'bg-transparent font-normal text-muted',
        className,
      )}
    >
      {dotClassName ? (
        <span aria-hidden="true" className={cn('h-8 w-8 shrink-0 rounded-circle', dotClassName)} />
      ) : null}
      {hash ? <span aria-hidden="true" className="font-mono text-13 text-faint">#</span> : null}
      <span className={cn(variant === 'nav' ? '' : 'flex-1', variant === 'tag' && 'truncate')}>{label}</span>
      {count != null ? <Badge>{count}</Badge> : null}
    </button>
  );
}
```

- [ ] **Step 5: Write the failing `Sidebar` test**

Create `src/components/shared/sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { APP_NAME, BRAND_MARK, Sidebar } from './sidebar';
import { SidebarNavItem } from './sidebar-nav-item';

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props: React.ComponentProps<typeof Sidebar> = {
    collapsed: false,
    drawerOpen: false,
    isMobile: false,
    onCollapse: vi.fn(),
    user: { displayName: 'Bác sĩ', username: 'bacsi' },
    onLogout: vi.fn(),
    children: <SidebarNavItem label="Tất cả ghi chú" count={14} active onClick={() => {}} />,
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe('Sidebar', () => {
  it('shows the Kno-Notes brand with the K mark', () => {
    renderSidebar();
    expect(APP_NAME).toBe('Kno-Notes');
    expect(BRAND_MARK).toBe('K');
    expect(screen.getByText('Kno-Notes')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('is 256px wide with a right hairline', () => {
    const { container } = render(
      <Sidebar collapsed={false} drawerOpen={false} isMobile={false} onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-256');
    expect(aside.className).toContain('border-r');
    expect(aside.className).toContain('border-line');
    expect(aside.className).toContain('gap-28');
  });

  it('collapses on desktop with -256px margin and hidden visibility', () => {
    const { container } = render(
      <Sidebar collapsed drawerOpen={false} isMobile={false} onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.marginLeft).toBe('-256px');
    expect(aside.style.visibility).toBe('hidden');
    expect(aside.style.transform).toBe('none');
  });

  it('slides off-canvas on mobile when the drawer is closed', () => {
    const { container } = render(
      <Sidebar collapsed={false} drawerOpen={false} isMobile onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.transform).toBe('translateX(-102%)');
    expect(aside.style.visibility).toBe('hidden');
    expect(aside.style.position).toBe('fixed');
  });

  it('shows the drawer on mobile when open', () => {
    const { container } = render(
      <Sidebar collapsed={false} drawerOpen isMobile onCollapse={() => {}}
        user={{ displayName: 'Bác sĩ', username: 'bacsi' }} onLogout={() => {}}>
        <div />
      </Sidebar>,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.transform).toBe('none');
    expect(aside.style.visibility).toBe('visible');
  });

  it('fires onCollapse from the 34px collapse button', async () => {
    const onCollapse = vi.fn();
    renderSidebar({ onCollapse });
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('shows the session display name, mono username and initials', () => {
    renderSidebar({ user: { displayName: 'Nguyễn An', username: 'annguyen' } });
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('annguyen').className).toContain('font-mono');
    expect(screen.getByText('NG')).toBeInTheDocument();
  });

  it('fires onLogout', async () => {
    const onLogout = vi.fn();
    renderSidebar({ onLogout });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Write `Sidebar`**

Create `src/components/shared/sidebar.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';

export const APP_NAME = 'Kno-Notes';
export const BRAND_MARK = 'K';

export interface SidebarUser {
  displayName: string;
  username: string;
}

export interface SidebarProps {
  collapsed: boolean;
  drawerOpen: boolean;
  isMobile: boolean;
  onCollapse: () => void;
  onBrandClick?: () => void;
  user: SidebarUser;
  onLogout: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * w 256 · h 100vh · sticky (desktop) / fixed (mobile) · z 50
 * padding 22 16 16 · gap 28 · transition transform/margin-left/visibility .22s
 */
export function Sidebar({
  collapsed, drawerOpen, isMobile, onCollapse, onBrandClick, user, onLogout, children, className,
}: SidebarProps) {
  const hidden = isMobile ? !drawerOpen : collapsed;

  return (
    <aside
      className={cn(
        'flex h-screen w-256 shrink-0 flex-col gap-28 overflow-y-auto border-r border-line bg-bg pt-22 pr-16 pb-16 pl-16',
        '[transition:transform_.22s_ease,margin-left_.22s_ease,visibility_.22s]',
        className,
      )}
      style={{
        position: isMobile ? 'fixed' : 'sticky',
        top: 0,
        left: 0,
        zIndex: Z.sidebar,
        transform: isMobile && !drawerOpen ? 'translateX(-102%)' : 'none',
        marginLeft: !isMobile && collapsed ? '-256px' : '0px',
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      <div className="flex items-center justify-between px-8">
        <button
          type="button"
          onClick={onBrandClick}
          className="flex cursor-pointer items-center gap-10 border-0 bg-transparent p-0 text-left"
        >
          <span
            aria-hidden="true"
            className="flex h-28 w-28 items-center justify-center rounded-8 bg-accent font-serif text-16 font-bold text-accent-ink"
          >
            {BRAND_MARK}
          </span>
          <span className="font-serif text-18 font-semibold tracking-[-.01em] text-text">{APP_NAME}</span>
        </button>
        <IconButton
          icon="sidebar-collapse"
          label="Thu gọn thanh bên"
          size={34}
          radius="8"
          iconSize={18}
          tone="muted"
          hoverTone="text"
          onClick={onCollapse}
        />
      </div>

      {children}

      <div className="flex items-center gap-10 border-t border-line px-10 pt-12">
        <Avatar name={user.displayName} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-13 font-medium">{user.displayName}</span>
          <span className="truncate font-mono text-12 text-faint">{user.username}</span>
        </div>
        <IconButton
          icon="logout"
          label="Đăng xuất"
          size={34}
          radius="8"
          iconSize={17}
          tone="muted"
          onClick={onLogout}
        />
      </div>
    </aside>
  );
}
```

- [ ] **Step 7: Write the failing `AppHeader` test and the component**

Create `src/components/shared/app-header.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';

function renderHeader(overrides: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
  const props: React.ComponentProps<typeof AppHeader> = {
    showMenuButton: false,
    onMenuClick: vi.fn(),
    search: <div data-testid="search" />,
    settings: <div data-testid="settings" />,
    onNewNote: vi.fn(),
    isMobile: false,
    ...overrides,
  };
  render(<AppHeader {...props} />);
  return props;
}

describe('AppHeader', () => {
  it('is 64px tall, sticky, with a bottom hairline and 40px side padding on desktop', () => {
    const { container } = render(
      <AppHeader showMenuButton={false} onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile={false} />,
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.className).toContain('h-64');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('border-b');
    expect(header.className).toContain('border-line');
    expect(header.style.paddingLeft).toBe('40px');
    expect(header.style.paddingRight).toBe('40px');
  });

  it('uses 16px side padding on mobile', () => {
    const { container } = render(
      <AppHeader showMenuButton onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile />,
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.style.paddingLeft).toBe('16px');
  });

  it('hides the menu button unless asked for', () => {
    renderHeader({ showMenuButton: false });
    expect(screen.queryByRole('button', { name: 'Mở thanh bên' })).toBeNull();
  });

  it('shows and fires the menu button', async () => {
    const onMenuClick = vi.fn();
    renderHeader({ showMenuButton: true, onMenuClick });
    await userEvent.click(screen.getByRole('button', { name: 'Mở thanh bên' }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('renders the search and settings slots', () => {
    renderHeader();
    expect(screen.getByTestId('search')).toBeInTheDocument();
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('shows the "Ghi chú mới" label on desktop and hides it on mobile', () => {
    const { rerender } = render(
      <AppHeader showMenuButton={false} onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile={false} />,
    );
    expect(screen.getByRole('button', { name: 'Ghi chú mới' })).toHaveTextContent('Ghi chú mới');
    rerender(
      <AppHeader showMenuButton onMenuClick={() => {}} search={null} settings={null}
        onNewNote={() => {}} isMobile />,
    );
    expect(screen.getByRole('button', { name: 'Ghi chú mới' })).not.toHaveTextContent('Ghi chú mới');
  });

  it('fires onNewNote', async () => {
    const onNewNote = vi.fn();
    renderHeader({ onNewNote });
    await userEvent.click(screen.getByRole('button', { name: 'Ghi chú mới' }));
    expect(onNewNote).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/components/shared/app-header.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

export const HEADER_PAD_X = { desktop: 40, mobile: 16 } as const;

export interface AppHeaderProps {
  showMenuButton: boolean;
  onMenuClick: () => void;
  search: ReactNode;
  settings: ReactNode;
  onNewNote: () => void;
  isMobile: boolean;
  className?: string;
}

/** h64 · sticky top 0 · z30 · gap 10 · bg --bg · border-bottom 1px --line. */
export function AppHeader({
  showMenuButton, onMenuClick, search, settings, onNewNote, isMobile, className,
}: AppHeaderProps) {
  const padX = isMobile ? HEADER_PAD_X.mobile : HEADER_PAD_X.desktop;

  return (
    <header
      className={cn('sticky top-0 flex h-64 items-center gap-10 border-b border-line bg-bg', className)}
      style={{ zIndex: Z.header, paddingLeft: padX, paddingRight: padX }}
    >
      {showMenuButton ? (
        <IconButton
          icon="sidebar-open"
          label="Mở thanh bên"
          size={40}
          radius="10"
          iconSize={20}
          tone="default"
          onClick={onMenuClick}
        />
      ) : null}

      <div className="relative min-w-0 max-w-560 flex-1">{search}</div>

      <div className="ml-auto flex-[0_1_auto]" />

      {settings}

      <Button
        variant="primary"
        size="40"
        icon="plus"
        iconSize={17}
        onClick={onNewNote}
        aria-label="Ghi chú mới"
        className={cn('shrink-0 gap-8', isMobile && 'px-11')}
      >
        {isMobile ? null : 'Ghi chú mới'}
      </Button>
    </header>
  );
}
```

- [ ] **Step 8: Run the shell tests**

Run: `npx vitest run src/hooks/use-is-mobile.test.tsx src/components/shared/sidebar.test.tsx src/components/shared/app-header.test.tsx`
Expected: PASS (19 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(shared): add useIsMobile, AppShell, Sidebar, SidebarSection, SidebarNavItem, AppHeader"
```

---

### Task D13: `SearchBox` and `SearchSuggestions`

**Files:**
- Create: `src/components/shared/search-box.tsx`, `src/components/shared/search-suggestions.tsx`
- Test: `src/components/shared/search-box.test.tsx`, `src/components/shared/search-suggestions.test.tsx`

**Decision:** the suggestion panel is hand-written rather than a `Popover`, because it must stay inside the search box's `relative` wrapper and must never take focus away from the input (Radix and our own `Popover` both render a click-catcher that would blur the field on the first click).

**Interfaces:**
- Consumes: `cn`, `Z`, `Icon`, `IconButton`, `Kbd`, `ScrollArea`, `SectionLabel`, `TagChip`, `PriorityDot`, `Priority`.
- Produces:

```ts
export const SEARCH_PLACEHOLDER = 'Tìm theo tiêu đề, mô tả hoặc #thẻ';

export interface SearchBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: React.ReactNode;      // <SearchSuggestions/>
  showKbdHint: boolean;              // !value && !isMobile
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  className?: string;
}
export function SearchBox(props: SearchBoxProps): JSX.Element;

export interface SuggestionTag { name: string; count: number }
export interface SuggestionNote { id: string; title: string; sub: string; priority: Priority }
export interface SearchSuggestionsProps {
  query: string;
  recent: readonly string[];         // hidden while the query is non-empty
  onRecentSelect: (query: string) => void;
  onClearRecent: () => void;
  tags: readonly SuggestionTag[];
  tagsTitle: string;                 // 'Thẻ' (idle) | 'Thẻ khớp' (typing)
  onTagSelect: (name: string) => void;
  notes: readonly SuggestionNote[];
  notesTitle: string;                // 'Mở gần đây' (idle) | 'Ghi chú khớp' (typing)
  onNoteSelect: (id: string) => void;
  onSubmit: () => void;
}
export function SearchSuggestions(props: SearchSuggestionsProps): JSX.Element;
```

- [ ] **Step 1: Write the failing `SearchBox` test**

Create `src/components/shared/search-box.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SEARCH_PLACEHOLDER, SearchBox } from './search-box';

function renderBox(overrides: Partial<React.ComponentProps<typeof SearchBox>> = {}) {
  const props: React.ComponentProps<typeof SearchBox> = {
    value: '',
    onValueChange: vi.fn(),
    onSubmit: vi.fn(),
    open: false,
    onOpenChange: vi.fn(),
    suggestions: <div data-testid="panel" />,
    showKbdHint: true,
    ...overrides,
  };
  render(<SearchBox {...props} />);
  return props;
}

describe('SearchBox', () => {
  it('uses the prototype placeholder', () => {
    renderBox();
    expect(SEARCH_PLACEHOLDER).toBe('Tìm theo tiêu đề, mô tả hoặc #thẻ');
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeInTheDocument();
  });

  it('is 42px tall with a 10px radius and a --line border when closed', () => {
    const { container } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint />,
    );
    const box = container.querySelector('[data-search-box]') as HTMLElement;
    expect(box.className).toContain('h-42');
    expect(box.className).toContain('rounded-10');
    expect(box.className).toContain('border-line');
  });

  it('switches the border to accent while the panel is open', () => {
    const { container } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
        onOpenChange={() => {}} suggestions={null} showKbdHint />,
    );
    expect((container.querySelector('[data-search-box]') as HTMLElement).className).toContain('border-accent');
  });

  it('shows the "/" hint only when asked', () => {
    const { rerender } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint />,
    );
    expect(screen.getByText('/')).toBeInTheDocument();
    rerender(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint={false} />,
    );
    expect(screen.queryByText('/')).toBeNull();
  });

  it('shows a clear button only when there is a value, and clears', async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <SearchBox value="" onValueChange={onValueChange} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Xoá từ khoá' })).toBeNull();
    rerender(
      <SearchBox value="sốc" onValueChange={onValueChange} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xoá từ khoá' }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('opens the panel on focus and on click', async () => {
    const onOpenChange = vi.fn();
    renderBox({ onOpenChange });
    await userEvent.click(screen.getByPlaceholderText(SEARCH_PLACEHOLDER));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('submits on Enter and closes on Escape', async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    renderBox({ onSubmit, onOpenChange, open: true });
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
    input.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders the suggestion panel only while open', () => {
    const { rerender } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false} />,
    );
    expect(screen.queryByTestId('panel')).toBeNull();
    rerender(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
        onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false} />,
    );
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write `SearchBox`**

Create `src/components/shared/search-box.tsx`:

```tsx
'use client';

import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';

export const SEARCH_PLACEHOLDER = 'Tìm theo tiêu đề, mô tả hoặc #thẻ';

export interface SearchBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: ReactNode;
  showKbdHint: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  className?: string;
}

/**
 * Box: h42 · px 12 · gap 10 · r10 · --surface · 1px --line → --accent when open · z32.
 * Backdrop z31. Panel z33 at top 48.
 */
export function SearchBox({
  value, onValueChange, onSubmit, open, onOpenChange, suggestions,
  showKbdHint, inputRef, placeholder = SEARCH_PLACEHOLDER, className,
}: SearchBoxProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      {open ? (
        <div
          aria-hidden="true"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0"
          style={{ zIndex: Z.sugBackdrop }}
        />
      ) : null}

      <div
        data-search-box=""
        className={cn(
          'relative flex h-42 items-center gap-10 rounded-10 border bg-surface px-12',
          open ? 'border-accent' : 'border-line',
        )}
        style={{ zIndex: Z.sugBox }}
      >
        <Icon name="search" size={17} className="text-faint" />
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => onOpenChange(true)}
          onClick={() => onOpenChange(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape') {
              onOpenChange(false);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-14 text-text outline-none placeholder:text-faint"
        />
        {value ? (
          <IconButton
            icon="close"
            label="Xoá từ khoá"
            variant="soft"
            size={24}
            radius="6"
            iconSize={12}
            strokeWidth={2.2}
            tone="muted"
            onClick={() => onValueChange('')}
          />
        ) : null}
        {showKbdHint ? <Kbd>/</Kbd> : null}
      </div>

      {open ? (
        <div
          className="absolute inset-x-0 top-48 flex flex-col gap-6 rounded-12 border border-line bg-surface p-8 shadow-card"
          style={{ zIndex: Z.sugPanel, maxHeight: 'min(480px, 72vh)', overflowY: 'auto' }}
        >
          {suggestions}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Write the failing `SearchSuggestions` test**

Create `src/components/shared/search-suggestions.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchSuggestions } from './search-suggestions';

const BASE: React.ComponentProps<typeof SearchSuggestions> = {
  query: '',
  recent: ['sốc phản vệ', 'ECG'],
  onRecentSelect: vi.fn(),
  onClearRecent: vi.fn(),
  tags: [{ name: 'Cấp cứu', count: 4 }],
  tagsTitle: 'Thẻ',
  onTagSelect: vi.fn(),
  notes: [{ id: 'n1', title: 'Đọc ECG trong 10 bước', sub: '#Tim mạch · 3 ngày trước', priority: 'medium' }],
  notesTitle: 'Mở gần đây',
  onNoteSelect: vi.fn(),
  onSubmit: vi.fn(),
};

describe('SearchSuggestions', () => {
  it('shows recent searches, tags and notes with the idle headings', () => {
    render(<SearchSuggestions {...BASE} />);
    expect(screen.getByText('Tìm gần đây')).toBeInTheDocument();
    expect(screen.getByText('Thẻ')).toBeInTheDocument();
    expect(screen.getByText('Mở gần đây')).toBeInTheDocument();
  });

  it('hides recent searches once the user types', () => {
    render(<SearchSuggestions {...BASE} query="ecg" tagsTitle="Thẻ khớp" notesTitle="Ghi chú khớp" />);
    expect(screen.queryByText('Tìm gần đây')).toBeNull();
    expect(screen.getByText('Thẻ khớp')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú khớp')).toBeInTheDocument();
  });

  it('selects a recent term', async () => {
    const onRecentSelect = vi.fn();
    render(<SearchSuggestions {...BASE} onRecentSelect={onRecentSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'sốc phản vệ' }));
    expect(onRecentSelect).toHaveBeenCalledWith('sốc phản vệ');
  });

  it('clears recent searches', async () => {
    const onClearRecent = vi.fn();
    render(<SearchSuggestions {...BASE} onClearRecent={onClearRecent} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(onClearRecent).toHaveBeenCalledTimes(1);
  });

  it('selects a tag and a note', async () => {
    const onTagSelect = vi.fn();
    const onNoteSelect = vi.fn();
    render(<SearchSuggestions {...BASE} onTagSelect={onTagSelect} onNoteSelect={onNoteSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /#Cấp cứu/ }));
    expect(onTagSelect).toHaveBeenCalledWith('Cấp cứu');
    await userEvent.click(screen.getByRole('button', { name: /Đọc ECG trong 10 bước/ }));
    expect(onNoteSelect).toHaveBeenCalledWith('n1');
  });

  it('shows the "no suggestions" line when a query matches nothing', () => {
    render(<SearchSuggestions {...BASE} query="zzz" tags={[]} notes={[]} recent={[]} />);
    expect(screen.getByText('Không có gợi ý cho “zzz”')).toBeInTheDocument();
  });

  it('offers the full-results row with an Enter hint whenever there is a query', async () => {
    const onSubmit = vi.fn();
    render(<SearchSuggestions {...BASE} query="ecg" onSubmit={onSubmit} />);
    const row = screen.getByRole('button', { name: /Xem tất cả kết quả cho “ecg”/ });
    expect(row).toHaveTextContent('Enter');
    await userEvent.click(row);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('omits the full-results row when the query is empty', () => {
    render(<SearchSuggestions {...BASE} />);
    expect(screen.queryByText(/Xem tất cả kết quả/)).toBeNull();
  });
});
```

- [ ] **Step 4: Write `SearchSuggestions`**

Create `src/components/shared/search-suggestions.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { PriorityDot, type Priority } from './priority';
import { SectionLabel } from './section-label';
import { TagChip } from './tag-chip';

export interface SuggestionTag {
  name: string;
  count: number;
}

export interface SuggestionNote {
  id: string;
  title: string;
  sub: string;
  priority: Priority;
}

export interface SearchSuggestionsProps {
  query: string;
  recent: readonly string[];
  onRecentSelect: (query: string) => void;
  onClearRecent: () => void;
  tags: readonly SuggestionTag[];
  tagsTitle: string;
  onTagSelect: (name: string) => void;
  notes: readonly SuggestionNote[];
  notesTitle: string;
  onNoteSelect: (id: string) => void;
  onSubmit: () => void;
}

export function SearchSuggestions({
  query, recent, onRecentSelect, onClearRecent,
  tags, tagsTitle, onTagSelect, notes, notesTitle, onNoteSelect, onSubmit,
}: SearchSuggestionsProps) {
  const typing = query.trim().length > 0;
  const showRecent = !typing && recent.length > 0;
  const empty = typing && tags.length === 0 && notes.length === 0;

  return (
    <>
      {showRecent ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-10 pt-6 pb-4">
            <SectionLabel size={11}>Tìm gần đây</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className="border-0 bg-transparent p-0 text-12 text-faint hover:text-text"
            >
              Xoá
            </button>
          </div>
          {recent.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => onRecentSelect(term)}
              className="flex h-36 items-center gap-10 rounded-8 border-0 bg-transparent px-10 text-left text-14 text-text hover:bg-surface2"
            >
              <Icon name="history" size={15} className="text-faint" />
              {term}
            </button>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="flex flex-col gap-6 px-10 pt-4 pb-8">
          <SectionLabel size={11}>{tagsTitle}</SectionLabel>
          <div className="flex flex-wrap gap-6">
            {tags.map((tag) => (
              <TagChip
                key={tag.name}
                name={tag.name}
                hash
                count={tag.count}
                onClick={() => onTagSelect(tag.name)}
                className="h-28"
              />
            ))}
          </div>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="flex flex-col">
          <SectionLabel size={11} className="px-10 pt-6 pb-4">{notesTitle}</SectionLabel>
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onNoteSelect(note.id)}
              className="flex items-start gap-10 rounded-8 border-0 bg-transparent px-10 py-9 text-left text-text hover:bg-surface2"
            >
              <PriorityDot priority={note.priority} size={7} className="mt-7" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="truncate font-serif text-15 font-semibold">{note.title}</span>
                <span className="truncate text-12 text-muted">{note.sub}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {empty ? (
        <div className="px-10 py-20 text-center text-13 text-muted">{`Không có gợi ý cho “${query}”`}</div>
      ) : null}

      {typing ? (
        <button
          type="button"
          onClick={onSubmit}
          className={cn(
            'mt-2 flex h-38 items-center gap-10 border-0 border-t border-line bg-transparent px-10 text-left text-13 text-accent hover:bg-surface2',
            'rounded-b-8',
          )}
        >
          <Icon name="search" size={15} />
          {`Xem tất cả kết quả cho “${query}”`}
          <Kbd bare className="ml-auto">Enter</Kbd>
        </button>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Run the search tests**

Run: `npx vitest run src/components/shared/search-box.test.tsx src/components/shared/search-suggestions.test.tsx`
Expected: PASS (16 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shared): add SearchBox and SearchSuggestions with the prototype z-index stack"
```

---

### Task D14: `SettingsPopover`, `ThemeSwitch`, `FontSizeControl`

**Files:**
- Create: `src/components/shared/theme-switch.tsx`, `src/components/shared/font-size-control.tsx`, `src/components/shared/settings-popover.tsx`
- Test: `src/components/shared/theme-switch.test.tsx`, `src/components/shared/font-size-control.test.tsx`, `src/components/shared/settings-popover.test.tsx`

**Interfaces:**
- Consumes: `Popover`, `Segmented`, `Slider`, `Button`, `Icon`, `Theme`, `FS_MIN`, `FS_MAX`, `clampFontSize`, `Z`.
- Produces:

```ts
export interface ThemeSwitchProps { value: Theme; onChange: (theme: Theme) => void; className?: string }
export function ThemeSwitch(props: ThemeSwitchProps): JSX.Element;

export interface FontSizeControlProps { value: number; onChange: (size: number) => void; className?: string }
export function FontSizeControl(props: FontSizeControlProps): JSX.Element;
export const FONT_PREVIEW_TEXT = 'Adrenalin 0,5 mg tiêm bắp.';

export interface SettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onLogout: () => void;
  className?: string;
}
export function SettingsPopover(props: SettingsPopoverProps): JSX.Element;
```

- [ ] **Step 1: Write the failing `ThemeSwitch` test**

Create `src/components/shared/theme-switch.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeSwitch } from './theme-switch';

describe('ThemeSwitch', () => {
  it('offers Sáng and Tối as a 2-column track', () => {
    const { container } = render(<ThemeSwitch value="light" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Sáng' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('marks the active theme', () => {
    render(<ThemeSwitch value="dark" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'true');
  });

  it('emits the other theme', async () => {
    const onChange = vi.fn();
    render(<ThemeSwitch value="light" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
```

- [ ] **Step 2: Write `ThemeSwitch`**

Create `src/components/shared/theme-switch.tsx`:

```tsx
'use client';

import type { Theme } from '@/lib/theme';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

const OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'light', label: 'Sáng', icon: 'sun', iconSize: 15 },
  { value: 'dark', label: 'Tối', icon: 'moon', iconSize: 15 },
];

export interface ThemeSwitchProps {
  value: Theme;
  onChange: (theme: Theme) => void;
  className?: string;
}

export function ThemeSwitch({ value, onChange, className }: ThemeSwitchProps) {
  return (
    <Segmented
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Giao diện"
      columns={2}
      className={className}
    />
  );
}
```

- [ ] **Step 3: Write the failing `FontSizeControl` test**

Create `src/components/shared/font-size-control.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FONT_PREVIEW_TEXT, FontSizeControl } from './font-size-control';

describe('FontSizeControl', () => {
  it('shows the current size in mono and the serif preview', () => {
    render(<FontSizeControl value={17} onChange={() => {}} />);
    expect(screen.getByText('17px').className).toContain('font-mono');
    const preview = screen.getByText(FONT_PREVIEW_TEXT);
    expect(preview.className).toContain('font-serif');
    expect(preview.style.fontSize).toBe('17px');
  });

  it('exposes a 14–22 range with step 1', () => {
    render(<FontSizeControl value={17} onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Cỡ chữ nội dung' });
    expect(range).toHaveAttribute('min', '14');
    expect(range).toHaveAttribute('max', '22');
    expect(range).toHaveAttribute('step', '1');
  });

  it('steps down and up with the 30px A buttons', async () => {
    const onChange = vi.fn();
    render(<FontSizeControl value={17} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Giảm cỡ chữ' }));
    expect(onChange).toHaveBeenCalledWith(16);
    await userEvent.click(screen.getByRole('button', { name: 'Tăng cỡ chữ' }));
    expect(onChange).toHaveBeenCalledWith(18);
  });

  it('never steps outside 14–22', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<FontSizeControl value={14} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Giảm cỡ chữ' }));
    expect(onChange).toHaveBeenLastCalledWith(14);
    rerender(<FontSizeControl value={22} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tăng cỡ chữ' }));
    expect(onChange).toHaveBeenLastCalledWith(22);
  });

  it('emits a clamped integer from the range input', () => {
    const onChange = vi.fn();
    render(<FontSizeControl value={17} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Cỡ chữ nội dung' }), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith(20);
  });
});
```

- [ ] **Step 4: Write `FontSizeControl`**

Create `src/components/shared/font-size-control.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { FS_MAX, FS_MIN, clampFontSize } from '@/lib/theme';
import { Slider } from '@/components/ui/slider';

export const FONT_PREVIEW_TEXT = 'Adrenalin 0,5 mg tiêm bắp.';

export interface FontSizeControlProps {
  value: number;
  onChange: (size: number) => void;
  className?: string;
}

/** 30×30 r8 A buttons (serif 13 / serif 18), range 14–22 step 1, preview on --surface2 r8. */
export function FontSizeControl({ value, onChange, className }: FontSizeControlProps) {
  const size = clampFontSize(value);

  return (
    <div className={cn('flex flex-col gap-10', className)}>
      <div className="flex justify-between text-12 font-medium text-muted">
        <span>Cỡ chữ nội dung</span>
        <span className="font-mono">{`${size}px`}</span>
      </div>
      <div className="flex items-center gap-10">
        <button
          type="button"
          aria-label="Giảm cỡ chữ"
          onClick={() => onChange(Math.max(FS_MIN, size - 1))}
          className="h-30 w-30 rounded-8 border border-line bg-transparent font-serif text-13"
        >
          A
        </button>
        <Slider
          aria-label="Cỡ chữ nội dung"
          min={FS_MIN}
          max={FS_MAX}
          step={1}
          value={size}
          onChange={(e) => onChange(clampFontSize(e.target.value))}
        />
        <button
          type="button"
          aria-label="Tăng cỡ chữ"
          onClick={() => onChange(Math.min(FS_MAX, size + 1))}
          className="h-30 w-30 rounded-8 border border-line bg-transparent font-serif text-18"
        >
          A
        </button>
      </div>
      <div
        className="rounded-8 bg-surface2 px-12 py-10 font-serif leading-[1.6] text-muted"
        style={{ fontSize: `${size}px` }}
      >
        {FONT_PREVIEW_TEXT}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the failing `SettingsPopover` test and the component**

Create `src/components/shared/settings-popover.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPopover } from './settings-popover';

function renderPopover(overrides: Partial<React.ComponentProps<typeof SettingsPopover>> = {}) {
  const props: React.ComponentProps<typeof SettingsPopover> = {
    open: true,
    onOpenChange: vi.fn(),
    theme: 'light',
    onThemeChange: vi.fn(),
    fontSize: 17,
    onFontSizeChange: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<SettingsPopover {...props} />);
  return props;
}

describe('SettingsPopover', () => {
  it('renders the Aa trigger with serif A and a small a', () => {
    renderPopover({ open: false });
    const trigger = screen.getByRole('button', { name: 'Giao diện' });
    expect(trigger).toHaveTextContent('Aa');
    expect(trigger.className).toContain('h-40');
    expect(trigger.className).toContain('rounded-10');
  });

  it('shows nothing until opened', () => {
    renderPopover({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is 288px wide with a 14px radius when open', () => {
    renderPopover();
    const panel = screen.getByRole('dialog', { name: 'Giao diện' });
    expect(panel.style.width).toBe('288px');
    expect(panel.className).toContain('rounded-14');
  });

  it('contains the theme switch, the font size control and logout', () => {
    renderPopover();
    expect(screen.getByRole('radiogroup', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Cỡ chữ nội dung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('relays theme, font-size and logout', async () => {
    const onThemeChange = vi.fn();
    const onLogout = vi.fn();
    renderPopover({ onThemeChange, onLogout });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    renderPopover({ onOpenChange });
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

Create `src/components/shared/settings-popover.tsx`:

```tsx
'use client';

import type { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import { FontSizeControl } from './font-size-control';
import { ThemeSwitch } from './theme-switch';

export interface SettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onLogout: () => void;
  className?: string;
}

/** Trigger h40 min-w40 px-10 r10 1px --line, Serif 17/600 "A" + 12 "a". Panel 288 r14 p18 gap 20. */
export function SettingsPopover({
  open, onOpenChange, theme, onThemeChange, fontSize, onFontSizeChange, onLogout, className,
}: SettingsPopoverProps) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      offset={48}
      width={288}
      backdropZ={Z.settingsBackdrop}
      panelZ={Z.settingsPopover}
      panelLabel="Giao diện"
      panelClassName="rounded-14 flex flex-col gap-20 p-18"
      wrapperClassName={className}
      trigger={
        <button
          type="button"
          title="Giao diện"
          aria-label="Giao diện"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="flex h-40 min-w-40 items-center justify-center gap-2 rounded-10 border border-line bg-surface px-10 font-serif text-17 font-semibold text-text transition-colors duration-150 hover:border-line2"
        >
          A<span className="text-12">a</span>
        </button>
      }
    >
      <div className="flex flex-col gap-10">
        <div className="text-12 font-medium text-muted">Giao diện</div>
        <ThemeSwitch value={theme} onChange={onThemeChange} />
      </div>

      <FontSizeControl value={fontSize} onChange={onFontSizeChange} />

      <button
        type="button"
        onClick={onLogout}
        className={cn(
          'flex items-center gap-8 border-0 border-t border-line bg-transparent pt-14 text-13 text-muted hover:text-text',
        )}
      >
        <Icon name="logout" size={15} />
        Đăng xuất
      </button>
    </Popover>
  );
}
```

- [ ] **Step 6: Run the settings tests**

Run: `npx vitest run src/components/shared/theme-switch.test.tsx src/components/shared/font-size-control.test.tsx src/components/shared/settings-popover.test.tsx`
Expected: PASS (14 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): add SettingsPopover with ThemeSwitch and FontSizeControl (14-22px)"
```

---

### Task D15: `NoteCard`, `NoteListRow`, `NoteGrid`, `NoteList`

**Files:**
- Create: `src/components/shared/note-card.tsx`, `src/components/shared/note-list-row.tsx`, `src/components/shared/note-grid.tsx`, `src/components/shared/note-list.tsx`
- Test: `src/components/shared/note-card.test.tsx`, `src/components/shared/note-list-row.test.tsx`, `src/components/shared/note-grid.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Toggle`, `Icon`, `Badge`, `TagChip`, `PriorityDot`, `PriorityLabel`, `Priority`.
- Produces:

```ts
export interface NoteSummary {
  id: string;
  title: string;
  desc: string;
  priority: Priority;
  tags: readonly string[];        // the card shows at most 3 — slice at the call site or here
  favorite: boolean;
  updatedLabel: string;           // already formatted by rel()
  version: number;                // rendered as `v{version}` in mono
  imageCount: number;
  commentCount: number;
}

export interface NoteItemHandlers {
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export interface NoteCardProps extends NoteItemHandlers { note: NoteSummary; className?: string }
export function NoteCard(props: NoteCardProps): JSX.Element;

export interface NoteListRowProps extends NoteItemHandlers {
  note: NoteSummary;
  first?: boolean;      // first row has a transparent top border
  wrap?: boolean;       // mobile
  className?: string;
}
export function NoteListRow(props: NoteListRowProps): JSX.Element;

export interface NoteGridProps extends NoteItemHandlers { notes: readonly NoteSummary[]; className?: string }
export function NoteGrid(props: NoteGridProps): JSX.Element;

export interface NoteListProps extends NoteItemHandlers { notes: readonly NoteSummary[]; wrap?: boolean; className?: string }
export function NoteList(props: NoteListProps): JSX.Element;

export const MAX_CARD_TAGS = 3;
```

- [ ] **Step 1: Write the failing `NoteCard` test (covers Review Focus #4)**

Create `src/components/shared/note-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteCard, type NoteSummary } from './note-card';

const NOTE: NoteSummary = {
  id: 'n1',
  title: 'Đọc ECG trong 10 bước',
  desc: 'Loại trừ 5 nguyên nhân nguy hiểm…',
  priority: 'medium',
  tags: ['Tim mạch', 'Cấp cứu', 'Nội khoa', 'Thừa'],
  favorite: false,
  updatedLabel: '3 ngày trước',
  version: 3,
  imageCount: 2,
  commentCount: 1,
};

describe('NoteCard', () => {
  it('uses the card frame: surface, 1px line, r14, 18/20/16 padding, min-h 200', () => {
    const { container } = render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('bg-surface');
    expect(card.className).toContain('border-line');
    expect(card.className).toContain('rounded-14');
    expect(card.className).toContain('pt-18');
    expect(card.className).toContain('px-20');
    expect(card.className).toContain('pb-16');
    expect(card.className).toContain('min-h-200');
    expect(card.className).toContain('gap-10');
  });

  it('renders the serif 20px title and the 2-line clamped description', () => {
    render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const title = screen.getByText('Đọc ECG trong 10 bước');
    expect(title.className).toContain('font-serif');
    expect(title.className).toContain('text-20');
    expect(screen.getByText('Loại trừ 5 nguyên nhân nguy hiểm…').className).toContain('line-clamp-2');
  });

  it('shows the priority label and at most three tags', () => {
    render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('Trung bình')).toBeInTheDocument();
    expect(screen.getByText('Tim mạch')).toBeInTheDocument();
    expect(screen.getByText('Nội khoa')).toBeInTheDocument();
    expect(screen.queryByText('Thừa')).toBeNull();
  });

  it('shows the footer meta: relative time, image count, comment count, mono version', () => {
    render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('3 ngày trước')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('v3').className).toContain('font-mono');
  });

  it('hides image and comment counters when they are zero', () => {
    render(
      <NoteCard note={{ ...NOTE, imageCount: 0, commentCount: 0 }} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    expect(screen.queryByLabelText('Số hình ảnh')).toBeNull();
    expect(screen.queryByLabelText('Số bình luận')).toBeNull();
  });

  it('opens the note when the card body is clicked', async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={NOTE} onOpen={onOpen} onToggleFavorite={() => {}} />);
    await userEvent.click(screen.getByText('Đọc ECG trong 10 bước'));
    expect(onOpen).toHaveBeenCalledWith('n1');
  });

  it('toggles favourite without opening the note', async () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<NoteCard note={NOTE} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('n1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('marks the star pressed and tinted when favourited', () => {
    render(<NoteCard note={{ ...NOTE, favorite: true }} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const star = screen.getByRole('button', { name: 'Yêu thích' });
    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(star.className).toContain('text-med');
  });

  it('never lets an unbreakable title widen the card', () => {
    render(
      <NoteCard note={{ ...NOTE, title: 'a'.repeat(120) }} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    expect(screen.getByText('a'.repeat(120)).className).toContain('break-words');
  });

  it('opens the note when Enter is pressed on the card', async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={NOTE} onOpen={onOpen} onToggleFavorite={() => {}} />);
    screen.getByRole('button', { name: /Đọc ECG trong 10 bước/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('n1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shared/note-card.test.tsx`
Expected: FAIL — cannot resolve `./note-card`.

- [ ] **Step 3: Write `NoteCard`**

Create `src/components/shared/note-card.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import { PriorityLabel, type Priority } from './priority';
import { TagChip } from './tag-chip';

export const MAX_CARD_TAGS = 3;

export interface NoteSummary {
  id: string;
  title: string;
  desc: string;
  priority: Priority;
  tags: readonly string[];
  favorite: boolean;
  updatedLabel: string;
  version: number;
  imageCount: number;
  commentCount: number;
}

export interface NoteItemHandlers {
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export interface NoteCardProps extends NoteItemHandlers {
  note: NoteSummary;
  className?: string;
}

export function NoteCard({ note, onOpen, onToggleFavorite, className }: NoteCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={note.title}
      onClick={() => onOpen(note.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(note.id);
        }
      }}
      className={cn(
        'flex min-h-200 cursor-pointer flex-col gap-10 rounded-14 border border-line bg-surface pt-18 pr-20 pb-16 pl-20',
        'transition-[border-color,box-shadow] duration-150 hover:border-line2 hover:shadow-card',
        className,
      )}
    >
      <div className="flex h-28 items-center justify-between gap-8">
        <PriorityLabel priority={note.priority} />
        <Toggle
          icon="star"
          label="Yêu thích"
          pressed={note.favorite}
          iconSize={18}
          strokeWidth={1.6}
          iconFilled={note.favorite}
          tone={note.favorite ? 'med' : 'faint'}
          size={32}
          radius="8"
          className="-mr-8"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(note.id);
          }}
        />
      </div>

      <div className="break-words font-serif text-20 font-semibold leading-[1.3] tracking-[-.01em] [text-wrap:pretty]">
        {note.title}
      </div>

      <div className="line-clamp-2 break-words text-14 leading-[1.55] text-muted">{note.desc}</div>

      <div className="flex-1" />

      <div className="flex flex-wrap gap-6">
        {note.tags.slice(0, MAX_CARD_TAGS).map((tag) => (
          <TagChip key={tag} name={tag} size="card" />
        ))}
      </div>

      <div className="flex items-center gap-14 border-t border-line pt-12 text-12 text-faint">
        <span className="flex-1 truncate">{note.updatedLabel}</span>
        {note.imageCount > 0 ? (
          <span className="flex items-center gap-4" aria-label="Số hình ảnh">
            <Icon name="image" size={14} />
            {note.imageCount}
          </span>
        ) : null}
        {note.commentCount > 0 ? (
          <span className="flex items-center gap-4" aria-label="Số bình luận">
            <Icon name="comment" size={14} />
            {note.commentCount}
          </span>
        ) : null}
        <Badge>{`v${note.version}`}</Badge>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the failing `NoteListRow` test**

Create `src/components/shared/note-list-row.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from './note-card';
import { NoteListRow } from './note-list-row';

const NOTE: NoteSummary = {
  id: 'n2',
  title: 'Thang điểm Glasgow (GCS)',
  desc: 'Cách chấm điểm nhanh tại giường.',
  priority: 'high',
  tags: ['Thần kinh', 'Cấp cứu'],
  favorite: true,
  updatedLabel: 'vừa xong',
  version: 1,
  imageCount: 0,
  commentCount: 2,
};

describe('NoteListRow', () => {
  it('uses the row frame: 16/18 padding, gap 16, top hairline', () => {
    const { container } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('py-16');
    expect(row.className).toContain('px-18');
    expect(row.className).toContain('gap-16');
    expect(row.className).toContain('border-t');
    expect(row.className).toContain('border-line');
  });

  it('makes the first row top border transparent', () => {
    const { container } = render(<NoteListRow note={NOTE} first onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('border-transparent');
  });

  it('renders the serif 17px title and 13px description, both ellipsised', () => {
    render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const title = screen.getByText('Thang điểm Glasgow (GCS)');
    expect(title.className).toContain('font-serif');
    expect(title.className).toContain('text-17');
    expect(title.className).toContain('truncate');
    expect(screen.getByText('Cách chấm điểm nhanh tại giường.').className).toContain('truncate');
  });

  it('shows the 8px priority dot', () => {
    const { container } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(container.querySelector('.bg-hi')).not.toBeNull();
  });

  it('wraps on mobile only when asked', () => {
    const { container, rerender } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('flex-nowrap');
    rerender(<NoteListRow note={NOTE} wrap onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('flex-wrap');
  });

  it('toggles favourite without opening', async () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<NoteListRow note={NOTE} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('n2');
    expect(onOpen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Write `NoteListRow`, `NoteGrid`, `NoteList`**

Create `src/components/shared/note-list-row.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import type { NoteItemHandlers, NoteSummary } from './note-card';
import { PriorityDot } from './priority';
import { TagChip } from './tag-chip';

export interface NoteListRowProps extends NoteItemHandlers {
  note: NoteSummary;
  first?: boolean;
  wrap?: boolean;
  className?: string;
}

export function NoteListRow({ note, first = false, wrap = false, onOpen, onToggleFavorite, className }: NoteListRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={note.title}
      onClick={() => onOpen(note.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(note.id);
        }
      }}
      className={cn(
        'flex cursor-pointer items-center gap-16 border-t py-16 px-18 hover:bg-surface2',
        first ? 'border-transparent' : 'border-line',
        wrap ? 'flex-wrap' : 'flex-nowrap',
        className,
      )}
    >
      <PriorityDot priority={note.priority} size={8} />

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
        <div className="truncate font-serif text-17 font-semibold leading-[1.3]">{note.title}</div>
        <div className="truncate text-13 text-muted">{note.desc}</div>
      </div>

      <div className="flex shrink-0 gap-6">
        {note.tags.slice(0, 3).map((tag) => (
          <TagChip key={tag} name={tag} size="card" />
        ))}
      </div>

      <div className="flex min-w-150 shrink-0 items-center justify-end gap-12 text-12 text-faint">
        {note.imageCount > 0 ? (
          <span className="flex items-center gap-4" aria-label="Số hình ảnh">
            <Icon name="image" size={14} />
            {note.imageCount}
          </span>
        ) : null}
        {note.commentCount > 0 ? (
          <span className="flex items-center gap-4" aria-label="Số bình luận">
            <Icon name="comment" size={14} />
            {note.commentCount}
          </span>
        ) : null}
        <span className="whitespace-nowrap">{note.updatedLabel}</span>
      </div>

      <Toggle
        icon="star"
        label="Yêu thích"
        pressed={note.favorite}
        iconSize={17}
        strokeWidth={1.6}
        iconFilled={note.favorite}
        tone={note.favorite ? 'med' : 'faint'}
        size={32}
        radius="8"
        className="hover:bg-surface"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(note.id);
        }}
      />
    </div>
  );
}
```

Create `src/components/shared/note-grid.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { NoteCard, type NoteItemHandlers, type NoteSummary } from './note-card';

export interface NoteGridProps extends NoteItemHandlers {
  notes: readonly NoteSummary[];
  className?: string;
}

/** grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap 16. */
export function NoteGrid({ notes, onOpen, onToggleFavorite, className }: NoteGridProps) {
  return (
    <div
      className={cn('grid gap-16', className)}
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
    >
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />
      ))}
    </div>
  );
}
```

Create `src/components/shared/note-list.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import type { NoteItemHandlers, NoteSummary } from './note-card';
import { NoteListRow } from './note-list-row';

export interface NoteListProps extends NoteItemHandlers {
  notes: readonly NoteSummary[];
  wrap?: boolean;
  className?: string;
}

export function NoteList({ notes, wrap = false, onOpen, onToggleFavorite, className }: NoteListProps) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-14 border border-line bg-surface', className)}>
      {notes.map((note, i) => (
        <NoteListRow
          key={note.id}
          note={note}
          first={i === 0}
          wrap={wrap}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Write the `NoteGrid` test (covers Review Focus #4 at the container level)**

Create `src/components/shared/note-grid.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NoteSummary } from './note-card';
import { NoteGrid } from './note-grid';
import { NoteList } from './note-list';

const make = (id: string, title: string): NoteSummary => ({
  id, title, desc: 'mô tả', priority: 'low', tags: [], favorite: false,
  updatedLabel: 'vừa xong', version: 1, imageCount: 0, commentCount: 0,
});

describe('NoteGrid / NoteList', () => {
  it('uses the auto-fill 300px grid with a 16px gap', () => {
    const { container } = render(
      <NoteGrid notes={[make('a', 'A')]} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(min(100%, 300px), 1fr))');
    expect(grid.className).toContain('gap-16');
  });

  it('renders one card per note', () => {
    render(<NoteGrid notes={[make('a', 'A'), make('b', 'B')]} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getAllByRole('button', { name: /^[AB]$/ })).toHaveLength(2);
  });

  it('renders an empty container without crashing for zero notes', () => {
    const { container } = render(<NoteGrid notes={[]} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(container.firstElementChild?.children).toHaveLength(0);
  });

  it('NoteList wraps rows in a single bordered, clipped panel', () => {
    const { container } = render(
      <NoteList notes={[make('a', 'A')]} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('rounded-14');
    expect(panel.className).toContain('overflow-hidden');
    expect(panel.className).toContain('border-line');
    expect(panel.className).toContain('bg-surface');
  });

  it('a 120-character title still truncates in the list row', () => {
    render(<NoteList notes={[make('a', 'x'.repeat(120))]} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('x'.repeat(120)).className).toContain('truncate');
  });
});
```

- [ ] **Step 7: Run the note tests**

Run: `npx vitest run src/components/shared/note-card.test.tsx src/components/shared/note-list-row.test.tsx src/components/shared/note-grid.test.tsx`
Expected: PASS (22 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): add NoteCard, NoteListRow, NoteGrid, NoteList"
```

---

### Task D16: `Prose`, `ImageThumb`, `ImageGrid`, `ImageDropzone`, `Lightbox`

**Files:**
- Create: `src/components/shared/prose.tsx`, `src/components/shared/image-thumb.tsx`, `src/components/shared/image-grid.tsx`, `src/components/shared/image-dropzone.tsx`, `src/components/shared/lightbox.tsx`
- Test: `src/components/shared/prose.test.tsx`, `src/components/shared/lightbox.test.tsx`, `src/components/shared/image-dropzone.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Z`, `Icon`, `IconButton`, `SectionLabel`.
- Produces:

```ts
export interface ProseProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'dangerouslySetInnerHTML'> {
  /** Trusted, app-generated HTML. Callers MUST sanitize before passing untrusted input. */
  html: string;
  proseRef?: React.RefObject<HTMLDivElement | null>;
}
export function Prose(props: ProseProps): JSX.Element;   // <div data-prose="1">

export interface NoteImage { id: string; label: string; src: string }   // src '' → striped placeholder

export interface ImageThumbProps {
  image: NoteImage;
  /** 'detail' = aspect 4/3, r10, caption below · 'editor' = aspect 1, r8, remove button. */
  variant?: 'detail' | 'editor';
  onOpen?: () => void;
  onRemove?: () => void;
  className?: string;
}
export function ImageThumb(props: ImageThumbProps): JSX.Element;

export interface ImageGridProps {
  images: readonly NoteImage[];
  variant?: 'detail' | 'editor';   // auto-fill minmax(160px,1fr) gap 12 | 3 cols gap 8
  onOpen?: (index: number) => void;
  onRemove?: (id: string) => void;
  className?: string;
}
export function ImageGrid(props: ImageGridProps): JSX.Element;

export interface ImageDropzoneProps {
  onFiles: (files: FileList) => void;
  className?: string;
}
export function ImageDropzone(props: ImageDropzoneProps): JSX.Element;

export interface LightboxProps {
  images: readonly NoteImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}
export function Lightbox(props: LightboxProps): JSX.Element | null;
```

- [ ] **Step 1: Write the failing `Prose` test**

Create `src/components/shared/prose.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Prose } from './prose';

describe('Prose', () => {
  it('marks itself with data-prose so the global stylesheet applies', () => {
    const { container } = render(<Prose html="<p>Xin chào</p>" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('data-prose', '1');
  });

  it('renders the supplied HTML', () => {
    render(<Prose html="<h2>Mục tiêu điều trị</h2><p>Dưới 130/80 mmHg.</p>" />);
    expect(screen.getByRole('heading', { name: 'Mục tiêu điều trị', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Dưới 130/80 mmHg.')).toBeInTheDocument();
  });

  it('keeps mark[data-hl] elements intact', () => {
    const { container } = render(<Prose html={'<p>A <mark data-hl="h1">đánh dấu</mark> B</p>'} />);
    const mark = container.querySelector('mark[data-hl="h1"]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent('đánh dấu');
  });

  it('renders an empty container for empty content', () => {
    const { container } = render(<Prose html="" />);
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('forwards extra class names and the ref', () => {
    const { container } = render(<Prose html="<p>x</p>" className="mt-28" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('mt-28');
  });
});
```

- [ ] **Step 2: Write `Prose`**

Create `src/components/shared/prose.tsx`:

```tsx
'use client';

import type { HTMLAttributes, RefObject } from 'react';
import { cn } from '@/lib/utils';

export interface ProseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'dangerouslySetInnerHTML'> {
  /**
   * Trusted, app-generated HTML (editor output or a stored version). Callers are
   * responsible for sanitizing anything that did not come from this app.
   */
  html: string;
  proseRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Read-only prose surface. All typography comes from the global `[data-prose]`
 * rules in globals.css and scales with `--fs` (14–22).
 */
export function Prose({ html, proseRef, className, ...rest }: ProseProps) {
  return (
    <div
      ref={proseRef}
      data-prose="1"
      className={cn(className)}
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
    />
  );
}
```

- [ ] **Step 3: Write `ImageThumb` and `ImageGrid`**

Create `src/components/shared/image-thumb.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';

export interface NoteImage {
  id: string;
  label: string;
  /** Empty string renders the 135° striped placeholder from the prototype. */
  src: string;
}

const STRIPE_DETAIL =
  'repeating-linear-gradient(135deg, var(--surface2) 0 10px, var(--bg) 10px 20px)';
const STRIPE_EDITOR =
  'repeating-linear-gradient(135deg, var(--surface2) 0 8px, var(--bg) 8px 16px)';

export interface ImageThumbProps {
  image: NoteImage;
  variant?: 'detail' | 'editor';
  onOpen?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function ImageThumb({ image, variant = 'detail', onOpen, onRemove, className }: ImageThumbProps) {
  if (variant === 'editor') {
    return (
      <div
        className={cn('relative aspect-square overflow-hidden rounded-8 border border-line', className)}
        style={{ background: STRIPE_EDITOR }}
      >
        {image.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt={image.label} className="block h-full w-full object-cover" />
        ) : null}
        {onRemove ? (
          <IconButton
            icon="close"
            label={`Gỡ ảnh ${image.label}`}
            variant="overlay"
            size={22}
            radius="6"
            iconSize={10}
            strokeWidth={2.6}
            onClick={onRemove}
            className="absolute right-4 top-4"
          />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Mở ảnh ${image.label}`}
      className={cn('flex cursor-zoom-in flex-col gap-8 border-0 bg-transparent p-0 text-left', className)}
    >
      <span
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-10 border border-line"
        style={{ background: STRIPE_DETAIL }}
      >
        {image.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt={image.label} className="block h-full w-full object-cover" />
        ) : (
          <span className="font-mono text-11 text-faint">hình ảnh</span>
        )}
      </span>
      <span className="truncate text-12 text-muted">{image.label}</span>
    </button>
  );
}
```

Create `src/components/shared/image-grid.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { ImageThumb, type NoteImage } from './image-thumb';

export interface ImageGridProps {
  images: readonly NoteImage[];
  /** detail: auto-fill minmax(160px, 1fr) gap 12 · editor: 3 fixed columns gap 8. */
  variant?: 'detail' | 'editor';
  onOpen?: (index: number) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

export function ImageGrid({ images, variant = 'detail', onOpen, onRemove, className }: ImageGridProps) {
  if (images.length === 0) return null;
  return (
    <div
      className={cn('grid', variant === 'detail' ? 'gap-12' : 'gap-8', className)}
      style={{
        gridTemplateColumns:
          variant === 'detail' ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(3, minmax(0, 1fr))',
      }}
    >
      {images.map((image, i) => (
        <ImageThumb
          key={image.id}
          image={image}
          variant={variant}
          onOpen={onOpen ? () => onOpen(i) : undefined}
          onRemove={onRemove ? () => onRemove(image.id) : undefined}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing `ImageDropzone` test and the component**

Create `src/components/shared/image-dropzone.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageDropzone } from './image-dropzone';

function fileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
}

describe('ImageDropzone', () => {
  it('shows the two-line Vietnamese copy', () => {
    render(<ImageDropzone onFiles={() => {}} />);
    expect(screen.getByText(/Kéo thả ảnh vào đây/)).toBeInTheDocument();
    expect(screen.getByText('hoặc chọn từ máy')).toBeInTheDocument();
  });

  it('uses the dashed line2 frame at rest', () => {
    render(<ImageDropzone onFiles={() => {}} />);
    const zone = screen.getByRole('button', { name: /Kéo thả ảnh vào đây/ });
    expect(zone.className).toContain('border-dashed');
    expect(zone.className).toContain('border-line2');
    expect(zone.className).toContain('rounded-10');
    expect(zone.className).toContain('py-20');
    expect(zone.className).toContain('px-16');
  });

  it('switches to accent border and accent-soft fill while dragging', () => {
    render(<ImageDropzone onFiles={() => {}} />);
    const zone = screen.getByRole('button', { name: /Kéo thả ảnh vào đây/ });
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('border-accent');
    expect(zone.className).toContain('bg-accent-soft');
    fireEvent.dragLeave(zone);
    expect(zone.className).toContain('border-line2');
  });

  it('emits dropped files and resets the drag state', () => {
    const onFiles = vi.fn();
    render(<ImageDropzone onFiles={onFiles} />);
    const zone = screen.getByRole('button', { name: /Kéo thả ảnh vào đây/ });
    const files = fileList([new File(['x'], 'a.png', { type: 'image/png' })]);
    fireEvent.drop(zone, { dataTransfer: { files } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(zone.className).toContain('border-line2');
  });

  it('accepts multiple images through the hidden file input', () => {
    const onFiles = vi.fn();
    const { container } = render(<ImageDropzone onFiles={onFiles} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, { target: { files: fileList([new File(['x'], 'b.png', { type: 'image/png' })]) } });
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/components/shared/image-dropzone.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ImageDropzoneProps {
  onFiles: (files: FileList) => void;
  className?: string;
}

/** py-20 px-16 · 1px dashed --line2 → --accent while dragging · r10 · 13px muted. */
export function ImageDropzone({ onFiles, className }: ImageDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Kéo thả ảnh vào đây hoặc chọn từ máy"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
        }}
        className={cn(
          'cursor-pointer rounded-10 border border-dashed py-20 px-16 text-center text-13 leading-[1.5] text-muted',
          dragOver ? 'border-accent bg-accent-soft' : 'border-line2 bg-transparent',
          className,
        )}
      >
        Kéo thả ảnh vào đây
        <br />
        <span className="font-medium text-accent">hoặc chọn từ máy</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
```

- [ ] **Step 5: Write the failing `Lightbox` test**

Create `src/components/shared/lightbox.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Lightbox } from './lightbox';

const IMAGES = [
  { id: 'i1', label: 'ECG mẫu', src: 'blob:a' },
  { id: 'i2', label: 'X-quang', src: '' },
];

describe('Lightbox', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(<Lightbox images={[]} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('covers the viewport with the fixed 88% scrim at z100', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Xem ảnh' });
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('bg-[rgba(8,9,10,.88)]');
    expect(dialog.style.zIndex).toBe('100');
  });

  it('shows the label and a mono "i / n" position', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByText('ECG mẫu')).toBeInTheDocument();
    expect(screen.getByText('1 / 2').className).toContain('font-mono');
  });

  it('falls back to a striped placeholder when src is empty', () => {
    render(<Lightbox images={IMAGES} index={1} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByText('hình ảnh · X-quang')).toBeInTheDocument();
  });

  it('hides the arrows for a single image', () => {
    render(<Lightbox images={[IMAGES[0]!]} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Ảnh trước' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ảnh sau' })).toBeNull();
  });

  it('steps with the arrow buttons and wraps around', async () => {
    const onIndexChange = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={onIndexChange} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('steps with ArrowLeft/ArrowRight and closes on Escape', async () => {
    const onIndexChange = vi.fn();
    const onClose = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={onIndexChange} onClose={onClose} />);
    await userEvent.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the scrim but not on the image', async () => {
    const onClose = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByAltText('ECG mẫu'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog', { name: 'Xem ảnh' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Write `Lightbox`**

Create `src/components/shared/lightbox.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { Z } from '@/lib/z';
import { IconButton } from '@/components/ui/icon-button';
import type { NoteImage } from './image-thumb';

export interface LightboxProps {
  images: readonly NoteImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** fixed inset-0 · rgba(8,9,10,.88) · z100 · image max 92vw × 78vh r8 · close 40 r10. */
export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const total = images.length;
  const current = images[index];

  useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onIndexChange((index - 1 + total) % total);
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % total);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, total, onClose, onIndexChange]);

  if (total === 0 || !current) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      onClick={onClose}
      className="fixed inset-0 flex flex-col items-center justify-center gap-16 bg-[rgba(8,9,10,.88)] p-24"
      style={{ zIndex: Z.lightbox }}
    >
      <IconButton
        icon="close"
        label="Đóng"
        variant="lightbox"
        size={40}
        radius="10"
        iconSize={18}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute right-16 top-16"
      />

      {current.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.src}
          alt={current.label}
          onClick={stop}
          className="block max-h-[78vh] max-w-[92vw] rounded-8"
        />
      ) : (
        <div
          onClick={stop}
          className="flex aspect-[4/3] max-h-[74vh] w-[min(80vw,900px)] items-center justify-center rounded-10 font-mono text-13 text-[#7c8388]"
          style={{ background: 'repeating-linear-gradient(135deg, #1c1f21 0 14px, #232729 14px 28px)' }}
        >
          {`hình ảnh · ${current.label}`}
        </div>
      )}

      <div onClick={stop} className="flex items-center gap-16 text-14 text-[#e6e7e5]">
        {total > 1 ? (
          <IconButton
            icon="chevron-left"
            label="Ảnh trước"
            variant="lightbox"
            size={36}
            radius="9"
            iconSize={16}
            onClick={() => onIndexChange((index - 1 + total) % total)}
          />
        ) : null}
        <span>
          {current.label}
          <span className="ml-6 font-mono text-12 text-[#8a9095]">{`${index + 1} / ${total}`}</span>
        </span>
        {total > 1 ? (
          <IconButton
            icon="chevron-right"
            label="Ảnh sau"
            variant="lightbox"
            size={36}
            radius="9"
            iconSize={16}
            onClick={() => onIndexChange((index + 1) % total)}
          />
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the media tests**

Run: `npx vitest run src/components/shared/prose.test.tsx src/components/shared/image-dropzone.test.tsx src/components/shared/lightbox.test.tsx`
Expected: PASS (18 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): add Prose, ImageThumb, ImageGrid, ImageDropzone and Lightbox"
```

---

### Task D17: `EditorToolbar`, `RichTextEditor`, `TagInput`, `TagSuggestions`

**Files:**
- Create: `src/components/shared/editor-toolbar.tsx`, `src/components/shared/rich-text-editor.tsx`, `src/components/shared/tag-input.tsx`, `src/components/shared/tag-suggestions.tsx`
- Test: `src/components/shared/editor-toolbar.test.tsx`, `src/components/shared/rich-text-editor.test.tsx`, `src/components/shared/tag-input.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Z`, `Icon`, `TagChip`.
- Produces:

```ts
// editor-toolbar.tsx
export type EditorCommand =
  | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'formatBlock'
  | 'insertUnorderedList' | 'insertOrderedList' | 'insertHorizontalRule' | 'undo' | 'redo';

export interface EditorTool {
  label: string;               // typographic glyph, never an emoji
  title: string;               // Vietnamese tooltip
  command: EditorCommand;
  value?: string;              // e.g. '<h2>'
  fontWeight?: 500 | 700;
  italic?: boolean;
  textDecoration?: 'underline' | 'line-through';
  serif?: boolean;
}
export const EDITOR_TOOL_GROUPS: readonly (readonly EditorTool[])[];   // 4 groups, exact prototype order
export interface EditorToolbarProps {
  onCommand: (command: EditorCommand, value?: string) => void;
  onPickImage: () => void;
  className?: string;
}
export function EditorToolbar(props: EditorToolbarProps): JSX.Element;

// rich-text-editor.tsx
export interface RichTextEditorHandle {
  getHtml(): string;
  setHtml(html: string): void;
  focus(): void;
  insertImageAtCursor(src: string, alt: string): void;
  exec(command: EditorCommand, value?: string): void;
}
export interface RichTextEditorProps {
  initialHtml: string;
  placeholder?: string;        // default 'Bắt đầu ghi chép…'
  onChange?: (html: string) => void;
  onPickImage: () => void;
  isMobile?: boolean;          // padding 32/40 (desktop) vs 20/18 (mobile)
  className?: string;
}
export const RichTextEditor: React.ForwardRefExoticComponent<
  RichTextEditorProps & React.RefAttributes<RichTextEditorHandle>
>;

// tag-input.tsx
export interface TagInputProps {
  tags: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  onAdd: (tag: string) => void;      // fired for Enter and for a trailing ','
  onRemove: (tag: string) => void;
  onRemoveLast: () => void;          // Backspace on an empty field
  placeholder?: string;              // default 'Thêm thẻ…'
  className?: string;
}
export function TagInput(props: TagInputProps): JSX.Element;

// tag-suggestions.tsx
export const MAX_TAG_SUGGESTIONS = 6;
export interface TagSuggestionsProps { tags: readonly string[]; onAdd: (tag: string) => void; className?: string }
export function TagSuggestions(props: TagSuggestionsProps): JSX.Element | null;
```

- [ ] **Step 1: Write the failing `EditorToolbar` test**

Create `src/components/shared/editor-toolbar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EDITOR_TOOL_GROUPS, EditorToolbar } from './editor-toolbar';

describe('EditorToolbar', () => {
  it('has the four prototype groups in order', () => {
    expect(EDITOR_TOOL_GROUPS.map((g) => g.map((t) => t.label))).toEqual([
      ['B', 'I', 'U', 'S'],
      ['H2', 'H3', '¶'],
      ['•', '1.', '❝', '—'],
      ['↶', '↷'],
    ]);
  });

  it('uses typographic glyphs, never emoji', () => {
    const labels = EDITOR_TOOL_GROUPS.flat().map((t) => t.label).join('');
    expect(/\p{Extended_Pictographic}/u.test(labels)).toBe(false);
  });

  it('is sticky beneath the 64px header at z5', () => {
    const { container } = render(<EditorToolbar onCommand={() => {}} onPickImage={() => {}} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('top-64');
    expect(bar.style.zIndex).toBe('5');
    expect(bar.className).toContain('gap-6');
    expect(bar.className).toContain('py-8');
    expect(bar.className).toContain('px-10');
  });

  it('renders 32px tools with a 7px radius', () => {
    render(<EditorToolbar onCommand={() => {}} onPickImage={() => {}} />);
    const bold = screen.getByRole('button', { name: 'Đậm' });
    expect(bold.className).toContain('h-32');
    expect(bold.className).toContain('min-w-32');
    expect(bold.className).toContain('rounded-7');
  });

  it('emits the command on mousedown, not click, and prevents the default', () => {
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} onPickImage={() => {}} />);
    const h2 = screen.getByRole('button', { name: 'Tiêu đề lớn' });
    const event = fireEvent.mouseDown(h2);
    expect(onCommand).toHaveBeenCalledWith('formatBlock', '<h2>');
    expect(event).toBe(false); // preventDefault() was called — the selection survives
  });

  it('emits simple commands without a value', () => {
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} onPickImage={() => {}} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(onCommand).toHaveBeenCalledWith('undo', undefined);
  });

  it('offers the image button', async () => {
    const onPickImage = vi.fn();
    render(<EditorToolbar onCommand={() => {}} onPickImage={onPickImage} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' }));
    expect(onPickImage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write `EditorToolbar`**

Create `src/components/shared/editor-toolbar.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';

export type EditorCommand =
  | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'formatBlock'
  | 'insertUnorderedList' | 'insertOrderedList' | 'insertHorizontalRule' | 'undo' | 'redo';

export interface EditorTool {
  label: string;
  title: string;
  command: EditorCommand;
  value?: string;
  fontWeight?: 500 | 700;
  italic?: boolean;
  textDecoration?: 'underline' | 'line-through';
  serif?: boolean;
}

/** Exactly the prototype's four groups. All labels are typographic glyphs, not emoji. */
export const EDITOR_TOOL_GROUPS: readonly (readonly EditorTool[])[] = [
  [
    { label: 'B', title: 'Đậm', command: 'bold', fontWeight: 700, serif: true },
    { label: 'I', title: 'Nghiêng', command: 'italic', italic: true, serif: true },
    { label: 'U', title: 'Gạch chân', command: 'underline', textDecoration: 'underline', serif: true },
    { label: 'S', title: 'Gạch ngang', command: 'strikeThrough', textDecoration: 'line-through', serif: true },
  ],
  [
    { label: 'H2', title: 'Tiêu đề lớn', command: 'formatBlock', value: '<h2>' },
    { label: 'H3', title: 'Tiêu đề nhỏ', command: 'formatBlock', value: '<h3>' },
    { label: '¶', title: 'Đoạn văn', command: 'formatBlock', value: '<p>' },
  ],
  [
    { label: '•', title: 'Danh sách', command: 'insertUnorderedList', fontWeight: 700 },
    { label: '1.', title: 'Danh sách số', command: 'insertOrderedList' },
    { label: '❝', title: 'Trích dẫn', command: 'formatBlock', value: '<blockquote>', serif: true },
    { label: '—', title: 'Đường kẻ', command: 'insertHorizontalRule' },
  ],
  [
    { label: '↶', title: 'Hoàn tác', command: 'undo' },
    { label: '↷', title: 'Làm lại', command: 'redo' },
  ],
];

export interface EditorToolbarProps {
  onCommand: (command: EditorCommand, value?: string) => void;
  onPickImage: () => void;
  className?: string;
}

/** sticky top 64 · z5 · gap 6 · py 8 px 10 · border-bottom --line · r 14 14 0 0. */
export function EditorToolbar({ onCommand, onPickImage, className }: EditorToolbarProps) {
  return (
    <div
      className={cn(
        'sticky top-64 flex flex-wrap items-center gap-6 rounded-t-14 border-b border-line bg-surface py-8 px-10',
        className,
      )}
      style={{ zIndex: Z.toolbar }}
    >
      {EDITOR_TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="flex gap-2 border-r border-line pr-6">
          {group.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              // onMouseDown + preventDefault keeps the editor selection alive.
              onMouseDown={(e) => {
                e.preventDefault();
                onCommand(tool.command, tool.value);
              }}
              className={cn(
                'h-32 min-w-32 rounded-7 border-0 bg-transparent px-6 text-14 text-text hover:bg-surface2',
                tool.serif ? 'font-serif' : 'font-sans',
                tool.fontWeight === 700 ? 'font-bold' : 'font-medium',
                tool.italic && 'italic',
                tool.textDecoration === 'underline' && 'underline',
                tool.textDecoration === 'line-through' && 'line-through',
              )}
            >
              {tool.label}
            </button>
          ))}
        </div>
      ))}

      <button
        type="button"
        title="Chèn ảnh vào nội dung"
        aria-label="Chèn ảnh vào nội dung"
        onMouseDown={(e) => {
          e.preventDefault();
          onPickImage();
        }}
        className="flex h-32 items-center gap-6 rounded-7 border-0 bg-transparent px-10 text-13 text-text hover:bg-surface2"
      >
        <Icon name="image" size={16} />
        Ảnh
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing `RichTextEditor` test**

Create `src/components/shared/rich-text-editor.test.tsx`:

```tsx
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditor, type RichTextEditorHandle } from './rich-text-editor';

describe('RichTextEditor', () => {
  it('renders a contenteditable prose surface with the placeholder attribute', () => {
    const { container } = render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface).toHaveAttribute('contenteditable', 'true');
    expect(surface).toHaveAttribute('data-ph', 'Bắt đầu ghi chép…');
  });

  it('seeds the initial HTML exactly once', () => {
    const { container, rerender } = render(<RichTextEditor initialHtml="<p>Ban đầu</p>" onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface.innerHTML).toBe('<p>Ban đầu</p>');
    rerender(<RichTextEditor initialHtml="<p>Khác</p>" onPickImage={() => {}} />);
    expect(surface.innerHTML).toBe('<p>Ban đầu</p>');
  });

  it('uses 460px min-height and 32/40 padding on desktop, 20/18 on mobile', () => {
    const { container, rerender } = render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    let surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface.className).toContain('min-h-460');
    expect(surface.className).toContain('py-32');
    expect(surface.className).toContain('px-40');
    rerender(<RichTextEditor initialHtml="" onPickImage={() => {}} isMobile />);
    surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface.className).toContain('py-20');
    expect(surface.className).toContain('px-18');
  });

  it('wraps the toolbar and the surface in the 14px editor panel', () => {
    const { container } = render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('rounded-14');
    expect(panel.className).toContain('border-line');
    expect(panel.className).toContain('bg-surface');
  });

  it('exposes getHtml/setHtml through the imperative handle', () => {
    const ref = createRef<RichTextEditorHandle>();
    render(<RichTextEditor ref={ref} initialHtml="<p>A</p>" onPickImage={() => {}} />);
    expect(ref.current?.getHtml()).toBe('<p>A</p>');
    ref.current?.setHtml('<p>B</p>');
    expect(ref.current?.getHtml()).toBe('<p>B</p>');
  });

  it('reports edits through onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<RichTextEditor initialHtml="" onChange={onChange} onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;
    surface.innerHTML = '<p>Mới</p>';
    fireEvent.input(surface);
    expect(onChange).toHaveBeenCalledWith('<p>Mới</p>');
  });

  it('routes toolbar commands to document.execCommand', () => {
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
    render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Đậm' }));
    expect(exec).toHaveBeenCalledWith('bold', false, undefined);
  });

  it('relays the toolbar image button', () => {
    const onPickImage = vi.fn();
    render(<RichTextEditor initialHtml="" onPickImage={onPickImage} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' }));
    expect(onPickImage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Write `RichTextEditor`**

Create `src/components/shared/rich-text-editor.tsx`:

```tsx
'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';
import { EditorToolbar, type EditorCommand } from './editor-toolbar';

export const EDITOR_PLACEHOLDER = 'Bắt đầu ghi chép…';

export interface RichTextEditorHandle {
  getHtml(): string;
  setHtml(html: string): void;
  focus(): void;
  insertImageAtCursor(src: string, alt: string): void;
  exec(command: EditorCommand, value?: string): void;
}

export interface RichTextEditorProps {
  initialHtml: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onPickImage: () => void;
  isMobile?: boolean;
  className?: string;
}

/**
 * contentEditable + execCommand, exactly as in the prototype. The caret position
 * is remembered on keyup/mouseup/blur so an image can be inserted where the user
 * last was, even after the toolbar takes a click.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { initialHtml, placeholder = EDITOR_PLACEHOLDER, onChange, onPickImage, isMobile = false, className },
  ref,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !surfaceRef.current) return;
    surfaceRef.current.innerHTML = initialHtml;
    seeded.current = true;
  }, [initialHtml]);

  const saveRange = useCallback(() => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (sel && sel.rangeCount > 0 && node && surfaceRef.current?.contains(node)) {
      rangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const emit = useCallback(() => {
    onChange?.(surfaceRef.current?.innerHTML ?? '');
  }, [onChange]);

  const exec = useCallback(
    (command: EditorCommand, value?: string) => {
      surfaceRef.current?.focus();
      if (rangeRef.current) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(rangeRef.current);
      }
      document.execCommand(command, false, value);
      emit();
    },
    [emit],
  );

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => surfaceRef.current?.innerHTML ?? '',
      setHtml: (html: string) => {
        if (surfaceRef.current) {
          surfaceRef.current.innerHTML = html;
          emit();
        }
      },
      focus: () => surfaceRef.current?.focus(),
      insertImageAtCursor: (src: string, alt: string) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        const range = rangeRef.current;
        if (range) {
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
        } else {
          surfaceRef.current?.appendChild(img);
        }
        emit();
      },
      exec,
    }),
    [emit, exec],
  );

  return (
    <div className={cn('rounded-14 border border-line bg-surface', className)}>
      <EditorToolbar onCommand={exec} onPickImage={onPickImage} />
      <div
        ref={surfaceRef}
        data-prose="1"
        data-ph={placeholder}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung ghi chú"
        onInput={emit}
        onKeyUp={saveRange}
        onMouseUp={saveRange}
        onBlur={saveRange}
        className={cn('min-h-460', isMobile ? 'py-20 px-18' : 'py-32 px-40')}
      />
    </div>
  );
});
```

- [ ] **Step 5: Write the failing `TagInput` test**

Create `src/components/shared/tag-input.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagInput } from './tag-input';
import { MAX_TAG_SUGGESTIONS, TagSuggestions } from './tag-suggestions';

function renderInput(overrides: Partial<React.ComponentProps<typeof TagInput>> = {}) {
  const props: React.ComponentProps<typeof TagInput> = {
    tags: ['Tim mạch'],
    value: '',
    onValueChange: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onRemoveLast: vi.fn(),
    ...overrides,
  };
  render(<TagInput {...props} />);
  return props;
}

describe('TagInput', () => {
  it('uses the 44px-minimum bordered field with 8px padding', () => {
    const { container } = render(
      <TagInput tags={[]} value="" onValueChange={() => {}} onAdd={() => {}} onRemove={() => {}} onRemoveLast={() => {}} />,
    );
    const field = container.firstElementChild as HTMLElement;
    expect(field.className).toContain('min-h-44');
    expect(field.className).toContain('p-8');
    expect(field.className).toContain('gap-6');
    expect(field.className).toContain('rounded-10');
    expect(field.className).toContain('border-line');
  });

  it('renders each tag as an accent-soft chip with a remove button', async () => {
    const onRemove = vi.fn();
    renderInput({ onRemove });
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ thẻ Tim mạch' }));
    expect(onRemove).toHaveBeenCalledWith('Tim mạch');
  });

  it('adds on Enter', async () => {
    const onAdd = vi.fn();
    renderInput({ value: 'Nội tiết', onAdd });
    screen.getByPlaceholderText('Thêm thẻ…').focus();
    await userEvent.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Nội tiết');
  });

  it('adds when the value ends with a comma', async () => {
    const onAdd = vi.fn();
    const onValueChange = vi.fn();
    renderInput({ value: 'Nội tiết', onAdd, onValueChange });
    await userEvent.type(screen.getByPlaceholderText('Thêm thẻ…'), ',');
    expect(onAdd).toHaveBeenCalledWith('Nội tiết,');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace in an empty field', async () => {
    const onRemoveLast = vi.fn();
    renderInput({ value: '', onRemoveLast });
    screen.getByPlaceholderText('Thêm thẻ…').focus();
    await userEvent.keyboard('{Backspace}');
    expect(onRemoveLast).toHaveBeenCalledTimes(1);
  });

  it('does not remove the last tag when the field has text', async () => {
    const onRemoveLast = vi.fn();
    renderInput({ value: 'Nội', onRemoveLast });
    screen.getByPlaceholderText('Thêm thẻ…').focus();
    await userEvent.keyboard('{Backspace}');
    expect(onRemoveLast).not.toHaveBeenCalled();
  });
});

describe('TagSuggestions', () => {
  it('caps the list at six', () => {
    expect(MAX_TAG_SUGGESTIONS).toBe(6);
  });

  it('renders nothing when empty', () => {
    const { container } = render(<TagSuggestions tags={[]} onAdd={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prefixes each suggestion with a plus and adds it', async () => {
    const onAdd = vi.fn();
    render(<TagSuggestions tags={['Hô hấp']} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Hô hấp' }));
    expect(onAdd).toHaveBeenCalledWith('Hô hấp');
  });

  it('never renders more than six chips', () => {
    render(<TagSuggestions tags={['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']} onAdd={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });
});
```

- [ ] **Step 6: Write `TagInput` and `TagSuggestions`**

Create `src/components/shared/tag-input.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { TagChip } from './tag-chip';

export interface TagInputProps {
  tags: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onRemoveLast: () => void;
  placeholder?: string;
  className?: string;
}

/** min-h 44 · p 8 · gap 6 · r10 · 1px --line · --surface. Enter or "," adds; Backspace pops. */
export function TagInput({
  tags, value, onValueChange, onAdd, onRemove, onRemoveLast, placeholder = 'Thêm thẻ…', className,
}: TagInputProps) {
  return (
    <div
      className={cn(
        'flex min-h-44 flex-wrap items-center gap-6 rounded-10 border border-line bg-surface p-8',
        className,
      )}
    >
      {tags.map((tag) => (
        <TagChip key={tag} name={tag} tone="soft" onRemove={() => onRemove(tag)} />
      ))}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label="Thêm thẻ"
        onChange={(e) => {
          const next = e.target.value;
          if (next.endsWith(',')) onAdd(next);
          else onValueChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd(value);
          } else if (e.key === 'Backspace' && value === '' && tags.length > 0) {
            onRemoveLast();
          }
        }}
        className="h-26 min-w-90 flex-1 border-0 bg-transparent text-13 text-text outline-none placeholder:text-faint"
      />
    </div>
  );
}
```

Create `src/components/shared/tag-suggestions.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { TagChip } from './tag-chip';

export const MAX_TAG_SUGGESTIONS = 6;

export interface TagSuggestionsProps {
  tags: readonly string[];
  onAdd: (tag: string) => void;
  className?: string;
}

/** Dashed 26px chips, "+ Tên", max six — exactly the prototype's `suggest` list. */
export function TagSuggestions({ tags, onAdd, className }: TagSuggestionsProps) {
  const shown = tags.slice(0, MAX_TAG_SUGGESTIONS);
  if (shown.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-6', className)}>
      {shown.map((tag) => (
        <TagChip key={tag} name={`+ ${tag}`} tone="dashed" onClick={() => onAdd(tag)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Run the editor tests**

Run: `npx vitest run src/components/shared/editor-toolbar.test.tsx src/components/shared/rich-text-editor.test.tsx src/components/shared/tag-input.test.tsx`
Expected: PASS (25 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): add EditorToolbar, RichTextEditor, TagInput and TagSuggestions"
```

---

### Task D18: Detail-page composites — comments, versions, banners, highlights, quiz history

**Files:**
- Create: `src/components/shared/comment-list.tsx`, `src/components/shared/comment-composer.tsx`, `src/components/shared/version-timeline.tsx`, `src/components/shared/version-banner.tsx`, `src/components/shared/delete-confirm-banner.tsx`, `src/components/shared/quiz-history-list.tsx`, `src/components/shared/highlight-popup.tsx`, `src/components/shared/highlight-list.tsx`
- Test: `src/components/shared/comment-composer.test.tsx`, `src/components/shared/version-timeline.test.tsx`, `src/components/shared/banners.test.tsx`, `src/components/shared/highlight-popup.test.tsx`, `src/components/shared/quiz-history-list.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Z`, `Icon`, `IconButton`, `Button`, `Avatar`, `Badge`, `Textarea`.
- Produces:

```ts
export interface CommentItem { id: string; text: string; dateLabel: string }
export interface CommentListProps {
  comments: readonly CommentItem[];
  authorName: string;
  onRemove: (id: string) => void;
  className?: string;
}
export function CommentList(props: CommentListProps): JSX.Element;

export interface CommentComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  className?: string;
}
export function CommentComposer(props: CommentComposerProps): JSX.Element;

export interface VersionItem { v: number; note: string; dateLabel: string; current: boolean }
export interface VersionTimelineProps {
  versions: readonly VersionItem[];   // newest first
  selected: number;
  onSelect: (v: number) => void;
  className?: string;
}
export function VersionTimeline(props: VersionTimelineProps): JSX.Element;

export interface VersionBannerProps {
  versionLabel: string;   // 'v2'
  dateLabel: string;      // 'dd/mm/yyyy · ghi chú'
  onBackToCurrent: () => void;
  onRestore: () => void;
  className?: string;
}
export function VersionBanner(props: VersionBannerProps): JSX.Element;

export interface DeleteConfirmBannerProps {
  message?: string;       // default 'Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?'
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}
export function DeleteConfirmBanner(props: DeleteConfirmBannerProps): JSX.Element;

export interface QuizHistoryEntry { id: string; score: number; total: number; dateLabel: string }
export interface QuizHistoryListProps {
  entries: readonly QuizHistoryEntry[];
  onOpen: (id: string) => void;
  className?: string;
}
export function QuizHistoryList(props: QuizHistoryListProps): JSX.Element;
export function scoreToneClass(pct: number): string;   // ≥80 bg-ok · ≥50 bg-med · else bg-hi

export interface HighlightPopupProps {
  mode: 'add' | 'remove';
  x: number;               // viewport px, pre-clamp
  y: number;
  viewportWidth: number;
  onAction: () => void;
}
export function HighlightPopup(props: HighlightPopupProps): JSX.Element;
export function clampHighlightPosition(x: number, y: number, viewportWidth: number): { x: number; y: number };

export interface HighlightItem { id: string; text: string }
export interface HighlightListProps {
  highlights: readonly HighlightItem[];
  onRemove: (id: string) => void;
  className?: string;
}
export function HighlightList(props: HighlightListProps): JSX.Element;
```

- [ ] **Step 1: Write `CommentList` and `CommentComposer`**

Create `src/components/shared/comment-list.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';

export interface CommentItem {
  id: string;
  text: string;
  dateLabel: string;
}

export interface CommentListProps {
  comments: readonly CommentItem[];
  authorName: string;
  onRemove: (id: string) => void;
  className?: string;
}

/** Avatar 30 · gap 12 · meta 12 faint with a 13/500 name · body 15/1.6 pre-wrap. */
export function CommentList({ comments, authorName, onRemove, className }: CommentListProps) {
  return (
    <div className={cn('flex flex-col gap-20', className)}>
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-12">
          <Avatar name={authorName} size={30} />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex items-center gap-8 text-12 text-faint">
              <span className="text-13 font-medium text-text">{authorName}</span>
              <span>{comment.dateLabel}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => onRemove(comment.id)}
                aria-label={`Xoá bình luận ${comment.dateLabel}`}
                className="border-0 bg-transparent p-0 text-12 text-faint hover:text-hi"
              >
                Xoá
              </button>
            </div>
            <div className="whitespace-pre-wrap break-words text-15 leading-[1.6]">{comment.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Create `src/components/shared/comment-composer.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const COMMENT_PLACEHOLDER = 'Thêm bình luận, kinh nghiệm thực tế, ca bệnh liên quan…';

export interface CommentComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  className?: string;
}

/** p 12 · gap 10 · r12 · 1px --line · --surface. ⌘/Ctrl + Enter submits. */
export function CommentComposer({ value, onValueChange, onSubmit, className }: CommentComposerProps) {
  const canSubmit = value.trim().length > 0;
  return (
    <div className={cn('flex flex-col gap-10 rounded-12 border border-line bg-surface p-12', className)}>
      <Textarea
        tone="comment"
        value={value}
        placeholder={COMMENT_PLACEHOLDER}
        aria-label="Thêm bình luận"
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-12 text-faint">⌘/Ctrl + Enter để gửi</span>
        <Button
          variant="primary"
          size="32"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(!canSubmit && 'opacity-40')}
        >
          Gửi
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the `CommentComposer` test**

Create `src/components/shared/comment-composer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COMMENT_PLACEHOLDER, CommentComposer } from './comment-composer';

describe('CommentComposer', () => {
  it('uses the prototype placeholder and hint', () => {
    render(<CommentComposer value="" onValueChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByPlaceholderText(COMMENT_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText('⌘/Ctrl + Enter để gửi')).toBeInTheDocument();
  });

  it('dims and disables Gửi while the draft is blank', () => {
    render(<CommentComposer value="   " onValueChange={() => {}} onSubmit={() => {}} />);
    const submit = screen.getByRole('button', { name: 'Gửi' });
    expect(submit).toBeDisabled();
    expect(submit.className).toContain('opacity-40');
  });

  it('submits on click when there is text', async () => {
    const onSubmit = vi.fn();
    render(<CommentComposer value="Ghi chú hay" onValueChange={() => {}} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits on Ctrl+Enter but not on plain Enter', async () => {
    const onSubmit = vi.fn();
    render(<CommentComposer value="Ghi chú hay" onValueChange={() => {}} onSubmit={onSubmit} />);
    const box = screen.getByPlaceholderText(COMMENT_PLACEHOLDER);
    box.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Write `VersionTimeline`, `VersionBanner`, `DeleteConfirmBanner`**

Create `src/components/shared/version-timeline.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

export interface VersionItem {
  v: number;
  note: string;
  dateLabel: string;
  current: boolean;
}

export interface VersionTimelineProps {
  /** Newest first. */
  versions: readonly VersionItem[];
  selected: number;
  onSelect: (v: number) => void;
  className?: string;
}

/** Item p 10/10/10/8 r10 · dot 9 with a 2px ring · 13/500 label · 12 faint date. */
export function VersionTimeline({ versions, selected, onSelect, className }: VersionTimelineProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {versions.map((item) => {
        const on = item.v === selected;
        return (
          <button
            key={item.v}
            type="button"
            onClick={() => onSelect(item.v)}
            aria-current={on ? 'true' : undefined}
            className={cn(
              'flex items-start gap-12 rounded-10 border-0 py-10 pr-10 pl-8 text-left hover:bg-surface2',
              on ? 'bg-surface2' : 'bg-transparent',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-6 h-9 w-9 shrink-0 rounded-circle border-2',
                on ? 'border-accent bg-accent' : 'border-line2 bg-surface',
              )}
            />
            <span className="flex min-w-0 flex-col gap-2">
              <span className="text-13 font-medium text-text">
                <span className="font-mono">{`v${item.v}`}</span>
                {` · ${item.note}`}
              </span>
              <span className="text-12 text-faint">
                {item.dateLabel}
                {item.current ? ' · hiện tại' : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

Create `src/components/shared/version-banner.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

export interface VersionBannerProps {
  versionLabel: string;
  dateLabel: string;
  onBackToCurrent: () => void;
  onRestore: () => void;
  className?: string;
}

/** py 12 px 16 · r12 · --med-soft / --med · 14px · clock icon 16. */
export function VersionBanner({ versionLabel, dateLabel, onBackToCurrent, onRestore, className }: VersionBannerProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-wrap items-center gap-12 rounded-12 bg-med-soft py-12 px-16 text-14 text-med', className)}
    >
      <Icon name="history" size={16} />
      <span className="min-w-160 flex-1">
        {'Đang xem '}
        <b className="font-mono">{versionLabel}</b>
        {` — ${dateLabel}`}
      </span>
      <Button variant="warnGhost" size="32" radius="8" onClick={onBackToCurrent} className="px-12">
        Về bản hiện tại
      </Button>
      <Button variant="warn" size="32" radius="8" onClick={onRestore} className="px-12">
        Khôi phục bản này
      </Button>
    </div>
  );
}
```

Create `src/components/shared/delete-confirm-banner.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const DELETE_CONFIRM_MESSAGE = 'Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?';

export interface DeleteConfirmBannerProps {
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}

/** py 14 px 16 · r12 · --hi-soft / --hi · inline confirmation, never a system dialog. */
export function DeleteConfirmBanner({
  message = DELETE_CONFIRM_MESSAGE, onCancel, onConfirm, className,
}: DeleteConfirmBannerProps) {
  return (
    <div
      role="alertdialog"
      aria-label={message}
      className={cn('flex flex-wrap items-center gap-12 rounded-12 bg-hi-soft py-14 px-16 text-14 text-hi', className)}
    >
      <span className="flex-1">{message}</span>
      <Button variant="dangerGhost" size="32" radius="8" onClick={onCancel} className="px-12">
        Huỷ
      </Button>
      <Button variant="danger" size="32" radius="8" onClick={onConfirm} className="px-12">
        Xoá
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Write the version and banner tests**

Create `src/components/shared/version-timeline.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VersionTimeline } from './version-timeline';

const VERSIONS = [
  { v: 3, note: 'Cập nhật nội dung', dateLabel: '20/09/2026', current: true },
  { v: 2, note: 'Khôi phục từ v1', dateLabel: '12/09/2026', current: false },
  { v: 1, note: 'Tạo ghi chú', dateLabel: '01/09/2026', current: false },
];

describe('VersionTimeline', () => {
  it('lists newest first with a mono version label and note', () => {
    render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={() => {}} />);
    const items = screen.getAllByRole('button');
    expect(items[0]).toHaveTextContent('v3 · Cập nhật nội dung');
    expect(items[2]).toHaveTextContent('v1 · Tạo ghi chú');
  });

  it('marks the newest entry with "· hiện tại"', () => {
    render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={() => {}} />);
    expect(screen.getByText('20/09/2026 · hiện tại')).toBeInTheDocument();
    expect(screen.getByText('12/09/2026')).toBeInTheDocument();
  });

  it('fills the dot with accent for the selected version only', () => {
    const { container } = render(<VersionTimeline versions={VERSIONS} selected={2} onSelect={() => {}} />);
    const dots = container.querySelectorAll('span.rounded-circle');
    expect(dots[1]?.className).toContain('bg-accent');
    expect(dots[0]?.className).toContain('bg-surface');
  });

  it('emits the clicked version', async () => {
    const onSelect = vi.fn();
    render(<VersionTimeline versions={VERSIONS} selected={3} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('v1 · Tạo ghi chú'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
```

Create `src/components/shared/banners.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DELETE_CONFIRM_MESSAGE, DeleteConfirmBanner } from './delete-confirm-banner';
import { VersionBanner } from './version-banner';

describe('VersionBanner', () => {
  it('paints med-soft and shows both actions', () => {
    const { container } = render(
      <VersionBanner versionLabel="v2" dateLabel="12/09/2026 · Khôi phục từ v1"
        onBackToCurrent={() => {}} onRestore={() => {}} />,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-med-soft');
    expect(screen.getByText('v2').className).toContain('font-mono');
    expect(screen.getByRole('button', { name: 'Về bản hiện tại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục bản này' })).toBeInTheDocument();
  });

  it('emits both actions', async () => {
    const onBackToCurrent = vi.fn();
    const onRestore = vi.fn();
    render(
      <VersionBanner versionLabel="v2" dateLabel="12/09/2026"
        onBackToCurrent={onBackToCurrent} onRestore={onRestore} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Về bản hiện tại' }));
    expect(onBackToCurrent).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục bản này' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteConfirmBanner', () => {
  it('asks inline with the exact Vietnamese wording', () => {
    render(<DeleteConfirmBanner onCancel={() => {}} onConfirm={() => {}} />);
    expect(DELETE_CONFIRM_MESSAGE).toBe('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?');
    expect(screen.getByText(DELETE_CONFIRM_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('paints hi-soft and emits both actions', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(<DeleteConfirmBanner onCancel={onCancel} onConfirm={onConfirm} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-hi-soft');
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Write `QuizHistoryList`, `HighlightPopup`, `HighlightList`**

Create `src/components/shared/quiz-history-list.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

export interface QuizHistoryEntry {
  id: string;
  score: number;
  total: number;
  dateLabel: string;
}

/** ≥80% --ok · ≥50% --med · <50% --hi (Design Spec §01). */
export function scoreToneClass(pct: number): string {
  if (pct >= 80) return 'bg-ok';
  if (pct >= 50) return 'bg-med';
  return 'bg-hi';
}

export const QUIZ_HISTORY_EMPTY =
  'Chưa có lần làm bài nào. Ôn lại kiến thức bằng bộ câu hỏi tạo từ ghi chú này.';

export interface QuizHistoryListProps {
  entries: readonly QuizHistoryEntry[];
  onOpen: (id: string) => void;
  className?: string;
}

export function QuizHistoryList({ entries, onOpen, className }: QuizHistoryListProps) {
  if (entries.length === 0) {
    return <div className={cn('text-13 leading-[1.5] text-muted', className)}>{QUIZ_HISTORY_EMPTY}</div>;
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {entries.map((entry) => {
        const pct = entry.total > 0 ? Math.round((entry.score / entry.total) * 100) : 0;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry.id)}
            className="flex flex-col gap-6 rounded-10 border-0 bg-transparent py-9 px-10 text-left text-text hover:bg-surface2"
          >
            <span className="flex w-full items-baseline justify-between gap-8">
              <span className="text-13 font-medium">
                <span className="font-mono">{`${entry.score}/${entry.total}`}</span>
                {` · ${pct}%`}
              </span>
              <span className="text-12 text-faint">{entry.dateLabel}</span>
            </span>
            <span className="block h-4 w-full overflow-hidden rounded-2 bg-surface2">
              <span className={cn('block h-full rounded-2', scoreToneClass(pct))} style={{ width: `${pct}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

Create `src/components/shared/highlight-popup.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';

/** Keep the bubble 90px inside the horizontal edges and never above y = 56. */
export function clampHighlightPosition(x: number, y: number, viewportWidth: number) {
  return { x: Math.max(90, Math.min(viewportWidth - 90, x)), y: Math.max(56, y) };
}

export interface HighlightPopupProps {
  mode: 'add' | 'remove';
  x: number;
  y: number;
  viewportWidth: number;
  onAction: () => void;
}

/** fixed · translate(-50%, calc(-100% - 10px)) · z80 · p4 · r10 · --text bg · 32px button. */
export function HighlightPopup({ mode, x, y, viewportWidth, onAction }: HighlightPopupProps) {
  const pos = clampHighlightPosition(x, y, viewportWidth);
  const label = mode === 'remove' ? 'Bỏ đánh dấu' : 'Đánh dấu';

  return (
    <div
      data-hlpop="1"
      onMouseDown={(e) => e.preventDefault()}
      className="fixed flex rounded-10 bg-text p-4 shadow-card"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: Z.highlightPopup,
      }}
    >
      <button
        type="button"
        onClick={onAction}
        className="flex h-32 items-center gap-7 whitespace-nowrap rounded-7 border-0 bg-transparent px-12 text-13 font-medium text-bg hover:bg-[rgba(127,127,127,.25)]"
      >
        <span
          aria-hidden="true"
          className={cn('h-12 w-12 rounded-3 border border-[rgba(127,127,127,.4)]', mode === 'remove' ? 'bg-transparent' : 'bg-hl2')}
        />
        <Icon name="highlight" size={15} />
        {label}
      </button>
    </div>
  );
}
```

Create `src/components/shared/highlight-list.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';

export const HIGHLIGHT_EMPTY = 'Bôi đen một đoạn trong nội dung để đánh dấu.';

export interface HighlightItem {
  id: string;
  text: string;
}

export interface HighlightListProps {
  highlights: readonly HighlightItem[];
  onRemove: (id: string) => void;
  className?: string;
}

/** Serif 14/1.5 on --hl, r4, py 2 px 6, clamped to 3 lines; 24px remove button. */
export function HighlightList({ highlights, onRemove, className }: HighlightListProps) {
  if (highlights.length === 0) {
    return <div className={cn('text-13 leading-[1.5] text-muted', className)}>{HIGHLIGHT_EMPTY}</div>;
  }

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      {highlights.map((item) => (
        <div key={item.id} className="flex items-start gap-8">
          <span className="line-clamp-3 min-w-0 flex-1 break-words rounded-4 bg-hl py-2 px-6 font-serif text-14 leading-[1.5]">
            {item.text}
          </span>
          <IconButton
            icon="close"
            label="Bỏ đánh dấu"
            size={24}
            radius="6"
            iconSize={12}
            strokeWidth={2.2}
            tone="faint"
            hoverTone="hi"
            onClick={() => onRemove(item.id)}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Write the highlight and quiz-history tests**

Create `src/components/shared/highlight-popup.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HighlightList } from './highlight-list';
import { HighlightPopup, clampHighlightPosition } from './highlight-popup';

describe('clampHighlightPosition', () => {
  it('keeps 90px clearance on both edges', () => {
    expect(clampHighlightPosition(10, 300, 1440)).toEqual({ x: 90, y: 300 });
    expect(clampHighlightPosition(1430, 300, 1440)).toEqual({ x: 1350, y: 300 });
    expect(clampHighlightPosition(700, 300, 1440)).toEqual({ x: 700, y: 300 });
  });

  it('never lets the bubble go above y = 56', () => {
    expect(clampHighlightPosition(700, 10, 1440).y).toBe(56);
  });
});

describe('HighlightPopup', () => {
  it('labels "Đánh dấu" in add mode and shows the hl2 swatch', () => {
    const { container } = render(<HighlightPopup mode="add" x={700} y={300} viewportWidth={1440} onAction={() => {}} />);
    expect(screen.getByRole('button', { name: /Đánh dấu/ })).toBeInTheDocument();
    expect(container.querySelector('.bg-hl2')).not.toBeNull();
  });

  it('labels "Bỏ đánh dấu" in remove mode with a transparent swatch', () => {
    const { container } = render(<HighlightPopup mode="remove" x={700} y={300} viewportWidth={1440} onAction={() => {}} />);
    expect(screen.getByRole('button', { name: /Bỏ đánh dấu/ })).toBeInTheDocument();
    expect(container.querySelector('.bg-transparent')).not.toBeNull();
  });

  it('positions itself above the selection at z80', () => {
    const { container } = render(<HighlightPopup mode="add" x={700} y={300} viewportWidth={1440} onAction={() => {}} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.left).toBe('700px');
    expect(el.style.top).toBe('300px');
    expect(el.style.transform).toBe('translate(-50%, calc(-100% - 10px))');
    expect(el.style.zIndex).toBe('80');
  });

  it('fires the action', async () => {
    const onAction = vi.fn();
    render(<HighlightPopup mode="add" x={700} y={300} viewportWidth={1440} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: /Đánh dấu/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('HighlightList', () => {
  it('shows the empty hint when there is nothing highlighted', () => {
    render(<HighlightList highlights={[]} onRemove={() => {}} />);
    expect(screen.getByText('Bôi đen một đoạn trong nội dung để đánh dấu.')).toBeInTheDocument();
  });

  it('renders each excerpt on the --hl background, clamped to 3 lines', () => {
    render(<HighlightList highlights={[{ id: 'h1', text: 'Adrenalin 0,5 mg' }]} onRemove={() => {}} />);
    const excerpt = screen.getByText('Adrenalin 0,5 mg');
    expect(excerpt.className).toContain('bg-hl');
    expect(excerpt.className).toContain('line-clamp-3');
    expect(excerpt.className).toContain('font-serif');
  });

  it('removes by id', async () => {
    const onRemove = vi.fn();
    render(<HighlightList highlights={[{ id: 'h1', text: 'x' }]} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect(onRemove).toHaveBeenCalledWith('h1');
  });
});
```

Create `src/components/shared/quiz-history-list.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QUIZ_HISTORY_EMPTY, QuizHistoryList, scoreToneClass } from './quiz-history-list';

describe('scoreToneClass', () => {
  it('uses ok / med / hi at the 80 and 50 thresholds', () => {
    expect(scoreToneClass(100)).toBe('bg-ok');
    expect(scoreToneClass(80)).toBe('bg-ok');
    expect(scoreToneClass(79)).toBe('bg-med');
    expect(scoreToneClass(50)).toBe('bg-med');
    expect(scoreToneClass(49)).toBe('bg-hi');
    expect(scoreToneClass(0)).toBe('bg-hi');
  });
});

describe('QuizHistoryList', () => {
  it('shows the empty prompt', () => {
    render(<QuizHistoryList entries={[]} onOpen={() => {}} />);
    expect(screen.getByText(QUIZ_HISTORY_EMPTY)).toBeInTheDocument();
  });

  it('renders the mono score, percentage and a proportional bar', () => {
    const { container } = render(
      <QuizHistoryList entries={[{ id: 'q1', score: 4, total: 5, dateLabel: '2 giờ trước' }]} onOpen={() => {}} />,
    );
    expect(screen.getByText('4/5').className).toContain('font-mono');
    expect(screen.getByText(/· 80%/)).toBeInTheDocument();
    const fill = container.querySelector('.bg-ok') as HTMLElement;
    expect(fill.style.width).toBe('80%');
  });

  it('never divides by zero for a 0-question attempt', () => {
    const { container } = render(
      <QuizHistoryList entries={[{ id: 'q1', score: 0, total: 0, dateLabel: 'vừa xong' }]} onOpen={() => {}} />,
    );
    expect(screen.getByText(/· 0%/)).toBeInTheDocument();
    expect((container.querySelector('.bg-hi') as HTMLElement).style.width).toBe('0%');
  });

  it('opens an attempt by id', async () => {
    const onOpen = vi.fn();
    render(<QuizHistoryList entries={[{ id: 'q1', score: 3, total: 5, dateLabel: 'hôm qua' }]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('q1');
  });
});
```

- [ ] **Step 7: Run the detail composite tests**

Run: `npx vitest run src/components/shared/comment-composer.test.tsx src/components/shared/version-timeline.test.tsx src/components/shared/banners.test.tsx src/components/shared/highlight-popup.test.tsx src/components/shared/quiz-history-list.test.tsx`
Expected: PASS (25 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): add CommentList/Composer, VersionTimeline/Banner, DeleteConfirmBanner, QuizHistoryList, Highlight popup and list"
```

---

### Task D19: `QuizOption`, `QuizFeedback`, `QuizResult`, `QuizModal`

**Files:**
- Create: `src/components/shared/quiz-option.tsx`, `src/components/shared/quiz-feedback.tsx`, `src/components/shared/quiz-result.tsx`, `src/components/shared/quiz-modal.tsx`
- Test: `src/components/shared/quiz-option.test.tsx`, `src/components/shared/quiz-result.test.tsx`, `src/components/shared/quiz-modal.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Z`, `Icon`, `IconButton`, `Button`, `SkeletonGroup`, `Skeleton`, `SectionLabel`, `scoreToneClass`.
- Produces — **consumed by the quiz/detail planners:**

```ts
export const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type QuizStatus = 'loading' | 'asking' | 'done';

export interface QuizQuestion {
  q: string;
  options: readonly string[];   // exactly 4
  answer: number;               // 0..3
  explain?: string;
}

export type QuizOptionState = 'idle' | 'ok' | 'bad' | 'dim';
export function quizOptionState(args: { answered: boolean; isAnswer: boolean; isPicked: boolean }): QuizOptionState;

export interface QuizOptionProps {
  letter: string;               // 'A' | 'B' | 'C' | 'D'
  text: string;
  state: QuizOptionState;
  answered: boolean;
  onPick: () => void;
  className?: string;
}
export function QuizOption(props: QuizOptionProps): JSX.Element;

export interface QuizFeedbackProps { correct: boolean; answerLetter: string; explain: string; className?: string }
export function QuizFeedback(props: QuizFeedbackProps): JSX.Element;

export function quizScore(questions: readonly QuizQuestion[], picks: readonly (number | null)[]): number;
export function quizPercent(score: number, total: number): number;          // 0 when total is 0
export function quizVerdict(pct: number): string;                            // Nắm vững | Cần ôn thêm | Nên đọc lại ghi chú
export function quizScoreTextClass(pct: number): string;                     // text-ok | text-med | text-hi

export interface QuizResultProps {
  questions: readonly QuizQuestion[];
  picks: readonly (number | null)[];
  review: boolean;               // caption 'Lần làm bài' vs 'Hoàn thành'
  completedAtLabel?: string;     // 'dd/mm/yyyy · HH:MM'
  onRetry: () => void;
  onClose: () => void;
  className?: string;
}
export function QuizResult(props: QuizResultProps): JSX.Element;

export interface QuizModalProps {
  open: boolean;
  noteTitle: string;
  review: boolean;
  status: QuizStatus;
  questions: readonly QuizQuestion[];
  picks: readonly (number | null)[];
  index: number;
  isMobile: boolean;
  completedAtLabel?: string;
  onPick: (optionIndex: number) => void;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}
export function QuizModal(props: QuizModalProps): JSX.Element | null;
```

- [ ] **Step 1: Write the failing `QuizOption` test**

Create `src/components/shared/quiz-option.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuizOption, quizOptionState } from './quiz-option';

describe('quizOptionState', () => {
  it('is idle before an answer', () => {
    expect(quizOptionState({ answered: false, isAnswer: true, isPicked: false })).toBe('idle');
    expect(quizOptionState({ answered: false, isAnswer: false, isPicked: false })).toBe('idle');
  });

  it('marks the correct answer, the wrong pick, and dims the rest', () => {
    expect(quizOptionState({ answered: true, isAnswer: true, isPicked: false })).toBe('ok');
    expect(quizOptionState({ answered: true, isAnswer: true, isPicked: true })).toBe('ok');
    expect(quizOptionState({ answered: true, isAnswer: false, isPicked: true })).toBe('bad');
    expect(quizOptionState({ answered: true, isAnswer: false, isPicked: false })).toBe('dim');
  });
});

describe('QuizOption', () => {
  it('shows the mono 26px key box and the 16px text', () => {
    render(<QuizOption letter="A" text="0,5 mg tiêm bắp" state="idle" answered={false} onPick={() => {}} />);
    const key = screen.getByText('A');
    expect(key.className).toContain('h-26');
    expect(key.className).toContain('w-26');
    expect(key.className).toContain('rounded-7');
    expect(key.className).toContain('font-mono');
    expect(screen.getByRole('button').className).toContain('text-16');
  });

  it('uses the idle frame: 1px --line, --surface, r12, py14 px16, gap 14', () => {
    render(<QuizOption letter="A" text="x" state="idle" answered={false} onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-line');
    expect(el.className).toContain('bg-surface');
    expect(el.className).toContain('rounded-12');
    expect(el.className).toContain('py-14');
    expect(el.className).toContain('px-16');
    expect(el.className).toContain('gap-14');
  });

  it('paints the correct option ok and labels it "Đúng"', () => {
    render(<QuizOption letter="B" text="x" state="ok" answered onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-ok');
    expect(el.className).toContain('bg-ok-soft');
    expect(screen.getByText('Đúng')).toBeInTheDocument();
  });

  it('paints the wrong pick hi and labels it "Sai"', () => {
    render(<QuizOption letter="C" text="x" state="bad" answered onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-hi');
    expect(el.className).toContain('bg-hi-soft');
    expect(screen.getByText('Sai')).toBeInTheDocument();
  });

  it('leaves unpicked options neutral and unlabelled', () => {
    render(<QuizOption letter="D" text="x" state="dim" answered onPick={() => {}} />);
    expect(screen.queryByText('Đúng')).toBeNull();
    expect(screen.queryByText('Sai')).toBeNull();
  });

  it('is pickable once and disabled afterwards', async () => {
    const onPick = vi.fn();
    const { rerender } = render(<QuizOption letter="A" text="x" state="idle" answered={false} onPick={onPick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledTimes(1);
    rerender(<QuizOption letter="A" text="x" state="dim" answered onPick={onPick} />);
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write `QuizOption` and `QuizFeedback`**

Create `src/components/shared/quiz-option.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

export const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;

export type QuizOptionState = 'idle' | 'ok' | 'bad' | 'dim';

export function quizOptionState({
  answered, isAnswer, isPicked,
}: { answered: boolean; isAnswer: boolean; isPicked: boolean }): QuizOptionState {
  if (!answered) return 'idle';
  if (isAnswer) return 'ok';
  if (isPicked) return 'bad';
  return 'dim';
}

export interface QuizOptionProps {
  letter: string;
  text: string;
  state: QuizOptionState;
  answered: boolean;
  onPick: () => void;
  className?: string;
}

/** py14 px16 · r12 · gap 14 · key 26×26 r7 mono 12/600 · text 16/1.5 · verdict 12/600. */
export function QuizOption({ letter, text, state, answered, onPick, className }: QuizOptionProps) {
  const verdict = state === 'ok' ? 'Đúng' : state === 'bad' ? 'Sai' : '';
  return (
    <button
      type="button"
      disabled={answered}
      onClick={onPick}
      className={cn(
        'flex items-start gap-14 rounded-12 border py-14 px-16 text-left text-16 leading-[1.5] text-text',
        'transition-[border-color,background-color] duration-150',
        state === 'ok' && 'border-ok bg-ok-soft',
        state === 'bad' && 'border-hi bg-hi-soft',
        (state === 'idle' || state === 'dim') && 'border-line bg-surface',
        answered ? 'cursor-default' : 'cursor-pointer hover:border-accent',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-26 w-26 shrink-0 items-center justify-center rounded-7 font-mono text-12 font-semibold',
          state === 'ok' && 'bg-ok text-surface',
          state === 'bad' && 'bg-hi text-surface',
          (state === 'idle' || state === 'dim') && 'bg-surface2 text-muted',
        )}
      >
        {letter}
      </span>
      <span className="flex-1 pt-1">{text}</span>
      {verdict ? (
        <span className={cn('pt-4 text-12 font-semibold', state === 'ok' ? 'text-ok' : 'text-hi')}>{verdict}</span>
      ) : null}
    </button>
  );
}
```

Create `src/components/shared/quiz-feedback.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

export interface QuizFeedbackProps {
  correct: boolean;
  answerLetter: string;
  explain: string;
  className?: string;
}

/** py16 px18 · r12 · ok-soft/hi-soft · title 14/600 · explanation 15/1.6. */
export function QuizFeedback({ correct, answerLetter, explain, className }: QuizFeedbackProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col gap-6 rounded-12 py-16 px-18', correct ? 'bg-ok-soft' : 'bg-hi-soft', className)}
    >
      <span className={cn('text-14 font-semibold', correct ? 'text-ok' : 'text-hi')}>
        {correct ? 'Chính xác' : `Chưa đúng — đáp án là ${answerLetter}`}
      </span>
      {explain ? <span className="text-15 leading-[1.6] text-text">{explain}</span> : null}
    </div>
  );
}
```

- [ ] **Step 3: Write the failing `QuizResult` test (covers Review Focus #5)**

Create `src/components/shared/quiz-result.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuizResult, quizPercent, quizScore, quizVerdict } from './quiz-result';
import type { QuizQuestion } from './quiz-option';

const QUESTIONS: QuizQuestion[] = [
  { q: 'Liều adrenalin IM?', options: ['0,1 mg', '0,5 mg', '1 mg', '5 mg'], answer: 1, explain: 'Theo phác đồ.' },
  { q: 'Đường dùng?', options: ['IM', 'IV', 'SC', 'PO'], answer: 0, explain: 'Tiêm bắp.' },
];

describe('quiz scoring', () => {
  it('counts only exact matches', () => {
    expect(quizScore(QUESTIONS, [1, 0])).toBe(2);
    expect(quizScore(QUESTIONS, [1, 3])).toBe(1);
    expect(quizScore(QUESTIONS, [null, null])).toBe(0);
  });

  it('returns 0% instead of NaN for a zero-question quiz', () => {
    expect(quizPercent(0, 0)).toBe(0);
    expect(quizPercent(4, 5)).toBe(80);
  });

  it('uses the spec thresholds for the verdict', () => {
    expect(quizVerdict(100)).toBe('Nắm vững');
    expect(quizVerdict(80)).toBe('Nắm vững');
    expect(quizVerdict(79)).toBe('Cần ôn thêm');
    expect(quizVerdict(50)).toBe('Cần ôn thêm');
    expect(quizVerdict(49)).toBe('Nên đọc lại ghi chú');
  });
});

describe('QuizResult', () => {
  it('renders the 64px serif score and the coloured verdict', () => {
    render(<QuizResult questions={QUESTIONS} picks={[1, 0]} review={false} onRetry={() => {}} onClose={() => {}} />);
    const score = screen.getByText('2/2');
    expect(score.className).toContain('font-serif');
    expect(score.className).toContain('text-64');
    expect(screen.getByText('100% · Nắm vững').className).toContain('text-ok');
  });

  it('uses "HOÀN THÀNH" for a fresh run and "LẦN LÀM BÀI" in review mode', () => {
    const { rerender } = render(
      <QuizResult questions={QUESTIONS} picks={[1, 0]} review={false} onRetry={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText('Hoàn thành').className).toContain('uppercase');
    rerender(<QuizResult questions={QUESTIONS} picks={[1, 0]} review onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Lần làm bài')).toBeInTheDocument();
  });

  it('lists every question with a ✓ or ✕ circle and the chosen answer', () => {
    render(<QuizResult questions={QUESTIONS} picks={[1, 3]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText('1. Liều adrenalin IM?')).toBeInTheDocument();
    expect(screen.getByText('2. Đường dùng?')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
    expect(screen.getByText('B. 0,5 mg')).toBeInTheDocument();
  });

  it('shows the correct answer only for wrong rows', () => {
    render(<QuizResult questions={QUESTIONS} picks={[1, 3]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText(/Đáp án đúng:/)).toHaveLength(1);
  });

  it('renders an em dash when a question was never answered', () => {
    render(<QuizResult questions={QUESTIONS} picks={[null, null]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('survives a zero-question quiz without NaN', () => {
    render(<QuizResult questions={[]} picks={[]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByText('0% · Nên đọc lại ghi chú')).toBeInTheDocument();
  });

  it('offers both 42px actions', async () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(<QuizResult questions={QUESTIONS} picks={[1, 0]} review={false} onRetry={onRetry} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Làm bộ câu hỏi mới' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Về ghi chú' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Write `QuizResult`**

Create `src/components/shared/quiz-result.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { QUIZ_LETTERS, type QuizQuestion } from './quiz-option';
import { SectionLabel } from './section-label';

export function quizScore(questions: readonly QuizQuestion[], picks: readonly (number | null)[]): number {
  return questions.reduce((sum, q, i) => sum + (picks[i] === q.answer ? 1 : 0), 0);
}

export function quizPercent(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}

export function quizVerdict(pct: number): string {
  if (pct >= 80) return 'Nắm vững';
  if (pct >= 50) return 'Cần ôn thêm';
  return 'Nên đọc lại ghi chú';
}

export function quizScoreTextClass(pct: number): string {
  if (pct >= 80) return 'text-ok';
  if (pct >= 50) return 'text-med';
  return 'text-hi';
}

export interface QuizResultProps {
  questions: readonly QuizQuestion[];
  picks: readonly (number | null)[];
  review: boolean;
  completedAtLabel?: string;
  onRetry: () => void;
  onClose: () => void;
  className?: string;
}

export function QuizResult({
  questions, picks, review, completedAtLabel, onRetry, onClose, className,
}: QuizResultProps) {
  const total = questions.length;
  const score = quizScore(questions, picks);
  const pct = quizPercent(score, total);

  return (
    <div className={cn('flex flex-col gap-28', className)}>
      <div className="flex flex-col items-start gap-10 border-b border-line pb-24">
        <SectionLabel>{review ? 'Lần làm bài' : 'Hoàn thành'}</SectionLabel>
        <div className="flex flex-wrap items-baseline gap-14">
          <span className="font-serif text-64 font-semibold leading-none tracking-[-.03em]">{`${score}/${total}`}</span>
          <span className={cn('text-18 font-medium', quizScoreTextClass(pct))}>
            {`${pct}% · ${quizVerdict(pct)}`}
          </span>
        </div>
        {completedAtLabel ? <span className="text-14 text-muted">{completedAtLabel}</span> : null}
        <div className="mt-10 flex flex-wrap gap-8">
          <Button variant="primary" size="42" onClick={onRetry}>
            Làm bộ câu hỏi mới
          </Button>
          <Button variant="secondary" size="42" onClick={onClose} className="border-line2">
            Về ghi chú
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-14">
        <SectionLabel>Xem lại đáp án</SectionLabel>
        {questions.map((question, i) => {
          const pick = picks[i] ?? null;
          const correct = pick === question.answer;
          const pickedLabel =
            pick == null ? '—' : `${QUIZ_LETTERS[pick]}. ${question.options[pick]}`;
          return (
            <div key={`${i}-${question.q}`} className="flex gap-14 rounded-12 border border-line bg-surface py-16 px-18">
              <span
                className={cn(
                  'flex h-24 w-24 shrink-0 items-center justify-center rounded-circle text-12 font-bold',
                  correct ? 'bg-ok-soft text-ok' : 'bg-hi-soft text-hi',
                )}
              >
                {correct ? '✓' : '✕'}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-6">
                <span className="font-serif text-16 font-semibold leading-[1.45]">{`${i + 1}. ${question.q}`}</span>
                <span className="text-14 leading-[1.5] text-muted">
                  {'Bạn chọn: '}
                  <span className={cn('font-medium', correct ? 'text-ok' : 'text-hi')}>{pickedLabel}</span>
                </span>
                {!correct ? (
                  <span className="text-14 leading-[1.5] text-muted">
                    {'Đáp án đúng: '}
                    <span className="font-medium text-ok">
                      {`${QUIZ_LETTERS[question.answer]}. ${question.options[question.answer]}`}
                    </span>
                  </span>
                ) : null}
                {question.explain ? (
                  <span className="text-13 leading-[1.55] text-muted">{question.explain}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the failing `QuizModal` test**

Create `src/components/shared/quiz-modal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { QuizQuestion } from './quiz-option';
import { QuizModal } from './quiz-modal';

const QUESTIONS: QuizQuestion[] = [
  { q: 'Liều adrenalin IM cho người lớn?', options: ['0,1 mg', '0,5 mg', '1 mg', '5 mg'], answer: 1, explain: 'Theo phác đồ.' },
  { q: 'Đường dùng?', options: ['IM', 'IV', 'SC', 'PO'], answer: 0, explain: 'Tiêm bắp.' },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof QuizModal>> = {}) {
  const props: React.ComponentProps<typeof QuizModal> = {
    open: true,
    noteTitle: 'Xử trí sốc phản vệ',
    review: false,
    status: 'asking',
    questions: QUESTIONS,
    picks: [null, null],
    index: 0,
    isMobile: false,
    onPick: vi.fn(),
    onNext: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<QuizModal {...props} />);
  return props;
}

describe('QuizModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <QuizModal open={false} noteTitle="x" review={false} status="asking" questions={QUESTIONS}
        picks={[null, null]} index={0} isMobile={false}
        onPick={() => {}} onNext={() => {}} onRetry={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('covers the viewport at z95 on the app background', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Trắc nghiệm' });
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('bg-bg');
    expect(dialog.style.zIndex).toBe('95');
  });

  it('shows the heading, note title and a mono counter', () => {
    renderModal({ index: 1 });
    expect(screen.getByText('Trắc nghiệm')).toBeInTheDocument();
    expect(screen.getByText('Xử trí sốc phản vệ')).toBeInTheDocument();
    expect(screen.getByText('2 / 2').className).toContain('font-mono');
  });

  it('uses the review heading when replaying a stored attempt', () => {
    renderModal({ review: true, status: 'done', picks: [1, 0] });
    expect(screen.getByText('Kết quả trắc nghiệm')).toBeInTheDocument();
  });

  it('advances the 3px progress bar as questions are answered', () => {
    const { container } = render(
      <QuizModal open noteTitle="x" review={false} status="asking" questions={QUESTIONS}
        picks={[1, null]} index={0} isMobile={false}
        onPick={() => {}} onNext={() => {}} onRetry={() => {}} onClose={() => {}} />,
    );
    const fill = container.querySelector('[data-quiz-progress]') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('shows the loading state with the serif headline and five skeleton bars', () => {
    renderModal({ status: 'loading' });
    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Đang soạn câu hỏi…' })).toBeInTheDocument();
  });

  it('shows the question label and four options', () => {
    renderModal();
    expect(screen.getByText('CÂU 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Liều adrenalin IM cho người lớn?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /mg$/ })).toHaveLength(4);
  });

  it('picks by click and by the 1–4 keys, once per question', async () => {
    const onPick = vi.fn();
    renderModal({ onPick });
    await userEvent.keyboard('2');
    expect(onPick).toHaveBeenCalledWith(1);
    await userEvent.keyboard('4');
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it('ignores the number keys once the question is answered', async () => {
    const onPick = vi.fn();
    renderModal({ onPick, picks: [1, null] });
    await userEvent.keyboard('3');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('shows the feedback panel and enables the next button after answering', () => {
    renderModal({ picks: [1, null] });
    expect(screen.getByText('Chính xác')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Câu tiếp theo' })).not.toBeDisabled();
  });

  it('labels the last question button "Xem kết quả"', () => {
    renderModal({ index: 1, picks: [1, 0] });
    expect(screen.getByRole('button', { name: 'Xem kết quả' })).toBeInTheDocument();
  });

  it('advances on Enter once answered', async () => {
    const onNext = vi.fn();
    renderModal({ onNext, picks: [1, null] });
    await userEvent.keyboard('{Enter}');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on the 40px close button', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders the result view when done', () => {
    renderModal({ status: 'done', picks: [1, 0] });
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Xem lại đáp án')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Write `QuizModal`**

Create `src/components/shared/quiz-modal.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { QuizFeedback } from './quiz-feedback';
import { QUIZ_LETTERS, QuizOption, quizOptionState, type QuizQuestion } from './quiz-option';
import { QuizResult } from './quiz-result';

export type QuizStatus = 'loading' | 'asking' | 'done';

export interface QuizModalProps {
  open: boolean;
  noteTitle: string;
  review: boolean;
  status: QuizStatus;
  questions: readonly QuizQuestion[];
  picks: readonly (number | null)[];
  index: number;
  isMobile: boolean;
  completedAtLabel?: string;
  onPick: (optionIndex: number) => void;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** Full-screen: fixed inset-0 · --bg · z95. Header 64, progress 3px, body max 760. */
export function QuizModal({
  open, noteTitle, review, status, questions, picks, index, isMobile,
  completedAtLabel, onPick, onNext, onRetry, onClose,
}: QuizModalProps) {
  const total = questions.length;
  const question = questions[index];
  const pick = picks[index] ?? null;
  const answered = pick !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (status !== 'asking' || !question) return;
      if (e.key === 'Enter') {
        if (answered) {
          e.preventDefault();
          onNext();
        }
        return;
      }
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= 4) {
        e.preventDefault();
        onPick(n - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, status, question, answered, onClose, onNext, onPick]);

  if (!open) return null;

  const heading = review ? 'Kết quả trắc nghiệm' : 'Trắc nghiệm';
  const counter =
    status === 'asking' ? `${index + 1} / ${total}` : status === 'done' ? `${total} câu` : '';
  const progress =
    status === 'done' ? 100 : total > 0 ? ((index + (answered ? 1 : 0)) / total) * 100 : 0;
  const padX = isMobile ? 16 : 40;
  const padTop = isMobile ? 28 : 56;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 flex flex-col bg-bg"
      style={{ zIndex: Z.quiz }}
    >
      <div
        className="flex h-64 shrink-0 items-center gap-14 border-b border-line"
        style={{ paddingLeft: padX, paddingRight: padX }}
      >
        <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-9 bg-accent-soft text-accent">
          <Icon name="quiz" size={15} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-14 font-semibold">{heading}</span>
          <span className="truncate text-12 text-faint">{noteTitle}</span>
        </div>
        <span className="font-mono text-13 text-muted">{counter}</span>
        <IconButton icon="close" label="Đóng" size={40} radius="10" iconSize={18} tone="default" onClick={onClose} />
      </div>

      <div className="h-3 shrink-0 bg-line">
        <div
          data-quiz-progress=""
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full max-w-760 flex-col gap-28 pb-64"
          style={{ paddingTop: padTop, paddingLeft: padX, paddingRight: padX }}
        >
          {status === 'loading' ? (
            <div className="flex flex-col gap-18 pt-24">
              <div className="font-serif text-26 font-semibold tracking-[-.01em]">Đang soạn câu hỏi…</div>
              <div className="text-15 leading-[1.6] text-muted">
                Bộ câu hỏi được tạo từ chính nội dung của ghi chú này.
              </div>
              <SkeletonGroup label="Đang soạn câu hỏi…" className="mt-12">
                <Skeleton className="h-22 w-[80%]" radius="6" />
                <Skeleton className="h-52" radius="12" />
                <Skeleton className="h-52" radius="12" />
                <Skeleton className="h-52" radius="12" />
                <Skeleton className="h-52" radius="12" />
              </SkeletonGroup>
            </div>
          ) : null}

          {status === 'asking' && question ? (
            <>
              <div className="flex flex-col gap-12">
                <span className="font-mono text-12 font-medium text-accent">{`CÂU ${index + 1} / ${total}`}</span>
                <h2
                  className={cn(
                    'm-0 font-serif font-semibold leading-[1.35] tracking-[-.01em] [text-wrap:pretty]',
                    isMobile ? 'text-22' : 'text-28',
                  )}
                >
                  {question.q}
                </h2>
              </div>

              <div className="flex flex-col gap-10">
                {question.options.map((text, i) => (
                  <QuizOption
                    key={`${i}-${text}`}
                    letter={QUIZ_LETTERS[i] ?? ''}
                    text={text}
                    answered={answered}
                    state={quizOptionState({ answered, isAnswer: i === question.answer, isPicked: i === pick })}
                    onPick={() => onPick(i)}
                  />
                ))}
              </div>

              {answered ? (
                <QuizFeedback
                  correct={pick === question.answer}
                  answerLetter={QUIZ_LETTERS[question.answer] ?? ''}
                  explain={question.explain ?? ''}
                />
              ) : null}

              <div className="flex items-center justify-between gap-12 pt-4">
                <span className="text-12 text-faint">Phím 1–4 để chọn · Enter để tiếp tục</span>
                <Button
                  variant="primary"
                  size="44"
                  onClick={onNext}
                  disabled={!answered}
                  className={cn(!answered && 'opacity-35')}
                >
                  {index < total - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}
                </Button>
              </div>
            </>
          ) : null}

          {status === 'done' ? (
            <QuizResult
              questions={questions}
              picks={picks}
              review={review}
              completedAtLabel={completedAtLabel}
              onRetry={onRetry}
              onClose={onClose}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the quiz tests**

Run: `npx vitest run src/components/shared/quiz-option.test.tsx src/components/shared/quiz-result.test.tsx src/components/shared/quiz-modal.test.tsx`
Expected: PASS (30 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): add QuizOption, QuizFeedback, QuizResult and the full-screen QuizModal"
```

---

### Task D20: Barrel exports, the duplication guard, and the green-build gate

**Files:**
- Create: `src/components/ui/index.ts`, `src/components/shared/index.ts`, `src/components/no-duplicates.test.ts`
- Modify: `src/app/layout.tsx` (wrap in `ToastProvider` + `TooltipRoot`), `src/app/page.tsx`, `CLAUDE.md`
- Test: `src/components/no-duplicates.test.ts`

**Interfaces:**
- Consumes: every component from Tasks D5–D19.
- Produces: **`@/components/ui` and `@/components/shared` are the only import paths later plans use.** Deep imports (`@/components/ui/button`) are allowed inside `src/components/`, never from `src/app/`.

- [ ] **Step 1: Write the UI barrel**

Create `src/components/ui/index.ts`:

```ts
export { Avatar, initialsOf, type AvatarProps } from './avatar';
export { Badge, type BadgeProps } from './badge';
export { Button, buttonVariants, RADIUS_CLASS, type ButtonProps, type ButtonSize, type ButtonVariant, type Radius } from './button';
export { Chip, type ChipProps } from './chip';
export { Icon, ICON_NAMES, type IconName, type IconProps } from './icon';
export { IconButton, type IconButtonProps } from './icon-button';
export { Input, type InputProps } from './input';
export { Kbd, type KbdProps } from './kbd';
export { Label, type LabelProps } from './label';
export { Pill, type PillProps, type PillTone } from './pill';
export { Popover, type PopoverProps } from './popover';
export { ScrollArea, type ScrollAreaProps } from './scroll-area';
export { Segmented, type SegmentedOption, type SegmentedProps } from './segmented';
export { Select, type SelectOption, type SelectProps } from './select';
export { Separator, type SeparatorProps } from './separator';
export { Skeleton, SkeletonGroup, type SkeletonGroupProps, type SkeletonProps } from './skeleton';
export { Slider, type SliderProps } from './slider';
export { Spinner, type SpinnerProps } from './spinner';
export { Textarea, type TextareaProps } from './textarea';
export { Toast, ToastProvider, Toaster as ToastViewport, TOAST_DURATION_MS, useToast, type ToastProps } from './toast';
export { Toggle, type ToggleProps } from './toggle';
export { Tooltip, TooltipRoot, type TooltipProps } from './tooltip';
```

> Note: `ToastProvider` renders its own viewport, so `Toaster` is an alias kept for the SPEC §5 name. Add to `src/components/ui/toast.tsx`:
> ```ts
> /** SPEC §5 names this `Toaster`; ToastProvider already renders it. */
> export function Toaster() { return null; }
> ```

- [ ] **Step 2: Write the shared barrel**

Create `src/components/shared/index.ts`:

```ts
export { AppHeader, HEADER_PAD_X, type AppHeaderProps } from './app-header';
export { AppShell, type AppShellProps } from './app-shell';
export { CommentComposer, COMMENT_PLACEHOLDER, type CommentComposerProps } from './comment-composer';
export { CommentList, type CommentItem, type CommentListProps } from './comment-list';
export { DeleteConfirmBanner, DELETE_CONFIRM_MESSAGE, type DeleteConfirmBannerProps } from './delete-confirm-banner';
export { EditorToolbar, EDITOR_TOOL_GROUPS, type EditorCommand, type EditorTool, type EditorToolbarProps } from './editor-toolbar';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { FilterChips, type FilterChipDescriptor, type FilterChipsProps } from './filter-chips';
export { FontSizeControl, FONT_PREVIEW_TEXT, type FontSizeControlProps } from './font-size-control';
export { HighlightList, HIGHLIGHT_EMPTY, type HighlightItem, type HighlightListProps } from './highlight-list';
export { HighlightPopup, clampHighlightPosition, type HighlightPopupProps } from './highlight-popup';
export { ImageDropzone, type ImageDropzoneProps } from './image-dropzone';
export { ImageGrid, type ImageGridProps } from './image-grid';
export { ImageThumb, type ImageThumbProps, type NoteImage } from './image-thumb';
export { InfoGrid, type InfoGridItem, type InfoGridProps } from './info-grid';
export { Lightbox, type LightboxProps } from './lightbox';
export { NoteCard, MAX_CARD_TAGS, type NoteCardProps, type NoteItemHandlers, type NoteSummary } from './note-card';
export { NoteGrid, type NoteGridProps } from './note-grid';
export { NoteList, type NoteListProps } from './note-list';
export { NoteListRow, type NoteListRowProps } from './note-list-row';
export { Pagination, type PaginationProps } from './pagination';
export {
  PRIORITIES, PRIORITY_CLASS, PRIORITY_LABEL, PRIORITY_ORDER,
  PriorityDot, PriorityLabel, PriorityPill, PrioritySegmented,
  type Priority, type PriorityDotProps, type PriorityLabelProps, type PriorityPillProps, type PrioritySegmentedProps,
} from './priority';
export { Prose, type ProseProps } from './prose';
export { QuizFeedback, type QuizFeedbackProps } from './quiz-feedback';
export { QuizHistoryList, QUIZ_HISTORY_EMPTY, scoreToneClass, type QuizHistoryEntry, type QuizHistoryListProps } from './quiz-history-list';
export { QuizModal, type QuizModalProps, type QuizStatus } from './quiz-modal';
export { QuizOption, QUIZ_LETTERS, quizOptionState, type QuizOptionProps, type QuizOptionState, type QuizQuestion } from './quiz-option';
export { QuizResult, quizPercent, quizScore, quizScoreTextClass, quizVerdict, type QuizResultProps } from './quiz-result';
export { Rail, RailSection, type RailProps, type RailSectionProps } from './rail';
export { RichTextEditor, EDITOR_PLACEHOLDER, type RichTextEditorHandle, type RichTextEditorProps } from './rich-text-editor';
export { SearchBox, SEARCH_PLACEHOLDER, type SearchBoxProps } from './search-box';
export { SearchSuggestions, type SearchSuggestionsProps, type SuggestionNote, type SuggestionTag } from './search-suggestions';
export { SectionLabel, type SectionLabelProps } from './section-label';
export { SettingsPopover, type SettingsPopoverProps } from './settings-popover';
export { Sidebar, APP_NAME, BRAND_MARK, type SidebarProps, type SidebarUser } from './sidebar';
export { SidebarNavItem, type SidebarNavItemProps } from './sidebar-nav-item';
export { SidebarSection, type SidebarSectionProps } from './sidebar-section';
export { SortSelect, SORT_OPTIONS, type SortKey, type SortSelectProps } from './sort-select';
export { TagChip, type TagChipProps } from './tag-chip';
export { TagInput, type TagInputProps } from './tag-input';
export { TagSuggestions, MAX_TAG_SUGGESTIONS, type TagSuggestionsProps } from './tag-suggestions';
export { ThemeSwitch, type ThemeSwitchProps } from './theme-switch';
export { VersionBanner, type VersionBannerProps } from './version-banner';
export { VersionTimeline, type VersionItem, type VersionTimelineProps } from './version-timeline';
export { ViewToggle, type ViewMode, type ViewToggleProps } from './view-toggle';
```

- [ ] **Step 3: Write the duplication-guard test (enforces SPEC §5 mechanically)**

Create `src/components/no-duplicates.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const APP_DIR = join(ROOT, 'src/app');
const UI_DIR = join(ROOT, 'src/components/ui');
const SHARED_DIR = join(ROOT, 'src/components/shared');

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
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

  it('no source file contains an emoji', () => {
    const files = [...walk(APP_DIR), ...walk(UI_DIR), ...walk(SHARED_DIR)];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Extended_Pictographic covers emoji; the typographic glyphs we do use
      // (B I U S ¶ • ❝ — ↶ ↷ ✓ ✕ #) are NOT in this class.
      expect(/\p{Extended_Pictographic}/u.test(source), `${file} contains an emoji`).toBe(false);
    }
  });

  it('no component hard-codes a hex colour outside globals.css', () => {
    const allowed = new Set([
      'lightbox.tsx',       // rgba(8,9,10,.88) / #1c1f21 / #232729 / #7c8388 / #e6e7e5 / #8a9095 — fixed, theme-independent
      'image-thumb.tsx',    // striped placeholder uses var(--surface2)/var(--bg) only
    ]);
    for (const file of [...walk(UI_DIR), ...walk(SHARED_DIR)]) {
      if (allowed.has(file.split('/').pop() ?? '')) continue;
      const source = readFileSync(file, 'utf8');
      expect(/#[0-9a-fA-F]{6}\b/.test(source), `${file} hard-codes a hex colour`).toBe(false);
    }
  });
});
```

- [ ] **Step 4: Run the guard and fix any violation it reports**

Run: `npx vitest run src/components/no-duplicates.test.ts`
Expected: PASS (5 tests). If a barrel entry is missing, add it; if a page deep-imports, switch it to the barrel.

- [ ] **Step 5: Wire the providers into the root layout**

Modify `src/app/layout.tsx` — replace the `<body>` line:

```tsx
      <body>
        <TooltipRoot>
          <ToastProvider>{children}</ToastProvider>
        </TooltipRoot>
      </body>
```

and add: `import { ToastProvider, TooltipRoot } from '@/components/ui';`

- [ ] **Step 6: Record the barrel rule in CLAUDE.md**

Append to the "SHARED COMPONENT RULE" section of `CLAUDE.md`:

```markdown
6. Import from the barrels: `@/components/ui` and `@/components/shared`. Deep
   imports (`@/components/ui/button`) are allowed only INSIDE `src/components/`.
   `src/components/no-duplicates.test.ts` enforces this, plus the no-emoji,
   no-native-`<select>` and no-hard-coded-hex rules — keep it green.
```

- [ ] **Step 7: Run the whole gate**

Run:
```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```
Expected: all four clean. Total: 20 tasks, ~250 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(components): add ui/shared barrels and the SPEC §5 duplication guard test"
```

---

## Handoff notes for the other planners

These are the contracts your pages consume. Do not re-declare them.

| Thing | Exact value |
|---|---|
| Class helper | `import { cn } from '@/lib/utils'` |
| Component imports | `from '@/components/ui'` and `from '@/components/shared'` — never deep |
| Colour utilities | `bg-bg` `bg-surface` `bg-surface2` `border-line` `border-line2` `text-text`/`bg-text` `text-muted` `text-faint` `bg-accent`/`text-accent`/`border-accent` `text-accent-ink` `bg-accent-soft` `text-hi`/`bg-hi`/`border-hi` `bg-hi-soft` `text-med`/`bg-med` `bg-med-soft` `text-low`/`bg-low` `bg-low-soft` `text-ok`/`bg-ok`/`border-ok` `bg-ok-soft` `bg-hl` `bg-hl2` |
| Shadows | `shadow-card`, `shadow-seg` |
| Fonts | `font-serif` (Source Serif 4), `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono) |
| Radii | `rounded-2 … rounded-14`, `rounded-full` (999px), `rounded-circle` (50%) |
| Text sizes | `text-11 … text-64`, plus `text-fs` for prose |
| Spacing | `--spacing: 1px` — `h-46`, `px-14`, `gap-6` are literal pixels |
| Dark mode | `data-theme="dark"` on `<html>`; `dark:` variant also works |
| Accent | `data-accent="teal" \| "indigo" \| "plum"` on `<html>` |
| Prose size | `--fs` on `<html>`, integer 14–22 (`clampFontSize` from `@/lib/theme`) |
| Breakpoint | `useIsMobile()` from `@/hooks/use-is-mobile`; `max-[819px]:` / `min-[820px]:` |
| Z-index | `Z` from `@/lib/z` |
| Toast | `const { flash } = useToast()` — 2200 ms, provider already in the root layout |

---

## Self-Review

**1. Spec coverage.** Every primitive in SPEC §5 `src/components/ui/` is built: Button (D6), IconButton (D6), Input (D7), Textarea (D7), Label (D7), Badge (D8), Chip (D8), Pill (D8), Popover (D9), Select (D9), Segmented (D9), Toggle (D9), Toast/Toaster (D10), Skeleton (D7), Separator (D7), Kbd (D7), Spinner (D7), Slider (D10), Avatar (D8), Tooltip (D10), ScrollArea (D10), Icon (D5). Every composite in `src/components/shared/` is built: AppShell, Sidebar, SidebarNavItem, SidebarSection, AppHeader (D12); SearchBox, SearchSuggestions (D13); SettingsPopover, ThemeSwitch, FontSizeControl (D14); NoteCard, NoteListRow, NoteGrid, NoteList (D15); PriorityDot, PriorityPill, PriorityLabel, PrioritySegmented (D8/D9); TagChip (D8), TagInput, TagSuggestions (D17); FilterChips, SortSelect, ViewToggle, Pagination, EmptyState (D9/D11); Prose (D16), RichTextEditor, EditorToolbar (D17); ImageDropzone, ImageGrid, ImageThumb, Lightbox (D16); CommentList, CommentComposer, VersionTimeline, VersionBanner, DeleteConfirmBanner (D18); QuizModal, QuizOption, QuizFeedback, QuizResult, QuizHistoryList (D18/D19); HighlightPopup, HighlightList, InfoGrid, SectionLabel, Rail (D11/D18). Design Spec tokens: §01 colours + 3 accents (D2), §02 type + `[data-prose]` (D2/D3), §03 spacing/breakpoint (D2/D12), §04 radii/shadow/z/motion (D2), §05 icons (D5), §06 components (D6–D19). SPEC §6.2's unit tests for `norm`/`rel`/`fmt`/sort/filter/pagination-logic/version/highlight-wrap/offlineQuiz/hybrid-search/storage-scoping are **domain logic, out of scope for this plan** — they belong to the data/logic plan. Pagination *rendering* is covered here (D11); pagination *slicing* is not.

**2. Placeholders.** None. Every step carries real code. Nothing says "similar to Task N" — `cn`, `RADIUS_CLASS` and `Z` are re-imported by name wherever used.

**3. Type consistency.** `Priority` is declared once in `shared/priority.tsx` and imported by `note-card`, `note-list-row`, `search-suggestions`. `NoteSummary` and `NoteItemHandlers` are declared once in `note-card.tsx` and imported by `note-list-row`, `note-grid`, `note-list`. `NoteImage` lives in `image-thumb.tsx` and is imported by `image-grid` and `lightbox`. `Radius`/`RADIUS_CLASS` live in `button.tsx` and are imported by `icon-button` and `skeleton`. `EditorCommand` lives in `editor-toolbar.tsx` and is imported by `rich-text-editor`. `QuizQuestion`/`QUIZ_LETTERS` live in `quiz-option.tsx` and are imported by `quiz-result` and `quiz-modal`. `SelectOption` lives in `select.tsx` and is imported by `sort-select`. `SegmentedOption` lives in `segmented.tsx` and is imported by `view-toggle`, `theme-switch`, `priority`.

**4. Review Focus coverage.** (1) theme flash / hydration → D3 Step 2, five assertions. (2) out-of-range `--fs` → D2 Step 5 and D3 Step 2. (3) `Select` keyboard and dismissal → D9 Step 2, ten assertions. (4) unbreakable long strings → D15 Steps 1 and 6. (5) empty/zero data → D11 Step 1 (Pagination/EmptyState), D18 Step 6 (`QuizHistoryList` with `total: 0`), D19 Step 3 (`QuizResult` with zero questions).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/part-1-design-system.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

**For this plan I recommend subagent-driven**, because the twenty tasks form a strict interface chain — `cn` → `Icon` → `Button`/`IconButton` → every composite — and a wrong Tailwind token name or a drifted prop signature in an early task would silently propagate into all four page plans that consume these components. Does the plan capture what you want, and which approach should we use?
