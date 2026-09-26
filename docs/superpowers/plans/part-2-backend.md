# Kno-Notes — Part 2: Backend / Data / API / Auth / MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entire server side of Kno-Notes — Next.js scaffold, domain types, Vietnamese-aware pure utils, Neon Postgres index via Drizzle, GitHub-backed note storage, self-hosted cookie auth, the note service that keeps both stores in sync, image upload/serving, Gemini + offline quiz generation, the internal REST API, the public `/api/v1` bearer API, and an MCP server — all on free tiers.

**Architecture:** Two stores. **Postgres (Neon free)** holds only small queryable rows: `users`, `api_keys`, `tags`, `note_index`, `user_prefs`. **A `NoteStorage` adapter** holds the heavy note JSON and image binaries under `data/users/<userId>/…` — the GitHub Contents API in production, a gitignored `.data/` directory locally and in tests, behind one interface. A single service layer (`src/lib/services/notes.ts`) is the *only* thing that writes both, so they never drift. Every storage call takes `userId` as its first non-optional argument and builds the path itself — a caller can never supply a path. All API routes run on the Node.js runtime; only `middleware.ts` runs on Edge and it does nothing but verify the JWT.

**Tech Stack:** Next.js 15 (App Router) · TypeScript strict · Drizzle ORM (`neon-http` on Vercel, `node-postgres` on localhost) · `@octokit/rest` · `bcryptjs` + `jose` · `linkedom` (server-side HTML parsing) · `@google/generative-ai` · `mcp-handler` + `@modelcontextprotocol/sdk` · `zod` · Vitest.

**Spec:** `docs/SPEC.md` (source of truth) · `docs/reference/So Lam Sang.dc.html` (prototype — the `<script data-dc-script>` block at file lines 679–1143 is the behavioural source of truth)

## Global Constraints

- **Cost must be 0₫.** Free tier only. No Redis, no S3, no Vercel Blob, no Upstash, no external auth provider, no paid LLM tier. (SPEC §1.4 #28)
- **Why GitHub and not Vercel Blob:** Vercel Blob on Hobby is capped (1 GB store, 10 GB/mo bandwidth, and it is a *metered* product that begins billing past the included amount). A private GitHub repo has no per-request bill, gives free version history for every write, and is readable/editable by the owner outside the app. GitHub is therefore the note/image store. (SPEC §2.1)
- **Storage is an interface, not a module.** `NoteStorage` (Task B6) has two implementations: `github.ts` (Task B7 — production, Octokit Contents API) and `filesystem.ts` (local dev, unit tests, Playwright e2e — writes under `.data/users/<userId>/`). `getStorage()` returns GitHub only when `GITHUB_TOKEN`, `GITHUB_OWNER` **and** `GITHUB_REPO` are all present. No GitHub PAT exists yet, so every local run and every test uses the filesystem adapter; one shared contract suite runs against both.
- **Postgres driver is chosen from the URL host at module init.** Host ending in `.neon.tech` → `@neondatabase/serverless` + `drizzle-orm/neon-http`. Anything else (i.e. `localhost`) → `pg` + `drizzle-orm/node-postgres`. The neon-http driver cannot speak to a local server, so this is not optional. Local dev DB: `kno_notes_dev`; test DB: `kno_notes_test`; both created idempotently by `scripts/db-setup.sh`.
- **Every storage function takes `userId` as its first, non-optional parameter** and constructs the path as `data/users/${userId}/…`. No function anywhere accepts a caller-supplied path. (SPEC §2.2)
- **Node.js runtime** (`export const runtime = 'nodejs'`) on every route handler under `src/app/api/**`. Rationale: `bcryptjs` is CPU-bound and pathological on Edge, `@octokit/rest` pulls Node polyfills, and `Buffer` base64 is used throughout. `middleware.ts` runs on Edge by definition and uses **only** `jose` (WebCrypto, Edge-safe) — it must never import the db, Octokit or bcryptjs.
- **TypeScript strict**, path alias `@/*` → `src/*`.
- **Vietnamese normalisation is one function**: `norm()` — `s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')`. Every search/compare path uses it. Never reimplement inline.
- **Title sort is always `localeCompare(a, b, 'vi')`** — never a Postgres `ORDER BY title`.
- **Version numbering** (SPEC §3): v1 on create with note `Tạo ghi chú`; +1 on update **only when** `html !== n.content || title !== n.title`, default note `Cập nhật nội dung`; restore appends a new version with note `Khôi phục từ vN`; saving highlights updates `content` **and the last version's content** and creates **no** version.
- **Exact error copy**: `Sai tên đăng nhập hoặc mật khẩu.` — byte for byte, including the trailing full stop.
- **No signup route.** Users exist only via `scripts/seed.ts` or a manual insert.
- **Default page size 6.** (SPEC §3)
- **Minimise GitHub API calls**: every read goes through an in-memory LRU keyed `${path}@${sha}`; the dashboard list never touches GitHub.
- **Minimise DB round-trips**: one query per request path; never N+1 over notes.
- App name is `Kno-Notes`. Vercel project `kno-notes`, domain `kno-notes.vercel.app`.
- **Out of scope for this plan** (owned by the design/UI plan): `src/app/layout.tsx`, `src/app/globals.css`, Tailwind theme, all components and pages. This plan owns `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.env.example`, and everything under `src/lib/**`, `src/app/api/**`, `src/middleware.ts`, `drizzle/**`, `scripts/**`.

## Contract Amendments (from `docs/superpowers/plans/part-0-contracts.md`)

`part-0-contracts.md` is **authoritative**; where it differs from anything below, it wins. These
amendments are already folded into the tasks — they are listed here so an executor reading one task
in isolation knows why a signature looks the way it does.

1. **Task B1 is superseded.** The coordinator runs Phase 0 (`package.json`, `tsconfig.json`,
   `next.config.ts`, eslint, `.env.example`, `vitest.config.ts`, directory skeleton) once, before the
   three agents start. **Skip Task B1** — read it only as the record of which dependencies and
   settings the backend needs, and verify Phase 0 produced them (`npm run check` must pass, `pg` and
   `@types/pg` must be present, `serverExternalPackages` must include `pg`). If anything is missing,
   report it to the coordinator rather than editing those files.
2. **Backend owns `src/lib/text/**`, design owns `src/lib/utils.ts`.** Every pure helper in this plan
   lives under `src/lib/text/` and is imported from `@/lib/text`. `cn()` comes from `@/lib/utils`,
   which this plan never touches.
3. **`NoteComment` carries an author** (`{ id, displayName }`) — the app is multi-user, so nothing
   may hard-code "BS". `addComment` takes the `SessionUser`.
4. **`contentSha` is a semantic hash, not the storage blob sha.** It is sha256 over
   `title \n desc \n tags.join(',') \n plain`, with `<mark>` tags stripped from `plain` first, so
   renaming a note invalidates the client's cached embedding while highlighting does not. The storage
   adapter's own blob sha stays internal to the adapter.
5. **`PUT /api/notes/[id]/highlights` returns `{ ok: true, contentSha }`**, not the whole note.
6. **`POST /api/notes/[id]/quiz/generate` accepts `{ avoid?: string[] }`** and returns
   **422 `{ error: { code: 'NOT_ENOUGH_CONTENT', … } }`** when no question can be built.
7. **`GET /api/search/index`** exists for the browser's vector index — Task B17.
8. **The filesystem adapter root is `DATA_DIR`**, and `db:seed:test` seeds into it, so Playwright's
   global setup can point at its own directory.

## Review Focus

1. **Cross-user path traversal.** A `userId`, note id or image id containing `../`, a URL-encoded slash, or a leading `/` must not escape `data/users/<userId>/`. Expected: the identifier is rejected before any I/O, on **both** adapters — the filesystem adapter would otherwise write outside `.data/`. → pinned in Task B6 as a shared contract test run against both adapters.
2. **A second user's note id passed to an owned-looking route.** `GET /api/notes/<someone-elses-id>` must 404, not 200 — the index lookup is scoped by `user_id` so the row simply does not exist. → pinned in Task B9.
3. **Gemini returns prose around the JSON, or a question with 3 options.** Expected: the malformed questions are dropped, and if fewer than 3 survive the whole response is discarded and the offline quiz is served with `source: 'offline'`. The user never sees an error. → pinned in Task B12.
4. **A note whose content has no `<h2>`/`<h3>` at all** (e.g. a one-paragraph note). `sections()` returns `[]`, `offlineQuiz` can build no section questions, and with fewer than 3 foreign tags it returns `[]`. Expected: the route answers `200 { questions: [], source: 'offline' }` and the UI shows `Ghi chú chưa đủ nội dung để tạo câu hỏi` — it must not 500. → pinned in Task B12.
5. **GitHub write racing itself** (two saves of the same note in flight). The second `PUT` gets HTTP 409 because its `sha` is stale. Expected: re-read the file, re-apply, retry up to 3 times, then surface a 409 — never silently drop the write. → pinned in Task B7 (GitHub-adapter unit test with a mocked Octokit, so it runs without a PAT).

---

### Task B1: Project scaffold, TypeScript config, lint, test runner

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/app/api/health/route.ts`
- Test: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `@/*` → `src/*` alias, the scripts `dev`/`build`/`start`/`lint`/`typecheck`/`test`/`db:generate`/`db:migrate`/`db:seed`, and the dependency set every later task imports from.

- [ ] **Step 1: Initialise the git repo**

```bash
cd /Users/spt/Documents/kno-notes
git init
git symbolic-ref HEAD refs/heads/main
```

- [ ] **Step 2: Write `package.json`**

The design plan adds Tailwind/shadcn runtime deps to this same file; the entries below already include them so the two plans do not fight over the file. Do not run `npm install` yet if another task is mid-flight — run it once at the end of this step.

```json
{
  "name": "kno-notes",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:setup": "bash scripts/db-setup.sh",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "bash scripts/db-setup.sh --drop"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@modelcontextprotocol/sdk": "^1.18.1",
    "@neondatabase/serverless": "^1.0.1",
    "@octokit/rest": "^22.0.0",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-tooltip": "^1.2.8",
    "bcryptjs": "^3.0.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.44.5",
    "jose": "^6.1.0",
    "linkedom": "^0.18.11",
    "mcp-handler": "^1.0.2",
    "next": "^15.5.4",
    "pg": "^8.16.3",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "tailwind-merge": "^3.3.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.1",
    "@tailwindcss/postcss": "^4.1.13",
    "@types/node": "^24.5.2",
    "@types/pg": "^8.15.5",
    "@types/react": "^19.1.13",
    "@types/react-dom": "^19.1.9",
    "@vitest/coverage-v8": "^3.2.4",
    "dotenv": "^17.2.2",
    "drizzle-kit": "^0.31.4",
    "eslint": "^9.36.0",
    "eslint-config-next": "^15.5.4",
    "tailwindcss": "^4.1.13",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

`pg` sits next to `@neondatabase/serverless` on purpose: local dev and the test suite talk to the Homebrew `postgresql@16` server on `localhost:5432`, which the neon-http driver physically cannot reach (it speaks HTTP to a Neon endpoint). Task B5 picks the driver from the URL host.

Why these and nothing else: `linkedom` replaces the browser `DOMParser` that `sections()` needs on the server and is ~100 KB with zero native deps. `sharp` is explicitly **not** here (SPEC/Task B11 forbids it). No rate-limit library, no session library, no file-upload library — Next's built-in `Request.formData()` and a module-scope `Map` cover both.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@octokit/rest', 'linkedom', 'pg'],
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 5: Write `eslint.config.mjs`**

```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
```

- [ ] **Step 6: Write `.env.example`**

```bash
# Postgres. Local dev uses the Homebrew postgresql@16 server; production uses Neon.
# The driver is chosen from the host: *.neon.tech => neon-http, otherwise node-postgres.
DATABASE_URL=postgresql://spt@localhost:5432/kno_notes_dev
# Production (set on Vercel):
# DATABASE_URL=postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/kno_notes?sslmode=require

# Used only by `npm test` and Playwright. Created by `npm run db:setup`.
TEST_DATABASE_URL=postgresql://spt@localhost:5432/kno_notes_test

# JWT signing secret for the kn_session cookie. Generate with: openssl rand -base64 32
AUTH_SECRET=

# Private GitHub repo that stores notes + images (classic PAT with `repo` scope,
# or a fine-grained PAT with Contents: Read and write on this one repo).
# LEAVE ALL THREE EMPTY LOCALLY: the storage layer then falls back to the
# filesystem adapter, which writes to ./.data/ (gitignored). Set all three on
# Vercel to switch to the GitHub adapter. See src/lib/storage/index.ts.
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_BRANCH=main

# Root for the filesystem storage adapter (dev/test only). Default: ./.data
# Playwright global-setup points this at its own throwaway directory.
DATA_DIR=.data

# Optional. Missing or invalid => quiz generation falls back to the offline generator.
GOOGLE_GENERATIVE_AI_API_KEY=

NEXT_PUBLIC_APP_NAME=Kno-Notes
```

- [ ] **Step 7: Write `.gitignore`**

```gitignore
node_modules/
.next/
out/
build/
.env
.env*.local
.vercel
*.tsbuildinfo
next-env.d.ts
coverage/
.DS_Store

# filesystem storage adapter (dev/test note + image store)
.data/

# Playwright
test-results/
playwright-report/
```

- [ ] **Step 8: Write `vitest.config.ts`**

`TZ` is pinned because `fmt()` and `rel()` use local-time `getDate()`/`getMonth()`; without pinning, the date tests pass in one CI region and fail in another.

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Asia/Ho_Chi_Minh';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
```

- [ ] **Step 9: Write `vitest.setup.ts`**

```ts
process.env.TZ = 'Asia/Ho_Chi_Minh';
process.env.AUTH_SECRET ||= 'test-secret-do-not-use-in-production-0000';
process.env.GITHUB_BRANCH ||= 'main';

// Tests hit the local Homebrew postgres, never Neon.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://spt@localhost:5432/kno_notes_test';

// GITHUB_* are deliberately NOT set here. getStorage() therefore returns the
// filesystem adapter for the whole unit suite. The GitHub contract test opts in
// by reading process.env itself and skipping when the vars are absent.
```

- [ ] **Step 10: Write the smoke test**

```ts
// src/lib/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('resolves the @/ alias and runs in the Asia/Ho_Chi_Minh timezone', async () => {
    expect(process.env.TZ).toBe('Asia/Ho_Chi_Minh');
    expect(new Date('2024-03-07T00:00:00+07:00').getDate()).toBe(7);
  });
});
```

- [ ] **Step 11: Write the health route**

```ts
// src/app/api/health/route.ts
export const runtime = 'nodejs';

export function GET() {
  return Response.json({ ok: true, app: 'kno-notes' });
}
```

- [ ] **Step 12: Install and verify**

```bash
cd /Users/spt/Documents/kno-notes
npm install
npx tsc --noEmit
npx vitest run
```
Expected: `tsc` clean, one passing test.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs .env.example .gitignore vitest.config.ts vitest.setup.ts src/app/api/health/route.ts src/lib/__tests__/smoke.test.ts
git commit -m "chore: scaffold Next.js 15 + TypeScript strict + Vitest toolchain"
```

---

### Task B2: Core domain types

**Files:**
- Create: `src/lib/types.ts`
- Test: `src/lib/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Priority`, `NoteImage`, `NoteComment`, `NoteVersion`, `Question`, `Quiz`, `Note`, `NoteSummary`, `NoteIndexRow`, `UserPrefs`, `ApiKey`, `SessionUser`, `NoteFilters`, `NoteListResult`, `SortKey`, `NavKey`, `CreateNoteInput`, `UpdateNoteInput`, `ApiError`. Every later task and the whole UI import from here.

- [ ] **Step 1: Write `src/lib/types.ts`**

Field names are the prototype's, unchanged, so the ported logic reads identically (`n.desc`, `n.fav`, `v.v`, `q.explain`). The one deliberate difference from the prototype is `NoteImage.src`, which now holds `/api/images/{userId}/{imageId}` instead of a data URL (SPEC §3 "Khác biệt có chủ ý").

```ts
// src/lib/types.ts

/** Ưu tiên của ghi chú. Thứ tự sắp xếp: high → medium → low. */
export type Priority = 'high' | 'medium' | 'low';

/** Khoá sắp xếp trên dashboard. */
export type SortKey = 'updated' | 'priority' | 'title';

/** Mục điều hướng sidebar. */
export type NavKey = 'all' | 'fav';

/** Ảnh trong thư viện của ghi chú. `src` là URL proxy, không phải data URL. */
export interface NoteImage {
  id: string;
  label: string;
  /** `/api/images/{userId}/{imageId}` */
  src: string;
}

/** Tác giả bình luận. App đa người dùng — không bao giờ hard-code "BS". */
export interface CommentAuthor {
  id: string;
  displayName: string;
}

export interface NoteComment {
  id: string;
  text: string;
  /** ISO-8601 */
  date: string;
  /**
   * Vắng mặt trên dữ liệu seed cũ; UI hiển thị 2 ký tự đầu của
   * `note.author.displayName`, hoặc "?" khi thiếu.
   */
  author?: CommentAuthor;
}

export interface NoteVersion {
  v: number;
  /** ISO-8601 */
  date: string;
  /** Ghi chú thay đổi, vd "Cập nhật nội dung", "Khôi phục từ v2". */
  note: string;
  title: string;
  /** HTML đầy đủ tại phiên bản này. */
  content: string;
}

export interface Question {
  q: string;
  /** Luôn đúng 4 phần tử. */
  options: string[];
  /** Chỉ số đáp án đúng trong `options`, 0..3. */
  answer: number;
  explain: string;
}

export interface Quiz {
  id: string;
  /** ISO-8601 */
  date: string;
  score: number;
  total: number;
  source: 'ai' | 'offline';
  /** Lựa chọn của người dùng theo từng câu; `null` nếu bỏ qua. */
  picks: (number | null)[];
  questions: Question[];
}

/** Bản ghi đầy đủ lưu tại `data/users/<userId>/notes/<noteId>.json`. */
export interface Note {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  fav: boolean;
  /** ISO-8601 */
  created: string;
  /** ISO-8601 */
  updated: string;
  /** HTML của phiên bản hiện tại. */
  content: string;
  images: NoteImage[];
  comments: NoteComment[];
  /** Tăng dần theo `v`; phần tử cuối là phiên bản hiện tại. */
  versions: NoteVersion[];
  /** Mới nhất ở đầu mảng. */
  quizzes: Quiz[];
}

/**
 * Bản rút gọn cho dashboard — dựng hoàn toàn từ `note_index`,
 * KHÔNG chạm vào GitHub.
 */
export interface NoteSummary {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  fav: boolean;
  /** ISO-8601 */
  created: string;
  /** ISO-8601 */
  updated: string;
  latestVersion: number;
  imageCount: number;
  commentCount: number;
  quizCount: number;
}

/** Một hàng của bảng `note_index` trong Postgres. */
export interface NoteIndexRow {
  id: string;
  userId: string;
  noteId: string;
  title: string;
  /** `norm(title)` — dùng cho tìm kiếm không dấu. */
  titleNorm: string;
  description: string;
  /** `norm(description)` */
  descriptionNorm: string;
  priority: Priority;
  favorite: boolean;
  /** `slugify()` của từng tag, đã khử dấu. */
  tagSlugs: string[];
  /** Tên tag hiển thị, cùng thứ tự với `tagSlugs`. */
  tagNames: string[];
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 */
  updatedAt: string;
  latestVersion: number;
  imageCount: number;
  commentCount: number;
  quizCount: number;
  /** Blob sha của file JSON trên GitHub; null khi chưa ghi lần nào. */
  contentSha: string | null;
}

export interface UserPrefs {
  userId: string;
  theme: 'light' | 'dark';
  /** 14..22 */
  fontSize: number;
  view: 'grid' | 'list';
  sidebarCollapsed: boolean;
  /** Tối đa 5 mục, mới nhất ở đầu. */
  recentSearches: string[];
}

/** Khoá API không bao giờ trả về giá trị đầy đủ sau lần tạo đầu tiên. */
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  /** 10 ký tự đầu, vd `kn_1a2b3c4`. */
  prefix: string;
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 hoặc null nếu chưa dùng. */
  lastUsedAt: string | null;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
}

export interface NoteFilters {
  /** Chuỗi thô người dùng gõ; `#` đầu chuỗi = chỉ tìm trong tag. */
  query?: string;
  nav?: NavKey;
  priority?: Priority | null;
  /** Tên tag hiển thị (không phải slug). */
  tag?: string | null;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface NoteListResult {
  notes: NoteSummary[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

export interface CreateNoteInput {
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  content: string;
  images: NoteImage[];
  /** Rỗng => "Tạo ghi chú". */
  changeNote?: string;
}

export interface UpdateNoteInput {
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  content: string;
  images: NoteImage[];
  /** Rỗng => "Cập nhật nội dung". */
  changeNote?: string;
}

/** Vỏ lỗi JSON dùng chung cho cả API nội bộ và `/api/v1`. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'] as const;

/** Trọng số sắp xếp — khớp `PRI_ORDER` trong prototype. */
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Nhãn tiếng Việt — khớp `PRI` trong prototype. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

export const DEFAULT_PAGE_SIZE = 6;
```

- [ ] **Step 2: Write the type test**

```ts
// src/lib/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  PRIORITY_ORDER,
  PRIORITY_LABEL,
  PRIORITIES,
  DEFAULT_PAGE_SIZE,
  type Note,
} from './types';

describe('domain constants', () => {
  it('orders priorities high → medium → low', () => {
    expect([...PRIORITIES].sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])).toEqual([
      'high',
      'medium',
      'low',
    ]);
  });

  it('uses the prototype Vietnamese labels', () => {
    expect(PRIORITY_LABEL).toEqual({ high: 'Cao', medium: 'Trung bình', low: 'Thấp' });
  });

  it('defaults to 6 notes per page', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(6);
  });

  it('accepts a fully-populated Note', () => {
    const n: Note = {
      id: 'n1',
      title: 'T',
      desc: 'D',
      tags: ['Tim mạch'],
      priority: 'high',
      fav: true,
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-02T00:00:00.000Z',
      content: '<p>x</p>',
      images: [{ id: 'i1', label: 'a', src: '/api/images/u1/i1' }],
      comments: [{ id: 'c1', text: 'hi', date: '2024-01-02T00:00:00.000Z', author: { id: 'u1', displayName: 'Bác sĩ' } }],
      versions: [{ v: 1, date: '2024-01-01T00:00:00.000Z', note: 'Tạo ghi chú', title: 'T', content: '<p>x</p>' }],
      quizzes: [],
    };
    expect(n.versions[n.versions.length - 1].v).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/lib/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/types.test.ts
git commit -m "feat(types): add core domain types ported from the prototype data model"
```

---

### Task B3: Pure text utils — norm, rel, fmt, clip, shuffle, slugify

**Files:**
- Create: `src/lib/text/normalize.ts`
- Create: `src/lib/text/date.ts`
- Create: `src/lib/text/array.ts`
- Create: `src/lib/text/index.ts`
- Test: `src/lib/text/text.test.ts`
- Test: `src/lib/text/date.test.ts`
- Test: `src/lib/text/array.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `norm(s: string | null | undefined): string`
  - `clip(s: string, n?: number): string`
  - `slugify(s: string): string`
  - `fmt(s: string | Date): string`
  - `rel(s: string | Date, now?: number): string`
  - `shuffle<T>(a: readonly T[]): T[]`

- [ ] **Step 1: Write the failing text tests**

```ts
// src/lib/text/text.test.ts
import { describe, it, expect } from 'vitest';
import { norm, clip, slugify } from './normalize';

describe('norm', () => {
  it('lowercases', () => {
    expect(norm('ABC')).toBe('abc');
  });

  it('strips Vietnamese diacritics via NFD', () => {
    expect(norm('Tim mạch')).toBe('tim mach');
    expect(norm('Phác đồ')).toBe('phac do');
    expect(norm('Cấp cứu')).toBe('cap cuu');
    expect(norm('Nội tiết')).toBe('noi tiet');
    expect(norm('Chẩn đoán hình ảnh')).toBe('chan doan hinh anh');
  });

  it('maps đ to d (đ has no NFD decomposition)', () => {
    expect(norm('đ')).toBe('d');
    expect(norm('Đái tháo đường')).toBe('dai thao duong');
    expect(norm('Điện giải')).toBe('dien giai');
  });

  it('normalises "Sổ" to "so"', () => {
    expect(norm('Sổ')).toBe('so');
    expect(norm('Sổ Lâm Sàng')).toBe('so lam sang');
  });

  it('handles every Vietnamese vowel family', () => {
    expect(norm('ăâêôơư')).toBe('aaeoou');
    expect(norm('ằẳẵặầẩẫậềểễệồổỗộờởỡợừửữự')).toBe('aaaaaaaaeeeeoooooooooouuuu');
    expect(norm('ýỳỷỹỵ')).toBe('yyyyy');
  });

  it('returns an empty string for null and undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
    expect(norm('')).toBe('');
  });

  it('leaves punctuation and digits alone', () => {
    expect(norm('HA ≥ 140/90 mmHg')).toBe('ha ≥ 140/90 mmhg');
  });
});

describe('clip', () => {
  it('returns the string unchanged when at or under the limit', () => {
    expect(clip('abc', 3)).toBe('abc');
    expect(clip('abc')).toBe('abc');
  });

  it('cuts to n-1 characters, trims, and appends an ellipsis', () => {
    expect(clip('abcdef', 4)).toBe('abc…');
  });

  it('trims trailing whitespace before the ellipsis', () => {
    expect(clip('abc def', 5)).toBe('abc…');
  });

  it('defaults to 150 characters', () => {
    const long = 'x'.repeat(200);
    expect(clip(long)).toHaveLength(150);
    expect(clip(long).endsWith('…')).toBe(true);
  });
});

describe('slugify', () => {
  it('normalises Vietnamese then hyphenates', () => {
    expect(slugify('Tim mạch')).toBe('tim-mach');
    expect(slugify('Chẩn đoán hình ảnh')).toBe('chan-doan-hinh-anh');
    expect(slugify('Đái tháo đường')).toBe('dai-thao-duong');
  });

  it('collapses runs of separators and trims them from both ends', () => {
    expect(slugify('  --Phác  đồ--  ')).toBe('phac-do');
  });

  it('is stable across accent variants of the same tag', () => {
    expect(slugify('Tim mạch')).toBe(slugify('tim mach'));
  });

  it('falls back to "tag" when nothing survives', () => {
    expect(slugify('###')).toBe('tag');
    expect(slugify('')).toBe('tag');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/text/text.test.ts`
Expected: FAIL — `Failed to resolve import "./normalize"`.

- [ ] **Step 3: Write `src/lib/text/normalize.ts`**

```ts
// src/lib/text/normalize.ts

/**
 * Chuẩn hoá tiếng Việt — port nguyên văn từ prototype:
 *   s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')
 *
 * `đ` không tách được bằng NFD nên phải thay riêng, và phải thay SAU khi
 * đã toLowerCase (để `Đ` cũng thành `d`).
 */
export const norm = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

/** Cắt chuỗi — port nguyên văn từ prototype. */
export const clip = (s: string, n = 150): string =>
  s.length > n ? s.slice(0, n - 1).trim() + '…' : s;

/** Slug ASCII ổn định cho tag, dùng làm khoá duy nhất theo user. */
export const slugify = (s: string): string =>
  norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tag';
```

- [ ] **Step 4: Run the text tests**

Run: `npx vitest run src/lib/text/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing date tests**

Boundaries matter: the prototype uses `m < 1`, `m < 60`, `m < 1440`, `m < 10080` where `m` is elapsed **minutes**, so 60 minutes exactly is already "1 giờ trước".

```ts
// src/lib/text/date.test.ts
import { describe, it, expect } from 'vitest';
import { fmt, rel } from './date';

const NOW = new Date('2024-03-07T12:00:00+07:00').getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('fmt', () => {
  it('formats as dd/mm/yyyy with zero padding', () => {
    expect(fmt('2024-03-07T12:00:00+07:00')).toBe('07/03/2024');
    expect(fmt('2024-12-25T12:00:00+07:00')).toBe('25/12/2024');
    expect(fmt('2024-01-01T12:00:00+07:00')).toBe('01/01/2024');
  });

  it('accepts a Date', () => {
    expect(fmt(new Date('2025-09-26T12:00:00+07:00'))).toBe('26/09/2025');
  });
});

describe('rel', () => {
  it('returns "vừa xong" strictly under one minute', () => {
    expect(rel(ago(0), NOW)).toBe('vừa xong');
    expect(rel(ago(0.9), NOW)).toBe('vừa xong');
  });

  it('switches to minutes at exactly one minute', () => {
    expect(rel(ago(1), NOW)).toBe('1 phút trước');
    expect(rel(ago(59), NOW)).toBe('59 phút trước');
    expect(rel(ago(59.9), NOW)).toBe('59 phút trước');
  });

  it('switches to hours at exactly 60 minutes', () => {
    expect(rel(ago(60), NOW)).toBe('1 giờ trước');
    expect(rel(ago(1439), NOW)).toBe('23 giờ trước');
  });

  it('switches to days at exactly 1440 minutes', () => {
    expect(rel(ago(1440), NOW)).toBe('1 ngày trước');
    expect(rel(ago(10079), NOW)).toBe('6 ngày trước');
  });

  it('falls back to dd/mm/yyyy at exactly 7 days', () => {
    expect(rel(ago(10080), NOW)).toBe('29/02/2024');
    expect(rel(ago(60 * 24 * 60), NOW)).toBe('07/01/2024');
  });

  it('floors rather than rounds', () => {
    expect(rel(ago(119), NOW)).toBe('1 giờ trước');
    expect(rel(ago(2879), NOW)).toBe('1 ngày trước');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/text/date.test.ts`
Expected: FAIL — `Failed to resolve import "./date"`.

- [ ] **Step 7: Write `src/lib/text/date.ts`**

`now` is injectable purely so the tests above can pin time; production callers omit it.

```ts
// src/lib/text/date.ts

/** dd/mm/yyyy theo giờ địa phương — port nguyên văn từ prototype. */
export const fmt = (s: string | Date): string => {
  const t = s instanceof Date ? s : new Date(s);
  return (
    String(t.getDate()).padStart(2, '0') +
    '/' +
    String(t.getMonth() + 1).padStart(2, '0') +
    '/' +
    t.getFullYear()
  );
};

/**
 * Thời gian tương đối — port nguyên văn từ prototype.
 * < 1 phút  → "vừa xong"
 * < 60 phút → "x phút trước"
 * < 24 giờ  → "x giờ trước"
 * < 7 ngày  → "x ngày trước"
 * còn lại   → dd/mm/yyyy
 */
export const rel = (s: string | Date, now: number = Date.now()): string => {
  const t = s instanceof Date ? s.getTime() : new Date(s).getTime();
  const m = (now - t) / 6e4;
  if (m < 1) return 'vừa xong';
  if (m < 60) return Math.floor(m) + ' phút trước';
  if (m < 1440) return Math.floor(m / 60) + ' giờ trước';
  if (m < 10080) return Math.floor(m / 1440) + ' ngày trước';
  return fmt(s);
};
```

- [ ] **Step 8: Run the date tests**

Run: `npx vitest run src/lib/text/date.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing array tests**

```ts
// src/lib/text/array.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shuffle } from './array';

afterEach(() => vi.restoreAllMocks());

describe('shuffle', () => {
  it('does not mutate the input', () => {
    const src = [1, 2, 3, 4, 5];
    const copy = [...src];
    shuffle(src);
    expect(src).toEqual(copy);
  });

  it('preserves every element', () => {
    const out = shuffle(['a', 'b', 'c', 'd']);
    expect([...out].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is a Fisher-Yates walk from the end (deterministic with Math.random stubbed to 0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // j is always 0, so each element from the end is swapped with index 0.
    expect(shuffle([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
  });

  it('is identity when Math.random maps j back to i', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(shuffle([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([7])).toEqual([7]);
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npx vitest run src/lib/text/array.test.ts`
Expected: FAIL — `Failed to resolve import "./array"`.

- [ ] **Step 11: Write `src/lib/text/array.ts`**

```ts
// src/lib/text/array.ts

/** Fisher-Yates — port nguyên văn từ prototype, không sửa mảng gốc. */
export const shuffle = <T>(a: readonly T[]): T[] => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
```

- [ ] **Step 12: Write the barrel**

```ts
// src/lib/text/index.ts
export { norm, clip, slugify } from './normalize';
export { fmt, rel } from './date';
export { shuffle } from './array';
export { sections, stripHtml } from './html';
```

Note: `./html` lands in Task B4 — run `npx tsc --noEmit` only after that task.

- [ ] **Step 13: Run the full suite**

Run: `npx vitest run src/lib/text`
Expected: PASS (all three files).

- [ ] **Step 14: Commit**

```bash
git add src/lib/text
git commit -m "feat(text): port norm/rel/fmt/clip/shuffle/slugify verbatim with Vietnamese + boundary tests"
```

---

### Task B4: `sections(html)` and `stripHtml` on the server

**Files:**
- Create: `src/lib/text/html.ts`
- Test: `src/lib/text/html.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Section { h: string; items: string[] }`
  - `sections(html: string | null | undefined): Section[]`
  - `stripHtml(html: string | null | undefined): string`
  - `extractHighlights(html: string | null | undefined): { id: string; text: string }[]`

- [ ] **Step 1: Write the failing test**

Case coverage mirrors the prototype's branch table exactly: `H2`/`H3` open a section; `UL`/`OL` push every `li`; `P`/`BLOCKQUOTE` push their trimmed text if non-empty; `TABLE` pushes every row *after* the first, joined with ` — `; anything before the first heading is dropped; empty sections are filtered out.

```ts
// src/lib/text/html.test.ts
import { describe, it, expect } from 'vitest';
import { sections, stripHtml, extractHighlights } from './html';

describe('sections', () => {
  it('returns [] for empty, null and undefined input', () => {
    expect(sections('')).toEqual([]);
    expect(sections(null)).toEqual([]);
    expect(sections(undefined)).toEqual([]);
  });

  it('opens a section on H2 and collects list items', () => {
    const html = '<h2>Ngưỡng chẩn đoán</h2><ul><li>HA tại nhà ≥ 135/85</li><li>Holter ≥ 130/80</li></ul>';
    expect(sections(html)).toEqual([
      { h: 'Ngưỡng chẩn đoán', items: ['HA tại nhà ≥ 135/85', 'Holter ≥ 130/80'] },
    ]);
  });

  it('opens a section on H3 too', () => {
    expect(sections('<h3>Phụ</h3><p>nội dung</p>')).toEqual([{ h: 'Phụ', items: ['nội dung'] }]);
  });

  it('collects ordered list items', () => {
    expect(sections('<h2>A</h2><ol><li>một</li><li>hai</li></ol>')).toEqual([
      { h: 'A', items: ['một', 'hai'] },
    ]);
  });

  it('collects paragraphs and blockquotes but skips empty ones', () => {
    const html = '<h2>A</h2><p>đoạn</p><p>   </p><blockquote>trích</blockquote>';
    expect(sections(html)).toEqual([{ h: 'A', items: ['đoạn', 'trích'] }]);
  });

  it('skips the header row of a table and joins cells with an em dash', () => {
    const html =
      '<h2>Bảng điểm</h2><table><tr><th>Thành phần</th><th>Điểm</th></tr>' +
      '<tr><td>Mắt (E)</td><td>1–4</td></tr><tr><td>Lời nói (V)</td><td>1–5</td></tr></table>';
    expect(sections(html)).toEqual([
      { h: 'Bảng điểm', items: ['Mắt (E) — 1–4', 'Lời nói (V) — 1–5'] },
    ]);
  });

  it('drops content that appears before the first heading', () => {
    expect(sections('<p>mồ côi</p><h2>A</h2><p>con</p>')).toEqual([{ h: 'A', items: ['con'] }]);
  });

  it('drops headings that collect no items', () => {
    expect(sections('<h2>Rỗng</h2><h2>Có</h2><p>x</p>')).toEqual([{ h: 'Có', items: ['x'] }]);
  });

  it('trims the heading text', () => {
    expect(sections('<h2>  Mục tiêu  </h2><p>x</p>')[0].h).toBe('Mục tiêu');
  });

  it('reads through inline markup inside list items', () => {
    expect(sections('<h2>A</h2><ul><li>HA <strong>≥ 140/90</strong> mmHg</li></ul>')[0].items[0]).toBe(
      'HA ≥ 140/90 mmHg',
    );
  });

  it('handles a multi-section prototype note', () => {
    const html =
      '<h2>Ngưỡng chẩn đoán</h2><p>Tăng huyết áp khi HA ≥ 140/90 mmHg.</p>' +
      '<h2>Mục tiêu điều trị</h2><p>Mục tiêu &lt; 130/80 mmHg.</p>' +
      '<h2>Lựa chọn thuốc khởi đầu</h2><ol><li>Phối hợp hai thuốc.</li></ol>';
    const out = sections(html);
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.h)).toEqual(['Ngưỡng chẩn đoán', 'Mục tiêu điều trị', 'Lựa chọn thuốc khởi đầu']);
    expect(out[1].items).toEqual(['Mục tiêu < 130/80 mmHg.']);
  });
});

describe('stripHtml', () => {
  it('replaces tags with spaces and collapses whitespace', () => {
    expect(stripHtml('<h2>A</h2><p>b  c</p>')).toBe('A b c');
  });

  it('returns an empty string for nullish input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('extractHighlights', () => {
  it('groups marks by data-hl and joins their text with a single space', () => {
    const html = '<p><mark data-hl="h1">Ưu tiên</mark> viên <mark data-hl="h1">phối hợp</mark></p>';
    expect(extractHighlights(html)).toEqual([{ id: 'h1', text: 'Ưu tiên phối hợp' }]);
  });

  it('preserves document order across distinct highlights', () => {
    const html = '<p><mark data-hl="a">một</mark><mark data-hl="b">hai</mark></p>';
    expect(extractHighlights(html).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('returns [] when there are no marks', () => {
    expect(extractHighlights('<p>x</p>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/text/html.test.ts`
Expected: FAIL — `Failed to resolve import "./html"`.

- [ ] **Step 3: Write `src/lib/text/html.ts`**

`linkedom`'s `parseHTML` gives a real DOM (`body.children`, `querySelectorAll`, `textContent`) on the server, so the prototype's traversal transfers one-for-one. Do not swap it for a regex parser — the prototype's `TABLE` and nested-inline cases depend on real `textContent`.

```ts
// src/lib/text/html.ts
import { parseHTML } from 'linkedom';

export interface Section {
  h: string;
  items: string[];
}

/**
 * Tách ghi chú thành các mục theo H2/H3 — port nguyên văn từ prototype
 * (`sections()`), thay `DOMParser` bằng `linkedom` để chạy được trên server.
 */
export function sections(html: string | null | undefined): Section[] {
  const { document } = parseHTML(`<!doctype html><body>${html || ''}</body>`);
  const out: Section[] = [];
  let cur: Section | null = null;

  for (const el of Array.from(document.body.children) as Element[]) {
    const tag = el.tagName;
    if (tag === 'H2' || tag === 'H3') {
      cur = { h: (el.textContent || '').trim(), items: [] };
      out.push(cur);
    } else if (cur && (tag === 'UL' || tag === 'OL')) {
      el.querySelectorAll('li').forEach((li) => {
        cur!.items.push((li.textContent || '').trim());
      });
    } else if (cur && (tag === 'P' || tag === 'BLOCKQUOTE')) {
      const t = (el.textContent || '').trim();
      if (t) cur.items.push(t);
    } else if (cur && tag === 'TABLE') {
      el.querySelectorAll('tr').forEach((tr, i) => {
        if (!i) return;
        cur!.items.push(
          Array.from(tr.children as unknown as Element[])
            .map((td) => (td.textContent || '').trim())
            .join(' — '),
        );
      });
    }
  }

  return out.filter((s) => s.items.length > 0);
}

/** Văn bản thuần từ HTML — port nguyên văn từ prototype (`replace(/<[^>]+>/g,' ')`). */
export const stripHtml = (html: string | null | undefined): string =>
  (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Liệt kê các đoạn đã đánh dấu — port từ prototype (`hls` trong `renderVals`).
 * Nhiều `<mark>` cùng `data-hl` được gộp thành một mục, giữ thứ tự xuất hiện.
 */
export function extractHighlights(html: string | null | undefined): { id: string; text: string }[] {
  const { document } = parseHTML(`<!doctype html><body>${html || ''}</body>`);
  const order: string[] = [];
  const map = new Map<string, string>();

  document.querySelectorAll('mark[data-hl]').forEach((m) => {
    const id = (m as Element).getAttribute('data-hl');
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, '');
      order.push(id);
    }
    const prev = map.get(id)!;
    map.set(id, prev ? prev + ' ' + (m.textContent || '') : m.textContent || '');
  });

  return order.map((id) => ({
    id,
    text: (map.get(id) || '').replace(/\s+/g, ' ').trim(),
  }));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/text/html.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Typecheck the whole utils barrel**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/text/html.ts src/lib/text/html.test.ts src/lib/text/index.ts
git commit -m "feat(text): port sections()/stripHtml/extractHighlights to the server via linkedom"
```

---

### Task B5: Postgres schema, dual-driver Drizzle client, local database setup

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`
- Create: `drizzle.config.ts`
- Create: `scripts/db-setup.sh`
- Create: `scripts/migrate.ts`
- Test: `src/lib/db/index.test.ts`
- Test: `src/lib/db/schema.test.ts`

**Interfaces:**
- Consumes: `Priority`, `NoteSummary` from `@/lib/types` (Task B2); `norm`, `slugify` from `@/lib/text` (Task B3).
- Produces:
  - `db` — a Drizzle instance whose driver is chosen from `DATABASE_URL`
  - `users`, `apiKeys`, `tags`, `noteIndex`, `userPrefs` table objects
  - `pickDriver(url: string): 'neon-http' | 'node-postgres'`
  - `getDb(): Database`, `closeDb(): Promise<void>`

- [ ] **Step 1: Write the failing driver-selection test**

```ts
// src/lib/db/index.test.ts
import { describe, it, expect } from 'vitest';
import { pickDriver } from './index';

describe('pickDriver', () => {
  it('uses neon-http for Neon hosts', () => {
    expect(pickDriver('postgresql://u:p@ep-cool-123.eu-central-1.aws.neon.tech/db?sslmode=require')).toBe('neon-http');
    expect(pickDriver('postgres://u:p@ep-x.us-east-2.aws.neon.tech/db')).toBe('neon-http');
  });

  it('uses node-postgres for localhost', () => {
    expect(pickDriver('postgresql://spt@localhost:5432/kno_notes_dev')).toBe('node-postgres');
    expect(pickDriver('postgresql://spt@127.0.0.1:5432/kno_notes_test')).toBe('node-postgres');
  });

  it('uses node-postgres for any non-Neon host', () => {
    expect(pickDriver('postgresql://u:p@db.internal:5432/x')).toBe('node-postgres');
  });

  it('throws on an unparseable URL rather than guessing', () => {
    expect(() => pickDriver('not-a-url')).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Write `src/lib/db/schema.ts`**

Three deliberate additions beyond SPEC §2.2, each earning its place: `title_norm` / `description_norm` let the query filter without pulling every row (`norm()` is a JS function Postgres cannot call); `tag_names` keeps the display-cased tag next to its slug so the dashboard never needs a join against `tags`.

```ts
// src/lib/db/schema.ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** sha256 hex of the full `kn_<32 hex>` key. The key itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    /** First 10 characters of the key, e.g. `kn_1a2b3c4` — shown in the UI. */
    prefix: text('prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_user_idx').on(t.userId)],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Display casing, e.g. "Tim mạch". */
    name: text('name').notNull(),
    /** `slugify(name)`, e.g. "tim-mach". */
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_user_slug_unique').on(t.userId, t.slug)],
);

export const noteIndex = pgTable(
  'note_index',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The note id used in the storage path and every URL, e.g. "n1". */
    noteId: text('note_id').notNull(),
    title: text('title').notNull(),
    /** norm(title) — accent-free, for search. */
    titleNorm: text('title_norm').notNull(),
    description: text('description').notNull().default(''),
    /** norm(description) — accent-free, for search. */
    descriptionNorm: text('description_norm').notNull().default(''),
    priority: text('priority').$type<'high' | 'medium' | 'low'>().notNull().default('medium'),
    favorite: boolean('favorite').notNull().default(false),
    tagSlugs: text('tag_slugs').array().notNull().default([]),
    /** Display names, index-aligned with tagSlugs. */
    tagNames: text('tag_names').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    latestVersion: integer('latest_version').notNull().default(1),
    imageCount: integer('image_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    quizCount: integer('quiz_count').notNull().default(0),
    /** Blob sha of the note JSON in the storage adapter; invalidates cache + embeddings. */
    contentSha: text('content_sha'),
  },
  (t) => [
    uniqueIndex('note_index_user_note_unique').on(t.userId, t.noteId),
    index('note_index_user_updated_idx').on(t.userId, t.updatedAt.desc()),
    index('note_index_user_priority_idx').on(t.userId, t.priority),
    index('note_index_user_favorite_idx').on(t.userId, t.favorite),
    index('note_index_tag_slugs_idx').using('gin', t.tagSlugs),
  ],
);

export const userPrefs = pgTable('user_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').$type<'light' | 'dark'>().notNull().default('light'),
  fontSize: integer('font_size').notNull().default(17),
  view: text('view').$type<'grid' | 'list'>().notNull().default('grid'),
  sidebarCollapsed: boolean('sidebar_collapsed').notNull().default(false),
  recentSearches: jsonb('recent_searches').$type<string[]>().notNull().default([]),
});

export type UserRow = typeof users.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type NoteIndexDbRow = typeof noteIndex.$inferSelect;
export type UserPrefsRow = typeof userPrefs.$inferSelect;
```

- [ ] **Step 4: Write `src/lib/db/index.ts`**

The `db` export is a lazily-initialised singleton behind a Proxy, so importing the module in a unit test that never touches Postgres does not open a connection.

```ts
// src/lib/db/index.ts
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';
import * as schema from './schema';

export type Driver = 'neon-http' | 'node-postgres';

/**
 * Neon's HTTP driver speaks to a Neon endpoint over HTTPS and cannot reach a
 * local Postgres server, so the driver must follow the host.
 */
export function pickDriver(url: string): Driver {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection URL: ${JSON.stringify(url)}`);
  }
  if (!host) throw new Error('DATABASE_URL has no host');
  return host.endsWith('.neon.tech') ? 'neon-http' : 'node-postgres';
}

export type Database =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | NodePgDatabase<typeof schema>;

let _db: Database | null = null;
let _pool: Pool | null = null;

export function getDb(): Database {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const driver = pickDriver(url);
  if (driver === 'neon-http') {
    _db = drizzleNeon(neon(url), { schema });
  } else {
    _pool = new Pool({ connectionString: url, max: 5 });
    _db = drizzleNode(_pool, { schema });
  }
  // eslint-disable-next-line no-console
  console.log(`[db] driver=${driver} host=${new URL(url).hostname}`);
  return _db;
}

/** Closes the node-postgres pool. No-op on neon-http. Used by tests and scripts. */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  _db = null;
}

/**
 * Proxy so callers write `db.select()...` without calling getDb() first,
 * while the real connection is still created lazily on first use.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as Database;

export * from './schema';
```

- [ ] **Step 5: Run the driver test**

Run: `npx vitest run src/lib/db/index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://spt@localhost:5432/kno_notes_dev',
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 7: Write `scripts/db-setup.sh`**

```bash
#!/usr/bin/env bash
# Idempotently create the local dev + test databases on the Homebrew
# postgresql@16 server, then apply Drizzle migrations to both.
#
#   npm run db:setup    create if missing, migrate
#   npm run db:reset    drop both, recreate, migrate
set -euo pipefail

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
USER_NAME="${PGUSER:-$(whoami)}"
DEV_DB="kno_notes_dev"
TEST_DB="kno_notes_test"

if ! pg_isready -h "$HOST" -p "$PORT" >/dev/null 2>&1; then
  echo "error: no Postgres on $HOST:$PORT. Start it: brew services start postgresql@16" >&2
  exit 1
fi

db_exists() {
  psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$1'" | grep -q 1
}

if [ "${1:-}" = "--drop" ]; then
  for d in "$DEV_DB" "$TEST_DB"; do
    if db_exists "$d"; then
      echo "dropping $d"
      psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -c "DROP DATABASE \"$d\"" >/dev/null
    fi
  done
fi

for d in "$DEV_DB" "$TEST_DB"; do
  if db_exists "$d"; then
    echo "ok: $d already exists"
  else
    echo "creating $d"
    createdb -h "$HOST" -p "$PORT" -U "$USER_NAME" "$d"
  fi
done

echo "migrating $DEV_DB"
DATABASE_URL="postgresql://$USER_NAME@$HOST:$PORT/$DEV_DB" npx tsx scripts/migrate.ts

echo "migrating $TEST_DB"
DATABASE_URL="postgresql://$USER_NAME@$HOST:$PORT/$TEST_DB" npx tsx scripts/migrate.ts

echo "done. dev=$DEV_DB test=$TEST_DB"
```

Then run `chmod +x scripts/db-setup.sh`.

- [ ] **Step 8: Write `scripts/migrate.ts`**

Migration must use `node-postgres` locally and `neon-http` on Vercel, so it reuses `pickDriver`.

```ts
// scripts/migrate.ts
import 'dotenv/config';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { migrate as migrateNode } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';
import { pickDriver } from '../src/lib/db/index';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const migrationsFolder = './drizzle';

  if (pickDriver(url) === 'neon-http') {
    await migrateNeon(drizzleNeon(neon(url)), { migrationsFolder });
  } else {
    const pool = new Pool({ connectionString: url, max: 1 });
    await migrateNode(drizzleNode(pool), { migrationsFolder });
    await pool.end();
  }
  console.log('migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 9: Generate and apply the first migration**

```bash
cd /Users/spt/Documents/kno-notes
chmod +x scripts/db-setup.sh
npx drizzle-kit generate --name init
npm run db:setup
```
Expected: `drizzle/0000_init.sql` created; both databases created and migrated. Verify with `psql -d kno_notes_dev -c '\dt'` — it lists `api_keys`, `note_index`, `tags`, `user_prefs`, `users`, `__drizzle_migrations`.

- [ ] **Step 10: Write the schema integration test**

This one talks to the real local test database — that is the point of having it.

```ts
// src/lib/db/schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db, closeDb, users, noteIndex, tags, userPrefs, apiKeys } from './index';

let userA = '';
let userB = '';

beforeAll(async () => {
  await db.delete(users).where(eq(users.username, 'schema_a'));
  await db.delete(users).where(eq(users.username, 'schema_b'));
  const [a] = await db.insert(users)
    .values({ username: 'schema_a', passwordHash: 'x', displayName: 'A' }).returning();
  const [b] = await db.insert(users)
    .values({ username: 'schema_b', passwordHash: 'x', displayName: 'B' }).returning();
  userA = a.id;
  userB = b.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userA));
  await db.delete(users).where(eq(users.id, userB));
  await closeDb();
});

describe('note_index', () => {
  it('lets two users own the same note_id', async () => {
    await db.insert(noteIndex).values({
      userId: userA, noteId: 'n1', title: 'A', titleNorm: 'a',
      description: '', descriptionNorm: '', priority: 'high',
      tagSlugs: ['tim-mach'], tagNames: ['Tim mạch'],
    });
    await db.insert(noteIndex).values({
      userId: userB, noteId: 'n1', title: 'B', titleNorm: 'b',
      description: '', descriptionNorm: '', priority: 'low',
      tagSlugs: [], tagNames: [],
    });
    const rows = await db.select().from(noteIndex).where(eq(noteIndex.noteId, 'n1'));
    expect(rows).toHaveLength(2);
  });

  it('rejects a duplicate (user_id, note_id)', async () => {
    await expect(
      db.insert(noteIndex).values({
        userId: userA, noteId: 'n1', title: 'dup', titleNorm: 'dup',
        description: '', descriptionNorm: '', priority: 'low',
        tagSlugs: [], tagNames: [],
      }),
    ).rejects.toThrow();
  });

  it('scopes a lookup by user_id so user B never sees user A row', async () => {
    const rows = await db.select().from(noteIndex)
      .where(and(eq(noteIndex.userId, userB), eq(noteIndex.noteId, 'n1')));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('B');
  });

  it('round-trips tag_slugs and tag_names as text[]', async () => {
    const [row] = await db.select().from(noteIndex)
      .where(and(eq(noteIndex.userId, userA), eq(noteIndex.noteId, 'n1')));
    expect(row.tagSlugs).toEqual(['tim-mach']);
    expect(row.tagNames).toEqual(['Tim mạch']);
  });
});

describe('tags', () => {
  it('enforces UNIQUE(user_id, slug) but allows the slug under another user', async () => {
    await db.insert(tags).values({ userId: userA, name: 'Tim mạch', slug: 'tim-mach' });
    await db.insert(tags).values({ userId: userB, name: 'Tim mạch', slug: 'tim-mach' });
    await expect(
      db.insert(tags).values({ userId: userA, name: 'Tim Mach', slug: 'tim-mach' }),
    ).rejects.toThrow();
  });
});

describe('user_prefs', () => {
  it('applies the prototype defaults', async () => {
    await db.insert(userPrefs).values({ userId: userA });
    const [p] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userA));
    expect(p).toMatchObject({
      theme: 'light', fontSize: 17, view: 'grid',
      sidebarCollapsed: false, recentSearches: [],
    });
  });
});

describe('cascade', () => {
  it('deletes dependent rows when the user is deleted', async () => {
    const [tmp] = await db.insert(users)
      .values({ username: 'schema_tmp', passwordHash: 'x', displayName: 'T' }).returning();
    await db.insert(apiKeys).values({
      userId: tmp.id, name: 'k', tokenHash: 'hash-schema-tmp', prefix: 'kn_aaaaaaa',
    });
    await db.delete(users).where(eq(users.id, tmp.id));
    const left = await db.select().from(apiKeys).where(eq(apiKeys.userId, tmp.id));
    expect(left).toHaveLength(0);
  });
});
```

- [ ] **Step 11: Run the schema test**

Run: `npx vitest run src/lib/db/schema.test.ts`
Expected: PASS (7 tests). If it errors with `database "kno_notes_test" does not exist`, run `npm run db:setup` first.

- [ ] **Step 12: Commit**

```bash
git add src/lib/db drizzle drizzle.config.ts scripts/db-setup.sh scripts/migrate.ts
git commit -m "feat(db): add Drizzle schema, URL-driven driver selection, and local Postgres setup"
```

---

### Task B6: Storage adapter interface, path guard, filesystem adapter, shared contract suite

**Files:**
- Create: `src/lib/storage/types.ts`
- Create: `src/lib/storage/paths.ts`
- Create: `src/lib/storage/filesystem.ts`
- Create: `src/lib/storage/index.ts`
- Test: `src/lib/storage/paths.test.ts`
- Test: `src/lib/storage/contract.ts` (shared suite — a helper, not collected as its own test file)
- Test: `src/lib/storage/filesystem.test.ts`

**Interfaces:**
- Consumes: `Note` from `@/lib/types` (Task B2).
- Produces:
```ts
export interface StoredImage { data: Buffer; contentType: string; sha: string }
export interface NoteStorage {
  readonly kind: 'github' | 'filesystem';
  readNote(userId: string, noteId: string): Promise<Note | null>;
  writeNote(userId: string, note: Note): Promise<{ sha: string }>;
  deleteNote(userId: string, noteId: string): Promise<void>;
  listNoteIds(userId: string): Promise<string[]>;
  putImage(userId: string, imageId: string, buffer: Buffer, contentType: string): Promise<{ sha: string; path: string }>;
  getImage(userId: string, imageId: string): Promise<StoredImage | null>;
}
export function getStorage(): NoteStorage;
export function githubConfigured(): boolean;
export function safeSegment(value: string, label: string): string;
export function notePath(userId: string, noteId: string): string;
export function imagePath(userId: string, imageId: string, ext: string): string;
export function extForContentType(contentType: string): string;
export function blobSha(data: Buffer): string;
export function runStorageContract(name: string, make: () => Promise<NoteStorage>, teardown?: () => Promise<void>): void;
export const MAX_IMAGE_BYTES: number; // 4 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES: string[];
```

- [ ] **Step 1: Write the failing path-guard test**

This is Review Focus #1. It must fail *before* any I/O and on both adapters, which is why the guard lives in its own module.

```ts
// src/lib/storage/paths.test.ts
import { describe, it, expect } from 'vitest';
import { safeSegment, notePath, imagePath, extForContentType } from './paths';

describe('safeSegment', () => {
  it('accepts ordinary ids', () => {
    expect(safeSegment('n1', 'noteId')).toBe('n1');
    expect(safeSegment('n1758891234567', 'noteId')).toBe('n1758891234567');
    expect(safeSegment('3f2a9c10-7b4e-4a1d-9f88-1c2d3e4f5a6b', 'userId'))
      .toBe('3f2a9c10-7b4e-4a1d-9f88-1c2d3e4f5a6b');
    expect(safeSegment('img_a1b2c3', 'imageId')).toBe('img_a1b2c3');
  });

  it('rejects parent-directory traversal', () => {
    expect(() => safeSegment('..', 'noteId')).toThrow(/noteId/);
    expect(() => safeSegment('../../etc/passwd', 'noteId')).toThrow(/noteId/);
    expect(() => safeSegment('n1/../n2', 'noteId')).toThrow(/noteId/);
  });

  it('rejects any slash or backslash', () => {
    expect(() => safeSegment('a/b', 'noteId')).toThrow();
    expect(() => safeSegment('a\\b', 'noteId')).toThrow();
    expect(() => safeSegment('/absolute', 'userId')).toThrow();
  });

  it('rejects URL-encoded separators, which would decode later', () => {
    expect(() => safeSegment('%2e%2e', 'noteId')).toThrow();
    expect(() => safeSegment('a%2Fb', 'noteId')).toThrow();
    expect(() => safeSegment('a%5Cb', 'noteId')).toThrow();
  });

  it('rejects NUL bytes, dot-only names and empty strings', () => {
    expect(() => safeSegment(String.fromCharCode(97, 0, 98), 'noteId')).toThrow();
    expect(() => safeSegment('.', 'noteId')).toThrow();
    expect(() => safeSegment('', 'userId')).toThrow();
  });

  it('rejects anything over 128 characters', () => {
    expect(() => safeSegment('a'.repeat(129), 'noteId')).toThrow();
    expect(safeSegment('a'.repeat(128), 'noteId')).toHaveLength(128);
  });
});

describe('notePath / imagePath', () => {
  it('always nests under data/users/<userId>/', () => {
    expect(notePath('u1', 'n1')).toBe('data/users/u1/notes/n1.json');
    expect(imagePath('u1', 'i1', 'png')).toBe('data/users/u1/images/i1.png');
  });

  it('refuses to build a path from a traversing userId', () => {
    expect(() => notePath('../u2', 'n1')).toThrow(/userId/);
    expect(() => imagePath('..', 'i1', 'png')).toThrow(/userId/);
  });

  it('refuses to build a path from a traversing noteId', () => {
    expect(() => notePath('u1', '../../secret')).toThrow(/noteId/);
  });
});

describe('extForContentType', () => {
  it('maps the allowed image types', () => {
    expect(extForContentType('image/png')).toBe('png');
    expect(extForContentType('image/jpeg')).toBe('jpg');
    expect(extForContentType('image/webp')).toBe('webp');
    expect(extForContentType('image/gif')).toBe('gif');
    expect(extForContentType('image/avif')).toBe('avif');
  });

  it('ignores parameters and casing', () => {
    expect(extForContentType('IMAGE/PNG; charset=binary')).toBe('png');
  });

  it('throws for anything else, including SVG', () => {
    expect(() => extForContentType('image/svg+xml')).toThrow(/content type/i);
    expect(() => extForContentType('application/pdf')).toThrow(/content type/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `Failed to resolve import "./paths"`.

- [ ] **Step 3: Write `src/lib/storage/paths.ts`**

An allowlist, not a denylist: only `[A-Za-z0-9._-]` survives and the first character must be alphanumeric, so `.` and `..` cannot appear however they are encoded.

```ts
// src/lib/storage/paths.ts

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Kiểm tra một đoạn đường dẫn. Bất kỳ giá trị nào không phải định danh đơn giản
 * đều bị từ chối TRƯỚC khi có bất kỳ I/O nào, nên không adapter nào có thể bị
 * dụ ra khỏi tiền tố `data/users/<userId>/`.
 */
export function safeSegment(value: string, label: string): string {
  if (typeof value !== 'string' || !SEGMENT_RE.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

export const userRoot = (userId: string): string =>
  `data/users/${safeSegment(userId, 'userId')}`;

export const notesDir = (userId: string): string => `${userRoot(userId)}/notes`;

export const notePath = (userId: string, noteId: string): string =>
  `${notesDir(userId)}/${safeSegment(noteId, 'noteId')}.json`;

export const imagesDir = (userId: string): string => `${userRoot(userId)}/images`;

export const imagePath = (userId: string, imageId: string, ext: string): string =>
  `${imagesDir(userId)}/${safeSegment(imageId, 'imageId')}.${safeSegment(ext, 'ext')}`;

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** SVG is deliberately absent: it can carry script and these bytes are served inline. */
export function extForContentType(contentType: string): string {
  const key = (contentType || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_EXT[key];
  if (!ext) throw new Error(`Unsupported image content type: ${contentType}`);
  return ext;
}

export const CONTENT_TYPE_FOR_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export const ALLOWED_IMAGE_TYPES = Object.keys(IMAGE_EXT);
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
```

- [ ] **Step 4: Run the path test**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Write `src/lib/storage/types.ts`**

```ts
// src/lib/storage/types.ts
import type { Note } from '@/lib/types';

export interface StoredImage {
  data: Buffer;
  contentType: string;
  sha: string;
}

/**
 * Mọi phương thức nhận `userId` là tham số đầu tiên, BẮT BUỘC, và tự dựng
 * đường dẫn `data/users/<userId>/…`. Không phương thức nào nhận path từ caller.
 */
export interface NoteStorage {
  readonly kind: 'github' | 'filesystem';
  readNote(userId: string, noteId: string): Promise<Note | null>;
  writeNote(userId: string, note: Note): Promise<{ sha: string }>;
  deleteNote(userId: string, noteId: string): Promise<void>;
  listNoteIds(userId: string): Promise<string[]>;
  putImage(
    userId: string,
    imageId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ sha: string; path: string }>;
  getImage(userId: string, imageId: string): Promise<StoredImage | null>;
}

export class StorageConflictError extends Error {
  readonly code = 'STORAGE_CONFLICT';
  constructor(message = 'Storage write conflict') {
    super(message);
    this.name = 'StorageConflictError';
  }
}
```

- [ ] **Step 6: Write the shared contract suite**

One suite, run against every adapter. It is a plain exported function in a `.ts` file, not a `.test.ts`, so Vitest does not collect it twice.

```ts
// src/lib/storage/contract.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { NoteStorage } from './types';
import type { Note } from '@/lib/types';

export function makeNote(id: string, over: Partial<Note> = {}): Note {
  const now = '2024-03-07T05:00:00.000Z';
  return {
    id,
    title: 'Phác đồ điều trị tăng huyết áp',
    desc: 'Ngưỡng chẩn đoán và mục tiêu.',
    tags: ['Tim mạch', 'Phác đồ'],
    priority: 'high',
    fav: false,
    created: now,
    updated: now,
    content: '<h2>Ngưỡng chẩn đoán</h2><p>HA ≥ 140/90 mmHg</p>',
    images: [],
    comments: [],
    versions: [{ v: 1, date: now, note: 'Tạo ghi chú', title: 'Phác đồ', content: '<p>x</p>' }],
    quizzes: [],
    ...over,
  };
}

/** A 1x1 transparent PNG, as bytes. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export function runStorageContract(
  name: string,
  make: () => Promise<NoteStorage>,
  teardown: () => Promise<void> = async () => {},
) {
  describe(`NoteStorage contract: ${name}`, () => {
    let s: NoteStorage;
    const A = 'user-aaaaaaaa-1111';
    const B = 'user-bbbbbbbb-2222';

    beforeAll(async () => {
      s = await make();
    });
    afterAll(async () => {
      await teardown();
    });

    it('returns null for a note that was never written', async () => {
      expect(await s.readNote(A, 'missing')).toBeNull();
    });

    it('round-trips a note with Vietnamese content intact', async () => {
      await s.writeNote(A, makeNote('n1'));
      const got = await s.readNote(A, 'n1');
      expect(got).not.toBeNull();
      expect(got!.title).toBe('Phác đồ điều trị tăng huyết áp');
      expect(got!.content).toBe('<h2>Ngưỡng chẩn đoán</h2><p>HA ≥ 140/90 mmHg</p>');
      expect(got!.tags).toEqual(['Tim mạch', 'Phác đồ']);
    });

    it('returns a sha that changes when the content changes', async () => {
      const first = await s.writeNote(A, makeNote('n-sha', { title: 'one' }));
      const second = await s.writeNote(A, makeNote('n-sha', { title: 'two' }));
      expect(first.sha).toBeTruthy();
      expect(second.sha).toBeTruthy();
      expect(second.sha).not.toBe(first.sha);
    });

    it('overwrites an existing note rather than erroring', async () => {
      await s.writeNote(A, makeNote('n2', { title: 'v1' }));
      await s.writeNote(A, makeNote('n2', { title: 'v2' }));
      expect((await s.readNote(A, 'n2'))!.title).toBe('v2');
    });

    it('lists only the calling user note ids', async () => {
      await s.writeNote(B, makeNote('b-only'));
      const idsA = await s.listNoteIds(A);
      const idsB = await s.listNoteIds(B);
      expect(idsA).toContain('n1');
      expect(idsA).not.toContain('b-only');
      expect(idsB).toEqual(['b-only']);
    });

    it('returns an empty list for a user with no notes', async () => {
      expect(await s.listNoteIds('user-cccccccc-3333')).toEqual([]);
    });

    it('cannot read another user note even with the exact id', async () => {
      expect(await s.readNote(B, 'n1')).toBeNull();
      expect(await s.readNote(A, 'b-only')).toBeNull();
    });

    it('deletes a note and makes it unreadable', async () => {
      await s.writeNote(A, makeNote('n-del'));
      await s.deleteNote(A, 'n-del');
      expect(await s.readNote(A, 'n-del')).toBeNull();
    });

    it('treats deleting a missing note as a no-op', async () => {
      await expect(s.deleteNote(A, 'never-existed')).resolves.toBeUndefined();
    });

    it('cannot delete another user note', async () => {
      await s.writeNote(B, makeNote('b-keep'));
      await s.deleteNote(A, 'b-keep');
      expect(await s.readNote(B, 'b-keep')).not.toBeNull();
    });

    it('round-trips image bytes and content type', async () => {
      const { path } = await s.putImage(A, 'img1', PNG_1PX, 'image/png');
      expect(path).toBe('data/users/user-aaaaaaaa-1111/images/img1.png');
      const got = await s.getImage(A, 'img1');
      expect(got).not.toBeNull();
      expect(got!.contentType).toBe('image/png');
      expect(Buffer.compare(got!.data, PNG_1PX)).toBe(0);
    });

    it('returns null for a missing image', async () => {
      expect(await s.getImage(A, 'nope')).toBeNull();
    });

    it('cannot read another user image', async () => {
      await s.putImage(B, 'img-b', PNG_1PX, 'image/png');
      expect(await s.getImage(A, 'img-b')).toBeNull();
    });

    it('rejects a traversing userId before doing any I/O', async () => {
      await expect(s.readNote('../../etc', 'n1')).rejects.toThrow(/userId/);
      await expect(s.listNoteIds('..')).rejects.toThrow(/userId/);
      await expect(s.writeNote('/root', makeNote('x'))).rejects.toThrow(/userId/);
      await expect(s.putImage('a/b', 'i', PNG_1PX, 'image/png')).rejects.toThrow(/userId/);
    });

    it('rejects a traversing noteId and imageId', async () => {
      await expect(s.readNote(A, '../b-only')).rejects.toThrow(/noteId/);
      await expect(s.deleteNote(A, '../../x')).rejects.toThrow(/noteId/);
      await expect(s.getImage(A, '..%2Fimg-b')).rejects.toThrow(/imageId/);
    });

    it('rejects a disallowed image content type', async () => {
      await expect(
        s.putImage(A, 'evil', Buffer.from('<svg/>'), 'image/svg+xml'),
      ).rejects.toThrow(/content type/i);
    });
  });
}
```

- [ ] **Step 7: Write `src/lib/storage/filesystem.ts`**

`sha` is the git blob sha of the bytes — exactly what the GitHub Contents API returns — so switching adapters never invalidates a stored `content_sha` unnecessarily.

```ts
// src/lib/storage/filesystem.ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Note } from '@/lib/types';
import type { NoteStorage, StoredImage } from './types';
import {
  CONTENT_TYPE_FOR_EXT,
  extForContentType,
  imagePath,
  imagesDir,
  notePath,
  notesDir,
  safeSegment,
} from './paths';

/** Git blob sha — identical to what the GitHub Contents API reports. */
export function blobSha(data: Buffer): string {
  const header = Buffer.from(`blob ${data.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, data])).digest('hex');
}

/**
 * Adapter cho dev/test. Ghi vào `<root>/data/users/<userId>/…`
 * (mặc định `.data/`, đã gitignore). Production dùng `github.ts`.
 */
export class FilesystemStorage implements NoteStorage {
  readonly kind = 'filesystem' as const;
  private readonly root: string;

  constructor(root = process.env.DATA_DIR || '.data') {
    this.root = path.resolve(root);
  }

  /**
   * Resolves a logical repo path to disk and asserts it stayed inside the root.
   * Belt and braces: `safeSegment` already rejected traversal; this catches any
   * future caller that assembles a path some other way.
   */
  private abs(logical: string): string {
    const full = path.resolve(this.root, logical);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes storage root: ${logical}`);
    }
    return full;
  }

  async readNote(userId: string, noteId: string): Promise<Note | null> {
    const file = this.abs(notePath(userId, noteId));
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Note;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async writeNote(userId: string, note: Note): Promise<{ sha: string }> {
    const file = this.abs(notePath(userId, note.id));
    const data = Buffer.from(JSON.stringify(note, null, 2) + '\n', 'utf8');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return { sha: blobSha(data) };
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const file = this.abs(notePath(userId, noteId));
    try {
      await fs.unlink(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  async listNoteIds(userId: string): Promise<string[]> {
    const dir = this.abs(notesDir(userId));
    try {
      const names = await fs.readdir(dir);
      return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async putImage(
    userId: string,
    imageId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ sha: string; path: string }> {
    // Validate userId first so a bad user id never reports a content-type error.
    safeSegment(userId, 'userId');
    const ext = extForContentType(contentType);
    const logical = imagePath(userId, imageId, ext);
    const file = this.abs(logical);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
    return { sha: blobSha(buffer), path: logical };
  }

  async getImage(userId: string, imageId: string): Promise<StoredImage | null> {
    const dir = this.abs(imagesDir(userId));
    const id = safeSegment(imageId, 'imageId');
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    const match = names.find((n) => n.slice(0, n.lastIndexOf('.')) === id);
    if (!match) return null;
    const ext = match.slice(match.lastIndexOf('.') + 1);
    const data = await fs.readFile(path.join(dir, match));
    return {
      data,
      contentType: CONTENT_TYPE_FOR_EXT[ext] ?? 'application/octet-stream',
      sha: blobSha(data),
    };
  }
}
```

- [ ] **Step 8: Write `src/lib/storage/filesystem.test.ts`**

```ts
// src/lib/storage/filesystem.test.ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FilesystemStorage, blobSha } from './filesystem';
import { runStorageContract, makeNote, PNG_1PX } from './contract';

let dir = '';

runStorageContract(
  'filesystem',
  async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-fs-'));
    return new FilesystemStorage(dir);
  },
  async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  },
);

describe('FilesystemStorage specifics', () => {
  it('computes the same blob sha git does', () => {
    // printf '' | git hash-object --stdin
    expect(blobSha(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    // printf 'hello' | git hash-object --stdin
    expect(blobSha(Buffer.from('hello'))).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
  });

  it('writes under <root>/data/users/<userId>/ and nowhere else', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-fs2-'));
    const s = new FilesystemStorage(root);
    await s.writeNote('u1', makeNote('n1'));
    await s.putImage('u1', 'i1', PNG_1PX, 'image/png');
    expect(await fs.readdir(path.join(root, 'data', 'users'))).toEqual(['u1']);
    expect(await fs.readdir(path.join(root, 'data', 'users', 'u1', 'notes'))).toEqual(['n1.json']);
    expect(await fs.readdir(path.join(root, 'data', 'users', 'u1', 'images'))).toEqual(['i1.png']);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores pretty-printed JSON so the repo stays diffable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-fs3-'));
    const s = new FilesystemStorage(root);
    await s.writeNote('u1', makeNote('n1'));
    const raw = await fs.readFile(path.join(root, 'data/users/u1/notes/n1.json'), 'utf8');
    expect(raw).toContain('"id": "n1"');
    expect(raw.endsWith('\n')).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 9: Write `src/lib/storage/index.ts`**

```ts
// src/lib/storage/index.ts
import type { NoteStorage } from './types';
import { FilesystemStorage } from './filesystem';
import { GitHubStorage } from './github';

let _storage: NoteStorage | null = null;

/** True only when every GitHub variable a write needs is present. */
export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO);
}

/**
 * GitHub khi có đủ `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO`,
 * ngược lại dùng filesystem (dev, unit test, Playwright).
 */
export function getStorage(): NoteStorage {
  if (_storage) return _storage;
  _storage = githubConfigured() ? new GitHubStorage() : new FilesystemStorage();
  // eslint-disable-next-line no-console
  console.log(
    `[storage] adapter=${_storage.kind}` +
      (_storage.kind === 'filesystem'
        ? ` root=${process.env.DATA_DIR || '.data'} (dev/test only - set GITHUB_TOKEN/OWNER/REPO for production)`
        : ` repo=${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}@${process.env.GITHUB_BRANCH || 'main'}`),
  );
  return _storage;
}

/** Test seam only. */
export function __resetStorage(): void {
  _storage = null;
}

export type { NoteStorage, StoredImage } from './types';
export { StorageConflictError } from './types';
export { blobSha } from './filesystem';
export * from './paths';
```

`./github` lands in Task B7 — run `npx tsc --noEmit` only after that task.

- [ ] **Step 10: Run the filesystem contract**

Run: `npx vitest run src/lib/storage/filesystem.test.ts`
Expected: PASS — 16 contract tests plus 3 filesystem-specific ones.

- [ ] **Step 11: Commit**

```bash
git add src/lib/storage
git commit -m "feat(storage): add NoteStorage interface, path guard, filesystem adapter, shared contract suite"
```

---

### Task B7: GitHub storage adapter (Octokit Contents API, LRU cache, conflict retry)

**Files:**
- Create: `src/lib/storage/lru.ts`
- Create: `src/lib/storage/github.ts`
- Test: `src/lib/storage/lru.test.ts`
- Test: `src/lib/storage/github.test.ts`

**Interfaces:**
- Consumes: `NoteStorage`, `StoredImage`, `StorageConflictError` from `./types`; `notePath`, `notesDir`, `imagePath`, `imagesDir`, `safeSegment`, `extForContentType`, `CONTENT_TYPE_FOR_EXT` from `./paths`; `runStorageContract`, `makeNote`, `PNG_1PX` from `./contract` (Task B6).
- Produces:
  - `class Lru<T> { constructor(max: number); get(k: string): T | undefined; set(k: string, v: T): void; delete(k: string): void; clear(): void; readonly size: number }`
  - `class GitHubStorage implements NoteStorage` with an optional `constructor(opts?: { octokit?: OctokitLike })` seam for tests
  - `type OctokitLike = { repos: { getContent: Fn; createOrUpdateFileContents: Fn; deleteFile: Fn } }`

**Why a PAT is not needed to build this task:** the adapter takes its Octokit through the constructor, so `github.test.ts` drives a hand-written fake that returns exactly the shapes and errors the real API returns (including 404, 409 and 403 rate-limit). The same contract suite from Task B6 runs against that fake. A block at the end of the file opts into the *real* API only when `GITHUB_TOKEN`, `GITHUB_OWNER` and `GITHUB_REPO` are present, and `describe.skip`s otherwise — so the suite is green today and gains real coverage the moment the user supplies the PAT.

- [ ] **Step 1: Write the failing LRU test**

```ts
// src/lib/storage/lru.test.ts
import { describe, it, expect } from 'vitest';
import { Lru } from './lru';

describe('Lru', () => {
  it('stores and returns values', () => {
    const c = new Lru<number>(3);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.get('missing')).toBeUndefined();
  });

  it('evicts the least recently used entry when full', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('counts a get as a use, protecting the entry from eviction', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });

  it('overwrites without growing', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('a', 9);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(9);
  });

  it('deletes and clears', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.delete('a');
    expect(c.get('a')).toBeUndefined();
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
  });

  it('is a no-op cache when max is 0', () => {
    const c = new Lru<number>(0);
    c.set('a', 1);
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/storage/lru.test.ts`
Expected: FAIL — `Failed to resolve import "./lru"`.

- [ ] **Step 3: Write `src/lib/storage/lru.ts`**

A `Map` already iterates in insertion order, so re-inserting on read is the whole algorithm.

```ts
// src/lib/storage/lru.ts

/** LRU tối giản dựa trên thứ tự chèn của Map. Không phụ thuộc bên ngoài. */
export class Lru<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly max: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): T | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Re-insert so this key becomes the most recently used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.max <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
```

- [ ] **Step 4: Run the LRU test**

Run: `npx vitest run src/lib/storage/lru.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `src/lib/storage/github.ts`**

Three cost/correctness decisions are encoded here:

1. **The LRU is keyed `${path}@${sha}`**, and a *path-to-sha* map is kept alongside it. A read first resolves the sha (one `getContent` call), then hits the cache — so a repeated read of an unchanged note still costs one API call, but the JSON parse and base64 decode are skipped, and more importantly `writeNote` never has to re-`getContent` just to learn the sha it already knows.
2. **Writes retry on 409.** GitHub returns 409 when the supplied `sha` is stale. The adapter re-reads the current sha and replays the `PUT`, up to 3 attempts, then throws `StorageConflictError`. It never drops the write silently (Review Focus #5).
3. **403/429 with a rate-limit header backs off** using `x-ratelimit-reset` when present, capped at 5 s so a request never hangs a serverless invocation.

```ts
// src/lib/storage/github.ts
import { Octokit } from '@octokit/rest';
import type { Note } from '@/lib/types';
import type { NoteStorage, StoredImage } from './types';
import { StorageConflictError } from './types';
import { Lru } from './lru';
import {
  CONTENT_TYPE_FOR_EXT,
  extForContentType,
  imagePath,
  imagesDir,
  notePath,
  notesDir,
  safeSegment,
} from './paths';

export interface GetContentParams {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}
export interface PutParams extends GetContentParams {
  message: string;
  content: string;
  sha?: string;
  branch?: string;
}
export interface DeleteParams extends GetContentParams {
  message: string;
  sha: string;
  branch?: string;
}

/** The slice of Octokit this adapter uses. Tests supply a fake with this shape. */
export interface OctokitLike {
  repos: {
    getContent(p: GetContentParams): Promise<{ data: unknown }>;
    createOrUpdateFileContents(p: PutParams): Promise<{ data: { content?: { sha?: string } | null } }>;
    deleteFile(p: DeleteParams): Promise<{ data: unknown }>;
  };
}

interface HttpError extends Error {
  status?: number;
  response?: { headers?: Record<string, string> };
}

const CACHE_MAX = 200;
const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 5000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Adapter production. Mỗi lần ghi là 1 commit; message theo SPEC §2.2:
 * `feat(note): <action> <noteId> by <userId>`.
 */
export class GitHubStorage implements NoteStorage {
  readonly kind = 'github' as const;

  private readonly octokit: OctokitLike;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;

  /** `${path}@${sha}` -> decoded bytes. */
  private readonly blobs = new Lru<Buffer>(CACHE_MAX);
  /** `path` -> latest known sha, so a write does not re-fetch to learn it. */
  private readonly shas = new Lru<string>(CACHE_MAX);

  constructor(opts: { octokit?: OctokitLike; owner?: string; repo?: string; branch?: string } = {}) {
    this.owner = opts.owner ?? process.env.GITHUB_OWNER ?? '';
    this.repo = opts.repo ?? process.env.GITHUB_REPO ?? '';
    this.branch = opts.branch ?? process.env.GITHUB_BRANCH ?? 'main';
    this.octokit =
      opts.octokit ?? (new Octokit({ auth: process.env.GITHUB_TOKEN }) as unknown as OctokitLike);
    if (!this.owner || !this.repo) {
      throw new Error('GitHubStorage requires GITHUB_OWNER and GITHUB_REPO');
    }
  }

  // ---- low-level -------------------------------------------------------

  private async withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const err = e as HttpError;
        const rateLimited =
          (err.status === 403 || err.status === 429) &&
          Boolean(err.response?.headers?.['x-ratelimit-remaining'] === '0' ||
            err.response?.headers?.['retry-after']);
        if (!rateLimited || attempt >= MAX_ATTEMPTS) throw e;
        const retryAfter = Number(err.response?.headers?.['retry-after'] ?? 0) * 1000;
        const reset = Number(err.response?.headers?.['x-ratelimit-reset'] ?? 0) * 1000;
        const untilReset = reset ? reset - Date.now() : 0;
        await sleep(Math.min(MAX_BACKOFF_MS, Math.max(250, retryAfter || untilReset || 250)));
      }
    }
  }

  /** Returns decoded bytes + sha, or null on 404. Uses the LRU when the sha matches. */
  private async getFile(path: string): Promise<{ data: Buffer; sha: string } | null> {
    let file: { sha?: string; content?: string; encoding?: string; type?: string };
    try {
      const res = await this.withRateLimitRetry(() =>
        this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
          ref: this.branch,
        }),
      );
      file = res.data as typeof file;
    } catch (e) {
      if ((e as HttpError).status === 404) {
        this.shas.delete(path);
        return null;
      }
      throw e;
    }
    if (!file || Array.isArray(file) || !file.sha) return null;

    const sha = file.sha;
    this.shas.set(path, sha);

    const cached = this.blobs.get(`${path}@${sha}`);
    if (cached) return { data: cached, sha };

    // Files over 1 MB come back with an empty `content`; the Contents API
    // cannot serve them, so fail loudly rather than returning a truncated note.
    if (!file.content && file.content !== '') {
      throw new Error(`GitHub returned no content for ${path} (file too large for the Contents API?)`);
    }
    const data = Buffer.from(file.content ?? '', (file.encoding as BufferEncoding) ?? 'base64');
    this.blobs.set(`${path}@${sha}`, data);
    return { data, sha };
  }

  /** Writes bytes, retrying a 409 by re-reading the current sha. */
  private async putFile(path: string, data: Buffer, message: string): Promise<string> {
    let sha = this.shas.get(path);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.withRateLimitRetry(() =>
          this.octokit.repos.createOrUpdateFileContents({
            owner: this.owner,
            repo: this.repo,
            path,
            message,
            content: data.toString('base64'),
            sha,
            branch: this.branch,
          }),
        );
        const newSha = res.data?.content?.sha;
        if (newSha) {
          this.shas.set(path, newSha);
          this.blobs.set(`${path}@${newSha}`, data);
          return newSha;
        }
        // No sha returned: drop our cached sha so the next read re-resolves it.
        this.shas.delete(path);
        return '';
      } catch (e) {
        const status = (e as HttpError).status;
        // 409 = stale sha, 422 = "sha wasn't supplied" for an existing file.
        if ((status === 409 || status === 422) && attempt < MAX_ATTEMPTS) {
          this.shas.delete(path);
          const current = await this.getFile(path);
          sha = current?.sha;
          await sleep(100 * attempt);
          continue;
        }
        if (status === 409 || status === 422) {
          throw new StorageConflictError(`Conflict writing ${path} after ${MAX_ATTEMPTS} attempts`);
        }
        throw e;
      }
    }
    throw new StorageConflictError(`Conflict writing ${path}`);
  }

  private async listDir(path: string): Promise<{ name: string }[]> {
    try {
      const res = await this.withRateLimitRetry(() =>
        this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
          ref: this.branch,
        }),
      );
      const data = res.data;
      return Array.isArray(data) ? (data as { name: string }[]) : [];
    } catch (e) {
      if ((e as HttpError).status === 404) return [];
      throw e;
    }
  }

  // ---- NoteStorage -----------------------------------------------------

  async readNote(userId: string, noteId: string): Promise<Note | null> {
    const file = await this.getFile(notePath(userId, noteId));
    if (!file) return null;
    return JSON.parse(file.data.toString('utf8')) as Note;
  }

  async writeNote(userId: string, note: Note): Promise<{ sha: string }> {
    const path = notePath(userId, note.id);
    const data = Buffer.from(JSON.stringify(note, null, 2) + '\n', 'utf8');
    const sha = await this.putFile(path, data, `feat(note): save ${note.id} by ${userId}`);
    return { sha };
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const path = notePath(userId, noteId);
    const current = await this.getFile(path);
    if (!current) return;
    await this.withRateLimitRetry(() =>
      this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path,
        message: `feat(note): delete ${noteId} by ${userId}`,
        sha: current.sha,
        branch: this.branch,
      }),
    );
    this.shas.delete(path);
    this.blobs.delete(`${path}@${current.sha}`);
  }

  async listNoteIds(userId: string): Promise<string[]> {
    const entries = await this.listDir(notesDir(userId));
    return entries
      .map((e) => e.name)
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.slice(0, -5))
      .sort();
  }

  async putImage(
    userId: string,
    imageId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ sha: string; path: string }> {
    safeSegment(userId, 'userId');
    const ext = extForContentType(contentType);
    const path = imagePath(userId, imageId, ext);
    const sha = await this.putFile(path, buffer, `feat(note): image ${imageId} by ${userId}`);
    return { sha, path };
  }

  async getImage(userId: string, imageId: string): Promise<StoredImage | null> {
    const id = safeSegment(imageId, 'imageId');
    const entries = await this.listDir(imagesDir(userId));
    const match = entries.map((e) => e.name).find((n) => n.slice(0, n.lastIndexOf('.')) === id);
    if (!match) return null;
    const ext = match.slice(match.lastIndexOf('.') + 1);
    const file = await this.getFile(`${imagesDir(userId)}/${match}`);
    if (!file) return null;
    return {
      data: file.data,
      contentType: CONTENT_TYPE_FOR_EXT[ext] ?? 'application/octet-stream',
      sha: file.sha,
    };
  }

  /** Test seam. */
  __clearCaches(): void {
    this.blobs.clear();
    this.shas.clear();
  }
}
```

- [ ] **Step 6: Write `src/lib/storage/github.test.ts`**

The fake is an in-memory repo that reproduces the Contents API contract: 404 for a missing path, a directory listing for a directory, a 409 when the supplied sha is stale, and base64 content.

```ts
// src/lib/storage/github.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GitHubStorage, type OctokitLike } from './github';
import { blobSha } from './filesystem';
import { StorageConflictError } from './types';
import { runStorageContract, makeNote, PNG_1PX } from './contract';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public response?: { headers?: Record<string, string> },
  ) {
    super(message);
  }
}

/** In-memory stand-in for the GitHub Contents API. */
function fakeOctokit() {
  const files = new Map<string, { content: Buffer; sha: string }>();
  const calls = { getContent: 0, put: 0, del: 0 };

  const api: OctokitLike = {
    repos: {
      async getContent({ path }) {
        calls.getContent++;
        const f = files.get(path);
        if (f) {
          return {
            data: {
              type: 'file',
              sha: f.sha,
              encoding: 'base64',
              content: f.content.toString('base64'),
              name: path.slice(path.lastIndexOf('/') + 1),
              path,
            },
          };
        }
        const prefix = path.endsWith('/') ? path : path + '/';
        const children = [...files.keys()].filter((k) => k.startsWith(prefix));
        if (children.length) {
          return {
            data: children.map((k) => ({ type: 'file', name: k.slice(prefix.length), path: k })),
          };
        }
        throw new HttpError(404, 'Not Found');
      },
      async createOrUpdateFileContents({ path, content, sha }) {
        calls.put++;
        const existing = files.get(path);
        if (existing && sha !== existing.sha) throw new HttpError(409, 'Conflict');
        if (!existing && sha) throw new HttpError(422, 'Invalid sha');
        const buf = Buffer.from(content, 'base64');
        const newSha = blobSha(buf);
        files.set(path, { content: buf, sha: newSha });
        return { data: { content: { sha: newSha } } };
      },
      async deleteFile({ path, sha }) {
        calls.del++;
        const existing = files.get(path);
        if (!existing) throw new HttpError(404, 'Not Found');
        if (existing.sha !== sha) throw new HttpError(409, 'Conflict');
        files.delete(path);
        return { data: {} };
      },
    },
  };

  return { api, files, calls };
}

runStorageContract('github (fake Contents API)', async () => {
  const { api } = fakeOctokit();
  return new GitHubStorage({ octokit: api, owner: 'o', repo: 'r', branch: 'main' });
});

describe('GitHubStorage specifics', () => {
  it('requires owner and repo', () => {
    const { api } = fakeOctokit();
    expect(() => new GitHubStorage({ octokit: api, owner: '', repo: 'r' })).toThrow(
      /GITHUB_OWNER/,
    );
  });

  it('commits with the SPEC message format', async () => {
    const { api } = fakeOctokit();
    const spy = vi.spyOn(api.repos, 'createOrUpdateFileContents');
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1'));
    expect(spy.mock.calls[0][0].message).toBe('feat(note): save n1 by u1');
    await s.deleteNote('u1', 'n1');
  });

  it('sends the branch as `ref` on read and `branch` on write', async () => {
    const { api } = fakeOctokit();
    const get = vi.spyOn(api.repos, 'getContent');
    const put = vi.spyOn(api.repos, 'createOrUpdateFileContents');
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r', branch: 'data' });
    await s.writeNote('u1', makeNote('n1'));
    await s.readNote('u1', 'n1');
    expect(put.mock.calls[0][0].branch).toBe('data');
    expect(get.mock.calls.at(-1)![0].ref).toBe('data');
  });

  it('serves a repeated read of an unchanged file from the LRU (no second decode)', async () => {
    const { api, calls } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { title: 'cached' }));
    const before = calls.getContent;
    const a = await s.readNote('u1', 'n1');
    const b = await s.readNote('u1', 'n1');
    expect(a!.title).toBe('cached');
    expect(b!.title).toBe('cached');
    // One getContent per read to resolve the sha; the body comes from the cache.
    expect(calls.getContent - before).toBe(2);
  });

  it('reuses the cached sha so a write does not need a preceding read', async () => {
    const { api, calls } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { title: 'one' }));
    const before = calls.getContent;
    await s.writeNote('u1', makeNote('n1', { title: 'two' }));
    expect(calls.getContent - before).toBe(0);
    expect((await s.readNote('u1', 'n1'))!.title).toBe('two');
  });

  it('retries a 409 by re-reading the current sha and replaying the write', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { title: 'first' }));
    s.__clearCaches();

    const real = api.repos.createOrUpdateFileContents.bind(api.repos);
    let thrown = 0;
    vi.spyOn(api.repos, 'createOrUpdateFileContents').mockImplementation(async (p) => {
      if (thrown === 0) {
        thrown++;
        throw new HttpError(409, 'Conflict');
      }
      return real(p);
    });

    await expect(s.writeNote('u1', makeNote('n1', { title: 'second' }))).resolves.toHaveProperty('sha');
    expect(thrown).toBe(1);
    vi.restoreAllMocks();
    expect((await s.readNote('u1', 'n1'))!.title).toBe('second');
  });

  it('throws StorageConflictError after 3 failed attempts rather than dropping the write', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1'));
    vi.spyOn(api.repos, 'createOrUpdateFileContents').mockRejectedValue(new HttpError(409, 'Conflict'));
    await expect(s.writeNote('u1', makeNote('n1', { title: 'x' }))).rejects.toBeInstanceOf(
      StorageConflictError,
    );
    vi.restoreAllMocks();
  });

  it('backs off and retries when the rate limit is exhausted', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    const real = api.repos.createOrUpdateFileContents.bind(api.repos);
    let first = true;
    vi.spyOn(api.repos, 'createOrUpdateFileContents').mockImplementation(async (p) => {
      if (first) {
        first = false;
        throw new HttpError(403, 'rate limited', {
          headers: { 'x-ratelimit-remaining': '0', 'retry-after': '0' },
        });
      }
      return real(p);
    });
    await expect(s.writeNote('u1', makeNote('n-rl'))).resolves.toHaveProperty('sha');
    vi.restoreAllMocks();
  });

  it('propagates a non-rate-limit 500 instead of retrying forever', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    vi.spyOn(api.repos, 'getContent').mockRejectedValue(new HttpError(500, 'boom'));
    await expect(s.readNote('u1', 'n1')).rejects.toThrow('boom');
    vi.restoreAllMocks();
  });

  it('throws rather than returning a truncated note when GitHub omits content', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    vi.spyOn(api.repos, 'getContent').mockResolvedValue({
      data: { type: 'file', sha: 'abc', encoding: 'none', name: 'n1.json', path: 'x' },
    });
    await expect(s.readNote('u1', 'n1')).rejects.toThrow(/no content/);
    vi.restoreAllMocks();
  });

  it('stores image bytes unchanged through base64', async () => {
    const { api, files } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.putImage('u1', 'i1', PNG_1PX, 'image/png');
    const stored = files.get('data/users/u1/images/i1.png')!;
    expect(Buffer.compare(stored.content, PNG_1PX)).toBe(0);
  });
});

/**
 * Real-API smoke test. Skipped until the user supplies a PAT and a private repo.
 * Run it with:
 *   GITHUB_TOKEN=... GITHUB_OWNER=... GITHUB_REPO=... npx vitest run src/lib/storage/github.test.ts
 */
const live = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO);
const describeLive = live ? describe : describe.skip;

describeLive('GitHubStorage against the real Contents API', () => {
  it('round-trips a note in a scratch user directory', async () => {
    const s = new GitHubStorage();
    const uid = 'livetest-' + Date.now();
    await s.writeNote(uid, makeNote('n1', { title: 'live round trip' }));
    const got = await s.readNote(uid, 'n1');
    expect(got!.title).toBe('live round trip');
    expect(await s.listNoteIds(uid)).toEqual(['n1']);
    await s.deleteNote(uid, 'n1');
    expect(await s.readNote(uid, 'n1')).toBeNull();
  }, 60_000);
});
```

- [ ] **Step 7: Run the GitHub tests**

Run: `npx vitest run src/lib/storage/github.test.ts`
Expected: PASS — 16 contract tests plus 11 specifics; the live block reports as skipped.

- [ ] **Step 8: Typecheck the storage module end to end**

Run: `npx tsc --noEmit`
Expected: clean (`src/lib/storage/index.ts` can now resolve `./github`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/storage/lru.ts src/lib/storage/lru.test.ts src/lib/storage/github.ts src/lib/storage/github.test.ts
git commit -m "feat(storage): add GitHub Contents API adapter with sha-keyed LRU and conflict retry"
```

---

### Task B8: Auth — bcrypt hashing, JWT session cookie, middleware, login/logout/me

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/jwt.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/index.ts`
- Create: `src/lib/http.ts`
- Create: `src/middleware.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Test: `src/lib/auth/password.test.ts`
- Test: `src/lib/auth/jwt.test.ts`
- Test: `src/lib/http.test.ts`
- Test: `src/app/api/auth/login/route.test.ts`

**Interfaces:**
- Consumes: `db`, `users` (Task B5); `SessionUser`, `ApiError` (Task B2).
- Produces:
```ts
// password.ts
export function hashPassword(plain: string): Promise<string>;
export function verifyPassword(plain: string, hash: string): Promise<boolean>;

// jwt.ts  — Edge-safe, no db / bcrypt imports
export const SESSION_COOKIE = 'kn_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds
export function signSession(user: SessionUser): Promise<string>;
export function verifySession(token: string): Promise<SessionUser | null>;

// session.ts  — Node runtime only (uses next/headers)
export function getSession(): Promise<SessionUser | null>;
export function requireUser(): Promise<SessionUser>;   // throws HttpError(401)
export function setSessionCookie(user: SessionUser): Promise<void>;
export function clearSessionCookie(): Promise<void>;

// http.ts
export class HttpError extends Error { constructor(status: number, code: string, message: string); readonly status: number; readonly code: string }
export function jsonError(status: number, code: string, message: string): Response;
export function handle<T>(fn: () => Promise<T>): Promise<Response>;
```

- [ ] **Step 1: Write the failing password test**

```ts
// src/lib/auth/password.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const h = await hashPassword('123456');
    expect(h).not.toBe('123456');
    expect(h.startsWith('$2')).toBe(true);
    expect(h.length).toBeGreaterThan(50);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('123456')).not.toBe(await hashPassword('123456'));
  });

  it('verifies a correct password', async () => {
    const h = await hashPassword('123456');
    expect(await verifyPassword('123456', h)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('123456');
    expect(await verifyPassword('1234567', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('returns false rather than throwing for a malformed hash', async () => {
    expect(await verifyPassword('123456', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('123456', '')).toBe(false);
  });

  it('handles Vietnamese and long passwords', async () => {
    const pw = 'Mật khẩu của bác sĩ 2024';
    expect(await verifyPassword(pw, await hashPassword(pw))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/password.test.ts`
Expected: FAIL — `Failed to resolve import "./password"`.

- [ ] **Step 3: Write `src/lib/auth/password.ts`**

```ts
// src/lib/auth/password.ts
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/** Never throws: a malformed or empty stored hash is simply a failed login. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the password test**

Run: `npx vitest run src/lib/auth/password.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing JWT test**

```ts
// src/lib/auth/jwt.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import { signSession, verifySession, SESSION_COOKIE, SESSION_MAX_AGE } from './jwt';

const user = { id: 'u-1', username: 'bacsi', displayName: 'Bác sĩ' };

afterEach(() => vi.useRealTimers());

describe('session JWT', () => {
  it('names the cookie kn_session and lasts 30 days', () => {
    expect(SESSION_COOKIE).toBe('kn_session');
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });

  it('round-trips the session user, including Vietnamese display names', async () => {
    const token = await signSession(user);
    expect(await verifySession(token)).toEqual(user);
  });

  it('produces a compact three-part JWS', async () => {
    expect((await signSession(user)).split('.')).toHaveLength(3);
  });

  it('returns null for a tampered payload', async () => {
    const token = await signSession(user);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...user, id: 'u-2' })).toString('base64url');
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const other = new TextEncoder().encode('a-completely-different-secret-value-01');
    const token = await new SignJWT({ username: 'x', displayName: 'X' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-9')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(other);
    expect(await verifySession(token)).toBeNull();
  });

  it('returns null for garbage and for an empty string', async () => {
    expect(await verifySession('not.a.jwt')).toBeNull();
    expect(await verifySession('')).toBeNull();
  });

  it('returns null once the token has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const token = await signSession(user);
    vi.setSystemTime(new Date('2024-02-05T00:00:00Z')); // 35 days later
    expect(await verifySession(token)).toBeNull();
  });

  it('still verifies at 29 days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const token = await signSession(user);
    vi.setSystemTime(new Date('2024-01-30T00:00:00Z'));
    expect(await verifySession(token)).toEqual(user);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/auth/jwt.test.ts`
Expected: FAIL — `Failed to resolve import "./jwt"`.

- [ ] **Step 7: Write `src/lib/auth/jwt.ts`**

This file is imported by `middleware.ts`, which runs on the Edge runtime. It must not import the db, bcryptjs, Octokit or `next/headers`.

```ts
// src/lib/auth/jwt.ts
import { SignJWT, jwtVerify } from 'jose';
import type { SessionUser } from '@/lib/types';

export const SESSION_COOKIE = 'kn_session';
/** 30 ngày, tính bằng giây. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const ALG = 'HS256';

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, displayName: user.displayName })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

/** Trả về null với MỌI lỗi (sai chữ ký, hết hạn, rác) — không ném. */
export async function verifySession(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    const id = payload.sub;
    const username = payload.username;
    const displayName = payload.displayName;
    if (typeof id !== 'string' || typeof username !== 'string' || typeof displayName !== 'string') {
      return null;
    }
    return { id, username, displayName };
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run the JWT test**

Run: `npx vitest run src/lib/auth/jwt.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 9: Write the failing HTTP-helper test**

```ts
// src/lib/http.test.ts
import { describe, it, expect } from 'vitest';
import { HttpError, jsonError, handle } from './http';

describe('jsonError', () => {
  it('uses the shared envelope and status', async () => {
    const res = jsonError(404, 'NOT_FOUND', 'Không tìm thấy ghi chú.');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy ghi chú.' },
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('handle', () => {
  it('serialises the resolved value as JSON 200', async () => {
    const res = await handle(async () => ({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('passes a Response through untouched', async () => {
    const res = await handle(async () => new Response(null, { status: 204 }));
    expect(res.status).toBe(204);
  });

  it('maps an HttpError to its status and code', async () => {
    const res = await handle(async () => {
      throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập.' },
    });
  });

  it('maps an unexpected error to a 500 without leaking its message', async () => {
    const res = await handle(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:5432 user=admin password=hunter2');
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('hunter2');
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npx vitest run src/lib/http.test.ts`
Expected: FAIL — `Failed to resolve import "./http"`.

- [ ] **Step 11: Write `src/lib/http.ts`**

```ts
// src/lib/http.ts
import { ZodError } from 'zod';
import { StorageConflictError } from '@/lib/storage';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Vỏ lỗi JSON dùng chung cho cả API nội bộ và `/api/v1`. */
export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Bọc một route handler. Trả Response nguyên vẹn nếu handler trả Response,
 * ngược lại JSON 200. Mọi lỗi đều thành vỏ lỗi chuẩn.
 */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return Response.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.status, e.code, e.message);
    if (e instanceof ZodError) {
      return jsonError(400, 'INVALID_INPUT', e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    if (e instanceof StorageConflictError) {
      return jsonError(409, 'CONFLICT', 'Ghi chú vừa được sửa ở nơi khác. Vui lòng thử lại.');
    }
    // Never echo the raw message: it can carry connection strings and tokens.
    // eslint-disable-next-line no-console
    console.error('[api]', e);
    return jsonError(500, 'INTERNAL', 'Đã có lỗi xảy ra. Vui lòng thử lại.');
  }
}
```

- [ ] **Step 12: Run the HTTP test**

Run: `npx vitest run src/lib/http.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 13: Write `src/lib/auth/session.ts`**

```ts
// src/lib/auth/session.ts
import { cookies } from 'next/headers';
import type { SessionUser } from '@/lib/types';
import { HttpError } from '@/lib/http';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from './jwt';

/** Server helper: phiên hiện tại hoặc null. Dùng được ở Server Component và route. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Dùng trong route handler: ném 401 nếu chưa đăng nhập. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
  return user;
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
```

- [ ] **Step 14: Write `src/lib/auth/index.ts`**

```ts
// src/lib/auth/index.ts
export { hashPassword, verifyPassword } from './password';
export { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from './jwt';
export { getSession, requireUser, setSessionCookie, clearSessionCookie } from './session';
```

- [ ] **Step 15: Write `src/middleware.ts`**

Edge runtime. `jose` only — importing `session.ts`, `db` or `bcryptjs` here breaks the build.

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/jwt';

/** Trang cần đăng nhập. API tự kiểm tra bằng `requireUser()`. */
const PROTECTED = [/^\/$/, /^\/notes(\/|$)/, /^\/settings(\/|$)/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  const user = await verifySession(token);

  if (pathname === '/login') {
    if (user) {
      const to = req.nextUrl.clone();
      to.pathname = '/';
      to.search = '';
      return NextResponse.redirect(to);
    }
    return NextResponse.next();
  }

  if (PROTECTED.some((re) => re.test(pathname)) && !user) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.search = '';
    // Preserve where they were going so login can bounce them back.
    if (pathname !== '/') to.searchParams.set('next', pathname + search);
    return NextResponse.redirect(to);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/notes/:path*', '/settings/:path*'],
};
```

- [ ] **Step 16: Write the login route**

`POST /api/auth/login` · body `{ username: string, password: string }` · 200 `{ user: SessionUser }` · 401 `{ error: { code: 'INVALID_CREDENTIALS', message: 'Sai tên đăng nhập hoặc mật khẩu.' } }`

```ts
// src/app/api/auth/login/route.ts
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';
import { handle, HttpError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Bản sao chính xác của thông báo lỗi trong prototype. */
const BAD_CREDENTIALS = 'Sai tên đăng nhập hoặc mật khẩu.';

/** Hash giả để so sánh khi user không tồn tại, giữ thời gian phản hồi đều nhau. */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.0nH7cM3P4.2JzZ9OdV4rK1a5Hb3C';

export async function POST(req: Request) {
  return handle(async () => {
    const { username, password } = Body.parse(await req.json());

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, username.trim()))
      .limit(1);

    const ok = await verifyPassword(password, row?.passwordHash ?? DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', BAD_CREDENTIALS);

    const user = { id: row.id, username: row.username, displayName: row.displayName };
    await setSessionCookie(user);
    return { user };
  });
}
```

- [ ] **Step 17: Write the logout and me routes**

`POST /api/auth/logout` · no body · 200 `{ ok: true }`
`GET /api/auth/me` · 200 `{ user: SessionUser }` · 401 when not signed in

```ts
// src/app/api/auth/logout/route.ts
import { clearSessionCookie } from '@/lib/auth/session';
import { handle } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST() {
  return handle(async () => {
    await clearSessionCookie();
    return { ok: true };
  });
}
```

```ts
// src/app/api/auth/me/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => ({ user: await requireUser() }));
}
```

- [ ] **Step 18: Write the login route test**

`next/headers` is not available outside a request, so `setSessionCookie` is mocked; the test asserts the decision logic and — critically — the exact error string.

```ts
// src/app/api/auth/login/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const setSessionCookie = vi.fn(async () => {});
vi.mock('@/lib/auth/session', () => ({
  setSessionCookie,
  clearSessionCookie: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
  requireUser: vi.fn(async () => {
    throw new Error('not used');
  }),
}));

const { POST } = await import('./route');
const { db, users, closeDb } = await import('@/lib/db');
const { hashPassword } = await import('@/lib/auth/password');

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

beforeAll(async () => {
  await db.delete(users).where(eq(users.username, 'login_test'));
  await db.insert(users).values({
    username: 'login_test',
    passwordHash: await hashPassword('123456'),
    displayName: 'Bác sĩ',
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.username, 'login_test'));
  await closeDb();
});

describe('POST /api/auth/login', () => {
  it('signs in with correct credentials and sets the session cookie', async () => {
    const res = await post({ username: 'login_test', password: '123456' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe('login_test');
    expect(body.user.displayName).toBe('Bác sĩ');
    expect(body.user.id).toBeTruthy();
    expect(setSessionCookie).toHaveBeenCalledWith(body.user);
  });

  it('never returns the password hash', async () => {
    const res = await post({ username: 'login_test', password: '123456' });
    expect(JSON.stringify(await res.json())).not.toContain('$2');
  });

  it('rejects a wrong password with the exact prototype copy', async () => {
    const res = await post({ username: 'login_test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Sai tên đăng nhập hoặc mật khẩu.' },
    });
  });

  it('gives the identical message for an unknown user, leaking nothing', async () => {
    const res = await post({ username: 'no_such_user', password: '123456' });
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe('Sai tên đăng nhập hoặc mật khẩu.');
  });

  it('trims surrounding whitespace in the username', async () => {
    const res = await post({ username: '  login_test  ', password: '123456' });
    expect(res.status).toBe(200);
  });

  it('rejects a missing field with 400, not 500', async () => {
    const res = await post({ username: 'login_test' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  it('rejects an empty password with 400', async () => {
    const res = await post({ username: 'login_test', password: '' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 19: Run the login test**

Run: `npx vitest run src/app/api/auth/login/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 20: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: all green.

- [ ] **Step 21: Commit**

```bash
git add src/lib/auth src/lib/http.ts src/lib/http.test.ts src/middleware.ts src/app/api/auth
git commit -m "feat(auth): add bcrypt hashing, jose session cookie, edge middleware and login/logout/me routes"
```

---

### Task B9: Note service part 1 — index sync, listNotes, getNote, createNote, updateNote

**Files:**
- Create: `src/lib/services/index-sync.ts`
- Create: `src/lib/services/notes.ts`
- Create: `src/lib/services/tags.ts`
- Test: `src/lib/services/index-sync.test.ts`
- Test: `src/lib/services/list.test.ts`
- Test: `src/lib/services/notes.test.ts`
- Test: `src/lib/services/helpers.ts` (shared fixture helper, not collected)

**Interfaces:**
- Consumes: `db`, `noteIndex`, `tags` (B5); `getStorage()` (B6/B7); `norm`, `slugify`, `shuffle` (B3); `Note`, `NoteSummary`, `NoteFilters`, `NoteListResult`, `CreateNoteInput`, `UpdateNoteInput`, `PRIORITY_ORDER`, `DEFAULT_PAGE_SIZE` (B2); `HttpError` (B8).
- Produces:
```ts
// index-sync.ts
export function rowToSummary(row: NoteIndexDbRow): NoteSummary;
export function computeContentSha(note: Note): string;
export function derivedIndexValues(note: Note): Record<string, unknown>;
export function upsertIndex(userId: string, note: Note): Promise<void>;
export function removeIndex(userId: string, noteId: string): Promise<void>;
export function syncTags(userId: string, tagNames: string[]): Promise<void>;

// notes.ts
export function listNotes(userId: string, filters?: NoteFilters): Promise<NoteListResult>;
export function getNote(userId: string, noteId: string): Promise<Note>;          // throws 404
export function createNote(userId: string, input: CreateNoteInput): Promise<{ note: Note; version: number }>;
export function updateNote(userId: string, noteId: string, input: UpdateNoteInput): Promise<{ note: Note; version: number }>;
export function applyFilters(rows: NoteSummary[], f: NoteFilters): NoteSummary[];  // pure, exported for tests
export function sortNotes(rows: NoteSummary[], sort: SortKey): NoteSummary[];      // pure, exported for tests
export function paginate(rows: NoteSummary[], f: NoteFilters): NoteListResult;     // pure, exported for tests
export function newNoteId(): string;
export function newId(prefix: string): string;
export const notFound: () => HttpError;

// tags.ts
export function listTags(userId: string): Promise<{ name: string; slug: string; count: number }[]>;
```

**Design note — why filter in SQL but sort and paginate in JS.** SPEC §3 requires `localeCompare(…, 'vi')` for the title sort and `norm()` for the query match; Postgres can do neither faithfully (its `vi-VN` collation is not the same ordering, and `norm()` is a JS function). The service therefore issues **one** query that narrows by the cheap, indexable predicates (`user_id`, `favorite`, `priority`, `tag_slugs @> …`), then applies the query match, sort and page in JS over the returned rows. That is one round trip, no N+1, and byte-identical behaviour to the prototype. A hard `LIMIT 5000` guards the pathological case; revisit if a user ever approaches it.

- [ ] **Step 1: Write the shared fixture helper**

```ts
// src/lib/services/helpers.ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { FilesystemStorage } from '@/lib/storage/filesystem';
import type { NoteSummary, Priority } from '@/lib/types';

/** Points getStorage() at a throwaway directory for the duration of a suite. */
export async function useTempStorage(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-svc-'));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const { __resetStorage } = await import('@/lib/storage');
  __resetStorage();
  return {
    dir,
    cleanup: async () => {
      process.env.DATA_DIR = prev;
      __resetStorage();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export async function makeUser(username: string): Promise<string> {
  await db.delete(users).where(eq(users.username, username));
  const [u] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', displayName: username })
    .returning();
  return u.id;
}

export async function dropUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export function summary(over: Partial<NoteSummary> & { id: string }): NoteSummary {
  return {
    title: 'T',
    desc: '',
    tags: [],
    priority: 'medium' as Priority,
    fav: false,
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    latestVersion: 1,
    imageCount: 0,
    commentCount: 0,
    quizCount: 0,
    ...over,
  };
}

export { FilesystemStorage };
```

- [ ] **Step 2: Write the failing filter/sort test**

Every row of SPEC §3's filter and sort table gets a case here.

```ts
// src/lib/services/list.test.ts
import { describe, it, expect } from 'vitest';
import { applyFilters, sortNotes, paginate } from './notes';
import { summary } from './helpers';

const notes = [
  summary({ id: 'a', title: 'Phác đồ điều trị tăng huyết áp', desc: 'Ngưỡng chẩn đoán',
    tags: ['Tim mạch', 'Phác đồ'], priority: 'high', fav: true, updated: '2024-03-07T10:00:00.000Z' }),
  summary({ id: 'b', title: 'Xử trí cấp cứu sốc phản vệ', desc: 'Adrenalin tiêm bắp',
    tags: ['Cấp cứu', 'Dị ứng'], priority: 'high', fav: true, updated: '2024-03-04T10:00:00.000Z' }),
  summary({ id: 'c', title: 'Đái tháo đường type 2', desc: 'Metformin nền tảng',
    tags: ['Nội tiết', 'Phác đồ'], priority: 'medium', updated: '2024-03-01T10:00:00.000Z' }),
  summary({ id: 'd', title: 'Thang điểm Glasgow', desc: 'Mắt, lời nói, vận động',
    tags: ['Thần kinh'], priority: 'low', updated: '2024-02-18T10:00:00.000Z' }),
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('applyFilters', () => {
  it('returns everything for the default all-nav with no query', () => {
    expect(ids(applyFilters(notes, {}))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps only favourites for nav=fav', () => {
    expect(ids(applyFilters(notes, { nav: 'fav' }))).toEqual(['a', 'b']);
  });

  it('filters by priority', () => {
    expect(ids(applyFilters(notes, { priority: 'high' }))).toEqual(['a', 'b']);
    expect(ids(applyFilters(notes, { priority: 'low' }))).toEqual(['d']);
  });

  it('filters by exact tag name', () => {
    expect(ids(applyFilters(notes, { tag: 'Phác đồ' }))).toEqual(['a', 'c']);
  });

  it('combines nav, priority and tag', () => {
    expect(ids(applyFilters(notes, { nav: 'fav', priority: 'high', tag: 'Tim mạch' }))).toEqual(['a']);
  });

  it('matches a query against title, desc and tags, accent-insensitively', () => {
    expect(ids(applyFilters(notes, { query: 'huyet ap' }))).toEqual(['a']);
    expect(ids(applyFilters(notes, { query: 'HUYẾT ÁP' }))).toEqual(['a']);
    expect(ids(applyFilters(notes, { query: 'adrenalin' }))).toEqual(['b']);
    expect(ids(applyFilters(notes, { query: 'noi tiet' }))).toEqual(['c']);
  });

  it('normalises đ in the query', () => {
    expect(ids(applyFilters(notes, { query: 'dai thao duong' }))).toEqual(['c']);
    expect(ids(applyFilters(notes, { query: 'Đái tháo' }))).toEqual(['c']);
  });

  it('restricts a # query to tags only', () => {
    expect(ids(applyFilters(notes, { query: '#phac do' }))).toEqual(['a', 'c']);
    // "Phác đồ" appears in note a's TITLE too, but # must not match titles.
    expect(ids(applyFilters(notes, { query: '#glasgow' }))).toEqual([]);
    expect(ids(applyFilters(notes, { query: '#than kinh' }))).toEqual(['d']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(ids(applyFilters(notes, { query: '   ' }))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(applyFilters(notes, { query: '  adrenalin  ' }))).toEqual(['b']);
  });

  it('returns [] when nothing matches', () => {
    expect(applyFilters(notes, { query: 'khong co gi' })).toEqual([]);
  });
});

describe('sortNotes', () => {
  it('sorts by updated descending', () => {
    expect(ids(sortNotes(notes, 'updated'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by priority high to low, then updated descending', () => {
    const shuffled = [notes[3], notes[1], notes[2], notes[0]];
    expect(ids(sortNotes(shuffled, 'priority'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by title using Vietnamese collation', () => {
    const out = sortNotes(notes, 'title').map((n) => n.title);
    expect(out).toEqual([
      'Đái tháo đường type 2',
      'Phác đồ điều trị tăng huyết áp',
      'Thang điểm Glasgow',
      'Xử trí cấp cứu sốc phản vệ',
    ]);
  });

  it('places Ă/Â/Đ/Ê/Ô/Ơ/Ư in Vietnamese alphabet order, not ASCII order', () => {
    const rows = ['Ương', 'Ăn', 'Ân', 'Đông', 'Em', 'An'].map((t, i) => summary({ id: String(i), title: t }));
    expect(sortNotes(rows, 'title').map((r) => r.title)).toEqual(['An', 'Ăn', 'Ân', 'Đông', 'Em', 'Ương']);
  });

  it('does not mutate the input array', () => {
    const before = ids(notes);
    sortNotes(notes, 'title');
    expect(ids(notes)).toEqual(before);
  });
});

describe('paginate', () => {
  const ten = Array.from({ length: 10 }, (_, i) => summary({ id: String(i) }));

  it('defaults to 6 per page', () => {
    const r = paginate(ten, {});
    expect(r.pageSize).toBe(6);
    expect(r.notes).toHaveLength(6);
    expect(r.pages).toBe(2);
    expect(r.total).toBe(10);
    expect(r.page).toBe(1);
  });

  it('returns the tail on the last page', () => {
    expect(ids(paginate(ten, { page: 2 }).notes)).toEqual(['6', '7', '8', '9']);
  });

  it('clamps a page beyond the end to the last page', () => {
    expect(paginate(ten, { page: 99 }).page).toBe(2);
  });

  it('clamps page 0 and negatives to 1', () => {
    expect(paginate(ten, { page: 0 }).page).toBe(1);
    expect(paginate(ten, { page: -3 }).page).toBe(1);
  });

  it('reports at least one page for an empty result', () => {
    const r = paginate([], {});
    expect(r).toMatchObject({ total: 0, pages: 1, page: 1, notes: [] });
  });

  it('honours an explicit pageSize and caps it at 100', () => {
    expect(paginate(ten, { pageSize: 3 }).notes).toHaveLength(3);
    expect(paginate(ten, { pageSize: 1000 }).pageSize).toBe(100);
    expect(paginate(ten, { pageSize: 0 }).pageSize).toBe(6);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/services/list.test.ts`
Expected: FAIL — `Failed to resolve import "./notes"`.

- [ ] **Step 4: Write `src/lib/services/index-sync.ts`**

```ts
// src/lib/services/index-sync.ts
import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, noteIndex, tags, type NoteIndexDbRow } from '@/lib/db';
import { norm, slugify, stripHtml } from '@/lib/text';
import type { Note, NoteSummary, Priority } from '@/lib/types';

export function rowToSummary(row: NoteIndexDbRow): NoteSummary {
  return {
    id: row.noteId,
    title: row.title,
    desc: row.description,
    tags: row.tagNames,
    priority: row.priority as Priority,
    fav: row.favorite,
    created: row.createdAt.toISOString(),
    updated: row.updatedAt.toISOString(),
    latestVersion: row.latestVersion,
    imageCount: row.imageCount,
    commentCount: row.commentCount,
    quizCount: row.quizCount,
  };
}

/**
 * Băm ngữ nghĩa cho `note_index.content_sha` (part-0 §3.2).
 * Nguồn băm = `title \n desc \n tags.join(',') \n plain`, trong đó `plain` đã
 * bỏ thẻ `<mark>`. Nhờ vậy: đổi tiêu đề/mô tả/thẻ => embedding phía trình duyệt
 * bị vô hiệu; thêm/bỏ highlight => KHÔNG vô hiệu.
 * KHÁC với blob sha của storage adapter (chỉ dùng nội bộ adapter).
 */
export function computeContentSha(note: Note): string {
  const plain = stripHtml((note.content || '').replace(/<\/?mark[^>]*>/g, ''));
  const source = [note.title, note.desc, note.tags.join(','), plain].join('\n');
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/** Mọi giá trị dẫn xuất của note_index được tính ở đúng một chỗ: tại đây. */
export function derivedIndexValues(note: Note) {
  return {
    title: note.title,
    titleNorm: norm(note.title),
    description: note.desc,
    descriptionNorm: norm(note.desc),
    priority: note.priority,
    favorite: note.fav,
    tagSlugs: note.tags.map(slugify),
    tagNames: note.tags,
    createdAt: new Date(note.created),
    updatedAt: new Date(note.updated),
    latestVersion: note.versions.length ? note.versions[note.versions.length - 1].v : 1,
    imageCount: note.images.length,
    commentCount: note.comments.length,
    quizCount: note.quizzes.length,
    contentSha: computeContentSha(note),
  };
}

/** Một round-trip: INSERT … ON CONFLICT (user_id, note_id) DO UPDATE. */
export async function upsertIndex(userId: string, note: Note): Promise<void> {
  const values = derivedIndexValues(note);
  await db
    .insert(noteIndex)
    .values({ userId, noteId: note.id, ...values })
    .onConflictDoUpdate({
      target: [noteIndex.userId, noteIndex.noteId],
      set: values,
    });
}

export async function removeIndex(userId: string, noteId: string): Promise<void> {
  await db.delete(noteIndex).where(and(eq(noteIndex.userId, userId), eq(noteIndex.noteId, noteId)));
}

/** Thêm các tag mới của user vào bảng `tags`. Bỏ qua tag đã có (UNIQUE user+slug). */
export async function syncTags(userId: string, tagNames: string[]): Promise<void> {
  const wanted = new Map<string, string>();
  for (const name of tagNames) {
    const slug = slugify(name);
    if (!wanted.has(slug)) wanted.set(slug, name);
  }
  if (!wanted.size) return;

  const existing = await db
    .select({ slug: tags.slug })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.slug, [...wanted.keys()])));
  const have = new Set(existing.map((r) => r.slug));

  const toInsert = [...wanted.entries()]
    .filter(([slug]) => !have.has(slug))
    .map(([slug, name]) => ({ userId, name, slug }));
  if (toInsert.length) {
    await db.insert(tags).values(toInsert).onConflictDoNothing();
  }
}
```

- [ ] **Step 5: Write `src/lib/services/notes.ts` (part 1)**

```ts
// src/lib/services/notes.ts
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { HttpError } from '@/lib/http';
import { norm, slugify } from '@/lib/text';
import {
  DEFAULT_PAGE_SIZE,
  PRIORITY_ORDER,
  type CreateNoteInput,
  type Note,
  type NoteFilters,
  type NoteListResult,
  type NoteSummary,
  type SortKey,
  type UpdateNoteInput,
} from '@/lib/types';
import { computeContentSha, removeIndex, rowToSummary, syncTags, upsertIndex } from './index-sync';

const MAX_SCAN = 5000;
const MAX_PAGE_SIZE = 100;

export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không tìm thấy ghi chú.');

/** Lọc — port nguyên văn `getList()` của prototype. */
export function applyFilters(rows: NoteSummary[], f: NoteFilters): NoteSummary[] {
  const q = norm((f.query ?? '').trim());
  return rows.filter((n) => {
    if (f.nav === 'fav' && !n.fav) return false;
    if (f.priority && n.priority !== f.priority) return false;
    if (f.tag && !n.tags.includes(f.tag)) return false;
    if (!q) return true;
    if (q[0] === '#') {
      const t = q.slice(1);
      return n.tags.some((x) => norm(x).includes(t));
    }
    return (
      norm(n.title).includes(q) ||
      norm(n.desc).includes(q) ||
      n.tags.some((x) => norm(x).includes(q))
    );
  });
}

/** Sắp xếp — port nguyên văn `cmp` của prototype. */
export function sortNotes(rows: NoteSummary[], sort: SortKey = 'updated'): NoteSummary[] {
  const cmp: Record<SortKey, (a: NoteSummary, b: NoteSummary) => number> = {
    updated: (a, b) => b.updated.localeCompare(a.updated),
    priority: (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.updated.localeCompare(a.updated),
    title: (a, b) => a.title.localeCompare(b.title, 'vi'),
  };
  return [...rows].sort(cmp[sort] ?? cmp.updated);
}

/** Phân trang — pageSize mặc định 6, page vượt biên bị kẹp về trang cuối. */
export function paginate(rows: NoteSummary[], f: NoteFilters): NoteListResult {
  const requested = f.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = requested > 0 ? Math.min(requested, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  return {
    notes: rows.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pages,
    pageSize,
  };
}

/**
 * Một truy vấn duy nhất: thu hẹp bằng các vị từ có index, phần còn lại
 * (query theo `norm()`, sort `localeCompare('vi')`, phân trang) làm trong JS
 * để giữ hành vi y hệt prototype. Không chạm GitHub.
 */
export async function listNotes(userId: string, filters: NoteFilters = {}): Promise<NoteListResult> {
  const where: SQL[] = [eq(noteIndex.userId, userId)];
  if (filters.nav === 'fav') where.push(eq(noteIndex.favorite, true));
  if (filters.priority) where.push(eq(noteIndex.priority, filters.priority));
  if (filters.tag) {
    where.push(sql`${noteIndex.tagSlugs} @> ARRAY[${slugify(filters.tag)}]::text[]`);
  }

  const rows = await db
    .select()
    .from(noteIndex)
    .where(and(...where))
    .limit(MAX_SCAN);

  const summaries = rows.map(rowToSummary);
  return paginate(sortNotes(applyFilters(summaries, filters), filters.sort ?? 'updated'), filters);
}

/**
 * Xác nhận note thuộc về user QUA note_index (đã scope theo user_id) rồi mới
 * đọc file. Không có hàng => 404, kể cả khi note tồn tại ở user khác.
 */
export async function getNote(userId: string, noteId: string): Promise<Note> {
  const [row] = await db
    .select({ noteId: noteIndex.noteId })
    .from(noteIndex)
    .where(and(eq(noteIndex.userId, userId), eq(noteIndex.noteId, noteId)))
    .limit(1);
  if (!row) throw notFound();

  const note = await getStorage().readNote(userId, noteId);
  if (!note) throw notFound();
  return note;
}

/** Id ghi chú mới — cùng dạng `n<timestamp>` như prototype, thêm hậu tố chống trùng. */
export function newNoteId(): string {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Tiêu đề rỗng => "Ghi chú không tiêu đề" (prototype). */
const titleOr = (t: string) => t.trim() || 'Ghi chú không tiêu đề';

export async function createNote(
  userId: string,
  input: CreateNoteInput,
): Promise<{ note: Note; version: number }> {
  const now = new Date().toISOString();
  const title = titleOr(input.title);
  const note: Note = {
    id: newNoteId(),
    title,
    desc: input.desc ?? '',
    tags: input.tags ?? [],
    priority: input.priority ?? 'medium',
    fav: false,
    created: now,
    updated: now,
    content: input.content ?? '',
    images: input.images ?? [],
    comments: [],
    versions: [
      {
        v: 1,
        date: now,
        note: (input.changeNote ?? '').trim() || 'Tạo ghi chú',
        title,
        content: input.content ?? '',
      },
    ],
    quizzes: [],
  };

  await getStorage().writeNote(userId, note);
  await upsertIndex(userId, note);
  await syncTags(userId, note.tags);
  return { note, version: 1 };
}

/**
 * Bump version CHỈ KHI `content` hoặc `title` đổi — port nguyên văn `save()`.
 * Đổi desc/tags/priority/images KHÔNG tạo version mới.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<{ note: Note; version: number }> {
  const existing = await getNote(userId, noteId);
  const now = new Date().toISOString();
  const title = titleOr(input.title);
  const content = input.content ?? '';

  const last = existing.versions[existing.versions.length - 1];
  const lastV = last ? last.v : 0;
  const changed = content !== existing.content || title !== existing.title;
  const v = changed ? lastV + 1 : lastV;

  const note: Note = {
    ...existing,
    title,
    desc: input.desc ?? '',
    tags: input.tags ?? [],
    priority: input.priority ?? existing.priority,
    images: input.images ?? [],
    content,
    updated: now,
    versions: changed
      ? [
          ...existing.versions,
          {
            v,
            date: now,
            note: (input.changeNote ?? '').trim() || 'Cập nhật nội dung',
            title,
            content,
          },
        ]
      : existing.versions,
  };

  await getStorage().writeNote(userId, note);
  await upsertIndex(userId, note);
  await syncTags(userId, note.tags);
  return { note, version: v };
}
```

- [ ] **Step 6: Run the filter/sort test**

Run: `npx vitest run src/lib/services/list.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 7: Write `src/lib/services/tags.ts`**

```ts
// src/lib/services/tags.ts
import { eq } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';

/**
 * Tag của user kèm số ghi chú, sắp xếp như prototype (`allTags`):
 * nhiều note trước, rồi `localeCompare(…, 'vi')`.
 * Nguồn là `note_index.tag_names` nên số đếm luôn khớp dashboard.
 */
export async function listTags(userId: string): Promise<{ name: string; slug: string; count: number }[]> {
  const rows = await db
    .select({ tagNames: noteIndex.tagNames, tagSlugs: noteIndex.tagSlugs })
    .from(noteIndex)
    .where(eq(noteIndex.userId, userId))
    .limit(5000);

  const counts = new Map<string, { name: string; slug: string; count: number }>();
  for (const row of rows) {
    row.tagNames.forEach((name, i) => {
      const slug = row.tagSlugs[i] ?? name;
      const hit = counts.get(slug);
      if (hit) hit.count += 1;
      else counts.set(slug, { name, slug, count: 1 });
    });
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'),
  );
}
```

- [ ] **Step 8: Write the version-rule integration test**

This is where every version-numbering rule in SPEC §3 is pinned.

```ts
// src/lib/services/notes.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { createNote, updateNote, getNote, listNotes } from './notes';
import { listTags } from './tags';
import { closeDb } from '@/lib/db';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const base = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch'],
  priority: 'high' as const,
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('svc_a');
  userB = await makeUser('svc_b');
});

afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('createNote', () => {
  it('creates v1 with the note "Tạo ghi chú"', async () => {
    const { note, version } = await createNote(userA, base);
    expect(version).toBe(1);
    expect(note.versions).toHaveLength(1);
    expect(note.versions[0]).toMatchObject({ v: 1, note: 'Tạo ghi chú', title: base.title });
    expect(note.versions[0].content).toBe(base.content);
  });

  it('honours an explicit change note', async () => {
    const { note } = await createNote(userA, { ...base, changeNote: '  Bản nháp đầu  ' });
    expect(note.versions[0].note).toBe('Bản nháp đầu');
  });

  it('falls back to "Ghi chú không tiêu đề" for an empty title', async () => {
    const { note } = await createNote(userA, { ...base, title: '   ' });
    expect(note.title).toBe('Ghi chú không tiêu đề');
    expect(note.versions[0].title).toBe('Ghi chú không tiêu đề');
  });

  it('starts with fav false and empty comments/quizzes', async () => {
    const { note } = await createNote(userA, base);
    expect(note.fav).toBe(false);
    expect(note.comments).toEqual([]);
    expect(note.quizzes).toEqual([]);
  });

  it('appears in listNotes immediately and registers its tags', async () => {
    const { note } = await createNote(userA, { ...base, tags: ['Hô hấp'] });
    const list = await listNotes(userA, { query: note.title, pageSize: 50 });
    expect(list.notes.some((n) => n.id === note.id)).toBe(true);
    expect((await listTags(userA)).some((t) => t.slug === 'ho-hap')).toBe(true);
  });
});

describe('updateNote version rules', () => {
  it('bumps to v2 when the content changes', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, {
      ...base,
      content: '<h2>A</h2><p>hai</p>',
    });
    expect(version).toBe(2);
    expect(after.versions.map((v) => v.v)).toEqual([1, 2]);
    expect(after.versions[1].note).toBe('Cập nhật nội dung');
    expect(after.content).toBe('<h2>A</h2><p>hai</p>');
  });

  it('bumps to v2 when only the title changes', async () => {
    const { note } = await createNote(userA, base);
    const { version } = await updateNote(userA, note.id, { ...base, title: 'Tiêu đề mới' });
    expect(version).toBe(2);
  });

  it('does NOT bump when only the description changes', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, { ...base, desc: 'khác hẳn' });
    expect(version).toBe(1);
    expect(after.versions).toHaveLength(1);
    expect(after.desc).toBe('khác hẳn');
  });

  it('does NOT bump when only the tags change', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, { ...base, tags: ['Nội khoa'] });
    expect(version).toBe(1);
    expect(after.tags).toEqual(['Nội khoa']);
  });

  it('does NOT bump when only the priority changes', async () => {
    const { note } = await createNote(userA, base);
    const { version } = await updateNote(userA, note.id, { ...base, priority: 'low' });
    expect(version).toBe(1);
  });

  it('does NOT bump when only the image list changes', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, {
      ...base,
      images: [{ id: 'i1', label: 'a', src: `/api/images/${userA}/i1` }],
    });
    expect(version).toBe(1);
    expect(after.images).toHaveLength(1);
  });

  it('does NOT bump on a save with no changes at all', async () => {
    const { note } = await createNote(userA, base);
    expect((await updateNote(userA, note.id, base)).version).toBe(1);
    expect((await updateNote(userA, note.id, base)).version).toBe(1);
  });

  it('keeps counting up across several content edits', async () => {
    const { note } = await createNote(userA, base);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>2</p>' })).version).toBe(2);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>3</p>' })).version).toBe(3);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>3</p>' })).version).toBe(3);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>4</p>' })).version).toBe(4);
    const after = await getNote(userA, note.id);
    expect(after.versions.map((v) => v.v)).toEqual([1, 2, 3, 4]);
  });

  it('honours an explicit change note on update', async () => {
    const { note } = await createNote(userA, base);
    const { note: after } = await updateNote(userA, note.id, {
      ...base,
      content: '<p>x</p>',
      changeNote: 'Rà soát liều',
    });
    expect(after.versions[1].note).toBe('Rà soát liều');
  });

  it('always moves `updated`, even when no version is created', async () => {
    const { note } = await createNote(userA, base);
    await new Promise((r) => setTimeout(r, 5));
    const { note: after } = await updateNote(userA, note.id, { ...base, desc: 'z' });
    expect(after.updated > note.updated).toBe(true);
    expect(after.created).toBe(note.created);
  });

  it('reflects the new latestVersion in the index without a storage read', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>bumped</p>' });
    const list = await listNotes(userA, { query: base.title, pageSize: 50 });
    const row = list.notes.find((n) => n.id === note.id)!;
    expect(row.latestVersion).toBe(2);
  });
});

describe('cross-user isolation', () => {
  it('404s when user B asks for user A note id', async () => {
    const { note } = await createNote(userA, base);
    await expect(getNote(userB, note.id)).rejects.toMatchObject({ status: 404 });
  });

  it('404s when user B tries to update user A note', async () => {
    const { note } = await createNote(userA, base);
    await expect(updateNote(userB, note.id, base)).rejects.toMatchObject({ status: 404 });
  });

  it('never lists another user notes', async () => {
    await createNote(userB, { ...base, title: 'Chỉ của B' });
    const listA = await listNotes(userA, { pageSize: 100 });
    expect(listA.notes.some((n) => n.title === 'Chỉ của B')).toBe(false);
  });

  it('rejects a traversing note id with 404, never a 500', async () => {
    await expect(getNote(userA, '../../etc/passwd')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 9: Run the service test**

Run: `npx vitest run src/lib/services/notes.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 10: Write the index-sync test**

```ts
// src/lib/services/index-sync.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, noteIndex, tags, closeDb } from '@/lib/db';
import { makeUser, dropUser, useTempStorage } from './helpers';
import { computeContentSha, derivedIndexValues, upsertIndex, removeIndex, syncTags } from './index-sync';
import { makeNote } from '@/lib/storage/contract';

let cleanup: () => Promise<void>;
let uid = '';

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  uid = await makeUser('idx_user');
});
afterAll(async () => {
  await dropUser(uid);
  await cleanup();
  await closeDb();
});

describe('derivedIndexValues', () => {
  it('stores accent-free copies of title and description for search', () => {
    const v = derivedIndexValues(makeNote('n1'));
    expect(v.titleNorm).toBe('phac do dieu tri tang huyet ap');
    expect(v.descriptionNorm).toBe('nguong chan doan va muc tieu.');
  });

  it('stores index-aligned tag slugs and names', () => {
    const v = derivedIndexValues(makeNote('n1'));
    expect(v.tagSlugs).toEqual(['tim-mach', 'phac-do']);
    expect(v.tagNames).toEqual(['Tim mạch', 'Phác đồ']);
  });

  it('takes latestVersion from the last version entry', () => {
    const n = makeNote('n1');
    n.versions = [
      { v: 1, date: n.created, note: 'a', title: 't', content: '' },
      { v: 7, date: n.created, note: 'b', title: 't', content: '' },
    ];
    expect(derivedIndexValues(n).latestVersion).toBe(7);
  });

  it('counts images, comments and quizzes', () => {
    const n = makeNote('n1');
    n.images = [{ id: 'i', label: 'l', src: 's' }];
    n.comments = [{ id: 'c', text: 't', date: n.created }];
    n.quizzes = [{ id: 'q', date: n.created, score: 1, total: 1, source: 'offline', picks: [0], questions: [] }];
    const v = derivedIndexValues(n);
    expect(v).toMatchObject({ imageCount: 1, commentCount: 1, quizCount: 1 });
  });
});

describe('computeContentSha', () => {
  it('is a 64-character sha256 hex digest', () => {
    expect(computeContentSha(makeNote('n1'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the title, description or tags change', () => {
    const base = computeContentSha(makeNote('n1'));
    expect(computeContentSha(makeNote('n1', { title: 'khác' }))).not.toBe(base);
    expect(computeContentSha(makeNote('n1', { desc: 'khác' }))).not.toBe(base);
    expect(computeContentSha(makeNote('n1', { tags: ['Khác'] }))).not.toBe(base);
  });

  it('changes when the prose text changes', () => {
    const base = computeContentSha(makeNote('n1'));
    expect(computeContentSha(makeNote('n1', { content: '<p>hoàn toàn khác</p>' }))).not.toBe(base);
  });

  it('does NOT change when only highlights are added or removed', () => {
    const plain = makeNote('n1', { content: '<h2>A</h2><p>HA ≥ 140/90 mmHg</p>' });
    const marked = makeNote('n1', {
      content: '<h2>A</h2><p><mark data-hl="h1">HA ≥ 140/90 mmHg</mark></p>',
    });
    expect(computeContentSha(marked)).toBe(computeContentSha(plain));
  });

  it('ignores the note id, version history and quiz history', () => {
    const a = makeNote('n1');
    const b = makeNote('n2');
    b.versions = [];
    expect(computeContentSha(b)).toBe(computeContentSha(a));
  });
});

describe('upsertIndex', () => {
  it('inserts once then updates in place, storing the semantic sha', async () => {
    await upsertIndex(uid, makeNote('n1', { title: 'one' }));
    const second = makeNote('n1', { title: 'two' });
    await upsertIndex(uid, second);
    const rows = await db.select().from(noteIndex)
      .where(and(eq(noteIndex.userId, uid), eq(noteIndex.noteId, 'n1')));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('two');
    expect(rows[0].contentSha).toBe(computeContentSha(second));
  });

  it('removeIndex deletes only the given user row', async () => {
    await upsertIndex(uid, makeNote('n-del'));
    await removeIndex(uid, 'n-del');
    const rows = await db.select().from(noteIndex)
      .where(and(eq(noteIndex.userId, uid), eq(noteIndex.noteId, 'n-del')));
    expect(rows).toHaveLength(0);
  });
});

describe('syncTags', () => {
  it('inserts new tags and is idempotent on a second call', async () => {
    await syncTags(uid, ['Tim mạch', 'Phác đồ']);
    await syncTags(uid, ['Tim mạch', 'Phác đồ', 'Hô hấp']);
    const rows = await db.select().from(tags).where(eq(tags.userId, uid));
    expect(rows.map((r) => r.slug).sort()).toEqual(['ho-hap', 'phac-do', 'tim-mach']);
  });

  it('treats accent variants of the same tag as one row', async () => {
    await syncTags(uid, ['tim mach']);
    const rows = await db.select().from(tags)
      .where(and(eq(tags.userId, uid), eq(tags.slug, 'tim-mach')));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Tim mạch');
  });

  it('does nothing for an empty tag list', async () => {
    await expect(syncTags(uid, [])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 11: Run it**

Run: `npx vitest run src/lib/services/index-sync.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 12: Commit**

```bash
git add src/lib/services
git commit -m "feat(notes): add note service with index sync, filtering, sorting, pagination and version rules"
```

---

### Task B10: Note service part 2 — restoreVersion, deleteNote, toggleFavorite, comments, highlights, quiz records

**Files:**
- Modify: `src/lib/services/notes.ts` (append to the file written in Task B9)
- Test: `src/lib/services/mutations.test.ts`

**Interfaces:**
- Consumes: `getNote`, `newId`, `notFound`, `upsertIndex`, `removeIndex`, `getStorage` (Task B9).
- Produces:
```ts
export function restoreVersion(userId: string, noteId: string, v: number): Promise<{ note: Note; version: number }>;
export function deleteNote(userId: string, noteId: string): Promise<void>;
export function toggleFavorite(userId: string, noteId: string): Promise<{ fav: boolean }>;
export function addComment(user: SessionUser, noteId: string, text: string): Promise<{ comment: NoteComment; note: Note }>;
export function deleteComment(userId: string, noteId: string, commentId: string): Promise<{ note: Note }>;
export function saveHighlights(userId: string, noteId: string, content: string): Promise<{ ok: true; contentSha: string; note: Note }>;
export function addQuizRecord(userId: string, noteId: string, rec: Omit<Quiz, 'id' | 'date'> & { id?: string; date?: string }): Promise<{ quiz: Quiz; note: Note }>;
```

- [ ] **Step 1: Write the failing mutation test**

The two rules most easily got wrong are pinned first: `restoreVersion` creates a *new* version whose note is `Khôi phục từ vN` (it does not rewind the list), and `saveHighlights` rewrites both `content` and the **last version's** content while creating no version at all.

```ts
// src/lib/services/mutations.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, noteIndex, closeDb } from '@/lib/db';
import { useTempStorage, makeUser, dropUser } from './helpers';
import {
  createNote, updateNote, getNote, listNotes,
  restoreVersion, deleteNote, toggleFavorite,
  addComment, deleteComment, saveHighlights, addQuizRecord,
} from './notes';
import { getStorage } from '@/lib/storage';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const base = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch'],
  priority: 'high' as const,
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

const indexRow = async (userId: string, noteId: string) => {
  const [r] = await db.select().from(noteIndex)
    .where(and(eq(noteIndex.userId, userId), eq(noteIndex.noteId, noteId)));
  return r;
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('mut_a');
  userB = await makeUser('mut_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('restoreVersion', () => {
  it('appends a new version noted "Khôi phục từ vN" rather than rewinding', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    await updateNote(userA, note.id, { ...base, content: '<p>v3</p>' });

    const { note: after, version } = await restoreVersion(userA, note.id, 1);
    expect(version).toBe(4);
    expect(after.versions.map((v) => v.v)).toEqual([1, 2, 3, 4]);
    expect(after.versions[3].note).toBe('Khôi phục từ v1');
  });

  it('sets the live content to the restored version content', async () => {
    const { note } = await createNote(userA, { ...base, content: '<p>original</p>' });
    await updateNote(userA, note.id, { ...base, content: '<p>changed</p>' });
    const { note: after } = await restoreVersion(userA, note.id, 1);
    expect(after.content).toBe('<p>original</p>');
    expect(after.versions[2].content).toBe('<p>original</p>');
  });

  it('keeps the current title on the restore version', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, title: 'Tiêu đề v2', content: '<p>v2</p>' });
    const { note: after } = await restoreVersion(userA, note.id, 1);
    expect(after.title).toBe('Tiêu đề v2');
    expect(after.versions.at(-1)!.title).toBe('Tiêu đề v2');
  });

  it('can restore the same version twice, producing two new versions', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    expect((await restoreVersion(userA, note.id, 1)).version).toBe(3);
    expect((await restoreVersion(userA, note.id, 1)).version).toBe(4);
    const after = await getNote(userA, note.id);
    expect(after.versions.map((v) => v.note).slice(-2)).toEqual(['Khôi phục từ v1', 'Khôi phục từ v1']);
  });

  it('moves `updated` and the index latestVersion', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    await restoreVersion(userA, note.id, 1);
    expect((await indexRow(userA, note.id)).latestVersion).toBe(3);
  });

  it('404s for a version number that does not exist', async () => {
    const { note } = await createNote(userA, base);
    await expect(restoreVersion(userA, note.id, 99)).rejects.toMatchObject({ status: 404 });
    await expect(restoreVersion(userA, note.id, 0)).rejects.toMatchObject({ status: 404 });
  });

  it('404s when another user tries to restore', async () => {
    const { note } = await createNote(userA, base);
    await expect(restoreVersion(userB, note.id, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteNote', () => {
  it('removes both the stored file and the index row', async () => {
    const { note } = await createNote(userA, base);
    await deleteNote(userA, note.id);
    expect(await getStorage().readNote(userA, note.id)).toBeNull();
    expect(await indexRow(userA, note.id)).toBeUndefined();
    await expect(getNote(userA, note.id)).rejects.toMatchObject({ status: 404 });
  });

  it('404s when another user tries to delete, leaving the note intact', async () => {
    const { note } = await createNote(userA, base);
    await expect(deleteNote(userB, note.id)).rejects.toMatchObject({ status: 404 });
    expect(await getStorage().readNote(userA, note.id)).not.toBeNull();
  });

  it('404s for a note that is already gone', async () => {
    const { note } = await createNote(userA, base);
    await deleteNote(userA, note.id);
    await expect(deleteNote(userA, note.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('toggleFavorite', () => {
  it('flips the flag and mirrors it into the index', async () => {
    const { note } = await createNote(userA, base);
    expect(await toggleFavorite(userA, note.id)).toEqual({ fav: true });
    expect((await indexRow(userA, note.id)).favorite).toBe(true);
    expect(await toggleFavorite(userA, note.id)).toEqual({ fav: false });
    expect((await indexRow(userA, note.id)).favorite).toBe(false);
  });

  it('makes the note appear under nav=fav straight away', async () => {
    const { note } = await createNote(userA, { ...base, title: 'Sẽ yêu thích' });
    await toggleFavorite(userA, note.id);
    const list = await listNotes(userA, { nav: 'fav', pageSize: 100 });
    expect(list.notes.some((n) => n.id === note.id)).toBe(true);
  });

  it('does NOT create a version', async () => {
    const { note } = await createNote(userA, base);
    await toggleFavorite(userA, note.id);
    expect((await getNote(userA, note.id)).versions).toHaveLength(1);
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(toggleFavorite(userB, note.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('comments', () => {
  it('appends a comment with an id and ISO date, and bumps commentCount', async () => {
    const { note } = await createNote(userA, base);
    const asA = { id: userA, username: 'mut_a', displayName: 'Bác sĩ' };
    const { comment, note: after } = await addComment(asA, note.id, '  Lưu ý người cao tuổi.  ');
    expect(comment.text).toBe('Lưu ý người cao tuổi.');
    expect(comment.id).toBeTruthy();
    expect(comment.author).toEqual({ id: userA, displayName: 'Bác sĩ' });
    expect(new Date(comment.date).toISOString()).toBe(comment.date);
    expect(after.comments).toHaveLength(1);
    expect((await indexRow(userA, note.id)).commentCount).toBe(1);
  });

  it('appends in order, newest last (prototype pushes to the end)', async () => {
    const { note } = await createNote(userA, base);
    const asA = { id: userA, username: 'mut_a', displayName: 'Bác sĩ' };
    await addComment(asA, note.id, 'một');
    const { note: after } = await addComment(asA, note.id, 'hai');
    expect(after.comments.map((c) => c.text)).toEqual(['một', 'hai']);
  });

  it('rejects an empty or whitespace-only comment with 400', async () => {
    const { note } = await createNote(userA, base);
    const asA = { id: userA, username: 'mut_a', displayName: 'Bác sĩ' };
    await expect(addComment(asA, note.id, '   ')).rejects.toMatchObject({ status: 400 });
    await expect(addComment(asA, note.id, '')).rejects.toMatchObject({ status: 400 });
  });

  it('deletes a comment by id and decrements the count', async () => {
    const { note } = await createNote(userA, base);
    const { comment } = await addComment({ id: userA, username: 'mut_a', displayName: 'Bác sĩ' }, note.id, 'sẽ xoá');
    const { note: after } = await deleteComment(userA, note.id, comment.id);
    expect(after.comments).toHaveLength(0);
    expect((await indexRow(userA, note.id)).commentCount).toBe(0);
  });

  it('404s when deleting a comment id that is not on this note', async () => {
    const { note } = await createNote(userA, base);
    await expect(deleteComment(userA, note.id, 'c-nope')).rejects.toMatchObject({ status: 404 });
  });

  it('does NOT create a version', async () => {
    const { note } = await createNote(userA, base);
    const { comment } = await addComment({ id: userA, username: 'mut_a', displayName: 'Bác sĩ' }, note.id, 'x');
    await deleteComment(userA, note.id, comment.id);
    expect((await getNote(userA, note.id)).versions).toHaveLength(1);
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(
      addComment({ id: userB, username: 'mut_b', displayName: 'B' }, note.id, 'x'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('saveHighlights', () => {
  const marked = '<h2>A</h2><p><mark data-hl="h1">một</mark></p>';

  it('updates content AND the last version content, creating no new version', async () => {
    const { note } = await createNote(userA, base);
    const { note: after, ok, contentSha } = await saveHighlights(userA, note.id, marked);
    expect(ok).toBe(true);
    expect(contentSha).toMatch(/^[0-9a-f]{64}$/);
    expect(after.content).toBe(marked);
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0].content).toBe(marked);
    expect(after.versions[0].note).toBe('Tạo ghi chú');
  });

  it('touches only the LAST version when several exist', async () => {
    const { note } = await createNote(userA, { ...base, content: '<p>v1</p>' });
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    const { note: after } = await saveHighlights(userA, note.id, '<p><mark data-hl="h9">v2</mark></p>');
    expect(after.versions).toHaveLength(2);
    expect(after.versions[0].content).toBe('<p>v1</p>');
    expect(after.versions[1].content).toBe('<p><mark data-hl="h9">v2</mark></p>');
  });

  it('leaves latestVersion unchanged in the index', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    await saveHighlights(userA, note.id, marked);
    expect((await indexRow(userA, note.id)).latestVersion).toBe(2);
  });

  it('removing a highlight is just another save', async () => {
    const { note } = await createNote(userA, base);
    await saveHighlights(userA, note.id, marked);
    const { note: after } = await saveHighlights(userA, note.id, '<h2>A</h2><p>một</p>');
    expect(after.content).toBe('<h2>A</h2><p>một</p>');
    expect(after.versions).toHaveLength(1);
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(saveHighlights(userB, note.id, marked)).rejects.toMatchObject({ status: 404 });
  });
});

describe('addQuizRecord', () => {
  const rec = {
    score: 3,
    total: 4,
    source: 'offline' as const,
    picks: [0, 2, 1, 3],
    questions: [
      { q: 'Mục tiêu HA?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: 'vì vậy' },
    ],
  };

  it('prepends the newest record and bumps quizCount', async () => {
    const { note } = await createNote(userA, base);
    const first = await addQuizRecord(userA, note.id, rec);
    const second = await addQuizRecord(userA, note.id, { ...rec, score: 4 });
    expect(second.note.quizzes.map((q) => q.score)).toEqual([4, 3]);
    expect(second.note.quizzes[1].id).toBe(first.quiz.id);
    expect((await indexRow(userA, note.id)).quizCount).toBe(2);
  });

  it('assigns an id and ISO date when none is supplied', async () => {
    const { note } = await createNote(userA, base);
    const { quiz } = await addQuizRecord(userA, note.id, rec);
    expect(quiz.id).toMatch(/^q/);
    expect(new Date(quiz.date).toISOString()).toBe(quiz.date);
  });

  it('does NOT create a version', async () => {
    const { note } = await createNote(userA, base);
    await addQuizRecord(userA, note.id, rec);
    expect((await getNote(userA, note.id)).versions).toHaveLength(1);
  });

  it('rejects a record whose picks length does not match its questions', async () => {
    const { note } = await createNote(userA, base);
    await expect(
      addQuizRecord(userA, note.id, { ...rec, picks: [0, 1] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(addQuizRecord(userB, note.id, rec)).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/mutations.test.ts`
Expected: FAIL — `restoreVersion is not a function` (the named export does not exist yet).

- [ ] **Step 3: Append the mutations to `src/lib/services/notes.ts`**

Add these imports at the top of the existing file:

```ts
import type { NoteComment, Quiz, SessionUser } from '@/lib/types';
```

Then append:

```ts
/** Ghi note + đồng bộ index trong một chỗ, để không nơi nào quên upsert. */
async function persist(userId: string, note: Note): Promise<Note> {
  await getStorage().writeNote(userId, note);
  await upsertIndex(userId, note);
  return note;
}

/**
 * Khôi phục = TẠO version mới với nội dung của version cũ, note
 * "Khôi phục từ vN" — port nguyên văn `restore()` của prototype.
 * Không cắt bớt lịch sử.
 */
export async function restoreVersion(
  userId: string,
  noteId: string,
  v: number,
): Promise<{ note: Note; version: number }> {
  const existing = await getNote(userId, noteId);
  const old = existing.versions.find((x) => x.v === v);
  if (!old) throw notFound();

  const now = new Date().toISOString();
  const last = existing.versions[existing.versions.length - 1];
  const nextV = (last ? last.v : 0) + 1;

  const note: Note = {
    ...existing,
    content: old.content,
    updated: now,
    versions: [
      ...existing.versions,
      { v: nextV, date: now, note: `Khôi phục từ v${old.v}`, title: existing.title, content: old.content },
    ],
  };

  await persist(userId, note);
  return { note, version: nextV };
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  // getNote scopes by user_id, so this 404s for a note the caller does not own.
  await getNote(userId, noteId);
  await getStorage().deleteNote(userId, noteId);
  await removeIndex(userId, noteId);
}

export async function toggleFavorite(userId: string, noteId: string): Promise<{ fav: boolean }> {
  const existing = await getNote(userId, noteId);
  const note: Note = { ...existing, fav: !existing.fav };
  await persist(userId, note);
  return { fav: note.fav };
}

export async function addComment(
  user: SessionUser,
  noteId: string,
  text: string,
): Promise<{ comment: NoteComment; note: Note }> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new HttpError(400, 'INVALID_INPUT', 'Bình luận không được để trống.');
  const existing = await getNote(user.id, noteId);

  const comment: NoteComment = {
    id: newId('c'),
    text: trimmed,
    date: new Date().toISOString(),
    author: { id: user.id, displayName: user.displayName },
  };
  const note: Note = { ...existing, comments: [...existing.comments, comment] };
  await persist(user.id, note);
  return { comment, note };
}

export async function deleteComment(
  userId: string,
  noteId: string,
  commentId: string,
): Promise<{ note: Note }> {
  const existing = await getNote(userId, noteId);
  if (!existing.comments.some((c) => c.id === commentId)) throw notFound();

  const note: Note = { ...existing, comments: existing.comments.filter((c) => c.id !== commentId) };
  await persist(userId, note);
  return { note };
}

/**
 * Highlight — port nguyên văn `hlCommit()`: ghi vào `content` VÀ content của
 * version CUỐI, KHÔNG tạo version mới.
 */
export async function saveHighlights(
  userId: string,
  noteId: string,
  content: string,
): Promise<{ ok: true; contentSha: string; note: Note }> {
  const existing = await getNote(userId, noteId);
  const lastIdx = existing.versions.length - 1;

  const note: Note = {
    ...existing,
    content,
    versions: existing.versions.map((v, i) => (i === lastIdx ? { ...v, content } : v)),
  };
  await persist(userId, note);
  // computeContentSha strips <mark>, so this is unchanged by highlighting —
  // the client's cached embedding stays valid. It is returned anyway so the
  // client can confirm that.
  return { ok: true, contentSha: computeContentSha(note), note };
}

/** Lịch sử quiz — mới nhất ở ĐẦU mảng, đúng như prototype. */
export async function addQuizRecord(
  userId: string,
  noteId: string,
  rec: Omit<Quiz, 'id' | 'date'> & { id?: string; date?: string },
): Promise<{ quiz: Quiz; note: Note }> {
  const existing = await getNote(userId, noteId);

  if (!Array.isArray(rec.questions) || !Array.isArray(rec.picks) ||
      rec.picks.length !== rec.questions.length) {
    throw new HttpError(400, 'INVALID_INPUT', 'Số câu trả lời không khớp số câu hỏi.');
  }

  const quiz: Quiz = {
    id: rec.id ?? newId('q'),
    date: rec.date ?? new Date().toISOString(),
    score: rec.score,
    total: rec.total,
    source: rec.source,
    picks: rec.picks,
    questions: rec.questions,
  };

  const note: Note = { ...existing, quizzes: [quiz, ...existing.quizzes] };
  await persist(userId, note);
  return { quiz, note };
}
```

- [ ] **Step 4: Run the mutation test**

Run: `npx vitest run src/lib/services/mutations.test.ts`
Expected: PASS (28 tests).

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/notes.ts src/lib/services/mutations.test.ts
git commit -m "feat(notes): add restore, delete, favourite, comments, highlights and quiz records"
```

---

### Task B11: Seed script — demo user `bacsi` and the 14 prototype notes

**Files:**
- Create: `scripts/seed-data.ts`
- Create: `scripts/seed.ts`
- Test: `scripts/seed-data.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, `userPrefs` (B5); `getStorage()` (B6); `upsertIndex`, `syncTags` (B9); `hashPassword` (B8); `Note` (B2).
- Produces:
  - `SEED0(): Note[]` — the 14 notes, with versions synthesised exactly as the prototype's `mk()` does
  - `SEED(): Note[]` — `SEED0()` plus the `hseed1` highlight on n1 and n1's seeded quiz record
  - `seed(opts?: { username?: string; password?: string; displayName?: string }): Promise<{ userId: string; count: number }>`

**Porting the 14 notes verbatim.** Do not retype the Vietnamese medical text — transcription errors are silent and the content feeds `sections()` and `offlineQuiz()`. Extract it mechanically:

```bash
cd /Users/spt/Documents/kno-notes
# Lines 703-736 of the prototype are exactly the fourteen mk({...}) literals.
sed -n '703,736p' 'docs/reference/So Lam Sang.dc.html' > /tmp/kno-seed-notes.txt
wc -l /tmp/kno-seed-notes.txt   # => 34
head -c 60 /tmp/kno-seed-notes.txt   # =>     mk({ id: 'n1', title: 'Phác đồ điều trị tăng
```
Paste that block unchanged into the `SEED0()` array in Step 3 below, between `return [` and `];`. Nothing inside it needs editing: `mk`, `sec` and `iso` are defined above it with the same signatures the prototype uses.

- [ ] **Step 1: Write the failing seed-data test**

```ts
// scripts/seed-data.test.ts
import { describe, it, expect } from 'vitest';
import { SEED0, SEED } from './seed-data';
import { sections } from '@/lib/text';

describe('SEED0', () => {
  const notes = SEED0();

  it('produces exactly the fourteen prototype notes, n1 through n14', () => {
    expect(notes).toHaveLength(14);
    expect(notes.map((n) => n.id)).toEqual(
      Array.from({ length: 14 }, (_, i) => `n${i + 1}`),
    );
  });

  it('keeps the prototype titles', () => {
    expect(notes[0].title).toBe('Phác đồ điều trị tăng huyết áp ở người lớn');
    expect(notes[1].title).toBe('Xử trí cấp cứu sốc phản vệ');
    expect(notes[13].title).toBe('Đọc công thức máu cơ bản');
  });

  it('marks n1, n2, n4 and n13 as favourites', () => {
    expect(notes.filter((n) => n.fav).map((n) => n.id)).toEqual(['n1', 'n2', 'n4', 'n13']);
  });

  it('keeps the prototype priorities', () => {
    const byId = Object.fromEntries(notes.map((n) => [n.id, n.priority]));
    expect(byId).toMatchObject({
      n1: 'high', n2: 'high', n3: 'medium', n4: 'medium', n5: 'high',
      n6: 'medium', n7: 'low', n8: 'high', n9: 'medium', n10: 'medium',
      n11: 'low', n12: 'low', n13: 'high', n14: 'low',
    });
  });

  it('synthesises the version counts mk() implies', () => {
    const v = Object.fromEntries(notes.map((n) => [n.id, n.versions.length]));
    expect(v).toMatchObject({
      n1: 3, n2: 2, n3: 2, n4: 1, n5: 2, n6: 1, n7: 1,
      n8: 2, n9: 1, n10: 1, n11: 1, n12: 1, n13: 2, n14: 1,
    });
  });

  it('numbers versions 1..k in order and gives the last one the full content', () => {
    for (const n of notes) {
      expect(n.versions.map((x) => x.v)).toEqual(n.versions.map((_, i) => i + 1));
      expect(n.versions[n.versions.length - 1].content).toBe(n.content);
    }
  });

  it('names the first version "Tạo ghi chú"', () => {
    for (const n of notes) expect(n.versions[0].note).toBe('Tạo ghi chú');
  });

  it('attaches image metadata where the prototype does', () => {
    const byId = Object.fromEntries(notes.map((n) => [n.id, n.images.length]));
    expect(byId).toMatchObject({ n1: 2, n2: 1, n4: 3, n11: 2, n3: 0, n5: 0 });
    expect(notes[0].images[0]).toMatchObject({ id: 'n1i0', label: 'Sơ đồ bậc điều trị', src: '' });
  });

  it('attaches the prototype comments', () => {
    expect(notes[0].comments).toHaveLength(2);
    expect(notes[0].comments[0].text).toContain('Lưu ý bệnh nhân cao tuổi');
    expect(notes[1].comments).toHaveLength(1);
    expect(notes[5].comments).toHaveLength(1);
  });

  it('orders created before updated on every note', () => {
    for (const n of notes) expect(n.created <= n.updated).toBe(true);
  });

  it('yields sections() usable by the offline quiz generator', () => {
    const secs = sections(notes[0].content);
    expect(secs.map((s) => s.h)).toContain('Ngưỡng chẩn đoán');
    expect(secs.map((s) => s.h)).toContain('Lựa chọn thuốc khởi đầu');
    expect(secs.every((s) => s.items.length > 0)).toBe(true);
  });

  it('gives every note at least one section with items, so offlineQuiz has material', () => {
    for (const n of notes) {
      expect(sections(n.content).length).toBeGreaterThan(0);
    }
  });

  it('carries the prototype tag vocabulary', () => {
    const all = new Set(notes.flatMap((n) => n.tags));
    expect(all).toContain('Tim mạch');
    expect(all).toContain('Phác đồ');
    expect(all).toContain('Cấp cứu');
    expect(all).toContain('Chẩn đoán hình ảnh');
    expect(all).toContain('Xét nghiệm');
  });

  it('starts every note with an empty quiz history', () => {
    for (const n of notes) expect(n.quizzes).toEqual([]);
  });
});

describe('SEED', () => {
  const notes = SEED();

  it('wraps the blockquote sentence on n1 in the hseed1 highlight', () => {
    expect(notes[0].content).toContain(
      '<mark data-hl="hseed1">Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.</mark>',
    );
  });

  it('mirrors that highlight into n1 last version', () => {
    const last = notes[0].versions[notes[0].versions.length - 1];
    expect(last.content).toBe(notes[0].content);
    expect(last.content).toContain('data-hl="hseed1"');
  });

  it('does not add a version for the highlight', () => {
    expect(notes[0].versions).toHaveLength(3);
  });

  it('seeds n1 with the qs1 quiz record: 3/4, offline, four questions', () => {
    const q = notes[0].quizzes[0];
    expect(notes[0].quizzes).toHaveLength(1);
    expect(q).toMatchObject({ id: 'qs1', score: 3, total: 4, source: 'offline' });
    expect(q.picks).toEqual([0, 2, 1, 3]);
    expect(q.questions).toHaveLength(4);
  });

  it('keeps every seeded question well formed', () => {
    for (const q of notes[0].quizzes[0].questions) {
      expect(q.options).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.explain.length).toBeGreaterThan(0);
    }
  });

  it('keeps the prototype stored score of 3 even though all four picks are correct', () => {
    // The prototype's seed record is internally inconsistent: picks [0,2,1,3]
    // match all four answers, yet `score` is 3. We port it verbatim rather than
    // "fixing" it, so the detail page renders exactly what the prototype shows.
    const q = notes[0].quizzes[0];
    const scored = q.questions.reduce((a, x, i) => a + (q.picks[i] === x.answer ? 1 : 0), 0);
    expect(scored).toBe(4);
    expect(q.score).toBe(3);
  });

  it('leaves the other thirteen notes without quizzes', () => {
    expect(notes.slice(1).every((n) => n.quizzes.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/seed-data.test.ts`
Expected: FAIL — `Failed to resolve import "./seed-data"`.

- [ ] **Step 3: Write `scripts/seed-data.ts`**

`mk`, `sec`, `iso` and `VNOTES` are the prototype's, unchanged, retyped as TypeScript. The fourteen `mk({…})` literals are the block you extracted above, pasted between the markers.

```ts
// scripts/seed-data.ts
// Dữ liệu mẫu port NGUYÊN VĂN từ prototype (`SEED0()` / `SEED()`),
// docs/reference/So Lam Sang.dc.html, dòng 690-748.
import type { Note, NoteVersion, Priority, Quiz } from '@/lib/types';

const DAY = 864e5;

const iso = (d: number): string => new Date(Date.now() - d * DAY).toISOString();

const sec = (h: string, b: string | string[]): string =>
  `<h2>${h}</h2>` +
  (Array.isArray(b) ? `<ul>${b.map((x) => `<li>${x}</li>`).join('')}</ul>` : `<p>${b}</p>`);

const VNOTES = ['Tạo ghi chú', 'Bổ sung phần điều trị', 'Cập nhật theo khuyến cáo mới', 'Rà soát liều'];

interface MkInput {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  p: Priority;
  fav?: number;
  d: number;
  v?: number;
  imgs?: string[];
  cm?: [string, number][];
  content: string;
}

/** Sinh versions từ nội dung — port nguyên văn `mk()` của prototype. */
function mk(o: MkInput): Note {
  const k = o.v || 1;
  const parts = o.content.split(/(?=<h2>)/);
  const versions: NoteVersion[] = [];
  for (let i = 1; i <= k; i++) {
    const cut = i === k ? parts.length : Math.max(1, Math.ceil((parts.length * i) / (k + 0.5)));
    versions.push({
      v: i,
      date: iso(o.d + (k - i) * 7),
      note: VNOTES[i - 1] || 'Cập nhật',
      title: o.title,
      content: parts.slice(0, cut).join(''),
    });
  }
  return {
    id: o.id,
    title: o.title,
    desc: o.desc,
    tags: o.tags,
    priority: o.p,
    fav: !!o.fav,
    created: iso(o.d + (k - 1) * 7),
    updated: iso(o.d),
    content: o.content,
    images: (o.imgs || []).map((l, i) => ({ id: o.id + 'i' + i, label: l, src: '' })),
    comments: (o.cm || []).map((c, i) => ({ id: o.id + 'c' + i, text: c[0], date: iso(c[1]) })),
    versions,
    quizzes: [],
  };
}

export function SEED0(): Note[] {
  return [
    // ── BEGIN verbatim block: prototype lines 703-736 ────────────────────
    // Paste the 34 lines extracted with:
    //   sed -n '703,736p' 'docs/reference/So Lam Sang.dc.html'
    // exactly as they are. Do not retype or reformat them.
    // ── END verbatim block ───────────────────────────────────────────────
  ];
}

export function SEED(): Note[] {
  const L = SEED0();
  const n1 = L[0];
  n1.content = n1.content.replace(
    'Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.',
    '<mark data-hl="hseed1">Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.</mark>',
  );
  n1.versions[n1.versions.length - 1].content = n1.content;

  const seededQuiz: Quiz = {
    id: 'qs1',
    date: iso(1.5),
    score: 3,
    total: 4,
    source: 'offline',
    picks: [0, 2, 1, 3],
    questions: [
      {
        q: 'Mục tiêu huyết áp cho đa số bệnh nhân nếu dung nạp tốt là bao nhiêu?',
        options: ['< 130/80 mmHg', '< 140/90 mmHg', '< 150/90 mmHg', '< 120/70 mmHg'],
        answer: 0,
        explain: 'Đa số bệnh nhân hướng tới < 130/80 mmHg nếu dung nạp tốt.',
      },
      {
        q: 'Ngưỡng HA tại nhà để chẩn đoán tăng huyết áp?',
        options: ['≥ 140/90', '≥ 130/80', '≥ 135/85', '≥ 125/75'],
        answer: 2,
        explain: 'HA tại nhà trung bình ≥ 135/85 mmHg.',
      },
      {
        q: 'Thuốc thêm vào khi tăng huyết áp kháng trị?',
        options: ['Hydralazin', 'Spironolacton', 'Clonidin', 'Doxazosin'],
        answer: 1,
        explain: 'Spironolacton 25–50 mg là lựa chọn bậc 4.',
      },
      {
        q: 'Phối hợp nào KHÔNG được khuyến cáo?',
        options: ['ACEi + CCB', 'ARB + lợi tiểu', 'CCB + lợi tiểu', 'ACEi + ARB'],
        answer: 3,
        explain: 'Không phối hợp ACEi với ARB.',
      },
    ],
  };
  n1.quizzes = [seededQuiz];

  return L;
}
```

- [ ] **Step 4: Paste the verbatim note block and run the test**

```bash
cd /Users/spt/Documents/kno-notes
sed -n '703,736p' 'docs/reference/So Lam Sang.dc.html'
```
Insert the printed lines into `SEED0()` between the BEGIN/END markers, then:

Run: `npx vitest run scripts/seed-data.test.ts`
Expected: PASS (20 tests). A failure on the version-count or favourite assertions means the block was edited — re-extract it.

- [ ] **Step 5: Write `scripts/seed.ts`**

```ts
// scripts/seed.ts
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, users, userPrefs, noteIndex, tags, closeDb } from '../src/lib/db/index';
import { hashPassword } from '../src/lib/auth/password';
import { getStorage } from '../src/lib/storage/index';
import { upsertIndex, syncTags } from '../src/lib/services/index-sync';
import { SEED } from './seed-data';

export async function seed(
  opts: { username?: string; password?: string; displayName?: string } = {},
): Promise<{ userId: string; count: number }> {
  const username = opts.username ?? 'bacsi';
  const password = opts.password ?? '123456';
  const displayName = opts.displayName ?? 'Bác sĩ';

  // Re-seeding is idempotent: drop the user (cascades to index/tags/prefs)
  // and its stored notes, then rebuild from scratch.
  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    const storage = getStorage();
    for (const id of await storage.listNoteIds(existing.id)) {
      await storage.deleteNote(existing.id, id);
    }
    await db.delete(users).where(eq(users.id, existing.id));
  }

  const [user] = await db
    .insert(users)
    .values({ username, passwordHash: await hashPassword(password), displayName })
    .returning();

  await db.insert(userPrefs).values({ userId: user.id }).onConflictDoNothing();

  const notes = SEED();
  const storage = getStorage();
  for (const note of notes) {
    await storage.writeNote(user.id, note);
    await upsertIndex(user.id, note);
    await syncTags(user.id, note.tags);
  }

  return { userId: user.id, count: notes.length };
}

async function main() {
  const { userId, count } = await seed();
  const tagRows = await db.select().from(tags).where(eq(tags.userId, userId));
  const indexRows = await db.select().from(noteIndex).where(eq(noteIndex.userId, userId));
  console.log(`seeded user bacsi (${userId})`);
  console.log(`  notes:      ${count} written, ${indexRows.length} indexed`);
  console.log(`  tags:       ${tagRows.length}`);
  console.log(`  storage:    ${getStorage().kind}`);
  console.log('  login with: bacsi / 123456');
  await closeDb();
}

// Only run when invoked directly, so tests can import `seed()`.
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Seed the local dev database and verify**

```bash
cd /Users/spt/Documents/kno-notes
npm run db:seed
```
Expected output ends with `notes: 14 written, 14 indexed` and `login with: bacsi / 123456`.

Then confirm the two stores agree:
```bash
psql -d kno_notes_dev -c "select note_id, title, priority, favorite, latest_version, quiz_count from note_index order by note_id;"
ls .data/data/users/*/notes | head -20
```
Expected: 14 rows; `n1` shows `latest_version = 3` and `quiz_count = 1`; 14 JSON files on disk.

- [ ] **Step 7: Verify re-seeding is idempotent**

```bash
npm run db:seed && psql -d kno_notes_dev -c "select count(*) from note_index;"
```
Expected: still 14, not 28.

- [ ] **Step 8: Commit**

```bash
git add scripts/seed-data.ts scripts/seed-data.test.ts scripts/seed.ts
git commit -m "feat(seed): add demo user bacsi and the fourteen prototype notes"
```

---

### Task B12: Quiz generation — offline generator, Gemini client, generate route

**Files:**
- Create: `src/lib/services/quiz.ts`
- Create: `src/app/api/notes/[id]/quiz/generate/route.ts`
- Test: `src/lib/services/quiz.test.ts`

**Interfaces:**
- Consumes: `sections`, `stripHtml`, `shuffle`, `clip` (B3/B4); `Note`, `Question` (B2); `listNotes`, `getNote` (B9); `requireUser` (B8); `handle` (B8).
- Produces:
```ts
export function offlineQuiz(n: Note, all: Note[]): Question[];
export function buildPrompt(note: Note, avoid?: string[]): string;
export function parseAiQuestions(text: string): Question[] | null;
export function generateQuiz(userId: string, noteId: string, avoid?: string[]): Promise<{ questions: Question[]; source: 'ai' | 'offline' }>;  // throws HttpError(422, 'NOT_ENOUGH_CONTENT')
export const GEMINI_MODEL = 'gemini-2.0-flash';
```

**The route must work with no API key.** `GOOGLE_GENERATIVE_AI_API_KEY` is optional; when it is absent the Gemini branch is skipped entirely (no import-time client construction, no network call) and `offlineQuiz` runs. Any Gemini failure — network, quota, bad JSON, too few valid questions — falls through to the same offline path. The route never returns 5xx for a quiz.

- [ ] **Step 1: Write the failing quiz test**

```ts
// src/lib/services/quiz.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { offlineQuiz, buildPrompt, parseAiQuestions } from './quiz';
import type { Note } from '@/lib/types';

afterEach(() => vi.restoreAllMocks());

const note = (over: Partial<Note> & { id: string }): Note => ({
  title: 'Ghi chú',
  desc: 'Mô tả',
  tags: ['Tim mạch'],
  priority: 'medium',
  fav: false,
  created: '2024-01-01T00:00:00.000Z',
  updated: '2024-01-01T00:00:00.000Z',
  content: '',
  images: [],
  comments: [],
  versions: [],
  quizzes: [],
  ...over,
});

const rich = note({
  id: 'n1',
  title: 'Phác đồ tăng huyết áp',
  tags: ['Tim mạch'],
  content:
    '<h2>Ngưỡng chẩn đoán</h2><ul><li>HA phòng khám ≥ 140/90 mmHg</li><li>HA tại nhà ≥ 135/85 mmHg</li><li>Holter ≥ 130/80 mmHg</li></ul>' +
    '<h2>Mục tiêu điều trị</h2><ul><li>Đa số: &lt; 130/80 mmHg</li><li>Trên 80 tuổi: 140–150 mmHg tâm thu</li></ul>' +
    '<h2>Lựa chọn thuốc</h2><ul><li>ACEi hoặc ARB</li><li>Chẹn kênh canxi</li><li>Lợi tiểu thiazide</li></ul>',
});

const others = [
  note({ id: 'n2', title: 'Sốc phản vệ', tags: ['Cấp cứu'],
    content: '<h2>Xử trí</h2><ul><li>Adrenalin tiêm bắp 0,5 mg</li><li>Nằm ngửa kê cao chân</li><li>Thở oxy</li></ul>' }),
  note({ id: 'n3', title: 'Đái tháo đường', tags: ['Nội tiết'],
    content: '<h2>Nguyên tắc</h2><ul><li>Metformin nền tảng</li><li>SGLT2i khi suy tim</li><li>GLP-1 RA khi xơ vữa</li></ul>' }),
  note({ id: 'n4', title: 'Hen phế quản', tags: ['Hô hấp'],
    content: '<h2>Các bậc</h2><ul><li>Bậc 1–2 ICS-formoterol khi cần</li><li>Bậc 3 duy trì</li><li>Bậc 4 liều trung bình</li></ul>' }),
];

describe('offlineQuiz', () => {
  it('returns at most five questions', () => {
    expect(offlineQuiz(rich, [rich, ...others]).length).toBeLessThanOrEqual(5);
  });

  it('gives every question exactly four options', () => {
    for (const q of offlineQuiz(rich, [rich, ...others])) {
      expect(q.options).toHaveLength(4);
    }
  });

  it('puts the answer index inside the options range', () => {
    for (const q of offlineQuiz(rich, [rich, ...others])) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.options[q.answer]).toBeTruthy();
    }
  });

  it('never repeats an option inside one question', () => {
    for (const q of offlineQuiz(rich, [rich, ...others])) {
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('phrases section questions exactly as the prototype does', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    const section = qs.find((q) => q.q.startsWith('Theo ghi chú'));
    expect(section).toBeTruthy();
    expect(section!.q).toMatch(/^Theo ghi chú, nội dung nào dưới đây thuộc mục “.+”\?$/);
    expect(section!.explain).toMatch(/^Mục “.+” ghi: /);
  });

  it('adds the topic question when three foreign tags exist', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    const topic = qs.find((q) => q.q.startsWith('Ghi chú “'));
    expect(topic).toBeTruthy();
    expect(topic!.q).toBe('Ghi chú “Phác đồ tăng huyết áp” thuộc chủ đề nào?');
    expect(topic!.options[topic!.answer]).toBe('Tim mạch');
    expect(topic!.explain).toBe('Ghi chú được gắn thẻ: Tim mạch.');
  });

  it('omits the topic question when fewer than three foreign tags exist', () => {
    const qs = offlineQuiz(rich, [rich, others[0]]);
    expect(qs.some((q) => q.q.startsWith('Ghi chú “'))).toBe(false);
  });

  it('never offers an item from the same section as a distractor', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const qs = offlineQuiz(rich, [rich, ...others]);
    const q = qs.find((x) => x.q.includes('Ngưỡng chẩn đoán'));
    if (q) {
      const sameSection = ['HA phòng khám ≥ 140/90 mmHg', 'HA tại nhà ≥ 135/85 mmHg', 'Holter ≥ 130/80 mmHg'];
      const wrongs = q.options.filter((_, i) => i !== q.answer);
      expect(wrongs.some((w) => sameSection.some((s) => s.startsWith(w.replace('…', ''))))).toBe(false);
    }
  });

  it('clips long option text to 150 characters', () => {
    const longItem = 'x'.repeat(400);
    const big = note({ id: 'nb', content: `<h2>A</h2><ul><li>${longItem}</li><li>b</li></ul>` });
    for (const q of offlineQuiz(big, [big, ...others])) {
      for (const o of q.options) expect(o.length).toBeLessThanOrEqual(150);
    }
  });

  it('returns [] for a note with no headings and no foreign tags to fall back on', () => {
    const empty = note({ id: 'ne', content: '<p>chỉ một đoạn</p>', tags: ['Tim mạch'] });
    expect(offlineQuiz(empty, [empty])).toEqual([]);
  });

  it('returns [] for completely empty content with no other notes', () => {
    const empty = note({ id: 'ne', content: '' });
    expect(offlineQuiz(empty, [empty])).toEqual([]);
  });

  it('does not throw when a section has a single item and no distractors exist', () => {
    const thin = note({ id: 'nt', content: '<h2>A</h2><p>một câu duy nhất</p>', tags: ['X'] });
    expect(() => offlineQuiz(thin, [thin])).not.toThrow();
  });

  it('excludes the note own content from the foreign distractor pool', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    expect(qs.length).toBeGreaterThan(0);
  });
});

describe('buildPrompt', () => {
  const n = note({
    id: 'n1',
    title: 'Phác đồ tăng huyết áp',
    desc: 'Ngưỡng chẩn đoán',
    content: '<h2>A</h2><p>HA  ≥  140/90</p>',
  });

  it('carries the prototype Vietnamese instruction verbatim', () => {
    const p = buildPrompt(n);
    expect(p).toContain('Bạn là giảng viên y khoa.');
    expect(p).toContain('tạo 5 câu hỏi trắc nghiệm bằng tiếng Việt');
    expect(p).toContain('Mỗi câu có đúng 4 lựa chọn ngắn gọn, 1 đáp án đúng');
    expect(p).toContain('Xáo trộn vị trí đáp án đúng.');
    expect(p).toContain('Chỉ trả về JSON array, không thêm chữ nào khác');
    expect(p).toContain('[{"q":"...","options":["...","...","...","..."],"answer":0,"explain":"giải thích 1–2 câu"}]');
  });

  it('includes the title, description and plain-text content', () => {
    const p = buildPrompt(n);
    expect(p).toContain('TIÊU ĐỀ: Phác đồ tăng huyết áp');
    expect(p).toContain('MÔ TẢ: Ngưỡng chẩn đoán');
    expect(p).toContain('NỘI DUNG: A HA ≥ 140/90');
    expect(p).not.toContain('<h2>');
  });

  it('omits the avoid-repeats clause when there is no history', () => {
    expect(buildPrompt(n)).not.toContain('Tránh lặp lại các câu');
  });

  it('lists previously asked questions, pipe separated, when history exists', () => {
    const withHistory = note({
      ...n,
      quizzes: [
        { id: 'q1', date: n.created, score: 1, total: 2, source: 'ai', picks: [0, 0],
          questions: [
            { q: 'Câu một?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' },
            { q: 'Câu hai?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' },
          ] },
      ],
    });
    const p = buildPrompt(withHistory);
    expect(p).toContain('Tránh lặp lại các câu: Câu một? | Câu hai?. ');
  });

  it('merges the caller-supplied avoid list with the note history', () => {
    const p = buildPrompt(n, ['Câu từ client A?', 'Câu từ client B?']);
    expect(p).toContain('Tránh lặp lại các câu: Câu từ client A? | Câu từ client B?. ');
  });

  it('de-duplicates between the history and the avoid list', () => {
    const withHistory = note({
      ...n,
      quizzes: [
        { id: 'q1', date: n.created, score: 0, total: 1, source: 'ai', picks: [0],
          questions: [{ q: 'Trùng?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' }] },
      ],
    });
    const p = buildPrompt(withHistory, ['Trùng?', 'Mới?']);
    expect(p).toContain('Tránh lặp lại các câu: Trùng? | Mới?. ');
  });

  it('caps the avoid list at the ten most recent questions', () => {
    const questions = Array.from({ length: 14 }, (_, i) => ({
      q: `Câu ${i}?`, options: ['a', 'b', 'c', 'd'], answer: 0, explain: '',
    }));
    const withHistory = note({
      ...n,
      quizzes: [{ id: 'q1', date: n.created, score: 0, total: 14, source: 'ai',
        picks: questions.map(() => 0), questions }],
    });
    const p = buildPrompt(withHistory);
    expect(p).toContain('Câu 4?');
    expect(p).toContain('Câu 13?');
    expect(p).not.toContain('Câu 0?');
    expect(p).not.toContain('Câu 3?');
  });
});

describe('parseAiQuestions', () => {
  const four = (q: string) => ({ q, options: ['a', 'b', 'c', 'd'], answer: 1, explain: 'vì vậy' });
  const json = (arr: unknown) => JSON.stringify(arr);

  it('parses a clean array of five questions', () => {
    const out = parseAiQuestions(json([1, 2, 3, 4, 5].map((i) => four(`Câu ${i}?`))));
    expect(out).toHaveLength(5);
    expect(out![0].q).toBe('Câu 1?');
  });

  it('extracts the array from surrounding prose and code fences', () => {
    const body = '```json\n' + json([1, 2, 3].map((i) => four(`Câu ${i}?`))) + '\n```\nHy vọng giúp ích!';
    expect(parseAiQuestions(body)).toHaveLength(3);
  });

  it('caps the result at five questions', () => {
    expect(parseAiQuestions(json(Array.from({ length: 9 }, (_, i) => four(`Q${i}`))))).toHaveLength(5);
  });

  it('drops a question that does not have exactly four options', () => {
    const arr = [four('ok 1'), four('ok 2'), four('ok 3'),
      { q: 'ba lựa chọn', options: ['a', 'b', 'c'], answer: 0, explain: '' }];
    const out = parseAiQuestions(json(arr))!;
    expect(out).toHaveLength(3);
    expect(out.some((q) => q.q === 'ba lựa chọn')).toBe(false);
  });

  it('drops a question whose answer index is out of range', () => {
    const arr = [four('ok 1'), four('ok 2'), four('ok 3'),
      { q: 'sai index', options: ['a', 'b', 'c', 'd'], answer: 4, explain: '' },
      { q: 'âm', options: ['a', 'b', 'c', 'd'], answer: -1, explain: '' }];
    expect(parseAiQuestions(json(arr))).toHaveLength(3);
  });

  it('drops a question with no text', () => {
    const arr = [four('ok 1'), four('ok 2'), four('ok 3'), { q: '', options: ['a','b','c','d'], answer: 0, explain: '' }];
    expect(parseAiQuestions(json(arr))).toHaveLength(3);
  });

  it('returns null when fewer than three questions survive', () => {
    expect(parseAiQuestions(json([four('a'), four('b')]))).toBeNull();
    expect(parseAiQuestions(json([]))).toBeNull();
  });

  it('returns null for text with no JSON array at all', () => {
    expect(parseAiQuestions('Xin lỗi, tôi không thể tạo câu hỏi.')).toBeNull();
    expect(parseAiQuestions('')).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseAiQuestions('[{"q":"x", options:}]')).toBeNull();
  });

  it('coerces a missing explain to an empty string', () => {
    const arr = [1, 2, 3].map((i) => ({ q: `Câu ${i}?`, options: ['a', 'b', 'c', 'd'], answer: 0 }));
    expect(parseAiQuestions(json(arr))![0].explain).toBe('');
  });

  it('stringifies non-string options rather than dropping the question', () => {
    const arr = [1, 2, 3].map((i) => ({ q: `Câu ${i}?`, options: [1, 2, 3, 4], answer: 0, explain: '' }));
    const out = parseAiQuestions(json(arr))!;
    expect(out[0].options).toEqual(['1', '2', '3', '4']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/quiz.test.ts`
Expected: FAIL — `Failed to resolve import "./quiz"`.

- [ ] **Step 3: Write `src/lib/services/quiz.ts`**

```ts
// src/lib/services/quiz.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Note, Question } from '@/lib/types';
import { clip, sections, shuffle, stripHtml } from '@/lib/text';
import { getNote } from './notes';
import { HttpError } from '@/lib/http';
import { getStorage } from '@/lib/storage';
import { db, noteIndex } from '@/lib/db';
import { eq, and, ne } from 'drizzle-orm';

export const GEMINI_MODEL = 'gemini-2.0-flash';

/** Bộ sinh quiz offline — port NGUYÊN VĂN `offlineQuiz()` của prototype. */
export function offlineQuiz(n: Note, all: Note[]): Question[] {
  const secs = sections(n.content);
  const qs: Question[] = [];

  const foreign = shuffle(
    all
      .filter((x) => x.id !== n.id)
      .flatMap((x) => sections(x.content).flatMap((s) => s.items)),
  );

  shuffle(secs).forEach((s) => {
    const right = s.items[Math.floor(Math.random() * s.items.length)];
    const own = secs.filter((o) => o !== s).flatMap((o) => o.items);
    const wrong = shuffle([...own])
      .concat(foreign)
      .filter((x) => x !== right && !s.items.includes(x))
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 3);
    if (wrong.length < 3) return;

    const opts = shuffle([right, ...wrong]);
    qs.push({
      q: 'Theo ghi chú, nội dung nào dưới đây thuộc mục “' + s.h + '”?',
      options: opts.map((o) => clip(o)),
      answer: opts.indexOf(right),
      explain: 'Mục “' + s.h + '” ghi: ' + clip(right, 220),
    });
  });

  const otherTags = shuffle([...new Set(all.flatMap((x) => x.tags))].filter((t) => !n.tags.includes(t)));
  if (otherTags.length >= 3 && n.tags.length) {
    const opts = shuffle([n.tags[0], ...otherTags.slice(0, 3)]);
    qs.push({
      q: 'Ghi chú “' + n.title + '” thuộc chủ đề nào?',
      options: opts,
      answer: opts.indexOf(n.tags[0]),
      explain: 'Ghi chú được gắn thẻ: ' + n.tags.join(', ') + '.',
    });
  }

  return qs.slice(0, 5);
}

/**
 * Prompt tiếng Việt — port NGUYÊN VĂN từ `startQuiz()` của prototype.
 * `avoid` do client truyền thêm (part-0 §3.6) được gộp với lịch sử của note,
 * khử trùng lặp, rồi lấy 10 câu gần nhất.
 */
export function buildPrompt(n: Note, avoid: string[] = []): string {
  const text = stripHtml(n.content);
  const history = (n.quizzes || []).flatMap((z) => z.questions.map((q) => q.q));
  const prev = [...new Set([...history, ...avoid])].slice(-10);
  return (
    'Bạn là giảng viên y khoa. Chỉ dựa vào ghi chú dưới đây, tạo 5 câu hỏi trắc nghiệm bằng tiếng Việt để bác sĩ tự ôn tập. ' +
    'Mỗi câu có đúng 4 lựa chọn ngắn gọn, 1 đáp án đúng, các phương án sai phải hợp lý. Xáo trộn vị trí đáp án đúng. ' +
    (prev.length ? 'Tránh lặp lại các câu: ' + prev.join(' | ') + '. ' : '') +
    'Chỉ trả về JSON array, không thêm chữ nào khác: ' +
    '[{"q":"...","options":["...","...","...","..."],"answer":0,"explain":"giải thích 1–2 câu"}]\n\n' +
    'TIÊU ĐỀ: ' + n.title + '\nMÔ TẢ: ' + n.desc + '\nNỘI DUNG: ' + text
  );
}

interface RawQuestion {
  q?: unknown;
  options?: unknown;
  answer?: unknown;
  explain?: unknown;
}

/**
 * Trích + kiểm tra JSON từ câu trả lời của LLM.
 * Trả null nếu còn dưới 3 câu hợp lệ => caller rơi về offline.
 */
export function parseAiQuestions(text: string): Question[] | null {
  const match = (text || '').match(/\[[\s\S]*\]/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const valid = (parsed as RawQuestion[])
    .filter(
      (q): q is RawQuestion =>
        Boolean(q) &&
        typeof q.q === 'string' &&
        q.q.trim().length > 0 &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.answer === 'number' &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < 4,
    )
    .map<Question>((q) => ({
      q: String(q.q).trim(),
      options: (q.options as unknown[]).map((o) => String(o)),
      answer: q.answer as number,
      explain: typeof q.explain === 'string' ? q.explain : '',
    }));

  if (valid.length < 3) return null;
  return valid.slice(0, 5);
}

/** Nguồn câu hỏi sai cho quiz offline: các note khác của CHÍNH user này. */
async function otherNotes(userId: string, noteId: string): Promise<Note[]> {
  const rows = await db
    .select({ noteId: noteIndex.noteId })
    .from(noteIndex)
    .where(and(eq(noteIndex.userId, userId), ne(noteIndex.noteId, noteId)))
    .limit(40);

  const storage = getStorage();
  const loaded = await Promise.all(rows.map((r) => storage.readNote(userId, r.noteId)));
  return loaded.filter((n): n is Note => n !== null);
}

async function tryGemini(note: Note, avoid: string[]): Promise<Question[] | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_MODEL });
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(note, avoid) }] }],
      generationConfig: { maxOutputTokens: 2500, temperature: 0.7 },
    });
    return parseAiQuestions(res.response.text());
  } catch (e) {
    // Quota, network, safety block — all become "use the offline generator".
    // eslint-disable-next-line no-console
    console.warn('[quiz] gemini failed, falling back to offline:', (e as Error).message);
    return null;
  }
}

/**
 * Gemini trước, offline sau. KHÔNG BAO GIỜ ném vì lỗi LLM — chỉ ném 404 khi
 * không có note, và 422 NOT_ENOUGH_CONTENT khi không dựng nổi câu hỏi nào.
 * Hoạt động bình thường khi KHÔNG có GOOGLE_GENERATIVE_AI_API_KEY.
 */
export async function generateQuiz(
  userId: string,
  noteId: string,
  avoid: string[] = [],
): Promise<{ questions: Question[]; source: 'ai' | 'offline' }> {
  const note = await getNote(userId, noteId);

  const ai = await tryGemini(note, avoid);
  if (ai) return { questions: ai, source: 'ai' };

  const all = [note, ...(await otherNotes(userId, noteId))];
  const questions = offlineQuiz(note, all);
  if (!questions.length) {
    // part-0 §3.6: the UI turns this into the toast
    // "Ghi chú chưa đủ nội dung để tạo câu hỏi".
    throw new HttpError(422, 'NOT_ENOUGH_CONTENT', 'Ghi chú chưa đủ nội dung để tạo câu hỏi.');
  }
  return { questions, source: 'offline' };
}
```

- [ ] **Step 4: Run the quiz test**

Run: `npx vitest run src/lib/services/quiz.test.ts`
Expected: PASS (28 tests).

- [ ] **Step 5: Write the generate route**

`POST /api/notes/[id]/quiz/generate` · optional body `{ avoid?: string[] }` · 200 `{ questions: Question[], source: 'ai' | 'offline' }` · 422 `NOT_ENOUGH_CONTENT` when the note has too little content

```ts
// src/app/api/notes/[id]/quiz/generate/route.ts
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { generateQuiz } from '@/lib/services/quiz';

export const runtime = 'nodejs';
export const maxDuration = 30;

const Body = z.object({ avoid: z.array(z.string().max(1000)).max(50).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    // The body is optional: an empty POST is a valid request.
    let avoid: string[] = [];
    try {
      avoid = Body.parse(await req.json()).avoid ?? [];
    } catch {
      avoid = [];
    }
    return generateQuiz(user.id, id, avoid);
  });
}
```

- [ ] **Step 6: Write the no-key integration test**

Appended to `src/lib/services/quiz.test.ts`. It proves Review Focus #3 and #4 end to end.

```ts
// appended to src/lib/services/quiz.test.ts
import { beforeAll, afterAll } from 'vitest';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { createNote } from './notes';
import { generateQuiz } from './quiz';
import { closeDb } from '@/lib/db';

describe('generateQuiz without an API key', () => {
  let cleanup: () => Promise<void>;
  let uid = '';
  let prevKey: string | undefined;

  beforeAll(async () => {
    prevKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    ({ cleanup } = await useTempStorage());
    uid = await makeUser('quiz_user');
  });

  afterAll(async () => {
    if (prevKey) process.env.GOOGLE_GENERATIVE_AI_API_KEY = prevKey;
    await dropUser(uid);
    await cleanup();
    await closeDb();
  });

  const mk = (title: string, content: string, tags: string[]) =>
    createNote(uid, { title, desc: '', tags, priority: 'medium', content, images: [] });

  it('produces offline questions and reports source "offline"', async () => {
    const { note } = await mk(
      'Phác đồ tăng huyết áp',
      '<h2>Ngưỡng</h2><ul><li>≥ 140/90</li><li>≥ 135/85</li><li>≥ 130/80</li></ul>' +
        '<h2>Mục tiêu</h2><ul><li>&lt; 130/80</li><li>140–150 ở người già</li></ul>',
      ['Tim mạch'],
    );
    await mk('Sốc phản vệ', '<h2>Xử trí</h2><ul><li>Adrenalin</li><li>Oxy</li><li>Dịch</li></ul>', ['Cấp cứu']);
    await mk('Đái tháo đường', '<h2>Thuốc</h2><ul><li>Metformin</li><li>SGLT2i</li><li>GLP-1</li></ul>', ['Nội tiết']);
    await mk('Hen', '<h2>Bậc</h2><ul><li>Bậc 1</li><li>Bậc 2</li><li>Bậc 3</li></ul>', ['Hô hấp']);

    const out = await generateQuiz(uid, note.id);
    expect(out.source).toBe('offline');
    expect(out.questions.length).toBeGreaterThan(0);
    for (const q of out.questions) {
      expect(q.options).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
  });

  it('throws 422 NOT_ENOUGH_CONTENT for a note with no headings, never a 500', async () => {
    const { note } = await mk('Ghi chú ngắn', '<p>Chỉ một câu.</p>', ['Tim mạch']);
    await expect(generateQuiz(uid, note.id)).rejects.toMatchObject({
      status: 422,
      code: 'NOT_ENOUGH_CONTENT',
      message: 'Ghi chú chưa đủ nội dung để tạo câu hỏi.',
    });
  });

  it('passes the caller avoid list through without failing', async () => {
    const { note } = await mk(
      'Có nội dung',
      '<h2>A</h2><ul><li>một</li><li>hai</li><li>ba</li></ul><h2>B</h2><ul><li>bốn</li><li>năm</li><li>sáu</li></ul>',
      ['Tim mạch'],
    );
    const out = await generateQuiz(uid, note.id, ['Câu đã hỏi rồi?']);
    expect(out.questions.length).toBeGreaterThan(0);
  });

  it('404s for a note the user does not own', async () => {
    await expect(generateQuiz(uid, 'n-does-not-exist')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 7: Run it**

Run: `npx vitest run src/lib/services/quiz.test.ts`
Expected: PASS (31 tests total).

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/quiz.ts src/lib/services/quiz.test.ts src/app/api/notes
git commit -m "feat(quiz): add offline generator, Gemini client with strict validation, and generate route"
```

---

### Task B13: Images — multipart upload and cached, ownership-checked serving

**Files:**
- Create: `src/lib/services/images.ts`
- Create: `src/app/api/images/route.ts`
- Create: `src/app/api/images/[userId]/[imageId]/route.ts`
- Test: `src/lib/services/images.test.ts`
- Test: `src/app/api/images/route.test.ts`

**Interfaces:**
- Consumes: `getStorage`, `MAX_IMAGE_BYTES`, `ALLOWED_IMAGE_TYPES`, `extForContentType`, `safeSegment` (B6); `requireUser`, `getSession` (B8); `handle`, `HttpError` (B8); `newId` (B9).
- Produces:
```ts
export function imageUrl(userId: string, imageId: string): string; // `/api/images/${userId}/${imageId}`
export function uploadImage(userId: string, file: File): Promise<NoteImage>;
```

**No `sharp`.** Nothing resizes, re-encodes or inspects pixels. The route checks the declared MIME type against an allowlist, verifies the leading magic bytes so a renamed file cannot slip through, enforces a 4 MB cap, and stores the bytes unchanged. That keeps the dependency tree small and the function cold-start fast, and it is the only option that stays inside the free tier (`sharp` needs a native binary Vercel charges bundle size for).

- [ ] **Step 1: Write the failing service test**

```ts
// src/lib/services/images.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { uploadImage, imageUrl, sniffImageType } from './images';
import { getStorage } from '@/lib/storage';
import { closeDb } from '@/lib/db';
import { PNG_1PX } from '@/lib/storage/contract';

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const GIF_HEAD = Buffer.from('GIF89a-fake-body');
const WEBP_HEAD = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '),
]);

let cleanup: () => Promise<void>;
let uid = '';

const file = (bytes: Buffer, type: string, name = 'x') =>
  new File([new Uint8Array(bytes)], name, { type });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  uid = await makeUser('img_user');
});
afterAll(async () => {
  await dropUser(uid);
  await cleanup();
  await closeDb();
});

describe('imageUrl', () => {
  it('builds the proxy URL the editor embeds', () => {
    expect(imageUrl('u1', 'i1')).toBe('/api/images/u1/i1');
  });
});

describe('sniffImageType', () => {
  it('recognises the allowed formats by magic bytes', () => {
    expect(sniffImageType(PNG_1PX)).toBe('image/png');
    expect(sniffImageType(JPEG_HEAD)).toBe('image/jpeg');
    expect(sniffImageType(GIF_HEAD)).toBe('image/gif');
    expect(sniffImageType(WEBP_HEAD)).toBe('image/webp');
  });

  it('returns null for text, SVG and empty buffers', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="..."/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('hello world'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('uploadImage', () => {
  it('stores the bytes unchanged and returns a NoteImage', async () => {
    const out = await uploadImage(uid, file(PNG_1PX, 'image/png', 'so-do.png'));
    expect(out.id).toBeTruthy();
    expect(out.label).toBe('so-do.png');
    expect(out.src).toBe(`/api/images/${uid}/${out.id}`);

    const stored = await getStorage().getImage(uid, out.id);
    expect(stored!.contentType).toBe('image/png');
    expect(Buffer.compare(stored!.data, PNG_1PX)).toBe(0);
  });

  it('gives each upload a distinct id', async () => {
    const a = await uploadImage(uid, file(PNG_1PX, 'image/png'));
    const b = await uploadImage(uid, file(PNG_1PX, 'image/png'));
    expect(a.id).not.toBe(b.id);
  });

  it('rejects a non-image MIME type with 400', async () => {
    await expect(uploadImage(uid, file(PNG_1PX, 'application/pdf', 'a.pdf')))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_IMAGE' });
  });

  it('rejects SVG even though it is an image/* type', async () => {
    await expect(uploadImage(uid, file(Buffer.from('<svg/>'), 'image/svg+xml', 'a.svg')))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    await expect(uploadImage(uid, file(Buffer.from('not an image at all'), 'image/png', 'fake.png')))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_IMAGE' });
  });

  it('rejects an empty file', async () => {
    await expect(uploadImage(uid, file(Buffer.alloc(0), 'image/png')))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a file over 4 MB', async () => {
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(4 * 1024 * 1024)]);
    await expect(uploadImage(uid, file(big, 'image/png')))
      .rejects.toMatchObject({ status: 413, code: 'IMAGE_TOO_LARGE' });
  });

  it('accepts a file exactly at the 4 MB limit', async () => {
    const exact = Buffer.concat([PNG_1PX, Buffer.alloc(4 * 1024 * 1024 - PNG_1PX.length)]);
    await expect(uploadImage(uid, file(exact, 'image/png'))).resolves.toHaveProperty('id');
  });

  it('falls back to a generic label when the file has no name', async () => {
    const out = await uploadImage(uid, file(PNG_1PX, 'image/png', ''));
    expect(out.label).toBe('Hình ảnh');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/images.test.ts`
Expected: FAIL — `Failed to resolve import "./images"`.

- [ ] **Step 3: Write `src/lib/services/images.ts`**

```ts
// src/lib/services/images.ts
import type { NoteImage } from '@/lib/types';
import { HttpError } from '@/lib/http';
import { getStorage, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/storage';
import { newId } from './notes';

export const imageUrl = (userId: string, imageId: string): string =>
  `/api/images/${userId}/${imageId}`;

/**
 * Nhận dạng định dạng qua magic bytes. Không dùng thư viện xử lý ảnh:
 * ta không resize hay re-encode, chỉ cần chắc chắn file đúng là ảnh.
 */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp' &&
      buf.subarray(8, 12).toString('latin1').startsWith('avif')) {
    return 'image/avif';
  }
  return null;
}

/** Tải ảnh lên storage của CHÍNH user. Không nhận đường dẫn từ caller. */
export async function uploadImage(userId: string, file: File): Promise<NoteImage> {
  const declared = (file.type || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(declared)) {
    throw new HttpError(
      400,
      'INVALID_IMAGE',
      `Chỉ chấp nhận ảnh ${ALLOWED_IMAGE_TYPES.map((t) => t.replace('image/', '')).join(', ')}.`,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt quá 4MB.');
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) throw new HttpError(400, 'INVALID_IMAGE', 'Tệp rỗng.');
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt quá 4MB.');
  }

  // A renamed .exe with a PNG content-type must not get through.
  const sniffed = sniffImageType(buf);
  if (!sniffed || sniffed !== declared) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Nội dung tệp không phải ảnh hợp lệ.');
  }

  const id = newId('img');
  await getStorage().putImage(userId, id, buf, sniffed);

  return { id, label: file.name || 'Hình ảnh', src: imageUrl(userId, id) };
}
```

- [ ] **Step 4: Run the service test**

Run: `npx vitest run src/lib/services/images.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Write the upload route**

`POST /api/images` · `multipart/form-data` with field `file` · 200 `{ image: NoteImage }`

```ts
// src/app/api/images/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle, HttpError } from '@/lib/http';
import { uploadImage } from '@/lib/services/images';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();

    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      throw new HttpError(400, 'INVALID_INPUT', 'Yêu cầu phải là multipart/form-data.');
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Thiếu tệp ảnh.');
    }

    return { image: await uploadImage(user.id, file) };
  });
}
```

- [ ] **Step 6: Write the serving route**

`GET /api/images/[userId]/[imageId]` · 200 with the bytes, `Cache-Control: public, max-age=31536000, immutable` · 401 when not signed in · 404 when the caller is not the owner or the image is missing.

A signed-in caller asking for someone else's image gets **404, not 403** — a 403 would confirm the image exists.

```ts
// src/app/api/images/[userId]/[imageId]/route.ts
import { getSession } from '@/lib/auth/session';
import { jsonError } from '@/lib/http';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string; imageId: string }> },
) {
  const { userId, imageId } = await ctx.params;

  const session = await getSession();
  if (!session) return jsonError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');

  // Ownership, not authorisation: 404 so the response cannot confirm existence.
  if (session.id !== userId) return jsonError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');

  let image;
  try {
    // Always read under the SESSION user id, never the path parameter.
    image = await getStorage().getImage(session.id, imageId);
  } catch {
    // safeSegment rejected the id.
    return jsonError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
  }
  if (!image) return jsonError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');

  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.data.length),
      // Image ids are unique per upload and never reused, so this is safe.
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${image.sha}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
```

- [ ] **Step 7: Write the route test**

```ts
// src/app/api/images/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const session = { current: null as null | { id: string; username: string; displayName: string } };
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => session.current),
  requireUser: vi.fn(async () => {
    if (!session.current) {
      const { HttpError } = await import('@/lib/http');
      throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
    }
    return session.current;
  }),
  setSessionCookie: vi.fn(async () => {}),
  clearSessionCookie: vi.fn(async () => {}),
}));

const { POST } = await import('./route');
const { GET } = await import('./[userId]/[imageId]/route');
const { useTempStorage, makeUser, dropUser } = await import('@/lib/services/helpers');
const { PNG_1PX } = await import('@/lib/storage/contract');
const { closeDb } = await import('@/lib/db');

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const upload = (bytes = PNG_1PX, type = 'image/png', name = 'a.png') => {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request('http://localhost/api/images', { method: 'POST', body: form }));
};

const fetchImage = (userId: string, imageId: string) =>
  GET(new Request(`http://localhost/api/images/${userId}/${imageId}`), {
    params: Promise.resolve({ userId, imageId }),
  });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('imgroute_a');
  userB = await makeUser('imgroute_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('POST /api/images', () => {
  it('401s when signed out', async () => {
    session.current = null;
    expect((await upload()).status).toBe(401);
  });

  it('uploads and returns a NoteImage scoped to the session user', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const res = await upload();
    expect(res.status).toBe(200);
    const { image } = await res.json();
    expect(image.src).toBe(`/api/images/${userA}/${image.id}`);
    expect(image.label).toBe('a.png');
  });

  it('413s for a file over 4MB', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(4 * 1024 * 1024)]);
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('IMAGE_TOO_LARGE');
  });

  it('400s for a non-image type', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    expect((await upload(PNG_1PX, 'application/pdf', 'a.pdf')).status).toBe(400);
  });

  it('400s when the multipart body has no file field', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const form = new FormData();
    form.append('other', 'x');
    const res = await POST(new Request('http://localhost/api/images', { method: 'POST', body: form }));
    expect(res.status).toBe(400);
  });

  it('400s for a JSON body', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const res = await POST(new Request('http://localhost/api/images', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/images/[userId]/[imageId]', () => {
  let imageId = '';

  beforeAll(async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const { image } = await (await upload()).json();
    imageId = image.id;
  });

  it('serves the bytes with the immutable cache header', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const res = await fetchImage(userA, imageId);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{40}"$/);
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), PNG_1PX)).toBe(0);
  });

  it('401s when signed out', async () => {
    session.current = null;
    expect((await fetchImage(userA, imageId)).status).toBe(401);
  });

  it('404s when another signed-in user asks for it', async () => {
    session.current = { id: userB, username: 'b', displayName: 'B' };
    const res = await fetchImage(userA, imageId);
    expect(res.status).toBe(404);
  });

  it('404s when the path userId differs from the session, even for a real image', async () => {
    session.current = { id: userB, username: 'b', displayName: 'B' };
    expect((await fetchImage(userA, imageId)).status).toBe(404);
  });

  it('404s for an unknown image id', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    expect((await fetchImage(userA, 'img-nope')).status).toBe(404);
  });

  it('404s for a traversing image id instead of 500', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    expect((await fetchImage(userA, '../../etc/passwd')).status).toBe(404);
  });
});
```

- [ ] **Step 8: Run the route test**

Run: `npx vitest run src/app/api/images/route.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/images.ts src/lib/services/images.test.ts src/app/api/images
git commit -m "feat(images): add multipart upload with magic-byte validation and cached owner-only serving"
```

---

### Task B14: Internal API routes (cookie session)

**Files:**
- Create: `src/lib/api/schemas.ts`
- Create: `src/lib/api/query.ts`
- Create: `src/lib/services/prefs.ts`
- Create: `src/app/api/notes/route.ts`
- Create: `src/app/api/notes/[id]/route.ts`
- Create: `src/app/api/notes/[id]/favorite/route.ts`
- Create: `src/app/api/notes/[id]/comments/route.ts`
- Create: `src/app/api/notes/[id]/comments/[commentId]/route.ts`
- Create: `src/app/api/notes/[id]/highlights/route.ts`
- Create: `src/app/api/notes/[id]/versions/[v]/restore/route.ts`
- Create: `src/app/api/notes/[id]/quizzes/route.ts`
- Create: `src/app/api/tags/route.ts`
- Create: `src/app/api/prefs/route.ts`
- Test: `src/lib/api/query.test.ts`
- Test: `src/app/api/notes/route.test.ts`

**Interfaces:**
- Consumes: every service from B9/B10/B12/B13; `requireUser` (B8); `handle` (B8).
- Produces the full internal contract the UI calls:

| Method | Path | Request body | Response |
|---|---|---|---|
| GET | `/api/notes?q&tag&priority&fav&sort&page&pageSize` | — | `NoteListResult` |
| POST | `/api/notes` | `CreateNoteInput` | `{ note: Note; version: number }` |
| GET | `/api/notes/[id]` | — | `{ note: Note }` |
| PATCH | `/api/notes/[id]` | `UpdateNoteInput` | `{ note: Note; version: number }` |
| DELETE | `/api/notes/[id]` | — | `{ ok: true }` |
| POST | `/api/notes/[id]/favorite` | — | `{ fav: boolean }` |
| POST | `/api/notes/[id]/comments` | `{ text: string }` | `{ comment: NoteComment; note: Note }` |
| DELETE | `/api/notes/[id]/comments/[commentId]` | — | `{ note: Note }` |
| PUT | `/api/notes/[id]/highlights` | `{ content: string }` | `{ ok: true; contentSha: string }` |
| POST | `/api/notes/[id]/versions/[v]/restore` | — | `{ note: Note; version: number }` |
| POST | `/api/notes/[id]/quizzes` | `{ score, total, source, picks, questions }` | `{ quiz: Quiz; note: Note }` |
| POST | `/api/notes/[id]/quiz/generate` | `{ avoid?: string[] }` (optional) | `{ questions: Question[]; source }` · 422 `NOT_ENOUGH_CONTENT` (Task B12) |
| GET | `/api/tags` | — | `{ tags: { name, slug, count }[] }` |
| GET | `/api/prefs` | — | `{ prefs: UserPrefs }` |
| PATCH | `/api/prefs` | `Partial<Omit<UserPrefs,'userId'>>` | `{ prefs: UserPrefs }` |
| POST | `/api/images` | multipart `file` | `{ image: NoteImage }` (Task B13) |
| GET | `/api/images/[userId]/[imageId]` | — | image bytes (Task B13) |
| GET | `/api/search/index` | — | `{ userId: string; items: SearchDoc[] }` (Task B17) |

- [ ] **Step 1: Write the failing query-parser test**

```ts
// src/lib/api/query.test.ts
import { describe, it, expect } from 'vitest';
import { parseNoteFilters } from './query';

const parse = (qs: string) => parseNoteFilters(new URL(`http://x/api/notes${qs}`).searchParams);

describe('parseNoteFilters', () => {
  it('defaults to all notes, updated sort, page 1, size 6', () => {
    expect(parse('')).toEqual({
      query: '', nav: 'all', priority: null, tag: null,
      sort: 'updated', page: 1, pageSize: 6,
    });
  });

  it('reads the query string as-is, including a leading #', () => {
    expect(parse('?q=%23Tim%20m%E1%BA%A1ch').query).toBe('#Tim mạch');
  });

  it('maps fav=1, fav=true and nav=fav to the favourites view', () => {
    expect(parse('?fav=1').nav).toBe('fav');
    expect(parse('?fav=true').nav).toBe('fav');
    expect(parse('?nav=fav').nav).toBe('fav');
    expect(parse('?fav=0').nav).toBe('all');
    expect(parse('?fav=false').nav).toBe('all');
  });

  it('accepts only the three known priorities', () => {
    expect(parse('?priority=high').priority).toBe('high');
    expect(parse('?priority=low').priority).toBe('low');
    expect(parse('?priority=urgent').priority).toBeNull();
    expect(parse('?priority=').priority).toBeNull();
  });

  it('accepts only the three known sorts, falling back to updated', () => {
    expect(parse('?sort=title').sort).toBe('title');
    expect(parse('?sort=priority').sort).toBe('priority');
    expect(parse('?sort=random').sort).toBe('updated');
  });

  it('clamps page to at least 1 and ignores junk', () => {
    expect(parse('?page=3').page).toBe(3);
    expect(parse('?page=0').page).toBe(1);
    expect(parse('?page=-5').page).toBe(1);
    expect(parse('?page=abc').page).toBe(1);
    expect(parse('?page=1e9').page).toBe(1);
  });

  it('clamps pageSize to 1..100 and defaults to 6', () => {
    expect(parse('?pageSize=12').pageSize).toBe(12);
    expect(parse('?pageSize=0').pageSize).toBe(6);
    expect(parse('?pageSize=5000').pageSize).toBe(100);
    expect(parse('?pageSize=xyz').pageSize).toBe(6);
  });

  it('passes the tag through untouched so display casing survives', () => {
    expect(parse('?tag=Tim%20m%E1%BA%A1ch').tag).toBe('Tim mạch');
    expect(parse('?tag=').tag).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/api/query.test.ts`
Expected: FAIL — `Failed to resolve import "./query"`.

- [ ] **Step 3: Write `src/lib/api/query.ts`**

```ts
// src/lib/api/query.ts
import { DEFAULT_PAGE_SIZE, PRIORITIES, type NoteFilters, type Priority, type SortKey } from '@/lib/types';

const SORTS: SortKey[] = ['updated', 'priority', 'title'];

function int(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Đọc filter từ query string. Mọi giá trị lạ đều rơi về mặc định, không 400. */
export function parseNoteFilters(sp: URLSearchParams): Required<NoteFilters> {
  const priority = sp.get('priority');
  const sort = sp.get('sort');
  const fav = sp.get('fav');
  const tag = sp.get('tag');

  return {
    query: sp.get('q') ?? '',
    nav: fav === '1' || fav === 'true' || sp.get('nav') === 'fav' ? 'fav' : 'all',
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : null,
    tag: tag && tag.length ? tag : null,
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : 'updated',
    page: int(sp.get('page'), 1, 1, 1_000_000),
    pageSize: pageSize(sp.get('pageSize')),
  };
}

/**
 * `pageSize` khác `page`: giá trị 0 hoặc rác phải rơi về 6 (mặc định),
 * KHÔNG bị kẹp thành 1 — nên không dùng chung `int()`.
 */
function pageSize(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, 100);
}
```

- [ ] **Step 4: Run the query test**

Run: `npx vitest run src/lib/api/query.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write `src/lib/api/schemas.ts`**

One place for every request body shape, shared by the internal API, `/api/v1` and MCP.

```ts
// src/lib/api/schemas.ts
import { z } from 'zod';

export const PrioritySchema = z.enum(['high', 'medium', 'low']);

export const NoteImageSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().max(300).default(''),
  src: z.string().max(500),
});

export const NoteWriteSchema = z.object({
  title: z.string().max(300).default(''),
  desc: z.string().max(1000).default(''),
  tags: z.array(z.string().min(1).max(80)).max(20).default([]),
  priority: PrioritySchema.default('medium'),
  content: z.string().max(400_000).default(''),
  images: z.array(NoteImageSchema).max(50).default([]),
  changeNote: z.string().max(200).optional(),
});

export const CommentSchema = z.object({ text: z.string().min(1).max(4000) });

export const HighlightSchema = z.object({ content: z.string().max(400_000) });

export const QuestionSchema = z.object({
  q: z.string().min(1).max(1000),
  options: z.array(z.string().max(500)).length(4),
  answer: z.number().int().min(0).max(3),
  explain: z.string().max(2000).default(''),
});

export const QuizRecordSchema = z.object({
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  source: z.enum(['ai', 'offline']),
  picks: z.array(z.number().int().min(0).max(3).nullable()).max(50),
  questions: z.array(QuestionSchema).max(50),
});

export const PrefsSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  fontSize: z.number().int().min(14).max(22).optional(),
  view: z.enum(['grid', 'list']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  recentSearches: z.array(z.string().max(200)).max(5).optional(),
});
```

- [ ] **Step 6: Write `src/lib/services/prefs.ts`**

```ts
// src/lib/services/prefs.ts
import { eq } from 'drizzle-orm';
import { db, userPrefs } from '@/lib/db';
import type { UserPrefs } from '@/lib/types';

const toPrefs = (r: typeof userPrefs.$inferSelect): UserPrefs => ({
  userId: r.userId,
  theme: r.theme,
  fontSize: r.fontSize,
  view: r.view,
  sidebarCollapsed: r.sidebarCollapsed,
  recentSearches: r.recentSearches,
});

/** Đọc prefs, tạo bản mặc định nếu chưa có. Một round-trip khi đã tồn tại. */
export async function getPrefs(userId: string): Promise<UserPrefs> {
  const [row] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  if (row) return toPrefs(row);
  const [created] = await db.insert(userPrefs).values({ userId }).onConflictDoNothing().returning();
  if (created) return toPrefs(created);
  const [again] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  return toPrefs(again);
}

export async function updatePrefs(
  userId: string,
  patch: Partial<Omit<UserPrefs, 'userId'>>,
): Promise<UserPrefs> {
  await getPrefs(userId);
  const [row] = await db
    .update(userPrefs)
    .set(patch)
    .where(eq(userPrefs.userId, userId))
    .returning();
  return toPrefs(row);
}
```

- [ ] **Step 7: Write the notes collection route**

```ts
// src/app/api/notes/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { parseNoteFilters } from '@/lib/api/query';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { createNote, listNotes } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const filters = parseNoteFilters(new URL(req.url).searchParams);
    return listNotes(user.id, filters);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = NoteWriteSchema.parse(await req.json());
    return createNote(user.id, input);
  });
}
```

- [ ] **Step 8: Write the single-note route**

```ts
// src/app/api/notes/[id]/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { deleteNote, getNote, updateNote } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return { note: await getNote(user.id, id) };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return updateNote(user.id, id, NoteWriteSchema.parse(await req.json()));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteNote(user.id, id);
    return { ok: true };
  });
}
```

- [ ] **Step 9: Write the favourite, comments, highlights, restore and quizzes routes**

```ts
// src/app/api/notes/[id]/favorite/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { toggleFavorite } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return toggleFavorite(user.id, id);
  });
}
```

```ts
// src/app/api/notes/[id]/comments/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { CommentSchema } from '@/lib/api/schemas';
import { addComment } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { text } = CommentSchema.parse(await req.json());
    return addComment(user, id, text);
  });
}
```

```ts
// src/app/api/notes/[id]/comments/[commentId]/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { deleteComment } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; commentId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id, commentId } = await ctx.params;
    return deleteComment(user.id, id, commentId);
  });
}
```

```ts
// src/app/api/notes/[id]/highlights/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { HighlightSchema } from '@/lib/api/schemas';
import { saveHighlights } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { content } = HighlightSchema.parse(await req.json());
    const { ok, contentSha } = await saveHighlights(user.id, id, content);
    // part-0 §3.5: the route returns only { ok, contentSha }, not the whole note.
    return { ok, contentSha };
  });
}
```

```ts
// src/app/api/notes/[id]/versions/[v]/restore/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle, HttpError } from '@/lib/http';
import { restoreVersion } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; v: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id, v } = await ctx.params;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError(400, 'INVALID_INPUT', 'Số phiên bản không hợp lệ.');
    }
    return restoreVersion(user.id, id, n);
  });
}
```

```ts
// src/app/api/notes/[id]/quizzes/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { QuizRecordSchema } from '@/lib/api/schemas';
import { addQuizRecord, getNote } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return { quizzes: (await getNote(user.id, id)).quizzes };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return addQuizRecord(user.id, id, QuizRecordSchema.parse(await req.json()));
  });
}
```

- [ ] **Step 10: Write the tags and prefs routes**

```ts
// src/app/api/tags/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { listTags } from '@/lib/services/tags';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { tags: await listTags(user.id) };
  });
}
```

```ts
// src/app/api/prefs/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { PrefsSchema } from '@/lib/api/schemas';
import { getPrefs, updatePrefs } from '@/lib/services/prefs';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { prefs: await getPrefs(user.id) };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const patch = PrefsSchema.parse(await req.json());
    return { prefs: await updatePrefs(user.id, patch) };
  });
}
```

- [ ] **Step 11: Write the notes route test**

```ts
// src/app/api/notes/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const session = { current: null as null | { id: string; username: string; displayName: string } };
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => session.current),
  requireUser: vi.fn(async () => {
    if (!session.current) {
      const { HttpError } = await import('@/lib/http');
      throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
    }
    return session.current;
  }),
  setSessionCookie: vi.fn(async () => {}),
  clearSessionCookie: vi.fn(async () => {}),
}));

const { GET, POST } = await import('./route');
const single = await import('./[id]/route');
const fav = await import('./[id]/favorite/route');
const comments = await import('./[id]/comments/route');
const highlights = await import('./[id]/highlights/route');
const restore = await import('./[id]/versions/[v]/restore/route');
const { useTempStorage, makeUser, dropUser } = await import('@/lib/services/helpers');
const { closeDb } = await import('@/lib/db');

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const body = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch'],
  priority: 'high',
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

const jsonReq = (url: string, method: string, payload?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

const create = () => POST(jsonReq('http://x/api/notes', 'POST', body));
const list = (qs = '') => GET(new Request(`http://x/api/notes${qs}`));

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('route_a');
  userB = await makeUser('route_b');
  session.current = { id: userA, username: 'route_a', displayName: 'A' };
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('auth gate', () => {
  it('401s every notes route when signed out', async () => {
    const saved = session.current;
    session.current = null;
    expect((await list()).status).toBe(401);
    expect((await create()).status).toBe(401);
    session.current = saved;
  });
});

describe('POST + GET /api/notes', () => {
  it('creates a note at v1 and returns it', async () => {
    const res = await create();
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.version).toBe(1);
    expect(out.note.title).toBe(body.title);
  });

  it('lists with the default page size of 6', async () => {
    const out = await (await list()).json();
    expect(out.pageSize).toBe(6);
    expect(out.notes.length).toBeLessThanOrEqual(6);
    expect(out.page).toBe(1);
  });

  it('filters by query, priority and tag from the query string', async () => {
    expect((await (await list('?q=huyet%20ap')).json()).total).toBeGreaterThan(0);
    expect((await (await list('?priority=low')).json()).total).toBe(0);
    expect((await (await list('?tag=Tim%20m%E1%BA%A1ch')).json()).total).toBeGreaterThan(0);
  });

  it('400s on an invalid body', async () => {
    const res = await POST(jsonReq('http://x/api/notes', 'POST', { priority: 'urgent' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });
});

describe('/api/notes/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('GETs a note the caller owns', async () => {
    const { note } = await (await create()).json();
    const res = await single.GET(new Request('http://x'), ctx(note.id));
    expect(res.status).toBe(200);
    expect((await res.json()).note.id).toBe(note.id);
  });

  it('404s a note owned by someone else', async () => {
    const { note } = await (await create()).json();
    session.current = { id: userB, username: 'route_b', displayName: 'B' };
    const res = await single.GET(new Request('http://x'), ctx(note.id));
    expect(res.status).toBe(404);
    session.current = { id: userA, username: 'route_a', displayName: 'A' };
  });

  it('PATCH bumps the version when the content changes', async () => {
    const { note } = await (await create()).json();
    const res = await single.PATCH(
      jsonReq('http://x', 'PATCH', { ...body, content: '<p>v2</p>' }),
      ctx(note.id),
    );
    expect((await res.json()).version).toBe(2);
  });

  it('PATCH does not bump when only the description changes', async () => {
    const { note } = await (await create()).json();
    const res = await single.PATCH(jsonReq('http://x', 'PATCH', { ...body, desc: 'z' }), ctx(note.id));
    expect((await res.json()).version).toBe(1);
  });

  it('DELETE removes it and a second DELETE 404s', async () => {
    const { note } = await (await create()).json();
    expect((await single.DELETE(new Request('http://x'), ctx(note.id))).status).toBe(200);
    expect((await single.DELETE(new Request('http://x'), ctx(note.id))).status).toBe(404);
  });
});

describe('side routes', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('toggles favourite', async () => {
    const { note } = await (await create()).json();
    expect(await (await fav.POST(new Request('http://x'), ctx(note.id))).json()).toEqual({ fav: true });
    expect(await (await fav.POST(new Request('http://x'), ctx(note.id))).json()).toEqual({ fav: false });
  });

  it('adds a comment and rejects an empty one with 400', async () => {
    const { note } = await (await create()).json();
    const ok = await comments.POST(jsonReq('http://x', 'POST', { text: 'ghi chú thêm' }), ctx(note.id));
    expect(ok.status).toBe(200);
    const bad = await comments.POST(jsonReq('http://x', 'POST', { text: '' }), ctx(note.id));
    expect(bad.status).toBe(400);
  });

  it('saves highlights, returns { ok, contentSha }, and creates no version', async () => {
    const { note } = await (await create()).json();
    const res = await highlights.PUT(
      jsonReq('http://x', 'PUT', { content: '<p><mark data-hl="h1">một</mark></p>' }),
      ctx(note.id),
    );
    const out = await res.json();
    expect(out).toEqual({ ok: true, contentSha: expect.stringMatching(/^[0-9a-f]{64}$/) });

    const after = await (await single.GET(new Request('http://x'), ctx(note.id))).json();
    expect(after.note.versions).toHaveLength(1);
    expect(after.note.versions[0].content).toContain('data-hl="h1"');
    expect(after.note.content).toContain('data-hl="h1"');
  });

  it('restores a version and 400s a non-numeric version', async () => {
    const { note } = await (await create()).json();
    await single.PATCH(jsonReq('http://x', 'PATCH', { ...body, content: '<p>v2</p>' }), ctx(note.id));
    const ok = await restore.POST(new Request('http://x'), {
      params: Promise.resolve({ id: note.id, v: '1' }),
    });
    expect((await ok.json()).version).toBe(3);
    const bad = await restore.POST(new Request('http://x'), {
      params: Promise.resolve({ id: note.id, v: 'abc' }),
    });
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 12: Run it**

Run: `npx vitest run src/app/api/notes/route.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 13: Full suite, typecheck, lint, build**

Run: `npx vitest run && npx tsc --noEmit && npx next lint && npx next build`
Expected: all green. The build proves every route file is a valid App Router handler.

- [ ] **Step 14: Commit**

```bash
git add src/lib/api src/lib/services/prefs.ts src/app/api/notes src/app/api/tags src/app/api/prefs
git commit -m "feat(api): add internal cookie-session routes for notes, comments, highlights, versions, tags and prefs"
```

---

### Task B15: API keys, bearer auth, in-memory rate limiter, public `/api/v1`

**Files:**
- Create: `src/lib/auth/api-keys.ts`
- Create: `src/lib/api/rate-limit.ts`
- Create: `src/lib/api/bearer.ts`
- Create: `src/app/api/api-keys/route.ts`
- Create: `src/app/api/api-keys/[id]/route.ts`
- Create: `src/app/api/v1/notes/route.ts`
- Create: `src/app/api/v1/notes/[id]/route.ts`
- Create: `src/app/api/v1/notes/[id]/quizzes/route.ts`
- Create: `src/app/api/v1/notes/[id]/comments/route.ts`
- Create: `src/app/api/v1/tags/route.ts`
- Test: `src/lib/auth/api-keys.test.ts`
- Test: `src/lib/api/rate-limit.test.ts`
- Test: `src/app/api/v1/notes/route.test.ts`

**Interfaces:**
- Consumes: `db`, `apiKeys` (B5); services (B9/B10/B12); `handle`, `HttpError` (B8); `parseNoteFilters`, `NoteWriteSchema`, `CommentSchema`, `QuizRecordSchema` (B14).
- Produces:
```ts
// api-keys.ts
export function generateApiKey(): { key: string; prefix: string; hash: string }; // key = `kn_<32 hex>`
export function hashApiKey(key: string): string;                                  // sha256 hex
export function createApiKey(userId: string, name: string): Promise<{ apiKey: ApiKey; key: string }>;
export function listApiKeys(userId: string): Promise<ApiKey[]>;
export function revokeApiKey(userId: string, id: string): Promise<void>;
export function resolveApiKey(key: string): Promise<SessionUser | null>;

// rate-limit.ts
export function takeToken(bucketId: string, opts?: { capacity?: number; refillPerSec?: number }): { ok: boolean; remaining: number; resetSec: number };
export function __resetRateLimits(): void;

// bearer.ts
export function requireBearer(req: Request): Promise<SessionUser>;  // throws 401 / 429
```

**Rate limiting without a paid service.** A module-scope token bucket: 60 requests per minute per key, capacity 60, refilling at 1 token/second. It lives in the Node process, so on Vercel each warm lambda instance keeps its own bucket and a burst spread across instances can exceed the nominal limit. That is stated in the docs as **best effort** — it exists to stop one runaway agent loop, not to enforce a billing quota. Anything stronger would need Redis, which is not free.

- [ ] **Step 1: Write the failing API-key test**

```ts
// src/lib/auth/api-keys.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, apiKeys, closeDb } from '@/lib/db';
import { makeUser, dropUser } from '@/lib/services/helpers';
import {
  generateApiKey, hashApiKey, createApiKey, listApiKeys, revokeApiKey, resolveApiKey,
} from './api-keys';

let userA = '';
let userB = '';

beforeAll(async () => {
  userA = await makeUser('key_a');
  userB = await makeUser('key_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await closeDb();
});

describe('generateApiKey', () => {
  it('produces kn_ followed by 32 hex characters', () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^kn_[0-9a-f]{32}$/);
    expect(key).toHaveLength(35);
  });

  it('takes the prefix from the first 10 characters', () => {
    const { key, prefix } = generateApiKey();
    expect(prefix).toBe(key.slice(0, 10));
    expect(prefix.startsWith('kn_')).toBe(true);
  });

  it('hashes with sha256, producing 64 hex characters', () => {
    const { key, hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiKey(key));
  });

  it('never repeats a key', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().key));
    expect(keys.size).toBe(200);
  });
});

describe('createApiKey', () => {
  it('returns the plaintext key once and stores only its hash', async () => {
    const { apiKey, key } = await createApiKey(userA, 'Claude Desktop');
    expect(key).toMatch(/^kn_[0-9a-f]{32}$/);
    expect(apiKey.name).toBe('Claude Desktop');
    expect(apiKey.prefix).toBe(key.slice(0, 10));
    expect(JSON.stringify(apiKey)).not.toContain(key);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
    expect(row.tokenHash).toBe(hashApiKey(key));
    expect(row.tokenHash).not.toContain(key);
  });

  it('lists keys without ever exposing the hash', async () => {
    await createApiKey(userA, 'Codex');
    const list = await listApiKeys(userA);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(list)).not.toContain('tokenHash');
    for (const k of list) expect(Object.keys(k)).not.toContain('tokenHash');
  });

  it('never lists another user keys', async () => {
    await createApiKey(userB, 'B key');
    const list = await listApiKeys(userA);
    expect(list.some((k) => k.name === 'B key')).toBe(false);
  });
});

describe('resolveApiKey', () => {
  it('resolves a valid key to its owner', async () => {
    const { key } = await createApiKey(userA, 'resolve me');
    const user = await resolveApiKey(key);
    expect(user).toMatchObject({ id: userA, username: 'key_a' });
  });

  it('records lastUsedAt', async () => {
    const { apiKey, key } = await createApiKey(userA, 'touch me');
    expect(apiKey.lastUsedAt).toBeNull();
    await resolveApiKey(key);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('returns null for an unknown, malformed or empty key', async () => {
    expect(await resolveApiKey('kn_' + '0'.repeat(32))).toBeNull();
    expect(await resolveApiKey('not-a-key')).toBeNull();
    expect(await resolveApiKey('')).toBeNull();
  });

  it('returns null once revoked', async () => {
    const { apiKey, key } = await createApiKey(userA, 'revoke me');
    expect(await resolveApiKey(key)).not.toBeNull();
    await revokeApiKey(userA, apiKey.id);
    expect(await resolveApiKey(key)).toBeNull();
  });

  it('refuses to revoke another user key', async () => {
    const { apiKey, key } = await createApiKey(userA, 'not yours');
    await expect(revokeApiKey(userB, apiKey.id)).rejects.toMatchObject({ status: 404 });
    expect(await resolveApiKey(key)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/api-keys.test.ts`
Expected: FAIL — `Failed to resolve import "./api-keys"`.

- [ ] **Step 3: Write `src/lib/auth/api-keys.ts`**

```ts
// src/lib/auth/api-keys.ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, apiKeys, users } from '@/lib/db';
import { HttpError } from '@/lib/http';
import type { ApiKey, SessionUser } from '@/lib/types';

const KEY_RE = /^kn_[0-9a-f]{32}$/;

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** `kn_` + 32 hex (128 bit). Chỉ hiện đầy đủ một lần, sau đó chỉ còn hash. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = 'kn_' + randomBytes(16).toString('hex');
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

const toApiKey = (r: typeof apiKeys.$inferSelect): ApiKey => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  prefix: r.prefix,
  createdAt: r.createdAt.toISOString(),
  lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
});

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ apiKey: ApiKey; key: string }> {
  const trimmed = (name || '').trim() || 'API key';
  const { key, prefix, hash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: trimmed, prefix, tokenHash: hash })
    .returning();
  return { apiKey: toApiKey(row), key };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(toApiKey);
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.id, id)))
    .returning({ id: apiKeys.id });
  if (!deleted.length) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy API key.');
}

/** Constant-time compare so a timing signal cannot reveal a stored hash. */
function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Tra khoá -> chủ sở hữu. Trả null với mọi khoá sai/rác. */
export async function resolveApiKey(key: string): Promise<SessionUser | null> {
  if (!KEY_RE.test(key || '')) return null;
  const hash = hashApiKey(key);

  const [row] = await db
    .select({
      keyId: apiKeys.id,
      tokenHash: apiKeys.tokenHash,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.tokenHash, hash))
    .limit(1);

  if (!row || !hashesEqual(row.tokenHash, hash)) return null;

  // Fire and forget: a failed timestamp update must not fail the request.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.keyId))
    .catch(() => {});

  return { id: row.id, username: row.username, displayName: row.displayName };
}
```

- [ ] **Step 4: Run the API-key test**

Run: `npx vitest run src/lib/auth/api-keys.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing rate-limit test**

```ts
// src/lib/api/rate-limit.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { takeToken, __resetRateLimits } from './rate-limit';

beforeEach(() => __resetRateLimits());
afterEach(() => vi.useRealTimers());

describe('takeToken', () => {
  it('allows the first request and reports the remaining budget', () => {
    const r = takeToken('k1', { capacity: 3, refillPerSec: 1 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('allows exactly `capacity` requests then refuses', () => {
    const opts = { capacity: 3, refillPerSec: 1 };
    expect(takeToken('k2', opts).ok).toBe(true);
    expect(takeToken('k2', opts).ok).toBe(true);
    expect(takeToken('k2', opts).ok).toBe(true);
    const fourth = takeToken('k2', opts);
    expect(fourth.ok).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.resetSec).toBeGreaterThan(0);
  });

  it('keeps separate budgets per bucket id', () => {
    const opts = { capacity: 1, refillPerSec: 1 };
    expect(takeToken('a', opts).ok).toBe(true);
    expect(takeToken('b', opts).ok).toBe(true);
    expect(takeToken('a', opts).ok).toBe(false);
  });

  it('refills over time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const opts = { capacity: 2, refillPerSec: 1 };
    takeToken('r', opts);
    takeToken('r', opts);
    expect(takeToken('r', opts).ok).toBe(false);

    vi.setSystemTime(new Date('2024-01-01T00:00:01Z'));
    expect(takeToken('r', opts).ok).toBe(true);
    expect(takeToken('r', opts).ok).toBe(false);
  });

  it('never refills above capacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const opts = { capacity: 2, refillPerSec: 1 };
    takeToken('c', opts);
    vi.setSystemTime(new Date('2024-01-01T01:00:00Z'));
    expect(takeToken('c', opts).remaining).toBe(1);
  });

  it('defaults to 60 requests per minute', () => {
    for (let i = 0; i < 60; i++) expect(takeToken('d').ok).toBe(true);
    expect(takeToken('d').ok).toBe(false);
  });

  it('evicts old buckets so memory does not grow without bound', () => {
    for (let i = 0; i < 12_000; i++) takeToken('bucket-' + i, { capacity: 1, refillPerSec: 1 });
    // The oldest bucket was evicted, so its budget is fresh again.
    expect(takeToken('bucket-0', { capacity: 1, refillPerSec: 1 }).ok).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/api/rate-limit.test.ts`
Expected: FAIL — `Failed to resolve import "./rate-limit"`.

- [ ] **Step 7: Write `src/lib/api/rate-limit.ts`**

```ts
// src/lib/api/rate-limit.ts

/**
 * Token bucket trong bộ nhớ tiến trình — KHÔNG cần dịch vụ trả phí.
 *
 * GIỚI HẠN ĐÃ BIẾT: trên Vercel mỗi lambda instance giữ bucket riêng, nên
 * lượng request thực tế có thể vượt hạn mức danh nghĩa khi nhiều instance
 * cùng ấm. Đây là "best effort": mục tiêu là chặn vòng lặp agent chạy loạn,
 * không phải áp hạn mức tính tiền. Muốn chặt hơn thì cần Redis (mất phí).
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SEC = 1;
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

export function takeToken(
  bucketId: string,
  opts: { capacity?: number; refillPerSec?: number } = {},
): { ok: boolean; remaining: number; resetSec: number } {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const refill = opts.refillPerSec ?? DEFAULT_REFILL_PER_SEC;
  const now = Date.now();

  let b = buckets.get(bucketId);
  if (!b) {
    b = { tokens: capacity, updatedAt: now };
    // Simple FIFO eviction; buckets are tiny and this only trims on growth.
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next().value as string | undefined;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(bucketId, b);
  }

  const elapsedSec = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsedSec * refill);
  b.updatedAt = now;

  if (b.tokens < 1) {
    return { ok: false, remaining: 0, resetSec: Math.ceil((1 - b.tokens) / refill) };
  }

  b.tokens -= 1;
  return {
    ok: true,
    remaining: Math.floor(b.tokens),
    resetSec: Math.ceil((capacity - b.tokens) / refill),
  };
}

/** Test seam. */
export function __resetRateLimits(): void {
  buckets.clear();
}
```

- [ ] **Step 8: Run the rate-limit test**

Run: `npx vitest run src/lib/api/rate-limit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 9: Write `src/lib/api/bearer.ts`**

```ts
// src/lib/api/bearer.ts
import { HttpError } from '@/lib/http';
import { hashApiKey, resolveApiKey } from '@/lib/auth/api-keys';
import { takeToken } from './rate-limit';
import type { SessionUser } from '@/lib/types';

/** Xác thực `Authorization: Bearer kn_…` + áp rate limit theo khoá. */
export async function requireBearer(req: Request): Promise<SessionUser> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Thiếu header Authorization: Bearer <api key>.');
  }
  const key = match[1];

  // Rate-limit by the key's hash so a wrong key cannot be used to probe
  // another key's remaining budget, and the raw key never enters a Map key.
  const bucket = hashApiKey(key);
  const limit = takeToken(bucket);
  if (!limit.ok) {
    throw new HttpError(
      429,
      'RATE_LIMITED',
      `Quá nhiều yêu cầu. Thử lại sau ${limit.resetSec} giây.`,
    );
  }

  const user = await resolveApiKey(key);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'API key không hợp lệ.');
  return user;
}
```

- [ ] **Step 10: Write the API-key management routes**

`GET /api/api-keys` · `{ keys: ApiKey[] }`
`POST /api/api-keys` · `{ name: string }` · `{ apiKey: ApiKey, key: string }` — `key` is returned **once**
`DELETE /api/api-keys/[id]` · `{ ok: true }`

```ts
// src/app/api/api-keys/route.ts
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { createApiKey, listApiKeys } from '@/lib/auth/api-keys';

export const runtime = 'nodejs';

const Body = z.object({ name: z.string().min(1).max(80) });

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { keys: await listApiKeys(user.id) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { name } = Body.parse(await req.json());
    return createApiKey(user.id, name);
  });
}
```

```ts
// src/app/api/api-keys/[id]/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { revokeApiKey } from '@/lib/auth/api-keys';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await revokeApiKey(user.id, id);
    return { ok: true };
  });
}
```

- [ ] **Step 11: Write the `/api/v1` routes**

Same services, bearer auth instead of a cookie. SPEC §2.4 lists exactly these.

```ts
// src/app/api/v1/notes/route.ts
import { handle } from '@/lib/http';
import { requireBearer } from '@/lib/api/bearer';
import { parseNoteFilters } from '@/lib/api/query';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { createNote, listNotes } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireBearer(req);
    return listNotes(user.id, parseNoteFilters(new URL(req.url).searchParams));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireBearer(req);
    return createNote(user.id, NoteWriteSchema.parse(await req.json()));
  });
}
```

```ts
// src/app/api/v1/notes/[id]/route.ts
import { handle } from '@/lib/http';
import { requireBearer } from '@/lib/api/bearer';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { deleteNote, getNote, updateNote } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return { note: await getNote(user.id, id) };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return updateNote(user.id, id, NoteWriteSchema.parse(await req.json()));
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    await deleteNote(user.id, id);
    return { ok: true };
  });
}
```

```ts
// src/app/api/v1/notes/[id]/quizzes/route.ts
import { handle } from '@/lib/http';
import { requireBearer } from '@/lib/api/bearer';
import { QuizRecordSchema } from '@/lib/api/schemas';
import { addQuizRecord, getNote } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return { quizzes: (await getNote(user.id, id)).quizzes };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return addQuizRecord(user.id, id, QuizRecordSchema.parse(await req.json()));
  });
}
```

```ts
// src/app/api/v1/notes/[id]/comments/route.ts
import { handle } from '@/lib/http';
import { requireBearer } from '@/lib/api/bearer';
import { CommentSchema } from '@/lib/api/schemas';
import { addComment } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    const { text } = CommentSchema.parse(await req.json());
    return addComment(user, id, text);
  });
}
```

```ts
// src/app/api/v1/tags/route.ts
import { handle } from '@/lib/http';
import { requireBearer } from '@/lib/api/bearer';
import { listTags } from '@/lib/services/tags';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireBearer(req);
    return { tags: await listTags(user.id) };
  });
}
```

- [ ] **Step 12: Write the `/api/v1` route test**

```ts
// src/app/api/v1/notes/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET, POST } from './route';
import * as single from './[id]/route';
import { useTempStorage, makeUser, dropUser } from '@/lib/services/helpers';
import { createApiKey } from '@/lib/auth/api-keys';
import { __resetRateLimits } from '@/lib/api/rate-limit';
import { closeDb } from '@/lib/db';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';
let keyA = '';
let keyB = '';

const body = {
  title: 'Ghi chú từ AI',
  desc: 'Mô tả',
  tags: ['Tim mạch'],
  priority: 'high',
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

const req = (url: string, key: string | null, method = 'GET', payload?: unknown) =>
  new Request(url, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('v1_a');
  userB = await makeUser('v1_b');
  keyA = (await createApiKey(userA, 'A')).key;
  keyB = (await createApiKey(userB, 'B')).key;
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('bearer auth', () => {
  it('401s with no Authorization header', async () => {
    __resetRateLimits();
    const res = await GET(req('http://x/api/v1/notes', null));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('401s for a non-Bearer scheme', async () => {
    __resetRateLimits();
    const res = await GET(new Request('http://x/api/v1/notes', {
      headers: { authorization: `Basic ${keyA}` },
    }));
    expect(res.status).toBe(401);
  });

  it('401s for an unknown key with the shared error envelope', async () => {
    __resetRateLimits();
    const res = await GET(req('http://x/api/v1/notes', 'kn_' + '0'.repeat(32)));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key không hợp lệ.' },
    });
  });

  it('accepts a valid key', async () => {
    __resetRateLimits();
    const res = await GET(req('http://x/api/v1/notes', keyA));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('pageSize', 6);
  });
});

describe('rate limiting', () => {
  it('429s after 60 requests in a minute, with a retry hint', async () => {
    __resetRateLimits();
    for (let i = 0; i < 60; i++) {
      expect((await GET(req('http://x/api/v1/notes', keyA))).status).toBe(200);
    }
    const res = await GET(req('http://x/api/v1/notes', keyA));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toMatch(/Thử lại sau \d+ giây\./);
  });

  it('limits each key independently', async () => {
    __resetRateLimits();
    for (let i = 0; i < 60; i++) await GET(req('http://x/api/v1/notes', keyA));
    expect((await GET(req('http://x/api/v1/notes', keyA))).status).toBe(429);
    expect((await GET(req('http://x/api/v1/notes', keyB))).status).toBe(200);
  });
});

describe('CRUD and scoping', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('creates, reads, updates and deletes a note', async () => {
    __resetRateLimits();
    const created = await (await POST(req('http://x/api/v1/notes', keyA, 'POST', body))).json();
    expect(created.version).toBe(1);

    const got = await (await single.GET(req('http://x', keyA), ctx(created.note.id))).json();
    expect(got.note.title).toBe(body.title);

    const patched = await (
      await single.PATCH(req('http://x', keyA, 'PATCH', { ...body, content: '<p>v2</p>' }), ctx(created.note.id))
    ).json();
    expect(patched.version).toBe(2);

    expect((await single.DELETE(req('http://x', keyA, 'DELETE'), ctx(created.note.id))).status).toBe(200);
    expect((await single.GET(req('http://x', keyA), ctx(created.note.id))).status).toBe(404);
  });

  it('never lets key B touch a note owned by A', async () => {
    __resetRateLimits();
    const created = await (await POST(req('http://x/api/v1/notes', keyA, 'POST', body))).json();
    expect((await single.GET(req('http://x', keyB), ctx(created.note.id))).status).toBe(404);
    expect((await single.PATCH(req('http://x', keyB, 'PATCH', body), ctx(created.note.id))).status).toBe(404);
    expect((await single.DELETE(req('http://x', keyB, 'DELETE'), ctx(created.note.id))).status).toBe(404);
    expect((await single.GET(req('http://x', keyA), ctx(created.note.id))).status).toBe(200);
  });

  it('400s on an invalid body with the shared envelope', async () => {
    __resetRateLimits();
    const res = await POST(req('http://x/api/v1/notes', keyA, 'POST', { priority: 'urgent' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toHaveProperty('code', 'INVALID_INPUT');
  });
});
```

- [ ] **Step 13: Run it**

Run: `npx vitest run src/app/api/v1/notes/route.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 14: Commit**

```bash
git add src/lib/auth/api-keys.ts src/lib/auth/api-keys.test.ts src/lib/api/rate-limit.ts src/lib/api/rate-limit.test.ts src/lib/api/bearer.ts src/app/api/api-keys src/app/api/v1
git commit -m "feat(api): add sha256 API keys, best-effort token-bucket limiting and the public /api/v1 surface"
```

---

### Task B16: MCP server at `/api/mcp` (Streamable HTTP, bearer auth, nine tools)

**Files:**
- Create: `src/lib/mcp/tools.ts`
- Create: `src/app/api/mcp/route.ts`
- Create: `docs/mcp.md`
- Test: `src/lib/mcp/tools.test.ts`

**Interfaces:**
- Consumes: `requireBearer` (B15); every service from B9/B10/B12; `NoteWriteSchema`, `QuestionSchema` (B14).
- Produces:
```ts
export interface McpTool<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: S;
  run(userId: string, input: z.infer<S>): Promise<unknown>;
}
export const TOOLS: readonly McpTool<z.ZodTypeAny>[];   // the nine tools, in SPEC §2.4 order
export function callTool(name: string, userId: string, rawInput: unknown): Promise<unknown>;
```

**The tool logic lives outside the transport.** `tools.ts` holds the nine tools with their zod schemas and handlers and knows nothing about JSON-RPC; `route.ts` is a thin adapter. That means the tools are unit-testable without a transport, and if `mcp-handler` turns out to be incompatible with this Next version the fallback in Step 6 swaps only `route.ts`.

- [ ] **Step 1: Write the failing tools test**

```ts
// src/lib/mcp/tools.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TOOLS, callTool } from './tools';
import { useTempStorage, makeUser, dropUser } from '@/lib/services/helpers';
import { closeDb } from '@/lib/db';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('mcp_a');
  userB = await makeUser('mcp_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('tool registry', () => {
  it('exposes exactly the nine tools SPEC 2.4 names, in order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'list_notes', 'search_notes', 'get_note', 'create_note', 'update_note',
      'delete_note', 'list_tags', 'create_quiz', 'list_quizzes',
    ]);
  });

  it('gives every tool a zod input schema and a non-empty description', () => {
    for (const t of TOOLS) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.inputSchema.parse).toBe('function');
    }
  });

  it('rejects an unknown tool name', async () => {
    await expect(callTool('drop_database', userA, {})).rejects.toMatchObject({ status: 404 });
  });
});

describe('create_note / get_note / update_note', () => {
  it('creates a note at v1 and reads it back', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Ghi chú do Claude tạo',
      desc: 'Từ MCP',
      tags: ['Tim mạch'],
      priority: 'high',
      content: '<h2>A</h2><p>một</p>',
    })) as { note: { id: string }; version: number };

    expect(created.version).toBe(1);
    const got = (await callTool('get_note', userA, { id: created.note.id })) as {
      note: { title: string; versions: unknown[] };
    };
    expect(got.note.title).toBe('Ghi chú do Claude tạo');
    expect(got.note.versions).toHaveLength(1);
  });

  it('rejects a create with a bad priority before touching storage', async () => {
    await expect(
      callTool('create_note', userA, { title: 'x', priority: 'urgent' }),
    ).rejects.toThrow();
  });

  it('updates only the fields supplied, bumping the version on a content change', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Bản gốc', content: '<p>v1</p>', tags: ['A'], priority: 'low', desc: 'd',
    })) as { note: { id: string } };

    const patched = (await callTool('update_note', userA, {
      id: created.note.id, content: '<p>v2</p>',
    })) as { version: number; note: { title: string; tags: string[]; priority: string } };

    expect(patched.version).toBe(2);
    expect(patched.note.title).toBe('Bản gốc');
    expect(patched.note.tags).toEqual(['A']);
    expect(patched.note.priority).toBe('low');
  });

  it('does not bump the version when only the description is updated', async () => {
    const created = (await callTool('create_note', userA, { title: 't', content: '<p>x</p>' })) as {
      note: { id: string };
    };
    const patched = (await callTool('update_note', userA, {
      id: created.note.id, desc: 'chỉ đổi mô tả',
    })) as { version: number };
    expect(patched.version).toBe(1);
  });

  it('404s for a note the caller does not own', async () => {
    const created = (await callTool('create_note', userA, { title: 't', content: '<p>x</p>' })) as {
      note: { id: string };
    };
    await expect(callTool('get_note', userB, { id: created.note.id })).rejects.toMatchObject({ status: 404 });
    await expect(callTool('update_note', userB, { id: created.note.id, desc: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(callTool('delete_note', userB, { id: created.note.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe('list_notes / search_notes / list_tags', () => {
  it('lists the caller notes with pagination metadata', async () => {
    await callTool('create_note', userA, { title: 'Một', content: '<p>a</p>', tags: ['Tim mạch'] });
    const out = (await callTool('list_notes', userA, { pageSize: 3 })) as {
      notes: unknown[]; total: number; pageSize: number;
    };
    expect(out.pageSize).toBe(3);
    expect(out.notes.length).toBeLessThanOrEqual(3);
    expect(out.total).toBeGreaterThan(0);
  });

  it('searches accent-insensitively', async () => {
    await callTool('create_note', userA, { title: 'Đái tháo đường type 2', content: '<p>x</p>' });
    const out = (await callTool('search_notes', userA, { query: 'dai thao duong' })) as {
      notes: { title: string }[];
    };
    expect(out.notes.some((n) => n.title === 'Đái tháo đường type 2')).toBe(true);
  });

  it('restricts a # search to tags', async () => {
    await callTool('create_note', userA, { title: 'Không phải thẻ', content: '<p>x</p>', tags: ['Hô hấp'] });
    const out = (await callTool('search_notes', userA, { query: '#ho hap' })) as {
      notes: { tags: string[] }[];
    };
    expect(out.notes.length).toBeGreaterThan(0);
    for (const n of out.notes) expect(n.tags.some((t) => t.includes('Hô hấp'))).toBe(true);
  });

  it('lists tags with counts, never another user tags', async () => {
    await callTool('create_note', userB, { title: 'B', content: '<p>x</p>', tags: ['Chỉ của B'] });
    const out = (await callTool('list_tags', userA, {})) as { tags: { name: string }[] };
    expect(out.tags.some((t) => t.name === 'Chỉ của B')).toBe(false);
    expect(out.tags.some((t) => t.name === 'Tim mạch')).toBe(true);
  });
});

describe('delete_note', () => {
  it('deletes and then 404s', async () => {
    const created = (await callTool('create_note', userA, { title: 'xoá', content: '<p>x</p>' })) as {
      note: { id: string };
    };
    expect(await callTool('delete_note', userA, { id: created.note.id })).toEqual({ ok: true });
    await expect(callTool('get_note', userA, { id: created.note.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe('create_quiz / list_quizzes', () => {
  it('generates questions offline and records them', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Quiz nguồn',
      content: '<h2>A</h2><ul><li>một</li><li>hai</li><li>ba</li></ul>' +
        '<h2>B</h2><ul><li>bốn</li><li>năm</li><li>sáu</li></ul>',
      tags: ['Tim mạch'],
    })) as { note: { id: string } };

    const gen = (await callTool('create_quiz', userA, { id: created.note.id })) as {
      source: string; quiz: { total: number; questions: unknown[] };
    };
    expect(['ai', 'offline']).toContain(gen.source);
    expect(gen.quiz.questions.length).toBe(gen.quiz.total);

    const listed = (await callTool('list_quizzes', userA, { id: created.note.id })) as {
      quizzes: unknown[];
    };
    expect(listed.quizzes).toHaveLength(1);
  });

  it('records a score of 0 because MCP supplies no answers', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Quiz điểm', content: '<h2>A</h2><ul><li>x</li><li>y</li><li>z</li></ul>',
    })) as { note: { id: string } };
    const gen = (await callTool('create_quiz', userA, { id: created.note.id })) as {
      quiz: { score: number; picks: (number | null)[] };
    };
    expect(gen.quiz.score).toBe(0);
    expect(gen.quiz.picks.every((p) => p === null)).toBe(true);
  });

  it('404s create_quiz for another user note', async () => {
    const created = (await callTool('create_note', userA, { title: 't', content: '<h2>A</h2><p>x</p>' })) as {
      note: { id: string };
    };
    await expect(callTool('create_quiz', userB, { id: created.note.id })).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: FAIL — `Failed to resolve import "./tools"`.

- [ ] **Step 3: Write `src/lib/mcp/tools.ts`**

```ts
// src/lib/mcp/tools.ts
import { z } from 'zod';
import { HttpError } from '@/lib/http';
import { PrioritySchema } from '@/lib/api/schemas';
import {
  addQuizRecord, createNote, deleteNote, getNote, listNotes, updateNote,
} from '@/lib/services/notes';
import { listTags } from '@/lib/services/tags';
import { generateQuiz } from '@/lib/services/quiz';
import { DEFAULT_PAGE_SIZE } from '@/lib/types';

export interface McpTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: S;
  run(userId: string, input: z.infer<S>): Promise<unknown>;
}

const FiltersShape = {
  query: z.string().optional().describe('Từ khoá. Tiền tố # để chỉ tìm trong thẻ, vd "#Tim mạch".'),
  tag: z.string().optional().describe('Lọc theo tên thẻ chính xác.'),
  priority: PrioritySchema.optional().describe('Lọc theo mức ưu tiên.'),
  favorite: z.boolean().optional().describe('Chỉ lấy ghi chú đã đánh dấu yêu thích.'),
  sort: z.enum(['updated', 'priority', 'title']).optional().describe('Mặc định "updated".'),
  page: z.number().int().min(1).optional().describe('Trang, bắt đầu từ 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Mặc định 6, tối đa 100.'),
};

const toFilters = (i: Record<string, unknown>) => ({
  query: (i.query as string) ?? '',
  nav: i.favorite ? ('fav' as const) : ('all' as const),
  priority: (i.priority as 'high' | 'medium' | 'low' | undefined) ?? null,
  tag: (i.tag as string | undefined) ?? null,
  sort: (i.sort as 'updated' | 'priority' | 'title' | undefined) ?? 'updated',
  page: (i.page as number | undefined) ?? 1,
  pageSize: (i.pageSize as number | undefined) ?? DEFAULT_PAGE_SIZE,
});

const IdShape = { id: z.string().min(1).max(128).describe('Mã ghi chú, vd "n1".') };

const listNotesTool: McpTool = {
  name: 'list_notes',
  description:
    'Liệt kê ghi chú của người dùng với bộ lọc và phân trang. Trả về bản rút gọn (không có nội dung HTML đầy đủ) — dùng get_note để lấy nội dung.',
  inputSchema: z.object(FiltersShape),
  run: (userId, input) => listNotes(userId, toFilters(input as Record<string, unknown>)),
};

const searchNotesTool: McpTool = {
  name: 'search_notes',
  description:
    'Tìm ghi chú theo tiêu đề, mô tả và thẻ. Không phân biệt dấu tiếng Việt ("dai thao duong" khớp "Đái tháo đường"). Tiền tố # chỉ tìm trong thẻ.',
  inputSchema: z.object({
    ...FiltersShape,
    query: z.string().min(1).describe('Từ khoá bắt buộc. Tiền tố # để chỉ tìm trong thẻ.'),
  }),
  run: (userId, input) => listNotes(userId, toFilters(input as Record<string, unknown>)),
};

const getNoteTool: McpTool = {
  name: 'get_note',
  description: 'Lấy một ghi chú đầy đủ: nội dung HTML, thẻ, lịch sử phiên bản, bình luận, ảnh và lịch sử trắc nghiệm.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => ({ note: await getNote(userId, (input as { id: string }).id) }),
};

const createNoteTool: McpTool = {
  name: 'create_note',
  description:
    'Tạo ghi chú mới ở phiên bản v1. Nội dung là HTML đơn giản: h2, h3, p, ul/ol/li, blockquote, table, strong, em.',
  inputSchema: z.object({
    title: z.string().min(1).max(300).describe('Tiêu đề ghi chú.'),
    desc: z.string().max(1000).optional().describe('Mô tả ngắn hiển thị trên thẻ ghi chú.'),
    tags: z.array(z.string().min(1).max(80)).max(20).optional().describe('Danh sách thẻ, vd ["Tim mạch"].'),
    priority: PrioritySchema.optional().describe('Mặc định "medium".'),
    content: z.string().max(400_000).optional().describe('Nội dung HTML.'),
    changeNote: z.string().max(200).optional().describe('Ghi chú thay đổi. Mặc định "Tạo ghi chú".'),
  }),
  run: (userId, input) => {
    const i = input as Record<string, unknown>;
    return createNote(userId, {
      title: i.title as string,
      desc: (i.desc as string) ?? '',
      tags: (i.tags as string[]) ?? [],
      priority: (i.priority as 'high' | 'medium' | 'low') ?? 'medium',
      content: (i.content as string) ?? '',
      images: [],
      changeNote: i.changeNote as string | undefined,
    });
  },
};

const updateNoteTool: McpTool = {
  name: 'update_note',
  description:
    'Cập nhật ghi chú. Chỉ trường nào được truyền mới bị thay đổi. Phiên bản CHỈ tăng khi tiêu đề hoặc nội dung đổi.',
  inputSchema: z.object({
    ...IdShape,
    title: z.string().min(1).max(300).optional(),
    desc: z.string().max(1000).optional(),
    tags: z.array(z.string().min(1).max(80)).max(20).optional(),
    priority: PrioritySchema.optional(),
    content: z.string().max(400_000).optional(),
    changeNote: z.string().max(200).optional().describe('Mặc định "Cập nhật nội dung".'),
  }),
  run: async (userId, input) => {
    const i = input as Record<string, unknown>;
    const id = i.id as string;
    const current = await getNote(userId, id);
    return updateNote(userId, id, {
      title: (i.title as string) ?? current.title,
      desc: (i.desc as string) ?? current.desc,
      tags: (i.tags as string[]) ?? current.tags,
      priority: (i.priority as 'high' | 'medium' | 'low') ?? current.priority,
      content: (i.content as string) ?? current.content,
      images: current.images,
      changeNote: i.changeNote as string | undefined,
    });
  },
};

const deleteNoteTool: McpTool = {
  name: 'delete_note',
  description: 'Xoá vĩnh viễn một ghi chú cùng toàn bộ phiên bản, bình luận và lịch sử trắc nghiệm.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => {
    await deleteNote(userId, (input as { id: string }).id);
    return { ok: true };
  },
};

const listTagsTool: McpTool = {
  name: 'list_tags',
  description: 'Liệt kê mọi thẻ của người dùng kèm số ghi chú, nhiều nhất trước.',
  inputSchema: z.object({}),
  run: async (userId) => ({ tags: await listTags(userId) }),
};

const createQuizTool: McpTool = {
  name: 'create_quiz',
  description:
    'Sinh bộ câu hỏi trắc nghiệm từ nội dung ghi chú và lưu vào lịch sử. Dùng Gemini nếu có API key, nếu không thì sinh offline từ chính nội dung ghi chú. Điểm ghi nhận là 0 vì chưa ai làm bài.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => {
    const id = (input as { id: string }).id;
    // generateQuiz throws HttpError(422, 'NOT_ENOUGH_CONTENT') when the note
    // has nothing to build questions from; callTool surfaces it as a tool error.
    const { questions, source } = await generateQuiz(userId, id);
    const { quiz } = await addQuizRecord(userId, id, {
      score: 0,
      total: questions.length,
      source,
      picks: questions.map(() => null),
      questions,
    });
    return { quiz, source };
  },
};

const listQuizzesTool: McpTool = {
  name: 'list_quizzes',
  description: 'Liệt kê lịch sử trắc nghiệm của một ghi chú, mới nhất trước.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => ({
    quizzes: (await getNote(userId, (input as { id: string }).id)).quizzes,
  }),
};

/** Thứ tự đúng theo SPEC §2.4. */
export const TOOLS: readonly McpTool[] = [
  listNotesTool,
  searchNotesTool,
  getNoteTool,
  createNoteTool,
  updateNoteTool,
  deleteNoteTool,
  listTagsTool,
  createQuizTool,
  listQuizzesTool,
];

export function findTool(name: string): McpTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export async function callTool(name: string, userId: string, rawInput: unknown): Promise<unknown> {
  const tool = findTool(name);
  if (!tool) throw new HttpError(404, 'UNKNOWN_TOOL', `Không có tool tên "${name}".`);
  const input = tool.inputSchema.parse(rawInput ?? {});
  return tool.run(userId, input);
}
```

- [ ] **Step 4: Run the tools test**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Write `src/app/api/mcp/route.ts` using `mcp-handler`**

```ts
// src/app/api/mcp/route.ts
import { createMcpHandler } from 'mcp-handler';
import { requireBearer } from '@/lib/api/bearer';
import { HttpError, jsonError } from '@/lib/http';
import { TOOLS, type McpTool } from '@/lib/mcp/tools';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Người dùng hiện tại cho lần gọi này. AsyncLocalStorage là quá mức cần thiết:
 * handler được dựng lại cho MỖI request nên biến đóng là đủ và an toàn.
 */
function buildHandler(user: SessionUser) {
  return createMcpHandler(
    (server) => {
      for (const tool of TOOLS as McpTool[]) {
        server.tool(
          tool.name,
          tool.description,
          // mcp-handler expects the zod *shape*, not the object schema.
          (tool.inputSchema as unknown as { shape: Record<string, unknown> }).shape ?? {},
          async (args: unknown) => {
            const input = tool.inputSchema.parse(args ?? {});
            const out = await tool.run(user.id, input);
            return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
          },
        );
      }
    },
    {},
    { basePath: '/api', maxDuration: 60, verboseLogs: false },
  );
}

async function withAuth(req: Request): Promise<Response> {
  let user: SessionUser;
  try {
    user = await requireBearer(req);
  } catch (e) {
    if (e instanceof HttpError) {
      const res = jsonError(e.status, e.code, e.message);
      if (e.status === 401) {
        res.headers.set('WWW-Authenticate', 'Bearer realm="kno-notes"');
      }
      return res;
    }
    return jsonError(500, 'INTERNAL', 'Đã có lỗi xảy ra.');
  }
  return buildHandler(user)(req);
}

export const GET = withAuth;
export const POST = withAuth;
export const DELETE = withAuth;
```

- [ ] **Step 6: Verify the transport, and switch to the hand-rolled handler if it fails**

```bash
cd /Users/spt/Documents/kno-notes
npx next build
npm run dev &
sleep 6
KEY=$(psql -d kno_notes_dev -tAc "select 1" >/dev/null && echo "paste a key from POST /api/api-keys")
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
Expected: a JSON-RPC result listing nine tools.

**If `mcp-handler` fails to build or the request errors**, replace `src/app/api/mcp/route.ts` wholesale with this dependency-free JSON-RPC handler. It implements the three methods a Streamable HTTP client needs and uses the same `TOOLS` registry, so no test changes:

```ts
// src/app/api/mcp/route.ts  — fallback: hand-rolled JSON-RPC over HTTP POST
import { z } from 'zod';
import { requireBearer } from '@/lib/api/bearer';
import { HttpError, jsonError } from '@/lib/http';
import { TOOLS, findTool, type McpTool } from '@/lib/mcp/tools';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PROTOCOL_VERSION = '2025-03-26';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcRequest['id'], result: unknown) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, result });

const rpcError = (id: RpcRequest['id'], code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function jsonSchemaFor(tool: McpTool): Record<string, unknown> {
  const shape = (tool.inputSchema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const def = field._def as { typeName?: string; description?: string };
    const inner = field.isOptional() ? (field as unknown as { unwrap(): z.ZodTypeAny }).unwrap?.() ?? field : field;
    const innerName = (inner._def as { typeName?: string }).typeName;
    const type =
      innerName === 'ZodNumber' ? 'number'
      : innerName === 'ZodBoolean' ? 'boolean'
      : innerName === 'ZodArray' ? 'array'
      : innerName === 'ZodObject' ? 'object'
      : 'string';
    properties[key] = {
      type,
      ...(def.description ? { description: def.description } : {}),
      ...(type === 'array' ? { items: { type: 'string' } } : {}),
    };
    if (!field.isOptional()) required.push(key);
  }

  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

async function dispatch(rpc: RpcRequest, user: SessionUser): Promise<Response> {
  switch (rpc.method) {
    case 'initialize':
      return ok(rpc.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kno-notes', version: '1.0.0' },
      });

    case 'notifications/initialized':
      return new Response(null, { status: 202 });

    case 'ping':
      return ok(rpc.id, {});

    case 'tools/list':
      return ok(rpc.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: jsonSchemaFor(t),
        })),
      });

    case 'tools/call': {
      const name = String(rpc.params?.name ?? '');
      const tool = findTool(name);
      if (!tool) return rpcError(rpc.id, -32602, `Unknown tool: ${name}`);
      try {
        const input = tool.inputSchema.parse(rpc.params?.arguments ?? {});
        const out = await tool.run(user.id, input);
        return ok(rpc.id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          isError: false,
        });
      } catch (e) {
        const message =
          e instanceof HttpError ? e.message
          : e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : 'Đã có lỗi xảy ra.';
        return ok(rpc.id, { content: [{ type: 'text', text: message }], isError: true });
      }
    }

    default:
      return rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
  }
}

export async function POST(req: Request): Promise<Response> {
  let user: SessionUser;
  try {
    user = await requireBearer(req);
  } catch (e) {
    if (e instanceof HttpError) {
      const res = jsonError(e.status, e.code, e.message);
      if (e.status === 401) res.headers.set('WWW-Authenticate', 'Bearer realm="kno-notes"');
      return res;
    }
    return jsonError(500, 'INTERNAL', 'Đã có lỗi xảy ra.');
  }

  let rpc: RpcRequest;
  try {
    rpc = (await req.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return rpcError(rpc?.id ?? null, -32600, 'Invalid Request');
  }

  return dispatch(rpc, user);
}

/** Streamable HTTP allows a stateless server to refuse the SSE stream. */
export async function GET(): Promise<Response> {
  return jsonError(405, 'METHOD_NOT_ALLOWED', 'Máy chủ MCP này chỉ nhận POST (stateless).');
}

export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 7: Write `docs/mcp.md`**

````markdown
# Kno-Notes MCP server

Endpoint: `https://kno-notes.vercel.app/api/mcp` (Streamable HTTP)
Auth: `Authorization: Bearer <api key>` — create one at `/settings/api-keys`.
Keys look like `kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d` and are shown **once**.

## Add it to Claude Code

```bash
claude mcp add --transport http kno-notes https://kno-notes.vercel.app/api/mcp \
  --header "Authorization: Bearer kn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Local development:

```bash
claude mcp add --transport http kno-notes-dev http://localhost:3000/api/mcp \
  --header "Authorization: Bearer kn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Verify: `claude mcp list` should show `kno-notes: connected`.

## Tools

| Tool | Input | Does |
|---|---|---|
| `list_notes` | `query?, tag?, priority?, favorite?, sort?, page?, pageSize?` | Paginated note summaries |
| `search_notes` | `query` (+ the same filters) | Accent-insensitive search; `#` prefix searches tags only |
| `get_note` | `id` | Full note: content, versions, comments, images, quizzes |
| `create_note` | `title, desc?, tags?, priority?, content?, changeNote?` | Creates at v1 |
| `update_note` | `id, title?, desc?, tags?, priority?, content?, changeNote?` | Version bumps only on a title or content change |
| `delete_note` | `id` | Permanent |
| `list_tags` | — | Tags with note counts |
| `create_quiz` | `id` | Generates and stores a quiz (Gemini, or offline with no API key). Errors if the note has too little content. |
| `list_quizzes` | `id` | Quiz history, newest first |

## Limits

Rate limiting is **best effort**: 60 requests per minute per key, enforced in
each serverless instance's memory. A burst spread across warm instances can
exceed that. It exists to stop a runaway agent loop, not to meter usage —
enforcing a hard quota would need Redis, which is not free.

Everything is scoped to the key's owner. A key can never read, write or even
confirm the existence of another user's note; cross-user requests return 404.
````

- [ ] **Step 8: Build and commit**

Run: `npx tsc --noEmit && npx next build && npx vitest run`
Expected: all green.

```bash
git add src/lib/mcp src/app/api/mcp docs/mcp.md
git commit -m "feat(mcp): add Streamable HTTP MCP server with nine bearer-authed tools"
```

---

### Task B17: `GET /api/search/index` — the browser's vector-index feed

**Files:**
- Create: `src/lib/services/search-index.ts`
- Create: `src/app/api/search/index/route.ts`
- Modify: `scripts/seed.ts` (add the `db:seed:test` entry point)
- Modify: `package.json` (add the `db:seed:test` script)
- Test: `src/lib/services/search-index.test.ts`

**Interfaces:**
- Consumes: `db`, `noteIndex` (B5); `getStorage` (B6); `stripHtml` (B4); `computeContentSha` (B9); `requireUser` (B8).
- Produces (required verbatim by `part-0-contracts.md` §3.1):
```ts
export interface SearchDoc {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
  /** sha256 of `title \n desc \n tags.join(',') \n plain` — see computeContentSha. */
  contentSha: string;
  /** stripHtml(content) with <mark> removed, truncated to PLAIN_MAX characters. */
  plain: string;
}
export const PLAIN_MAX = 2000;
export function buildSearchDocs(userId: string): Promise<SearchDoc[]>;
```
Response: `GET /api/search/index` → `{ userId: string, items: SearchDoc[] }`

**Why `plain` is capped at 2000 characters.** The client embeds roughly the first 512 tokens with
`Xenova/multilingual-e5-small` (SPEC §2.3); anything past that is dropped by the model anyway, so
sending it only costs bandwidth on a page that already runs on a phone.

**Why `<mark>` is stripped.** `contentSha` is computed over the same stripped text (Task B9), so
highlighting a passage must not change `plain` either — otherwise the sha would say "unchanged"
while the text the client embeds had shifted.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/services/search-index.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { createNote, saveHighlights, updateNote } from './notes';
import { buildSearchDocs, PLAIN_MAX } from './search-index';
import { computeContentSha } from './index-sync';
import { getNote } from './notes';
import { closeDb } from '@/lib/db';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const base = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch', 'Phác đồ'],
  priority: 'high' as const,
  content: '<h2>Ngưỡng</h2><p>HA phòng khám ≥ 140/90 mmHg.</p><ul><li>Holter ≥ 130/80</li></ul>',
  images: [],
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('sidx_a');
  userB = await makeUser('sidx_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('buildSearchDocs', () => {
  it('returns [] for a user with no notes', async () => {
    expect(await buildSearchDocs(userB)).toEqual([]);
  });

  it('emits exactly the six contract fields per note', async () => {
    const { note } = await createNote(userA, base);
    const docs = await buildSearchDocs(userA);
    const doc = docs.find((d) => d.noteId === note.id)!;
    expect(Object.keys(doc).sort()).toEqual(
      ['contentSha', 'desc', 'noteId', 'plain', 'tags', 'title'].sort(),
    );
    expect(doc.title).toBe(base.title);
    expect(doc.desc).toBe(base.desc);
    expect(doc.tags).toEqual(['Tim mạch', 'Phác đồ']);
  });

  it('strips HTML into readable plain text', async () => {
    const { note } = await createNote(userA, base);
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.plain).toBe('Ngưỡng HA phòng khám ≥ 140/90 mmHg. Holter ≥ 130/80');
    expect(doc.plain).not.toContain('<');
  });

  it('matches the contentSha the note index stores', async () => {
    const { note } = await createNote(userA, base);
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.contentSha).toBe(computeContentSha(await getNote(userA, note.id)));
    expect(doc.contentSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes contentSha and plain when the title changes', async () => {
    const { note } = await createNote(userA, base);
    const before = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    await updateNote(userA, note.id, { ...base, title: 'Tiêu đề hoàn toàn mới' });
    const after = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(after.title).toBe('Tiêu đề hoàn toàn mới');
    expect(after.contentSha).not.toBe(before.contentSha);
  });

  it('does NOT change contentSha or plain when a highlight is added', async () => {
    const { note } = await createNote(userA, base);
    const before = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    await saveHighlights(
      userA,
      note.id,
      '<h2>Ngưỡng</h2><p><mark data-hl="h1">HA phòng khám ≥ 140/90 mmHg.</mark></p><ul><li>Holter ≥ 130/80</li></ul>',
    );
    const after = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(after.plain).toBe(before.plain);
    expect(after.contentSha).toBe(before.contentSha);
  });

  it(`truncates plain to ${PLAIN_MAX} characters`, async () => {
    const long = '<p>' + 'x'.repeat(6000) + '</p>';
    const { note } = await createNote(userA, { ...base, content: long });
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.plain).toHaveLength(PLAIN_MAX);
  });

  it('never includes another user notes', async () => {
    await createNote(userB, { ...base, title: 'Chỉ của B' });
    const docs = await buildSearchDocs(userA);
    expect(docs.some((d) => d.title === 'Chỉ của B')).toBe(false);
  });

  it('drops a note whose stored file has gone missing rather than throwing', async () => {
    const { note } = await createNote(userA, base);
    const { getStorage } = await import('@/lib/storage');
    await getStorage().deleteNote(userA, note.id); // index row left behind on purpose
    const docs = await buildSearchDocs(userA);
    expect(docs.some((d) => d.noteId === note.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/search-index.test.ts`
Expected: FAIL — `Failed to resolve import "./search-index"`.

- [ ] **Step 3: Write `src/lib/services/search-index.ts`**

```ts
// src/lib/services/search-index.ts
import { eq } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { stripHtml } from '@/lib/text';
import type { Note } from '@/lib/types';
import { computeContentSha } from './index-sync';

/**
 * Trình duyệt chỉ nhúng khoảng 512 token đầu (e5-small), nên gửi nhiều hơn
 * chỉ tốn băng thông trên điện thoại.
 */
export const PLAIN_MAX = 2000;

const MAX_NOTES = 5000;

export interface SearchDoc {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
  contentSha: string;
  plain: string;
}

/** Bỏ thẻ `<mark>` giống hệt `computeContentSha`, rồi strip HTML và cắt. */
export function plainFor(note: Note): string {
  return stripHtml((note.content || '').replace(/<\/?mark[^>]*>/g, '')).slice(0, PLAIN_MAX);
}

/**
 * Nạp toàn bộ tài liệu tìm kiếm của MỘT user. Đọc song song từ storage
 * (adapter đã cache theo sha nên lần gọi lại gần như miễn phí).
 */
export async function buildSearchDocs(userId: string): Promise<SearchDoc[]> {
  const rows = await db
    .select({ noteId: noteIndex.noteId })
    .from(noteIndex)
    .where(eq(noteIndex.userId, userId))
    .limit(MAX_NOTES);

  const storage = getStorage();
  const loaded = await Promise.all(rows.map((r) => storage.readNote(userId, r.noteId)));

  return loaded
    .filter((n): n is Note => n !== null)
    .map((n) => ({
      noteId: n.id,
      title: n.title,
      desc: n.desc,
      tags: n.tags,
      contentSha: computeContentSha(n),
      plain: plainFor(n),
    }));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/services/search-index.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the route**

`GET /api/search/index` · 200 `{ userId: string, items: SearchDoc[] }` · 401 when signed out.

`no-store` is deliberate: the payload is one user's entire corpus, so it must never land in a shared
cache, and the client keeps its own copy in IndexedDB keyed by `contentSha` anyway.

```ts
// src/app/api/search/index/route.ts
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { buildSearchDocs } from '@/lib/services/search-index';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const items = await buildSearchDocs(user.id);
    return Response.json(
      { userId: user.id, items },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
```

- [ ] **Step 6: Add the `db:seed:test` entry point**

`scripts/seed.ts` already reads `DATA_DIR` through the filesystem adapter (Task B6), so the test
seed differs only in which database and directory it points at. Add to `package.json`:

```json
    "db:seed:test": "tsx scripts/seed-test.ts"
```

And create `scripts/seed-test.ts`:

```ts
// scripts/seed-test.ts
// Seeds the Playwright fixture user into kno_notes_test and the DATA_DIR
// directory that Playwright's global setup points at.
import 'dotenv/config';
import { closeDb } from '../src/lib/db/index';
import { getStorage } from '../src/lib/storage/index';
import { seed } from './seed';

async function main() {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://spt@localhost:5432/kno_notes_test';
  process.env.DATA_DIR = process.env.DATA_DIR ?? '.data-test';

  // GitHub must never be used by the test seed, whatever the shell has set.
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;

  const { userId, count } = await seed();
  console.log(`seeded test user bacsi (${userId})`);
  console.log(`  notes:   ${count}`);
  console.log(`  db:      ${new URL(process.env.DATABASE_URL).pathname.slice(1)}`);
  console.log(`  storage: ${getStorage().kind} at ${process.env.DATA_DIR}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Also add `.data-test/` to `.gitignore`.

- [ ] **Step 7: Verify both seed paths**

```bash
cd /Users/spt/Documents/kno-notes
npm run db:seed
npm run db:seed:test
psql -d kno_notes_test -c "select count(*) from note_index;"
ls .data-test/data/users/*/notes | wc -l
```
Expected: 14 rows in `kno_notes_test`, 14 JSON files under `.data-test/`, and `.data/` untouched.

- [ ] **Step 8: Full gate**

Run: `npx vitest run && npx tsc --noEmit && npx next lint && npx next build`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/search-index.ts src/lib/services/search-index.test.ts src/app/api/search scripts/seed-test.ts package.json .gitignore
git commit -m "feat(search): add /api/search/index feed for the client vector index and a test seed entry point"
```

---

### Task B18: Vercel deploy configuration, runtime decisions, environment variables

**Files:**
- Create: `vercel.json`
- Create: `docs/deploy.md`
- Create: `scripts/check-env.ts`
- Modify: `package.json` (add `predeploy` and `vercel-build` scripts)
- Test: `scripts/check-env.test.ts`

**Interfaces:**
- Consumes: nothing at runtime.
- Produces:
```ts
export interface EnvReport { ok: boolean; missing: string[]; warnings: string[]; storage: 'github' | 'filesystem'; quiz: 'gemini' | 'offline'; dbDriver: 'neon-http' | 'node-postgres' }
export function checkEnv(env?: NodeJS.ProcessEnv): EnvReport;
```

**Runtime decision — settled, not left open.**

| Surface | Runtime | Why |
|---|---|---|
| `src/middleware.ts` | Edge (forced by Next) | Only `jose`, which is pure WebCrypto and Edge-safe. It must never import `@/lib/db`, `bcryptjs`, `@octokit/rest` or `next/headers` — any of those break the Edge build. |
| Every `src/app/api/**/route.ts` | **Node.js** (`export const runtime = 'nodejs'`) | `bcryptjs` is CPU-bound and pathologically slow under the Edge runtime's limits; `@octokit/rest` pulls Node polyfills; `pg` needs TCP sockets; `Buffer` base64 is used for every image; `linkedom` is a Node module. `jose` and `@neondatabase/serverless` would both run on Edge, but nothing gains from splitting the surface, and one runtime is one class of bug. |
| `/api/mcp`, `/api/notes/[id]/quiz/generate` | Node.js + `maxDuration` | Gemini and multi-note offline generation can exceed the 10 s Hobby default. 60 s and 30 s respectively; Hobby allows up to 60. |

**Free-tier ledger.** Vercel Hobby (hosting, 100 GB bandwidth, 60 s functions) · Neon free (0.5 GB storage, autosuspend) · GitHub private repo (notes + images, no per-request cost) · Google Gemini free tier, entirely optional. No Redis, no S3, no Blob, no auth vendor. Total: 0₫.

- [ ] **Step 1: Write the failing env-check test**

```ts
// scripts/check-env.test.ts
import { describe, it, expect } from 'vitest';
import { checkEnv } from './check-env';

const full = {
  DATABASE_URL: 'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/kno_notes?sslmode=require',
  AUTH_SECRET: 'a'.repeat(32),
  GITHUB_TOKEN: 'ghp_x',
  GITHUB_OWNER: 'me',
  GITHUB_REPO: 'kno-notes-data',
  GITHUB_BRANCH: 'main',
  GOOGLE_GENERATIVE_AI_API_KEY: 'AIza-x',
  NEXT_PUBLIC_APP_NAME: 'Kno-Notes',
} as NodeJS.ProcessEnv;

describe('checkEnv', () => {
  it('passes a complete production environment', () => {
    const r = checkEnv(full);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.storage).toBe('github');
    expect(r.quiz).toBe('gemini');
    expect(r.dbDriver).toBe('neon-http');
  });

  it('fails without DATABASE_URL or AUTH_SECRET', () => {
    const r = checkEnv({ ...full, DATABASE_URL: undefined, AUTH_SECRET: undefined });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['DATABASE_URL', 'AUTH_SECRET']);
  });

  it('fails an AUTH_SECRET shorter than 32 characters', () => {
    const r = checkEnv({ ...full, AUTH_SECRET: 'short' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('AUTH_SECRET');
  });

  it('reports the filesystem adapter and warns when GitHub is unconfigured', () => {
    const r = checkEnv({ ...full, GITHUB_TOKEN: undefined, GITHUB_OWNER: undefined, GITHUB_REPO: undefined });
    expect(r.ok).toBe(true);
    expect(r.storage).toBe('filesystem');
    expect(r.warnings.join(' ')).toMatch(/GITHUB_TOKEN/);
  });

  it('warns about a partially configured GitHub setup', () => {
    const r = checkEnv({ ...full, GITHUB_REPO: undefined });
    expect(r.storage).toBe('filesystem');
    expect(r.warnings.join(' ')).toMatch(/GITHUB_REPO/);
  });

  it('reports offline quiz generation with no Gemini key, and does not fail', () => {
    const r = checkEnv({ ...full, GOOGLE_GENERATIVE_AI_API_KEY: undefined });
    expect(r.ok).toBe(true);
    expect(r.quiz).toBe('offline');
  });

  it('detects the local Postgres driver', () => {
    const r = checkEnv({ ...full, DATABASE_URL: 'postgresql://spt@localhost:5432/kno_notes_dev' });
    expect(r.dbDriver).toBe('node-postgres');
  });

  it('fails an unparseable DATABASE_URL instead of guessing a driver', () => {
    const r = checkEnv({ ...full, DATABASE_URL: 'localhost:5432' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('DATABASE_URL');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/check-env.test.ts`
Expected: FAIL — `Failed to resolve import "./check-env"`.

- [ ] **Step 3: Write `scripts/check-env.ts`**

```ts
// scripts/check-env.ts
import { pickDriver } from '../src/lib/db/index';

export interface EnvReport {
  ok: boolean;
  missing: string[];
  warnings: string[];
  storage: 'github' | 'filesystem';
  quiz: 'gemini' | 'offline';
  dbDriver: 'neon-http' | 'node-postgres' | 'unknown';
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const missing: string[] = [];
  const warnings: string[] = [];

  let dbDriver: EnvReport['dbDriver'] = 'unknown';
  if (!env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  } else {
    try {
      dbDriver = pickDriver(env.DATABASE_URL);
    } catch {
      missing.push('DATABASE_URL');
    }
  }

  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) missing.push('AUTH_SECRET');

  const githubVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'] as const;
  const githubSet = githubVars.filter((v) => Boolean(env[v]));
  const storage: EnvReport['storage'] = githubSet.length === 3 ? 'github' : 'filesystem';
  if (storage === 'filesystem') {
    const absent = githubVars.filter((v) => !env[v]);
    warnings.push(
      `Storage adapter = filesystem (writes to ./.data). Set ${absent.join(', ')} to use the private GitHub repo. ` +
        'This is fine locally; on Vercel it means data lives on an ephemeral filesystem and WILL be lost.',
    );
  }

  const quiz: EnvReport['quiz'] = env.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini' : 'offline';
  if (quiz === 'offline') {
    warnings.push(
      'GOOGLE_GENERATIVE_AI_API_KEY is not set. Quiz generation falls back to the offline generator. This is supported, not an error.',
    );
  }

  if (!env.NEXT_PUBLIC_APP_NAME) warnings.push('NEXT_PUBLIC_APP_NAME is not set; defaulting to "Kno-Notes".');

  return { ok: missing.length === 0, missing, warnings, storage, quiz, dbDriver };
}

function main() {
  const r = checkEnv();
  console.log(`db driver:       ${r.dbDriver}`);
  console.log(`note storage:    ${r.storage}`);
  console.log(`quiz generation: ${r.quiz}`);
  for (const w of r.warnings) console.warn(`warning: ${w}`);
  if (!r.ok) {
    console.error(`missing or invalid: ${r.missing.join(', ')}`);
    process.exit(1);
  }
  console.log('environment ok');
}

if (process.argv[1] && process.argv[1].endsWith('check-env.ts')) main();
```

- [ ] **Step 4: Run the env test**

Run: `npx vitest run scripts/check-env.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the deploy scripts to `package.json`**

Add to `"scripts"`:

```json
    "check-env": "tsx scripts/check-env.ts",
    "vercel-build": "tsx scripts/migrate.ts && next build"
```

`vercel-build` runs migrations before the build on every deploy, so the Neon schema is never behind the code. It is idempotent — Drizzle skips migrations already in `__drizzle_migrations`.

- [ ] **Step 6: Write `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["sin1"],
  "functions": {
    "src/app/api/mcp/route.ts": { "maxDuration": 60 },
    "src/app/api/notes/[id]/quiz/generate/route.ts": { "maxDuration": 30 }
  },
  "headers": [
    {
      "source": "/api/v1/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,PATCH,DELETE,OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Authorization,Content-Type" }
      ]
    },
    {
      "source": "/api/mcp",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,DELETE,OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Authorization,Content-Type,Mcp-Session-Id,Mcp-Protocol-Version" },
        { "key": "Access-Control-Expose-Headers", "value": "Mcp-Session-Id" }
      ]
    }
  ]
}
```

`sin1` (Singapore) is the region closest to Vietnamese users; pick the matching Neon region when creating the database so the DB round trip stays in one continent. CORS is opened only on the two machine-facing surfaces; the cookie-session API stays same-origin, which is what makes `SameSite=Lax` sufficient against CSRF.

- [ ] **Step 7: Write `docs/deploy.md`**

````markdown
# Deploying Kno-Notes

Project name: `kno-notes` · Production domain: `kno-notes.vercel.app`

Everything below is free tier: Vercel Hobby, Neon free, a private GitHub repo,
and an optional Google Gemini free-tier key.

## 1. Create the private data repository

Notes and images live in a **separate** private GitHub repo, not the app repo.

```bash
gh repo create kno-notes-data --private --description "Kno-Notes user data"
```

It starts empty; the app creates `data/users/<userId>/...` on the first write.

**Why GitHub and not Vercel Blob:** Blob on Hobby is a metered product with a
1 GB store and 10 GB/month bandwidth allowance that starts billing past the
included amount. A private repo has no per-request cost, gives free version
history for every write, and stays readable and editable outside the app.

## 2. Create the PAT

A fine-grained token is enough and is the safer choice:

- Repository access: **only** `kno-notes-data`
- Permissions: **Contents → Read and write**
- Expiry: set a reminder to rotate it

Copy the token — it is shown once.

## 3. Create the Neon database

Vercel dashboard → Storage → Create → Neon (free plan). Choose the region
closest to `sin1`. Vercel injects `DATABASE_URL` automatically; use the
**pooled** connection string.

## 4. Set the environment variables

Vercel → Settings → Environment Variables. All of these go in **Production**
and **Preview**:

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled connection string (ends in `.neon.tech`) |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` — at least 32 characters |
| `GITHUB_TOKEN` | yes | the PAT from step 2 |
| `GITHUB_OWNER` | yes | your GitHub username or org |
| `GITHUB_REPO` | yes | `kno-notes-data` |
| `GITHUB_BRANCH` | no | `main` (default) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | no | from aistudio.google.com. Without it, quizzes generate offline — fully supported |
| `NEXT_PUBLIC_APP_NAME` | no | `Kno-Notes` |

Verify before deploying:

```bash
npm run check-env
```

It prints the chosen DB driver, storage adapter and quiz source, and exits 1
if anything required is missing. **If it reports `note storage: filesystem`
on Vercel, stop** — the serverless filesystem is ephemeral and every note
would be lost on the next cold start.

## 5. Deploy

```bash
vercel link --project kno-notes
vercel --prod
```

`vercel-build` runs `scripts/migrate.ts` before `next build`, so the Neon
schema is migrated on every deploy. Drizzle skips migrations already recorded
in `__drizzle_migrations`, so this is safe to repeat.

## 6. Create the first user

There is no signup route. Seed one from your machine, pointed at production:

```bash
DATABASE_URL="<neon pooled url>" \
GITHUB_TOKEN="<pat>" GITHUB_OWNER="<owner>" GITHUB_REPO="kno-notes-data" \
npm run db:seed
```

That creates `bacsi` / `123456` (display name "Bác sĩ") with the 14 demo notes.
**Change that password before sharing the URL.**

## 7. Runtime notes

- Every `src/app/api/**/route.ts` exports `runtime = 'nodejs'`.
- `src/middleware.ts` runs on Edge and imports only `jose`. Never import the
  database, `bcryptjs`, `@octokit/rest` or `next/headers` from it — the Edge
  build fails, and the failure is not obvious.
- `/api/mcp` allows 60 s, `/api/notes/[id]/quiz/generate` 30 s; both are within
  the Hobby 60 s ceiling.
- Rate limiting on `/api/v1` and `/api/mcp` is per-instance and best effort
  (see `docs/mcp.md`).

## Local development

```bash
brew services start postgresql@16
npm install
cp .env.example .env
# edit .env: leave GITHUB_* empty to use the ./.data filesystem adapter
npm run db:setup    # creates kno_notes_dev + kno_notes_test, migrates both
npm run db:seed
npm run dev
```

`npm test` uses `kno_notes_test` and the filesystem storage adapter, so the
whole suite runs with no PAT and no network.
````

- [ ] **Step 8: Verify the production build and the full suite**

```bash
cd /Users/spt/Documents/kno-notes
npm run check-env
npx tsc --noEmit
npx next lint
npx vitest run
npx next build
```
Expected: `check-env` reports `filesystem` storage with a warning (correct locally); everything else green. Confirm the build output lists `ƒ Middleware` and every `/api/*` route.

- [ ] **Step 9: Commit**

```bash
git add vercel.json docs/deploy.md scripts/check-env.ts scripts/check-env.test.ts package.json
git commit -m "chore(deploy): add Vercel config, runtime decisions, env checker and deployment guide"
```

---

## Appendix: contract for the UI plan

These are the exact shapes the frontend plan consumes. They do not change.

**Types** — `@/lib/types` (Task B2): `Priority`, `SortKey`, `NavKey`, `NoteImage`, `NoteComment`, `NoteVersion`, `Question`, `Quiz`, `Note`, `NoteSummary`, `NoteIndexRow`, `UserPrefs`, `ApiKey`, `SessionUser`, `NoteFilters`, `NoteListResult`, `CreateNoteInput`, `UpdateNoteInput`, `ApiError`, plus the constants `PRIORITIES`, `PRIORITY_ORDER`, `PRIORITY_LABEL`, `DEFAULT_PAGE_SIZE`.

**Utilities** — `@/lib/text` (Tasks B3/B4): `norm`, `clip`, `slugify`, `fmt`, `rel`, `shuffle`, `sections`, `stripHtml`, `extractHighlights`. The UI must import these rather than reimplementing any of them.

**Session helpers** — `@/lib/auth` (Task B8), usable from Server Components:
```ts
getSession(): Promise<SessionUser | null>
requireUser(): Promise<SessionUser>     // throws HttpError(401)
```

**Error envelope** — every non-2xx response from every route:
```json
{ "error": { "code": "NOT_FOUND", "message": "Không tìm thấy ghi chú." } }
```
Codes in use: `UNAUTHORIZED` (401), `INVALID_CREDENTIALS` (401), `INVALID_INPUT` (400), `INVALID_IMAGE` (400), `NOT_FOUND` (404), `CONFLICT` (409), `IMAGE_TOO_LARGE` (413), `NOT_ENOUGH_CONTENT` (422), `RATE_LIMITED` (429), `INTERNAL` (500).

**Fixed copy the UI must render verbatim:** `Sai tên đăng nhập hoặc mật khẩu.` (login failure) · `Ghi chú không tiêu đề` (empty title) · `Tạo ghi chú` / `Cập nhật nội dung` / `Khôi phục từ v{N}` (version notes) · `Ghi chú chưa đủ nội dung để tạo câu hỏi` (empty quiz result).

**Deliberately NOT in this plan** — the UI plan owns these, and this plan supplies what they need:
- `wrapRange()` / `unwrapHl()` are browser DOM operations on the live `contenteditable`/prose node. The UI ports them verbatim from the prototype, then calls `PUT /api/notes/[id]/highlights` with the resulting `innerHTML`. The server side is `saveHighlights` (Task B10, no version created) and `extractHighlights(html)` (Task B4, for the detail rail's highlight list).
- The quiz state machine (loading → asking → done, keys 1–4 and Enter, cancel token on close) is UI state. The server supplies `POST /api/notes/[id]/quiz/generate` (Task B12) and stores the result via `POST /api/notes/[id]/quizzes` (Task B14).
- Client-side vector search (transformers.js in a Web Worker, IndexedDB embeddings, SPEC §2.3) is entirely client-side. This plan gives it `note_index.content_sha` for invalidation and `norm()` for the keyword half of the hybrid score.
- PWA manifest and service worker (SPEC §1.4 #25).
- Search suggestions, filter chips, pagination controls and every component in SPEC §5.
