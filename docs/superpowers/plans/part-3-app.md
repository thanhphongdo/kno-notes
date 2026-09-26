# Kno-Notes — Part 3: App Pages, Client State, Search & Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every Next.js route, all client-side state (URL filters, theme/prefs/toast), the browser-local hybrid (keyword + vector) search, the PWA layer, and the complete Vitest + Playwright test strategy for Kno-Notes, composing the shared components from Part 1 and the APIs from Part 2.

**Architecture:** App Router with two route groups — `(auth)` for `/login` and `(app)` for everything behind the session cookie. Server Components fetch through Part 2's `noteService` directly (no self-fetch); interactivity lives in thin client containers under `src/components/features/**` that render Part 1's shared components and own no markup of their own. Dashboard filter state lives *only* in the query string (`?q&tag&priority&fav&sort&page&view`); detail version state lives in `?v`. Theme, font-size, view and sidebar state are mirrored into a readable `kn_prefs` cookie so the server renders the correct `data-theme` / `--fs` / `data-sidebar` on `<html>` — zero FOUC, zero hydration mismatch — and are written back to Postgres through a debounced `PATCH /api/prefs`. Semantic search runs 100% in the browser: a Web Worker loads `Xenova/multilingual-e5-small` through `@huggingface/transformers`, caches vectors in IndexedDB keyed `${userId}:${noteId}` against the note's `contentSha`, and the UI ranks with `0.6 * keyword + 0.4 * cosine`, degrading to keyword-only until the model is ready.

**Tech Stack:** Next.js 15 (App Router, RSC) · TypeScript strict · Tailwind CSS v4 · React 19 · `@huggingface/transformers` (transformers.js) in a Web Worker · IndexedDB + Cache API · hand-written service worker · Vitest + jsdom (unit) · Playwright (e2e + visual capture).

**Spec:** `docs/SPEC.md` (source of truth) · `docs/reference/So Lam Sang.dc.html` (exact markup + behaviour) · `docs/reference/Design Spec.dc.html` §03, §07, §08, §09.

**Sibling plans (do NOT implement their files):**
- **P1 — `docs/superpowers/plans/part-1-design-system.md`** owns `src/app/globals.css`, `src/components/ui/**`, `src/components/shared/**`.
- **P2 — `docs/superpowers/plans/part-2-backend.md`** owns `src/lib/db/**`, `src/lib/github/**`, `src/lib/auth/**`, `src/lib/notes/**`, `src/lib/text/**`, `src/lib/quiz/**`, `src/app/api/**`.

---

## Global Constraints

Copied verbatim from `docs/SPEC.md`; every task below inherits these.

- **Brand:** app name is **`Kno-Notes`** everywhere (`process.env.NEXT_PUBLIC_APP_NAME`); logo glyph is **`K`**, never `S`. Login description: `Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục.`
- **Language:** the entire UI is **Vietnamese**. Microcopy comes verbatim from Design Spec §09 — never paraphrase, never translate, never add an exclamation mark. Section labels are UPPERCASE with `letter-spacing:.08em`.
- **Multi-user:** no public signup. Session is a JWT in an httpOnly cookie. Sidebar avatar shows the first 2 characters of `displayName`, never a hardcoded `BS`.
- **Shared component rule (SPEC §5 — absolute):** before writing any JSX, look in `src/components/ui/` and `src/components/shared/`. If a visual element exists there, import it; if it is missing, it belongs to P1 — request it, do not re-implement it. **`src/components/features/**` may contain only data wiring, hooks, and state; no duplicated presentational markup, no hard-coded colour/size literals where a token or variant exists.** Variants go through `cva`, never new components.
- **Custom select only:** `<select>` is banned everywhere. Use P1's `Select` / `Segmented`.
- **One breakpoint: 820px.** `< 820px` is mobile. Responsiveness is CSS-first (`max-[819px]:` / `min-[820px]:` Tailwind variants) so SSR never flashes. JavaScript width is used **only** for (a) sidebar drawer-vs-collapse semantics and (b) clamping the highlight popup to the viewport.
- **Exact numbers:** every height, padding, radius, gap, font-size and colour token ported from the prototype must be preserved to the pixel. When in doubt, re-read the `<x-dc>` template.
- **Behaviour parity (SPEC §3):** `norm()`, `rel()`, `fmt()`, sort order, filter rules, pagination (pageSize 6, filter change → page 1, page change → scroll top), version rules, highlight wrap/unwrap semantics, quiz state machine, score verdicts, suggestion panel contents, Esc handling, 2200 ms toast, tag-input keys.
- **Zero cost:** no paid service, no server-side embedding, no extra hosted infrastructure. Everything must run on Vercel Hobby + Neon free + GitHub free.
- **TypeScript strict.** `npm run build`, `tsc --noEmit` and `eslint` must be clean at every commit.
- **Commits:** conventional commits, one per task, local repo only.

### Environment facts (confirmed by the coordinator — the plan is built on these)

- **Postgres:** a real local Postgres 16 (Homebrew) listens on `localhost:5432`; `psql` is on `PATH`. The e2e database is a real database named `kno_notes_test`, reached with `DATABASE_URL=postgresql://spt@localhost:5432/kno_notes_test`. **No Docker, no PGlite.** Global setup drops/creates/migrates/seeds it before every Playwright run.
- **No GitHub PAT, no data repo.** P2's storage layer is an adapter interface whose **filesystem implementation** (`.data/users/<userId>/...`) activates whenever `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` are unset. All dev and e2e flows run against the filesystem adapter; global setup wipes `.data/` and reseeds so every run starts from a known state. **No test may require live GitHub.**
- **No `GOOGLE_GENERATIVE_AI_API_KEY`.** Quiz e2e must pass against the **offline fallback generator**, so its assertions are structural (≤5 questions, 4 options each, exactly one correct, feedback appears, result screen, history row created) and never depend on AI wording. One extra test stubs `POST /api/notes/:id/quiz/generate` with `page.route()` to prove the AI path renders identically.
- **The embedding model must never download in CI/e2e.** `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1` makes `useSemanticSearch()` return a permanently-not-ready embedder and never spawn the worker; Playwright always runs with it set, keyword-only and fast. Hybrid ranking is proven instead by a dedicated Vitest test driving `hybridRank()` with a fake embedder.

## Review Focus

Five failure modes the spec implies but no obvious task exercises. Each has a test pinned to the task that owns the code.

1. **Deep-linked dashboard URL with garbage params** — `/?page=999&sort=bogus&priority=purple&view=table`. A reasonable person expects the page to render the first page of the default sort, not crash or show an empty grid. → pinned to **Task A6** (`parseNoteFilters` clamps and falls back).
2. **Typing in the search box while the embedding worker is still downloading the model** — keystrokes must never block, and results must appear keyword-only, then silently improve. → pinned to **Task A15** (ranking with `embedder: null`).
3. **Highlighting a selection that spans two block elements and partially overlaps an existing `<mark>`** — must not nest marks, must not lose text, and must not create a version. → pinned to **Task A10** (`wrapRange` skips text nodes already inside a `mark`).
4. **Closing the quiz modal while the question set is still being generated** — the late response must be discarded, not rendered over a closed modal or saved as an attempt. → pinned to **Task A13** (cancellation token test).
5. **The service worker serving a cached authenticated page to a logged-out visitor** — navigations and `/api/*` responses must never be persisted. → pinned to **Task A16** (sw cache-allowlist unit test + e2e check that `/` is not in `caches`).

---

## Contract with P1 (design system) — components this plan CONSUMES

Every entry below is **provided by P1**. If a component is missing at execution time, stop and request it — do not inline the markup.

```ts
// src/components/ui/ — primitives
Icon:          { name: IconName; size?: number; className?: string }
// IconName ⊇ 'search' 'close' 'clock' 'check' 'chevron-left' 'chevron-right' 'chevron-down'
//            'grid' 'list' 'star' 'trash' 'quiz' 'edit' 'image' 'comment' 'menu'
//            'sidebar' 'logout' 'sun' 'moon' 'plus' 'highlight' 'copy' 'key' 'download'
Button:        { variant: 'primary'|'ink'|'secondary'|'ghost'|'danger'|'link'; size?: 'sm'|'md'|'lg'; loading?: boolean } & ButtonHTMLAttributes
IconButton:    { label: string; size?: 24|28|30|32|34|36|40; tone?: 'default'|'danger'|'onDark' } & ButtonHTMLAttributes
Input:         { invalid?: boolean } & InputHTMLAttributes
Textarea:      TextareaHTMLAttributes
Label:         { htmlFor?: string } & HTMLAttributes<HTMLLabelElement>
Chip:          { onRemove?: () => void; tone?: 'neutral'|'accent'|'dashed' } & HTMLAttributes
Pill:          { tone: 'high'|'medium'|'low'|'neutral'; dot?: boolean } & HTMLAttributes
Kbd:           { children: ReactNode }
Skeleton:      { className?: string; pulse?: boolean }
Separator:     { className?: string }
Spinner:       { size?: number }
Avatar:        { initials: string; size?: 30|32 }
Popover:       { open: boolean; onOpenChange: (o: boolean) => void; anchor: ReactNode; align?: 'start'|'end'; width?: number; children: ReactNode }
Select:        <T extends string>{ value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; triggerPrefix?: string }
Segmented:     <T extends string>{ value: T; onChange: (v: T) => void; options: { value: T; label: string; dotColor?: string }[]; columns: number; ariaLabel: string }
Toggle:        { pressed: boolean; onPressedChange: (p: boolean) => void; label: string } & ButtonHTMLAttributes
ToastViewport: { message: string | null }               // presentational only; state is owned by this plan
Slider:        { min: number; max: number; step: number; value: number; onChange: (v: number) => void; ariaLabel: string }
ScrollArea:    { className?: string; children: ReactNode }
Tooltip:       { label: string; children: ReactElement }
```

```ts
// src/components/shared/ — composites
AppShell:            { sidebar: ReactNode; header: ReactNode; children: ReactNode }
Sidebar:             { brand: ReactNode; nav: ReactNode; sections: ReactNode; footer: ReactNode; mode: 'sticky'|'drawer'; open: boolean; onClose: () => void }
SidebarNavItem:      { label: string; count: number; active: boolean; dotColor?: string; prefix?: string; href: string; onClick?: () => void }
SidebarSection:      { label: string; children: ReactNode; scroll?: boolean }
AppHeader:           { onOpenSidebar?: () => void; showMenuButton: boolean; search: ReactNode; settings: ReactNode; newNoteHref: string }
SearchBox:           { value: string; onChange: (v: string) => void; onFocus: () => void; onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void; onClear: () => void; open: boolean; showKbdHint: boolean; inputRef: RefObject<HTMLInputElement|null>; children?: ReactNode /* suggestion panel */ }
SearchSuggestions:   { recent: { label: string; onClick: () => void }[]; onClearRecent: () => void; tagsTitle: string; tags: { name: string; count: number; onClick: () => void }[]; notesTitle: string; notes: { id: string; title: string; sub: string; priority: Priority; onClick: () => void }[]; query: string; onSubmit: () => void; empty: boolean }
SettingsPopover:     { open: boolean; onOpenChange: (o: boolean) => void; theme: 'light'|'dark'; onThemeChange: (t: 'light'|'dark') => void; fontSize: number; onFontSizeChange: (n: number) => void; onLogout: () => void }
NoteCard:            { note: NoteSummaryVM; href: string; onToggleFavorite: (e: MouseEvent) => void }
NoteListRow:         { note: NoteSummaryVM; href: string; first: boolean; onToggleFavorite: (e: MouseEvent) => void }
NoteGrid:            { children: ReactNode }     // the auto-fill minmax(min(100%,300px),1fr) gap-16 grid
NoteList:            { children: ReactNode }     // the surface/line/r14 container
PriorityPill:        { priority: Priority }      // renders "Ưu tiên cao|trung bình|thấp"
PrioritySegmented:   { value: Priority; onChange: (p: Priority) => void }
TagChip:             { name: string; onClick?: () => void; onRemove?: () => void; tone?: 'neutral'|'accent' }
TagInput:            { tags: string[]; value: string; onValueChange: (v: string) => void; onAdd: (t: string) => void; onRemoveLast: () => void; onRemove: (t: string) => void }
TagSuggestions:      { items: { name: string; onAdd: () => void }[] }
FilterChips:         { chips: { key: string; label: string; onRemove: () => void }[]; onClearAll: () => void }
SortSelect:          { value: SortKey; onChange: (v: SortKey) => void }
ViewToggle:          { value: ViewKey; onChange: (v: ViewKey) => void }
Pagination:          { page: number; pages: number; rangeText: string; onPageChange: (p: number) => void }
EmptyState:          { title: string; description: ReactNode; actionLabel?: string; onAction?: () => void }
Prose:               { html: string; editable?: false; proseRef?: Ref<HTMLDivElement>; onClick?: MouseEventHandler; onMouseUp?: MouseEventHandler; onTouchEnd?: TouchEventHandler }
RichTextEditor:      { initialHtml: string; editorRef: RefObject<HTMLDivElement|null>; onSelectionChange: () => void; placeholder: string }
EditorToolbar:       { groups: ToolGroup[]; onPickImage: (e: ReactMouseEvent) => void }   // ToolGroup = { tools: ToolButton[] }
                     // ToolButton = { label: string; title: string; onMouseDown: (e: ReactMouseEvent) => void; style?: 'bold'|'italic'|'underline'|'strike'|'serif'|'plain' }
ImageDropzone:       { dragOver: boolean; onPick: () => void; onDragOver: DragEventHandler; onDragLeave: DragEventHandler; onDrop: DragEventHandler }
ImageGrid:           { columns: 3 | 'auto-fill-160'; children: ReactNode }
ImageThumb:          { src: string | null; label: string; ratio: '1'|'4/3'; onOpen?: () => void; onRemove?: () => void }
Lightbox:            { items: { src: string; label: string }[]; index: number; onIndexChange: (i: number) => void; onClose: () => void }
CommentList:         { comments: { id: string; author: string; initials: string; text: string; date: string; onRemove?: () => void }[]; count: number }
CommentComposer:     { value: string; onChange: (v: string) => void; onSubmit: () => void; onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> }
VersionTimeline:     { items: { v: number; note: string; date: string; current: boolean; selected: boolean; onClick: () => void }[] }
VersionBanner:       { label: string; date: string; onBackToCurrent: () => void; onRestore: () => void }
DeleteConfirmBanner: { onCancel: () => void; onConfirm: () => void }
QuizModal:           { children: ReactNode; heading: string; noteTitle: string; counter: string; progress: number; onClose: () => void }
QuizOption:          { optionKey: 'A'|'B'|'C'|'D'; text: string; state: 'idle'|'ok'|'bad'|'dim'; onPick: () => void; disabled: boolean }
QuizFeedback:        { correct: boolean; answerKey: 'A'|'B'|'C'|'D'; explain: string }
QuizResult:          { score: number; total: number; pct: number; verdict: string; caption: string; dateLabel: string; onRetry: () => void; onClose: () => void; review: QuizReviewItem[] }
QuizHistoryList:     { items: { id: string; score: string; pct: number; date: string; onOpen: () => void }[]; onStart: () => void }
HighlightPopup:      { x: number; y: number; mode: 'add'|'remove'; onAction: () => void }
HighlightList:       { items: { id: string; text: string; onRemove: () => void }[] }
InfoGrid:            { rows: { label: string; value: string }[] }
SectionLabel:        { children: ReactNode }
Rail:                { mode: 'sticky'|'static'; children: ReactNode }
```

`NoteSummaryVM` (built by this plan, consumed by P1):

```ts
export interface NoteSummaryVM {
  id: string; title: string; desc: string; priority: Priority;
  tags: string[];                // already sliced to 3 by the caller
  updatedLabel: string;          // rel(updatedAt)
  versionLabel: string;          // "v3"
  imageCount: number; commentCount: number; favorite: boolean;
}
```

## Contract with P2 (backend) — endpoints & modules this plan CONSUMES

Server Components import P2 modules directly; Client Components use `fetch` against these routes. All responses are JSON unless noted. All non-2xx bodies are `{ error: string; message?: string }`.

```ts
// Server-side modules (imported by Server Components — no self-fetch)
import { getSession } from '@/lib/auth/session';
//   getSession(): Promise<{ userId: string; username: string; displayName: string } | null>
import { noteService } from '@/lib/notes/service';
//   listNotes(userId, f: { q?: string; tag?: string|null; priority?: Priority|null; favorite?: boolean; sort: SortKey; page: number; pageSize: number })
//     : Promise<{ items: NoteSummary[]; total: number; page: number; pages: number }>
//   getNote(userId, noteId): Promise<Note | null>
//   listTags(userId): Promise<{ name: string; slug: string; count: number }[]>
//   counts(userId): Promise<{ all: number; favorite: number; high: number; medium: number; low: number }>
import { getPrefs } from '@/lib/prefs/service';
//   getPrefs(userId): Promise<UserPrefs>
import { norm } from '@/lib/text/vi';          // s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d')
import { rel, fmt } from '@/lib/text/date';
import type { Note, NoteSummary, Priority, UserPrefs, QuizAttempt, QuizQuestion, NoteVersion, NoteComment, NoteImage } from '@/lib/types';
```

| Method & path | Request | Response |
|---|---|---|
| `POST /api/auth/login` | `{ username: string; password: string }` | `200 { user: { id, username, displayName } }` · `401 { error: 'INVALID_CREDENTIALS' }` |
| `POST /api/auth/logout` | — | `204` |
| `GET /api/auth/me` | — | `200 { user }` · `401` |
| `GET /api/notes?q&tag&priority&fav&sort&page&pageSize` | — | `200 { items: NoteSummary[]; total; page; pages }` |
| `GET /api/notes/:id` | — | `200 Note` · `404` |
| `POST /api/notes` | `{ title; desc; tags: string[]; priority; content: string; images: NoteImage[]; changeNote: string }` | `201 { id: string; version: 1 }` |
| `PATCH /api/notes/:id` | same body as POST | `200 { id; version: number; updatedAt: string; changed: boolean }` |
| `DELETE /api/notes/:id` | — | `204` |
| `POST /api/notes/:id/restore` | `{ v: number }` | `200 { version: number }` |
| `POST /api/notes/:id/favorite` | `{ favorite: boolean }` | `200 { favorite: boolean }` |
| `POST /api/notes/:id/comments` | `{ text: string }` | `201 NoteComment` |
| `DELETE /api/notes/:id/comments/:commentId` | — | `204` |
| `PUT /api/notes/:id/highlights` | `{ content: string }` | `200 { ok: true; contentSha: string }` — **writes `content` and the last version's `content`, creates NO new version** |
| `POST /api/notes/:id/quiz/generate` | `{ avoid?: string[] }` | `200 { questions: QuizQuestion[]; source: 'ai' \| 'offline' }` · `422 { error: 'NOT_ENOUGH_CONTENT' }` |
| `POST /api/notes/:id/quizzes` | `{ questions; picks: number[]; score; total; source }` | `201 QuizAttempt` |
| `POST /api/images` | `multipart/form-data` field `files` (1..n, `image/*`) | `201 { images: { id: string; label: string; url: string }[] }` |
| `GET /api/images/:userId/:imageId` | — | image bytes, `Cache-Control: public, max-age=31536000, immutable` |
| `GET /api/tags` | — | `200 { items: { name; slug; count }[] }` |
| `GET /api/prefs` | — | `200 UserPrefs` |
| `PATCH /api/prefs` | `Partial<UserPrefs>` | `200 UserPrefs` |
| `GET /api/search/index` | — | `200 { userId: string; items: SearchDoc[] }` |
| `GET /api/api-keys` | — | `200 { items: { id; name; prefix; createdAt; lastUsedAt \| null }[] }` |
| `POST /api/api-keys` | `{ name: string }` | `201 { id; name; prefix; token: string }` — `token` returned **once only** |
| `DELETE /api/api-keys/:id` | — | `204` |

```ts
// Shapes this plan depends on
export interface UserPrefs { theme: 'light'|'dark'; fontSize: number; view: 'grid'|'list'; sidebarCollapsed: boolean; recentSearches: string[] }
export interface SearchDoc { noteId: string; title: string; desc: string; tags: string[]; contentSha: string; plain: string /* first ~512 tokens of plaintext */ }
export interface QuizQuestion { q: string; options: string[]; answer: number; explain: string }
export interface QuizAttempt { id: string; date: string; score: number; total: number; questions: QuizQuestion[]; picks: number[]; source: 'ai'|'offline' }
```

**Scripts P2 provides that this plan calls:**
- `npm run db:migrate` — applies Drizzle migrations against `DATABASE_URL`.
- `npm run db:seed:test` — wipes and seeds the test user (`bacsi` / `123456`, displayName `Bác sĩ`) plus 14 notes mirroring the prototype `SEED0()`, including one note with a pre-existing `<mark data-hl="hseed1">` and one saved quiz attempt. Honours `DATA_DIR` for the filesystem storage adapter.

---

## File Structure (owned by this plan)

```
src/app/layout.tsx                              root <html>, fonts, theme cookie → data-theme/--fs, providers
src/app/globals.css                             ← P1 OWNS (do not edit)
src/app/not-found.tsx                           global 404
src/app/offline/page.tsx                        service-worker offline fallback (static, no session)
src/app/(auth)/layout.tsx                       centred, no shell
src/app/(auth)/login/page.tsx                   server component; redirects to / when already signed in
src/app/(app)/layout.tsx                        session guard + AppShell + sidebar/header data
src/app/(app)/loading.tsx  error.tsx  not-found.tsx
src/app/(app)/page.tsx                          dashboard (server)
src/app/(app)/notes/new/page.tsx                editor, create mode
src/app/(app)/notes/[id]/page.tsx               detail (server)
src/app/(app)/notes/[id]/loading.tsx
src/app/(app)/notes/[id]/edit/page.tsx          editor, edit mode
src/app/(app)/settings/api-keys/page.tsx

src/components/providers/theme-provider.tsx     data-theme + --fs on <html>, cookie mirror
src/components/providers/prefs-provider.tsx     optimistic local prefs + debounced PATCH /api/prefs
src/components/providers/toast-provider.tsx     useToast(), 2200 ms auto-dismiss
src/components/providers/app-providers.tsx      composes the three + <ToastViewport/>

src/components/features/shell/shell-client.tsx  sidebar open/collapse, header, search mount, keyboard
src/components/features/dashboard/dashboard-client.tsx
src/components/features/dashboard/dashboard-toolbar.tsx
src/components/features/note-detail/detail-client.tsx
src/components/features/note-detail/detail-rail.tsx
src/components/features/note-detail/comments-section.tsx
src/components/features/note-detail/use-highlights.ts
src/components/features/editor/editor-client.tsx
src/components/features/editor/editor-panel.tsx
src/components/features/editor/use-editor-commands.ts
src/components/features/quiz/quiz-controller.tsx
src/components/features/quiz/quiz-reducer.ts
src/components/features/search/search-container.tsx
src/components/features/pwa/register-sw.tsx
src/components/features/pwa/install-prompt.tsx
src/components/features/api-keys/api-keys-client.tsx

src/hooks/use-note-filters.ts                   URL ⇄ filter state
src/hooks/use-media-query.ts                    SSR-safe, useSyncExternalStore
src/hooks/use-semantic-search.ts                worker lifecycle + query embedding
src/hooks/use-keyboard-shortcuts.ts             Design Spec §08 table
src/hooks/use-debounced-callback.ts

src/lib/highlight/range.ts                      wrapRange / unwrapHl / collectHighlights
src/lib/search/ranking.ts                       keywordScore / cosineSimilarity / hybridRank
src/lib/search/worker-protocol.ts               message types + model constants
src/lib/search/vector-store.ts                  IndexedDB cache
src/lib/prefs/cookie.ts                         kn_prefs read/write (shared server+client)
src/lib/nav/paths.ts                            typed route builders

src/workers/embedder.worker.ts                  transformers.js pipeline

public/manifest.webmanifest  public/sw.js  public/icons/*.png
scripts/generate-icons.mjs  scripts/visual-check.mjs
playwright.config.ts  vitest.config.ts
e2e/global-setup.ts  e2e/fixtures/*.ts  e2e/*.spec.ts
```

---

### Task A1: Project bootstrap, tooling and the shared-component rule

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `.env.example`, `vitest.config.ts`, `src/lib/nav/paths.ts`, `CLAUDE.md`
- Create: `src/app/layout.tsx` (placeholder replaced in Task A4), `src/app/page.tsx` (temporary, deleted in Task A7)
- Test: `src/lib/nav/paths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the repo itself; `npm run dev|build|start|lint|typecheck|test|test:e2e`; `buildDashboardHref`, `notePath`, `noteEditPath`, `newNotePath`, `apiKeysPath`, `loginPath`.

> **Coordination:** this task is the single shared bootstrap for P1, P2 and P3. Whichever plan executes first runs it; the others verify `package.json` exists and skip to their own tasks. Do not run `npm install` as part of planning — only during execution.

- [ ] **Step 1: Scaffold Next.js**

```bash
npx --yes create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm --yes
```

- [ ] **Step 2: Harden `tsconfig.json`**

Set these compiler options (merge, keep the generated `paths`):

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": false,
    "lib": ["dom", "dom.iterable", "esnext", "webworker"]
  },
  "exclude": ["node_modules", "e2e", "playwright.config.ts", "scripts"]
}
```

- [ ] **Step 3: Add the dependencies this plan needs**

```bash
npm i @huggingface/transformers
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test
npx playwright install chromium webkit
```

- [ ] **Step 4: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "icons": "node scripts/generate-icons.mjs",
    "visual": "node scripts/visual-check.mjs"
  }
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
```

And `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create `.env.example`**

```bash
DATABASE_URL=postgresql://spt@localhost:5432/kno_notes
AUTH_SECRET=change-me-openssl-rand-base64-32
# Storage: leave GITHUB_* empty to use the local filesystem adapter (.data/)
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_BRANCH=main
DATA_DIR=.data
# Optional; absent ⇒ quiz uses the offline fallback generator
GOOGLE_GENERATIVE_AI_API_KEY=
NEXT_PUBLIC_APP_NAME=Kno-Notes
# Set to 1 in CI/e2e so the embedding model is never downloaded
NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=
```

Append to `.gitignore`: `.data/`, `test-results/`, `playwright-report/`, `e2e/.auth/`, `.env.local`.

- [ ] **Step 7: Write the failing test for route builders**

`src/lib/nav/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDashboardHref, notePath, noteEditPath, newNotePath, apiKeysPath, loginPath } from './paths';

describe('paths', () => {
  it('builds plain routes', () => {
    expect(loginPath()).toBe('/login');
    expect(newNotePath()).toBe('/notes/new');
    expect(notePath('n1')).toBe('/notes/n1');
    expect(noteEditPath('n1')).toBe('/notes/n1/edit');
    expect(apiKeysPath()).toBe('/settings/api-keys');
  });

  it('omits default filter values from the dashboard href', () => {
    expect(buildDashboardHref({})).toBe('/');
    expect(buildDashboardHref({ sort: 'updated', page: 1, view: 'grid' })).toBe('/');
  });

  it('serialises only the non-default filters, in a stable order', () => {
    expect(buildDashboardHref({ q: 'sốc', tag: 'Cấp cứu', priority: 'high', fav: true, sort: 'title', page: 3, view: 'list' }))
      .toBe('/?q=s%E1%BB%91c&tag=C%E1%BA%A5p+c%E1%BB%A9u&priority=high&fav=1&sort=title&page=3&view=list');
  });

  it('escapes note ids', () => {
    expect(notePath('a b')).toBe('/notes/a%20b');
  });
});
```

- [ ] **Step 8: Run it and watch it fail**

Run: `npm test -- src/lib/nav/paths.test.ts`
Expected: FAIL — `Failed to resolve import "./paths"`.

- [ ] **Step 9: Implement `src/lib/nav/paths.ts`**

```ts
export type SortKey = 'updated' | 'priority' | 'title';
export type ViewKey = 'grid' | 'list';
export type PriorityKey = 'high' | 'medium' | 'low';

export interface DashboardHrefInput {
  q?: string;
  tag?: string | null;
  priority?: PriorityKey | null;
  fav?: boolean;
  sort?: SortKey;
  page?: number;
  view?: ViewKey;
}

export const loginPath = () => '/login';
export const dashboardPath = () => '/';
export const newNotePath = () => '/notes/new';
export const notePath = (id: string) => `/notes/${encodeURIComponent(id)}`;
export const noteEditPath = (id: string) => `${notePath(id)}/edit`;
export const noteVersionPath = (id: string, v: number) => `${notePath(id)}?v=${v}`;
export const apiKeysPath = () => '/settings/api-keys';
export const offlinePath = () => '/offline';

export function buildDashboardHref(input: DashboardHrefInput): string {
  const sp = new URLSearchParams();
  if (input.q && input.q.trim()) sp.set('q', input.q.trim());
  if (input.tag) sp.set('tag', input.tag);
  if (input.priority) sp.set('priority', input.priority);
  if (input.fav) sp.set('fav', '1');
  if (input.sort && input.sort !== 'updated') sp.set('sort', input.sort);
  if (input.page && input.page > 1) sp.set('page', String(input.page));
  if (input.view && input.view !== 'grid') sp.set('view', input.view);
  const qs = sp.toString();
  return qs ? `/?${qs}` : '/';
}
```

- [ ] **Step 10: Run the test and watch it pass**

Run: `npm test -- src/lib/nav/paths.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 11: Write the root `CLAUDE.md` with the shared-component rule**

```markdown
# Kno-Notes — working agreement

## ⚠️ QUY TẮC SHARED COMPONENT — CỰC KỲ QUAN TRỌNG

**Cấm tuyệt đối viết trùng lặp một dạng component.** Mọi thành phần UI dùng ở ≥ 2 nơi
(hoặc có khả năng dùng lại) **phải** nằm trong `src/components/ui/` (primitive) hoặc
`src/components/shared/` (composite nghiệp vụ), rồi page/feature mới import dùng.

- Trước khi viết bất kỳ JSX nào: tìm trong `src/components/` xem đã có chưa.
  Có → dùng/mở rộng bằng prop hoặc variant. Không → tạo shared component rồi mới dùng.
- Cấm copy-paste markup giữa các page.
- Cấm hard-code giá trị màu/size trong page khi đã có token/variant.
- Mọi variant thể hiện qua `cva` variants, không phải component mới.
- `src/components/features/**` chỉ chứa data wiring + state, KHÔNG chứa markup trình bày.

## Ngôn ngữ

Toàn bộ giao diện là tiếng Việt. Microcopy lấy nguyên văn từ `docs/reference/Design Spec.dc.html` mục 09.
Tên app: `Kno-Notes`. Logo: chữ `K`.

## Nguồn chuẩn

`docs/SPEC.md` → `docs/reference/So Lam Sang.dc.html` (markup + hành vi) → `docs/reference/Design Spec.dc.html` (token).

## Lệnh

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e`
```

- [ ] **Step 12: Verify the toolchain is clean**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all three succeed.

- [ ] **Step 13: Commit**

```bash
git init
git add -A
git commit -m "chore: bootstrap Next.js 15 app router project with vitest and playwright tooling"
```

---
### Task A2: Prefs cookie, `useMediaQuery`, debounce, and `PrefsProvider`

**Files:**
- Create: `src/lib/prefs/cookie.ts`, `src/hooks/use-debounced-callback.ts`, `src/hooks/use-media-query.ts`, `src/components/providers/prefs-provider.tsx`
- Test: `src/lib/prefs/cookie.test.ts`, `src/components/providers/prefs-provider.test.tsx`

**Interfaces:**
- Consumes: `UserPrefs` from `@/lib/types` (P2); `PATCH /api/prefs` (P2).
- Produces:
  ```ts
  export const PREFS_COOKIE = 'kn_prefs';
  export const DEFAULT_PREFS: UserPrefs;
  export function parsePrefsCookie(raw: string | undefined): UserPrefs;   // never throws
  export function serializePrefsCookie(p: UserPrefs): string;             // encodeURIComponent'd JSON
  export function writePrefsCookie(p: UserPrefs): void;                   // document.cookie, 1 year, SameSite=Lax, path=/
  export function useMediaQuery(query: string): boolean;                  // SSR ⇒ false, no flash because CSS does layout
  export function useIsMobile(): boolean;                                 // useMediaQuery('(max-width: 819px)')
  export function useDebouncedCallback<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void;
  export function PrefsProvider(props: { initial: UserPrefs; children: ReactNode }): JSX.Element;
  export function usePrefs(): { prefs: UserPrefs; setPrefs: (patch: Partial<UserPrefs>) => void; pushRecentSearch: (q: string) => void; clearRecentSearches: () => void };
  ```

**Decision — why a cookie.** `user_prefs` lives in Postgres, but the *first paint* must already have the right theme, font size and sidebar state. A non-httpOnly `kn_prefs` cookie is mirrored on every write; the root layout reads it with `cookies()` and renders `<html data-theme … style="--fs:…">` server-side, so there is no flash and no hydration mismatch. The cookie is a cache, never the source of truth — the server layout overwrites it from Postgres on each full page load.

- [ ] **Step 1: Write the failing cookie test**

`src/lib/prefs/cookie.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePrefsCookie, serializePrefsCookie, DEFAULT_PREFS } from './cookie';

describe('parsePrefsCookie', () => {
  it('returns defaults for undefined, empty and malformed input', () => {
    expect(parsePrefsCookie(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie('')).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie('not-json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie('%7B%22theme%22%3A')).toEqual(DEFAULT_PREFS);
  });

  it('clamps fontSize into 14..22 and rejects unknown enums', () => {
    const raw = encodeURIComponent(JSON.stringify({ theme: 'neon', fontSize: 99, view: 'table', sidebarCollapsed: 'yes', recentSearches: 'x' }));
    expect(parsePrefsCookie(raw)).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a valid value', () => {
    const p = { theme: 'dark' as const, fontSize: 21, view: 'list' as const, sidebarCollapsed: true, recentSearches: ['sốc phản vệ', '#Tim mạch'] };
    expect(parsePrefsCookie(serializePrefsCookie(p))).toEqual(p);
  });

  it('keeps at most 5 recent searches', () => {
    const raw = encodeURIComponent(JSON.stringify({ ...DEFAULT_PREFS, recentSearches: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(parsePrefsCookie(raw).recentSearches).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/lib/prefs/cookie.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/prefs/cookie.ts`**

```ts
import type { UserPrefs } from '@/lib/types';

export const PREFS_COOKIE = 'kn_prefs';
export const PREFS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_PREFS: UserPrefs = {
  theme: 'light',
  fontSize: 17,
  view: 'grid',
  sidebarCollapsed: false,
  recentSearches: [],
};

export function parsePrefsCookie(raw: string | undefined): UserPrefs {
  if (!raw) return DEFAULT_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return DEFAULT_PREFS;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
  const o = parsed as Record<string, unknown>;
  const theme = o.theme === 'dark' ? 'dark' : o.theme === 'light' ? 'light' : DEFAULT_PREFS.theme;
  const fontSize =
    typeof o.fontSize === 'number' && Number.isFinite(o.fontSize)
      ? Math.min(22, Math.max(14, Math.round(o.fontSize)))
      : DEFAULT_PREFS.fontSize;
  const view = o.view === 'list' ? 'list' : o.view === 'grid' ? 'grid' : DEFAULT_PREFS.view;
  const sidebarCollapsed = typeof o.sidebarCollapsed === 'boolean' ? o.sidebarCollapsed : DEFAULT_PREFS.sidebarCollapsed;
  const recentSearches = Array.isArray(o.recentSearches)
    ? o.recentSearches.filter((x): x is string => typeof x === 'string').slice(0, 5)
    : DEFAULT_PREFS.recentSearches;
  return { theme, fontSize, view, sidebarCollapsed, recentSearches };
}

export function serializePrefsCookie(p: UserPrefs): string {
  return encodeURIComponent(JSON.stringify(p));
}

export function writePrefsCookie(p: UserPrefs): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${PREFS_COOKIE}=${serializePrefsCookie(p)}; path=/; max-age=${PREFS_COOKIE_MAX_AGE}; SameSite=Lax`;
}
```

> Note: the unknown-enum test expects `DEFAULT_PREFS` exactly — every field above falls back independently, so a wholly-invalid object yields the defaults.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/lib/prefs/cookie.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `src/hooks/use-debounced-callback.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { fnRef.current = fn; }, [fn]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return useCallback((...args: A) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), ms);
  }, [ms]);
}
```

- [ ] **Step 6: Implement `src/hooks/use-media-query.ts`**

```ts
'use client';
import { useCallback, useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 819px)';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // Server snapshot is always false. Nothing visual depends on it: layout is
  // CSS-first (max-[819px]: / min-[820px]: variants). Only drawer-vs-collapse
  // *semantics* read this, and those only matter after the first interaction.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
```

- [ ] **Step 7: Write the failing PrefsProvider test**

`src/components/providers/prefs-provider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefsProvider, usePrefs } from './prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs/cookie';

function Probe() {
  const { prefs, setPrefs, pushRecentSearch } = usePrefs();
  return (
    <div>
      <span data-testid="view">{prefs.view}</span>
      <span data-testid="recent">{prefs.recentSearches.join('|')}</span>
      <button onClick={() => setPrefs({ view: 'list' })}>list</button>
      <button onClick={() => setPrefs({ fontSize: 21 })}>fs</button>
      <button onClick={() => pushRecentSearch('sốc')}>recent</button>
    </div>
  );
}

describe('PrefsProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('applies a change optimistically and PATCHes once after the debounce window', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PrefsProvider initial={DEFAULT_PREFS}><Probe /></PrefsProvider>);

    await user.click(screen.getByText('list'));
    expect(screen.getByTestId('view')).toHaveTextContent('list');
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByText('fs'));
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/prefs');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ view: 'list', fontSize: 21 });
  });

  it('mirrors prefs into the kn_prefs cookie synchronously', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PrefsProvider initial={DEFAULT_PREFS}><Probe /></PrefsProvider>);
    await user.click(screen.getByText('list'));
    expect(document.cookie).toContain('kn_prefs=');
    expect(decodeURIComponent(document.cookie)).toContain('"view":"list"');
  });

  it('keeps recent searches unique, newest first, capped at 5', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <PrefsProvider initial={{ ...DEFAULT_PREFS, recentSearches: ['a', 'sốc', 'b', 'c', 'd'] }}>
        <Probe />
      </PrefsProvider>,
    );
    await user.click(screen.getByText('recent'));
    expect(screen.getByTestId('recent')).toHaveTextContent('sốc|a|b|c|d');
  });
});
```

- [ ] **Step 8: Run it and watch it fail**

Run: `npm test -- src/components/providers/prefs-provider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 9: Implement `src/components/providers/prefs-provider.tsx`**

```tsx
'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { UserPrefs } from '@/lib/types';
import { writePrefsCookie } from '@/lib/prefs/cookie';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

export const PREFS_SYNC_DEBOUNCE_MS = 500;

interface PrefsContextValue {
  prefs: UserPrefs;
  setPrefs: (patch: Partial<UserPrefs>) => void;
  pushRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ initial, children }: { initial: UserPrefs; children: ReactNode }) {
  const [prefs, setState] = useState<UserPrefs>(initial);
  const pending = useRef<Partial<UserPrefs>>({});

  const flush = useDebouncedCallback(() => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    void fetch('/api/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => { /* prefs are best-effort; the cookie already holds the value */ });
  }, PREFS_SYNC_DEBOUNCE_MS);

  const setPrefs = useCallback((patch: Partial<UserPrefs>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      writePrefsCookie(next);
      return next;
    });
    pending.current = { ...pending.current, ...patch };
    flush();
  }, [flush]);

  const pushRecentSearch = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setState((prev) => {
      const recentSearches = [q, ...prev.recentSearches.filter((x) => x !== q)].slice(0, 5);
      const next = { ...prev, recentSearches };
      writePrefsCookie(next);
      pending.current = { ...pending.current, recentSearches };
      return next;
    });
    flush();
  }, [flush]);

  const clearRecentSearches = useCallback(() => setPrefs({ recentSearches: [] }), [setPrefs]);

  const value = useMemo(
    () => ({ prefs, setPrefs, pushRecentSearch, clearRecentSearches }),
    [prefs, setPrefs, pushRecentSearch, clearRecentSearches],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
```

- [ ] **Step 10: Run the test and watch it pass**

Run: `npm test -- src/components/providers/prefs-provider.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 11: Commit**

```bash
git add src/lib/prefs src/hooks/use-debounced-callback.ts src/hooks/use-media-query.ts src/components/providers/prefs-provider.tsx
git commit -m "feat(prefs): cookie-mirrored prefs provider with debounced server sync"
```

---

### Task A3: `ThemeProvider` (FOUC-free), `ToastProvider`, and `AppProviders`

**Files:**
- Create: `src/components/providers/theme-provider.tsx`, `src/components/providers/toast-provider.tsx`, `src/components/providers/app-providers.tsx`
- Test: `src/components/providers/toast-provider.test.tsx`, `src/components/providers/theme-provider.test.tsx`

**Interfaces:**
- Consumes: `usePrefs()` (A2); `ToastViewport` (P1).
- Produces:
  ```ts
  export const THEME_INIT_SCRIPT: string;                 // inline <script> body, runs before paint
  export function ThemeProvider(p: { children: ReactNode }): JSX.Element;
  export function useTheme(): { theme: 'light'|'dark'; setTheme(t: 'light'|'dark'): void; fontSize: number; setFontSize(n: number): void };
  export const TOAST_DURATION_MS = 2200;
  export function ToastProvider(p: { children: ReactNode }): JSX.Element;
  export function useToast(): { toast: (message: string) => void };
  export function AppProviders(p: { initialPrefs: UserPrefs; children: ReactNode }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing toast test**

`src/components/providers/toast-provider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from './toast-provider';

function Probe() {
  const { toast } = useToast();
  return <button onClick={() => toast('Đã lưu · phiên bản v2')}>go</button>;
}

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a message and hides it after exactly 2200ms', () => {
    render(<ToastProvider><Probe /></ToastProvider>);
    act(() => { screen.getByText('go').click(); });
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu · phiên bản v2');
    act(() => { vi.advanceTimersByTime(2199); });
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu · phiên bản v2');
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('restarts the timer when a second toast arrives', () => {
    render(<ToastProvider><Probe /></ToastProvider>);
    act(() => { screen.getByText('go').click(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { screen.getByText('go').click(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/providers/toast-provider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/providers/toast-provider.tsx`**

```tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastViewport } from '@/components/ui/toast';

export const TOAST_DURATION_MS = 2200;

const ToastContext = createContext<{ toast: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport message={message} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
```

> `ToastViewport` (P1) renders `null` when `message` is `null`, otherwise a `role="status"` `aria-live="polite"` element positioned `fixed left-1/2 bottom-[28px] -translate-x-1/2 z-[90] px-[18px] py-[11px] rounded-[10px] bg-text text-bg text-[14px] shadow-elevated`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/components/providers/toast-provider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing theme test**

`src/components/providers/theme-provider.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PrefsProvider } from './prefs-provider';
import { ThemeProvider, useTheme, THEME_INIT_SCRIPT } from './theme-provider';
import { DEFAULT_PREFS } from '@/lib/prefs/cookie';

function Probe() {
  const { theme, setTheme, setFontSize } = useTheme();
  return (
    <div>
      <span data-testid="t">{theme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setFontSize(30)}>big</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('writes data-theme and --fs onto <html> from the initial prefs', () => {
    render(
      <PrefsProvider initial={{ ...DEFAULT_PREFS, theme: 'dark', fontSize: 21 }}>
        <ThemeProvider><Probe /></ThemeProvider>
      </PrefsProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('21px');
  });

  it('updates <html> when the theme changes and clamps font size to 14..22', () => {
    render(
      <PrefsProvider initial={DEFAULT_PREFS}>
        <ThemeProvider><Probe /></ThemeProvider>
      </PrefsProvider>,
    );
    act(() => { screen.getByText('dark').click(); });
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => { screen.getByText('big').click(); });
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('22px');
  });

  it('exposes a blocking script that reads the same cookie name and never throws', () => {
    expect(THEME_INIT_SCRIPT).toContain('kn_prefs');
    expect(THEME_INIT_SCRIPT).toContain('try');
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm test -- src/components/providers/theme-provider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/components/providers/theme-provider.tsx`**

```tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { usePrefs } from './prefs-provider';

export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )kn_prefs=([^;]*)/);var p=m?JSON.parse(decodeURIComponent(m[1])):{};var r=document.documentElement;r.dataset.theme=p.theme==='dark'?'dark':'light';var f=typeof p.fontSize==='number'?Math.min(22,Math.max(14,Math.round(p.fontSize))):17;r.style.setProperty('--fs',f+'px');r.dataset.sidebar=p.sidebarCollapsed?'collapsed':'expanded';}catch(e){}})();`;

interface ThemeContextValue {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  fontSize: number;
  setFontSize: (n: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs, setPrefs } = usePrefs();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.style.setProperty('--fs', `${prefs.fontSize}px`);
    root.dataset.sidebar = prefs.sidebarCollapsed ? 'collapsed' : 'expanded';
  }, [prefs.theme, prefs.fontSize, prefs.sidebarCollapsed]);

  const setTheme = useCallback((theme: 'light' | 'dark') => setPrefs({ theme }), [setPrefs]);
  const setFontSize = useCallback(
    (n: number) => setPrefs({ fontSize: Math.min(22, Math.max(14, Math.round(n))) }),
    [setPrefs],
  );

  const value = useMemo(
    () => ({ theme: prefs.theme, setTheme, fontSize: prefs.fontSize, setFontSize }),
    [prefs.theme, prefs.fontSize, setTheme, setFontSize],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
```

- [ ] **Step 8: Run the test and watch it pass**

Run: `npm test -- src/components/providers/theme-provider.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 9: Implement `src/components/providers/app-providers.tsx`**

```tsx
'use client';
import type { ReactNode } from 'react';
import type { UserPrefs } from '@/lib/types';
import { PrefsProvider } from './prefs-provider';
import { ThemeProvider } from './theme-provider';
import { ToastProvider } from './toast-provider';

export function AppProviders({ initialPrefs, children }: { initialPrefs: UserPrefs; children: ReactNode }) {
  return (
    <PrefsProvider initial={initialPrefs}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </PrefsProvider>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add src/components/providers
git commit -m "feat(providers): FOUC-free theme provider, 2200ms toast provider and app provider stack"
```

---
### Task A4: Root layout, route groups, app shell wiring and boundary files

**Files:**
- Create: `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/offline/page.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/loading.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/not-found.tsx`, `src/components/features/shell/shell-client.tsx`
- Delete: `src/app/page.tsx` (the create-next-app placeholder)
- Test: `e2e/shell.spec.ts` is written later (Task A20); this task is verified by `npm run build`.

**Interfaces:**
- Consumes: `getSession`, `getPrefs`, `noteService.counts`, `noteService.listTags` (P2); `AppShell`, `Sidebar`, `SidebarNavItem`, `SidebarSection`, `AppHeader`, `SettingsPopover`, `Avatar`, `IconButton`, `Icon` (P1); `AppProviders`, `useTheme`, `usePrefs`, `useIsMobile`.
- Produces:
  ```ts
  // src/components/features/shell/shell-client.tsx
  export interface ShellNavData {
    user: { displayName: string; username: string };
    counts: { all: number; favorite: number; high: number; medium: number; low: number };
    tags: { name: string; slug: string; count: number }[];
  }
  export function ShellClient(p: { data: ShellNavData; children: ReactNode }): JSX.Element;
  ```

**Layout decisions.**
- `src/app/layout.tsx` is the only `<html>`. It reads `kn_prefs` with `cookies()` *and* the authoritative prefs from Postgres when a session exists, renders `data-theme` / `style={{ '--fs' }}` / `data-sidebar` **server-side**, and still injects `THEME_INIT_SCRIPT` in `<head>` for the case where the cookie was updated in another tab after this HTML was cached.
- The `(app)` group's layout is the session guard: no session ⇒ `redirect('/login')`. `(auth)` is the inverse.
- `/offline` sits **outside** both groups: it must render with no session, no data, and no network.

- [ ] **Step 1: Write `src/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/providers/app-providers';
import { THEME_INIT_SCRIPT } from '@/components/providers/theme-provider';
import { PREFS_COOKIE, parsePrefsCookie } from '@/lib/prefs/cookie';
import { getSession } from '@/lib/auth/session';
import { getPrefs } from '@/lib/prefs/service';
import { RegisterServiceWorker } from '@/components/features/pwa/register-sw';

const sans = IBM_Plex_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin', 'vietnamese'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin', 'vietnamese'], weight: ['400', '600', '700'], variable: '--font-serif', display: 'swap' });

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Kno-Notes';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Sổ tay kiến thức cá nhân.',
  manifest: '/manifest.webmanifest',
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#17756b' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1112' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const cookiePrefs = parsePrefsCookie(jar.get(PREFS_COOKIE)?.value);
  const session = await getSession();
  const prefs = session ? await getPrefs(session.userId) : cookiePrefs;

  return (
    <html
      lang="vi"
      data-theme={prefs.theme}
      data-sidebar={prefs.sidebarCollapsed ? 'collapsed' : 'expanded'}
      style={{ ['--fs' as string]: `${prefs.fontSize}px` }}
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppProviders initialPrefs={prefs}>{children}</AppProviders>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
```

> `RegisterServiceWorker` is created in Task A16. Until then, stub it as a component returning `null` in the same file path so the build stays green.

- [ ] **Step 2: Write `src/app/(auth)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session) redirect('/');
  return <div className="min-h-screen flex items-center justify-center p-[24px] bg-bg">{children}</div>;
}
```

- [ ] **Step 3: Write `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { noteService } from '@/lib/notes/service';
import { ShellClient } from '@/components/features/shell/shell-client';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [counts, tags] = await Promise.all([
    noteService.counts(session.userId),
    noteService.listTags(session.userId),
  ]);

  return (
    <ShellClient
      data={{
        user: { displayName: session.displayName, username: session.username },
        counts,
        tags,
      }}
    >
      {children}
    </ShellClient>
  );
}
```

- [ ] **Step 4: Write `src/components/features/shell/shell-client.tsx`**

```tsx
'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shared/app-shell';
import { Sidebar } from '@/components/shared/sidebar';
import { SidebarNavItem } from '@/components/shared/sidebar-nav-item';
import { SidebarSection } from '@/components/shared/sidebar-section';
import { AppHeader } from '@/components/shared/app-header';
import { SettingsPopover } from '@/components/shared/settings-popover';
import { SearchContainer } from '@/components/features/search/search-container';
import { usePrefs } from '@/components/providers/prefs-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { useIsMobile } from '@/hooks/use-media-query';
import { buildDashboardHref, newNotePath, loginPath } from '@/lib/nav/paths';

export interface ShellNavData {
  user: { displayName: string; username: string };
  counts: { all: number; favorite: number; high: number; medium: number; low: number };
  tags: { name: string; slug: string; count: number }[];
}

const PRIORITIES = [
  { key: 'high', label: 'Cao', dot: 'var(--hi)' },
  { key: 'medium', label: 'Trung bình', dot: 'var(--med)' },
  { key: 'low', label: 'Thấp', dot: 'var(--low)' },
] as const;

export function ShellClient({ data, children }: { data: ShellNavData; children: ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const isMobile = useIsMobile();
  const { prefs, setPrefs } = usePrefs();
  const { theme, setTheme, fontSize, setFontSize } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeTag = sp.get('tag');
  const activePriority = sp.get('priority');
  const activeFav = sp.get('fav') === '1';
  const hasQuery = Boolean(sp.get('q'));

  const openSidebar = useCallback(() => {
    if (isMobile) setDrawerOpen(true);
    else setPrefs({ sidebarCollapsed: false });
  }, [isMobile, setPrefs]);

  const closeSidebar = useCallback(() => {
    if (isMobile) setDrawerOpen(false);
    else setPrefs({ sidebarCollapsed: true });
  }, [isMobile, setPrefs]);

  const go = useCallback((href: string) => {
    setDrawerOpen(false);
    router.push(href);
  }, [router]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace(loginPath());
    router.refresh();
  }, [router]);

  const sidebar = (
    <Sidebar
      mode={isMobile ? 'drawer' : 'sticky'}
      open={isMobile ? drawerOpen : !prefs.sidebarCollapsed}
      onClose={closeSidebar}
      brand={{ glyph: 'K', name: process.env.NEXT_PUBLIC_APP_NAME ?? 'Kno-Notes', onClick: () => go(buildDashboardHref({})) }}
      nav={
        <>
          <SidebarNavItem label="Tất cả ghi chú" count={data.counts.all} href={buildDashboardHref({})}
            active={!activeFav && !activePriority && !activeTag && !hasQuery} onClick={() => setDrawerOpen(false)} />
          <SidebarNavItem label="Yêu thích" count={data.counts.favorite} href={buildDashboardHref({ fav: true })}
            active={activeFav} onClick={() => setDrawerOpen(false)} />
        </>
      }
      sections={
        <>
          <SidebarSection label="Mức ưu tiên">
            {PRIORITIES.map((p) => (
              <SidebarNavItem key={p.key} label={p.label} count={data.counts[p.key]} dotColor={p.dot}
                href={buildDashboardHref({ priority: activePriority === p.key ? null : p.key })}
                active={activePriority === p.key} onClick={() => setDrawerOpen(false)} />
            ))}
          </SidebarSection>
          <SidebarSection label="Thẻ" scroll>
            {data.tags.map((t) => (
              <SidebarNavItem key={t.slug} label={t.name} count={t.count} prefix="#"
                href={buildDashboardHref({ tag: activeTag === t.name ? null : t.name })}
                active={activeTag === t.name} onClick={() => setDrawerOpen(false)} />
            ))}
          </SidebarSection>
        </>
      }
      footer={{ initials: data.user.displayName.slice(0, 2), displayName: data.user.displayName, username: data.user.username, onLogout: logout }}
    />
  );

  const header = (
    <AppHeader
      showMenuButton={isMobile || prefs.sidebarCollapsed}
      onOpenSidebar={openSidebar}
      newNoteHref={newNotePath()}
      search={<SearchContainer />}
      settings={
        <SettingsPopover
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          theme={theme}
          onThemeChange={setTheme}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onLogout={logout}
        />
      }
    />
  );

  return <AppShell sidebar={sidebar} header={header}>{children}</AppShell>;
}
```

> `SearchContainer` arrives in Task A15. Until then, stub it at that path as a component returning `null`.

- [ ] **Step 5: Write the boundary files**

`src/app/(app)/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="w-full max-w-[1160px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[64px] flex flex-col gap-[24px]">
      <Skeleton className="h-[38px] w-[260px] rounded-[6px]" />
      <div className="grid gap-[16px] grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="min-h-[200px] rounded-[14px]" />)}
      </div>
    </div>
  );
}
```

`src/app/(app)/error.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { EmptyState } from '@/components/shared/empty-state';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="w-full max-w-[1160px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[64px]">
      <EmptyState
        title="Không tải được nội dung"
        description="Đã có lỗi xảy ra. Thử tải lại trang."
        actionLabel="Thử lại"
        onAction={reset}
      />
    </div>
  );
}
```

`src/app/(app)/not-found.tsx`:

```tsx
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';

export default function AppNotFound() {
  return (
    <div className="w-full max-w-[1160px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[64px]">
      <EmptyState title="Không tìm thấy ghi chú" description={<>Ghi chú có thể đã bị xoá. <Link href="/">Về tất cả ghi chú</Link>.</>} />
    </div>
  );
}
```

`src/app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-[10px] p-[24px] text-center bg-bg text-text">
      <div className="font-serif text-[22px] font-semibold">Không tìm thấy trang</div>
      <Link href="/" className="text-[14px] text-accent">Về trang chủ</Link>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/app/offline/page.tsx`**

```tsx
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-[10px] p-[24px] text-center bg-bg text-text">
      <div className="w-[40px] h-[40px] rounded-[11px] bg-accent text-accent-ink flex items-center justify-center font-serif text-[22px] font-bold">K</div>
      <div className="font-serif text-[22px] font-semibold">Đang ngoại tuyến</div>
      <div className="text-[14px] text-muted max-w-[320px] leading-[1.5]">
        Không có kết nối mạng. Các ghi chú đã mở sẽ hiện lại khi bạn trực tuyến trở lại.
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Delete the scaffold page and build**

```bash
rm -f src/app/page.tsx
npm run typecheck && npm run build
```
Expected: build succeeds; routes `/login`, `/`, `/offline` are listed.

- [ ] **Step 8: Commit**

```bash
git add src/app src/components/features/shell
git commit -m "feat(app): root layout with server-rendered theme, route groups and app shell wiring"
```

---

### Task A5: Login page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/components/features/auth/login-form.tsx`
- Test: `src/components/features/auth/login-form.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` (P2); `Input`, `Label`, `Button` (P1).
- Produces: nothing other plans depend on.

**Exact layout (prototype lines 47–68, Design Spec §07 S1):** form `w-full max-w-[380px] flex flex-col gap-[28px]`; brand block `gap-[14px]` with a `40×40 rounded-[11px] bg-accent text-accent-ink` tile holding a serif `22px/700` **`K`**; title serif `32px/600`, `-0.02em`, `leading-[1.15]`; description `15px` muted `leading-[1.5]`; field block `gap-[14px]`; label `13px/500` muted with `gap-[6px]`; inputs `h-[46px] px-[14px] rounded-[10px] border-line2 bg-surface text-[15px]`, focus border accent; error `13px` `text-hi`; submit `h-[46px] rounded-[10px] bg-text text-bg text-[15px]/500 mt-[6px]`, hover `opacity-[.88]`; demo hint `12px` faint mono.

- [ ] **Step 1: Write the page (server component)**

`src/app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { LoginForm } from '@/components/features/auth/login-form';

export const metadata: Metadata = { title: 'Đăng nhập' };

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Kno-Notes';

export default function LoginPage() {
  return (
    <LoginForm
      appName={APP_NAME}
      showDemoHint={process.env.NODE_ENV !== 'production'}
    />
  );
}
```

- [ ] **Step 2: Write the failing form test**

`src/components/features/auth/login-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push, refresh }) }));

describe('LoginForm', () => {
  beforeEach(() => { push.mockClear(); refresh.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the exact error copy on bad credentials and clears it when the user retypes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'INVALID_CREDENTIALS' }) }));
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Sai tên đăng nhập hoặc mật khẩu.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Mật khẩu'), 'x');
    expect(screen.queryByText('Sai tên đăng nhập hoặc mật khẩu.')).toBeNull();
  });

  it('submits on Enter and navigates to the dashboard on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ user: { id: 'u1' } }) }));
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
    await user.type(screen.getByLabelText('Mật khẩu'), '123456{Enter}');

    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('hides the demo hint when showDemoHint is false', () => {
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);
    expect(screen.queryByText(/Demo ·/)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- src/components/features/auth/login-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/components/features/auth/login-form.tsx`**

```tsx
'use client';
import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const ERROR_COPY = 'Sai tên đăng nhập hoặc mật khẩu.';

export function LoginForm({ appName, showDemoHint }: { appName: string; showDemoHint: boolean }) {
  const router = useRouter();
  const userId = useId();
  const passId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) { setError(ERROR_COPY); return; }
      router.push('/');
      router.refresh();
    } catch {
      setError(ERROR_COPY);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[380px] flex flex-col gap-[28px]">
      <div className="flex flex-col gap-[14px]">
        <div className="w-[40px] h-[40px] rounded-[11px] bg-accent text-accent-ink flex items-center justify-center font-serif text-[22px] font-bold">K</div>
        <h1 className="m-0 font-serif text-[32px] font-semibold tracking-[-0.02em] leading-[1.15]">{appName}</h1>
        <p className="m-0 text-[15px] text-muted leading-[1.5]">Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục.</p>
      </div>

      <div className="flex flex-col gap-[14px]">
        <label htmlFor={userId} className="flex flex-col gap-[6px] text-[13px] font-medium text-muted">
          Tên đăng nhập
          <Input id={userId} value={username} autoComplete="username" placeholder="bacsi"
            onChange={(e) => { setUsername(e.target.value); setError(''); }} />
        </label>
        <label htmlFor={passId} className="flex flex-col gap-[6px] text-[13px] font-medium text-muted">
          Mật khẩu
          <Input id={passId} type="password" value={password} autoComplete="current-password" placeholder="••••••"
            onChange={(e) => { setPassword(e.target.value); setError(''); }} />
        </label>
        {error ? <div role="alert" className="text-[13px] text-hi">{error}</div> : null}
        <Button type="submit" variant="ink" size="lg" className="mt-[6px]" loading={busy}>Đăng nhập</Button>
      </div>

      {showDemoHint ? (
        <div className="text-[12px] text-faint font-mono">Demo · bacsi / 123456</div>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm test -- src/components/features/auth/login-form.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\) src/components/features/auth
git commit -m "feat(login): login page with exact prototype layout and error copy"
```

---
### Task A6: `useNoteFilters()` — the query string is the state

**Files:**
- Create: `src/hooks/use-note-filters.ts`
- Test: `src/hooks/use-note-filters.test.ts`, `src/hooks/use-note-filters.test.tsx`

**Interfaces:**
- Consumes: `buildDashboardHref`, `SortKey`, `ViewKey`, `PriorityKey` (A1); `usePrefs` (A2).
- Produces:
  ```ts
  export interface NoteFilters { q: string; tag: string | null; priority: PriorityKey | null; fav: boolean; sort: SortKey; page: number; view: ViewKey }
  export const DEFAULT_FILTERS: NoteFilters;
  export const PAGE_SIZE = 6;
  export function parseNoteFilters(sp: URLSearchParams | ReadonlyURLSearchParams, prefView?: ViewKey): NoteFilters;
  export type FilterPatch = Partial<NoteFilters>;
  export function nextFilters(current: NoteFilters, patch: FilterPatch): NoteFilters;   // resets page on any narrowing change
  export function useNoteFilters(): {
    filters: NoteFilters;
    setFilters: (patch: FilterPatch) => void;   // push, scroll preserved
    setQuery: (q: string) => void;              // replace, debounced by the caller
    setPage: (page: number) => void;            // push + scrollTo(0,0)
    setView: (view: ViewKey) => void;           // push + writes prefs
    clearAll: () => void;
    chips: { key: string; label: string; onRemove: () => void }[];
    title: string;
  };
  ```

**Rules (from SPEC §3 and the prototype `goDash` / `renderVals`).**
- `q`, `tag`, `priority`, `fav`, `sort` changes reset `page` to `1`. `page` and `view` changes do not.
- `page` changes call `window.scrollTo(0, 0)` — the prototype does this on every page button.
- Query typing uses `router.replace(..., { scroll: false })` so 20 keystrokes do not create 20 history entries; every other control uses `router.push(..., { scroll: false })` so Back undoes one deliberate action.
- `view` has two homes: the URL (shareable) and prefs (remembered). **URL wins when present**; choosing a view writes both.
- `title` mirrors the prototype exactly: `q` ⇒ `Kết quả tìm kiếm`; else `tag` ⇒ `#<tag>`; else `priority` ⇒ `Ưu tiên <label lowercase>`; else `fav` ⇒ `Yêu thích`; else `Tất cả ghi chú`.

- [ ] **Step 1: Write the failing pure-function test**

`src/hooks/use-note-filters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseNoteFilters, nextFilters, DEFAULT_FILTERS } from './use-note-filters';

const sp = (s: string) => new URLSearchParams(s);

describe('parseNoteFilters', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseNoteFilters(sp(''))).toEqual(DEFAULT_FILTERS);
  });

  it('reads every supported parameter', () => {
    expect(parseNoteFilters(sp('q=sốc&tag=Cấp cứu&priority=high&fav=1&sort=title&page=3&view=list'))).toEqual({
      q: 'sốc', tag: 'Cấp cứu', priority: 'high', fav: true, sort: 'title', page: 3, view: 'list',
    });
  });

  it('falls back on unknown enum values instead of crashing', () => {
    expect(parseNoteFilters(sp('sort=bogus&priority=purple&view=table'))).toEqual(DEFAULT_FILTERS);
  });

  it('clamps page to >= 1 and ignores non-numeric pages', () => {
    expect(parseNoteFilters(sp('page=0')).page).toBe(1);
    expect(parseNoteFilters(sp('page=-4')).page).toBe(1);
    expect(parseNoteFilters(sp('page=abc')).page).toBe(1);
    expect(parseNoteFilters(sp('page=999')).page).toBe(999);
  });

  it('uses the prefs view only when the URL has none', () => {
    expect(parseNoteFilters(sp(''), 'list').view).toBe('list');
    expect(parseNoteFilters(sp('view=grid'), 'list').view).toBe('grid');
  });

  it('treats fav=0 and a missing fav identically', () => {
    expect(parseNoteFilters(sp('fav=0')).fav).toBe(false);
    expect(parseNoteFilters(sp('fav=1')).fav).toBe(true);
  });
});

describe('nextFilters', () => {
  const base = { ...DEFAULT_FILTERS, page: 4 };

  it.each(['q', 'tag', 'priority', 'fav', 'sort'] as const)('resets page to 1 when %s changes', (key) => {
    const patch = { q: 'x', tag: 'y', priority: 'low', fav: true, sort: 'title' }[key as 'q'];
    expect(nextFilters(base, { [key]: patch } as never).page).toBe(1);
  });

  it('keeps the page when only the page changes', () => {
    expect(nextFilters(base, { page: 7 }).page).toBe(7);
  });

  it('keeps the page when only the view changes', () => {
    expect(nextFilters(base, { view: 'list' }).page).toBe(4);
  });

  it('does not reset the page when a filter is set to the value it already has', () => {
    expect(nextFilters({ ...base, sort: 'title' }, { sort: 'title' }).page).toBe(4);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/hooks/use-note-filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/use-note-filters.ts`**

```ts
'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { usePrefs } from '@/components/providers/prefs-provider';
import type { PriorityKey, SortKey, ViewKey } from '@/lib/nav/paths';

export const PAGE_SIZE = 6;

export interface NoteFilters {
  q: string;
  tag: string | null;
  priority: PriorityKey | null;
  fav: boolean;
  sort: SortKey;
  page: number;
  view: ViewKey;
}

export const DEFAULT_FILTERS: NoteFilters = {
  q: '', tag: null, priority: null, fav: false, sort: 'updated', page: 1, view: 'grid',
};

const SORTS: readonly SortKey[] = ['updated', 'priority', 'title'];
const PRIORITIES: readonly PriorityKey[] = ['high', 'medium', 'low'];
const VIEWS: readonly ViewKey[] = ['grid', 'list'];

export const PRIORITY_LABEL: Record<PriorityKey, string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };

export function parseNoteFilters(sp: URLSearchParams | ReadonlyURLSearchParams, prefView?: ViewKey): NoteFilters {
  const rawSort = sp.get('sort');
  const rawPriority = sp.get('priority');
  const rawView = sp.get('view');
  const rawPage = Number.parseInt(sp.get('page') ?? '', 10);

  return {
    q: sp.get('q') ?? '',
    tag: sp.get('tag') || null,
    priority: PRIORITIES.includes(rawPriority as PriorityKey) ? (rawPriority as PriorityKey) : null,
    fav: sp.get('fav') === '1',
    sort: SORTS.includes(rawSort as SortKey) ? (rawSort as SortKey) : DEFAULT_FILTERS.sort,
    page: Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1,
    view: VIEWS.includes(rawView as ViewKey) ? (rawView as ViewKey) : (prefView ?? DEFAULT_FILTERS.view),
  };
}

export type FilterPatch = Partial<NoteFilters>;

const NARROWING_KEYS = ['q', 'tag', 'priority', 'fav', 'sort'] as const;

export function nextFilters(current: NoteFilters, patch: FilterPatch): NoteFilters {
  const merged: NoteFilters = { ...current, ...patch };
  const narrowed = NARROWING_KEYS.some((k) => k in patch && patch[k] !== current[k]);
  if (narrowed && !('page' in patch)) merged.page = 1;
  return merged;
}

export function serializeNoteFilters(f: NoteFilters): string {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set('q', f.q.trim());
  if (f.tag) sp.set('tag', f.tag);
  if (f.priority) sp.set('priority', f.priority);
  if (f.fav) sp.set('fav', '1');
  if (f.sort !== DEFAULT_FILTERS.sort) sp.set('sort', f.sort);
  if (f.page > 1) sp.set('page', String(f.page));
  if (f.view !== DEFAULT_FILTERS.view) sp.set('view', f.view);
  return sp.toString();
}

export function filtersTitle(f: NoteFilters): string {
  if (f.q.trim()) return 'Kết quả tìm kiếm';
  if (f.tag) return `#${f.tag}`;
  if (f.priority) return `Ưu tiên ${PRIORITY_LABEL[f.priority].toLowerCase()}`;
  if (f.fav) return 'Yêu thích';
  return 'Tất cả ghi chú';
}

export function useNoteFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { prefs, setPrefs } = usePrefs();

  const filters = useMemo(() => parseNoteFilters(sp, prefs.view), [sp, prefs.view]);

  const navigate = useCallback((next: NoteFilters, mode: 'push' | 'replace') => {
    const qs = serializeNoteFilters(next);
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (mode === 'replace') router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router]);

  const setFilters = useCallback((patch: FilterPatch) => {
    navigate(nextFilters(filters, patch), 'push');
  }, [filters, navigate]);

  const setQuery = useCallback((q: string) => {
    navigate(nextFilters(filters, { q }), 'replace');
  }, [filters, navigate]);

  const setPage = useCallback((page: number) => {
    navigate(nextFilters(filters, { page }), 'push');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [filters, navigate]);

  const setView = useCallback((view: ViewKey) => {
    setPrefs({ view });
    navigate(nextFilters(filters, { view }), 'push');
  }, [filters, navigate, setPrefs]);

  const clearAll = useCallback(() => {
    navigate({ ...DEFAULT_FILTERS, view: filters.view }, 'push');
  }, [filters.view, navigate]);

  const chips = useMemo(() => {
    const out: { key: string; label: string; onRemove: () => void }[] = [];
    if (filters.q.trim()) out.push({ key: 'q', label: `“${filters.q.trim()}”`, onRemove: () => setFilters({ q: '' }) });
    if (filters.priority) out.push({ key: 'priority', label: `Ưu tiên ${PRIORITY_LABEL[filters.priority].toLowerCase()}`, onRemove: () => setFilters({ priority: null }) });
    if (filters.tag) out.push({ key: 'tag', label: `#${filters.tag}`, onRemove: () => setFilters({ tag: null }) });
    return out;
  }, [filters.q, filters.priority, filters.tag, setFilters]);

  return { filters, setFilters, setQuery, setPage, setView, clearAll, chips, title: filtersTitle(filters) };
}
```

- [ ] **Step 4: Run the pure-function test and watch it pass**

Run: `npm test -- src/hooks/use-note-filters.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing hook-behaviour test**

`src/hooks/use-note-filters.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PrefsProvider } from '@/components/providers/prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs/cookie';
import { useNoteFilters } from './use-note-filters';

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => search,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <PrefsProvider initial={DEFAULT_PREFS}>{children}</PrefsProvider>
);

describe('useNoteFilters', () => {
  beforeEach(() => { push.mockClear(); replace.mockClear(); search = new URLSearchParams(''); });

  it('pushes without scrolling and drops default values from the URL', () => {
    const { result } = renderHook(() => useNoteFilters(), { wrapper });
    act(() => result.current.setFilters({ sort: 'title' }));
    expect(push).toHaveBeenCalledWith('/?sort=title', { scroll: false });
  });

  it('replaces (not pushes) when only the query text changes', () => {
    const { result } = renderHook(() => useNoteFilters(), { wrapper });
    act(() => result.current.setQuery('sốc'));
    expect(replace).toHaveBeenCalledWith('/?q=s%E1%BB%91c', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('resets the page when a filter narrows', () => {
    search = new URLSearchParams('page=5');
    const { result } = renderHook(() => useNoteFilters(), { wrapper });
    act(() => result.current.setFilters({ tag: 'Cấp cứu' }));
    expect(push).toHaveBeenCalledWith('/?tag=C%E1%BA%A5p+c%E1%BB%A9u', { scroll: false });
  });

  it('scrolls to top when the page changes', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    const { result } = renderHook(() => useNoteFilters(), { wrapper });
    act(() => result.current.setPage(3));
    expect(push).toHaveBeenCalledWith('/?page=3', { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    vi.unstubAllGlobals();
  });

  it('computes the dynamic H1 the way the prototype does', () => {
    search = new URLSearchParams('tag=ECG');
    expect(renderHook(() => useNoteFilters(), { wrapper }).result.current.title).toBe('#ECG');
    search = new URLSearchParams('q=hen');
    expect(renderHook(() => useNoteFilters(), { wrapper }).result.current.title).toBe('Kết quả tìm kiếm');
    search = new URLSearchParams('priority=medium');
    expect(renderHook(() => useNoteFilters(), { wrapper }).result.current.title).toBe('Ưu tiên trung bình');
    search = new URLSearchParams('fav=1');
    expect(renderHook(() => useNoteFilters(), { wrapper }).result.current.title).toBe('Yêu thích');
    search = new URLSearchParams('');
    expect(renderHook(() => useNoteFilters(), { wrapper }).result.current.title).toBe('Tất cả ghi chú');
  });

  it('keeps the current view when clearing filters', () => {
    search = new URLSearchParams('view=list&tag=ECG&q=x');
    const { result } = renderHook(() => useNoteFilters(), { wrapper });
    act(() => result.current.clearAll());
    expect(push).toHaveBeenCalledWith('/?view=list', { scroll: false });
  });
});
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npm test -- src/hooks/use-note-filters.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-note-filters.ts src/hooks/use-note-filters.test.ts src/hooks/use-note-filters.test.tsx
git commit -m "feat(dashboard): URL-backed note filter state with page reset and scroll rules"
```

---

### Task A7: Dashboard page

**Files:**
- Create: `src/app/(app)/page.tsx`, `src/components/features/dashboard/dashboard-toolbar.tsx`, `src/components/features/dashboard/note-collection.tsx`, `src/lib/notes/view-model.ts`
- Test: `src/lib/notes/view-model.test.ts`

**Interfaces:**
- Consumes: `getSession`, `noteService.listNotes` (P2); `rel` (P2); `useNoteFilters`, `PAGE_SIZE` (A6); `NoteGrid`, `NoteList`, `NoteCard`, `NoteListRow`, `SortSelect`, `ViewToggle`, `FilterChips`, `Pagination`, `EmptyState`, `SectionLabel` (P1).
- Produces:
  ```ts
  // src/lib/notes/view-model.ts
  export function toNoteSummaryVM(n: NoteSummary, now?: number): NoteSummaryVM;
  export function rangeText(page: number, pageSize: number, total: number): string;  // "Hiển thị 1–6 trên 14"
  ```

**Exact layout:** container `w-full max-w-[1160px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[64px] flex flex-col gap-[24px]`; head row `flex items-end justify-between gap-[16px] flex-wrap`; H1 serif `26px` mobile / `32px` desktop, `600`, `-0.02em`, `leading-[1.15]`; sub `14px text-muted` reading `n ghi chú`; grid `grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-[16px]`.

- [ ] **Step 1: Write the failing view-model test**

`src/lib/notes/view-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toNoteSummaryVM, rangeText } from './view-model';

const base = {
  id: 'n1', title: 'Phác đồ', desc: 'Mô tả', priority: 'high' as const,
  tags: ['Tim mạch', 'Phác đồ', 'ESC', 'Thừa'], favorite: true,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z',
  latestVersion: 3, imageCount: 2, commentCount: 1, quizCount: 1, contentSha: 'abc',
};

describe('toNoteSummaryVM', () => {
  it('keeps at most three tags and labels the version', () => {
    const vm = toNoteSummaryVM(base, Date.parse('2026-09-26T00:30:00.000Z'));
    expect(vm.tags).toEqual(['Tim mạch', 'Phác đồ', 'ESC']);
    expect(vm.versionLabel).toBe('v3');
    expect(vm.updatedLabel).toBe('30 phút trước');
    expect(vm.favorite).toBe(true);
  });
});

describe('rangeText', () => {
  it('formats the prototype string', () => {
    expect(rangeText(1, 6, 14)).toBe('Hiển thị 1–6 trên 14');
    expect(rangeText(3, 6, 14)).toBe('Hiển thị 13–14 trên 14');
  });
  it('returns an empty string when there is nothing to show', () => {
    expect(rangeText(1, 6, 0)).toBe('');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/lib/notes/view-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/notes/view-model.ts`**

```ts
import { rel } from '@/lib/text/date';
import type { NoteSummary } from '@/lib/types';

export interface NoteSummaryVM {
  id: string;
  title: string;
  desc: string;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  updatedLabel: string;
  versionLabel: string;
  imageCount: number;
  commentCount: number;
  favorite: boolean;
}

export function toNoteSummaryVM(n: NoteSummary, now?: number): NoteSummaryVM {
  return {
    id: n.id,
    title: n.title,
    desc: n.desc,
    priority: n.priority,
    tags: n.tags.slice(0, 3),
    updatedLabel: rel(n.updatedAt, now),
    versionLabel: `v${n.latestVersion}`,
    imageCount: n.imageCount,
    commentCount: n.commentCount,
    favorite: n.favorite,
  };
}

export function rangeText(page: number, pageSize: number, total: number): string {
  if (total <= 0) return '';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `Hiển thị ${from}–${to} trên ${total}`;
}
```

> `rel(iso, now?)` is P2's; it must accept an optional `now` so this test is deterministic. If P2 shipped `rel(iso)` only, request the second parameter — do not fork the function.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/lib/notes/view-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `src/app/(app)/page.tsx` (server component)**

```tsx
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { noteService } from '@/lib/notes/service';
import { getPrefs } from '@/lib/prefs/service';
import { parseNoteFilters, PAGE_SIZE } from '@/hooks/use-note-filters';
import { toNoteSummaryVM } from '@/lib/notes/view-model';
import { DashboardToolbar } from '@/components/features/dashboard/dashboard-toolbar';
import { NoteCollection } from '@/components/features/dashboard/note-collection';

export const metadata: Metadata = { title: 'Tất cả ghi chú' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') sp.set(k, v);

  const prefs = await getPrefs(session.userId);
  const filters = parseNoteFilters(sp, prefs.view);

  const { items, total, pages } = await noteService.listNotes(session.userId, {
    q: filters.q,
    tag: filters.tag,
    priority: filters.priority,
    favorite: filters.fav,
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="w-full max-w-[1160px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[64px] flex flex-col gap-[24px]">
      <DashboardToolbar total={total} />
      <NoteCollection notes={items.map((n) => toNoteSummaryVM(n))} total={total} pages={pages} />
    </div>
  );
}
```

- [ ] **Step 6: Write `src/components/features/dashboard/dashboard-toolbar.tsx`**

```tsx
'use client';
import { SortSelect } from '@/components/shared/sort-select';
import { ViewToggle } from '@/components/shared/view-toggle';
import { FilterChips } from '@/components/shared/filter-chips';
import { useNoteFilters } from '@/hooks/use-note-filters';

export function DashboardToolbar({ total }: { total: number }) {
  const { filters, setFilters, setView, clearAll, chips, title } = useNoteFilters();

  return (
    <>
      <div className="flex items-end justify-between gap-[16px] flex-wrap">
        <div className="flex flex-col gap-[6px]">
          <h1 className="m-0 font-serif text-[26px] min-[820px]:text-[32px] font-semibold tracking-[-0.02em] leading-[1.15]">{title}</h1>
          <div className="text-[14px] text-muted">{total} ghi chú</div>
        </div>
        <div className="flex items-center gap-[10px]">
          <SortSelect value={filters.sort} onChange={(sort) => setFilters({ sort })} />
          <ViewToggle value={filters.view} onChange={setView} />
        </div>
      </div>
      {chips.length > 0 ? <FilterChips chips={chips} onClearAll={clearAll} /> : null}
    </>
  );
}
```

- [ ] **Step 7: Write `src/components/features/dashboard/note-collection.tsx`**

```tsx
'use client';
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NoteGrid } from '@/components/shared/note-grid';
import { NoteList } from '@/components/shared/note-list';
import { NoteCard } from '@/components/shared/note-card';
import { NoteListRow } from '@/components/shared/note-list-row';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { useNoteFilters, PAGE_SIZE } from '@/hooks/use-note-filters';
import { rangeText, type NoteSummaryVM } from '@/lib/notes/view-model';
import { notePath } from '@/lib/nav/paths';

export function NoteCollection({ notes, total, pages }: { notes: NoteSummaryVM[]; total: number; pages: number }) {
  const { filters, setPage, clearAll } = useNoteFilters();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [favOverride, setFavOverride] = useState<Record<string, boolean>>({});

  const toggleFavorite = useCallback(async (id: string, current: boolean) => {
    const next = !current;
    setFavOverride((m) => ({ ...m, [id]: next }));
    const res = await fetch(`/api/notes/${encodeURIComponent(id)}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: next }),
    });
    if (!res.ok) { setFavOverride((m) => ({ ...m, [id]: current })); return; }
    startTransition(() => router.refresh());
  }, [router]);

  const withFav = notes.map((n) => ({ ...n, favorite: favOverride[n.id] ?? n.favorite }));

  if (withFav.length === 0) {
    return (
      <EmptyState
        title="Không tìm thấy ghi chú"
        description={<>Thử từ khoá khác, hoặc tìm theo thẻ với cú pháp <span className="font-mono">#thẻ</span>.</>}
        actionLabel="Xoá bộ lọc"
        onAction={clearAll}
      />
    );
  }

  return (
    <>
      {filters.view === 'grid' ? (
        <NoteGrid>
          {withFav.map((n) => (
            <NoteCard key={n.id} note={n} href={notePath(n.id)}
              onToggleFavorite={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(n.id, n.favorite); }} />
          ))}
        </NoteGrid>
      ) : (
        <NoteList>
          {withFav.map((n, i) => (
            <NoteListRow key={n.id} note={n} href={notePath(n.id)} first={i === 0}
              onToggleFavorite={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(n.id, n.favorite); }} />
          ))}
        </NoteList>
      )}
      <Pagination page={filters.page} pages={pages} rangeText={rangeText(filters.page, PAGE_SIZE, total)} onPageChange={setPage} />
    </>
  );
}
```

- [ ] **Step 8: Verify the page renders**

Run: `npm run typecheck && npm run build`
Expected: clean build; `/` is a dynamic route.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/page.tsx src/components/features/dashboard src/lib/notes/view-model.ts src/lib/notes/view-model.test.ts
git commit -m "feat(dashboard): server-rendered note collection with URL filters, grid/list and pagination"
```

---
### Task A8: Note detail page — article column

**Files:**
- Create: `src/app/(app)/notes/[id]/page.tsx`, `src/app/(app)/notes/[id]/loading.tsx`, `src/components/features/note-detail/detail-client.tsx`, `src/components/features/note-detail/detail-actions.tsx`
- Test: `src/components/features/note-detail/detail-actions.test.tsx`

**Interfaces:**
- Consumes: `getSession`, `noteService.getNote` (P2); `POST /api/notes/:id/favorite`, `DELETE /api/notes/:id`, `POST /api/notes/:id/restore` (P2); `rel`, `fmt` (P2); `PriorityPill`, `TagChip`, `Button`, `IconButton`, `Icon`, `Prose`, `ImageGrid`, `ImageThumb`, `Lightbox`, `DeleteConfirmBanner`, `VersionBanner`, `SectionLabel` (P1); `useToast` (A3).
- Produces:
  ```ts
  export interface DetailViewData {
    note: Note;
    shownContent: string;     // version content when ?v=<old>, else note.content
    viewingOld: boolean;
    selectedVersion: number;  // the version currently displayed
    latestVersion: number;
  }
  export function DetailClient(p: { data: DetailViewData }): JSX.Element;
  ```

**Exact layout (prototype 342–419):** container `max-w-[1120px]` with the same padding rule as the dashboard, `gap-[24px]`; back button ghost `h-[32px]` labelled `Tất cả ghi chú`; body `flex flex-wrap gap-[56px] items-start`; `article` `flex-[1_1_560px] min-w-0 max-w-[740px]`; badge row `mb-[16px] gap-[8px]`; `h1` serif `28px` mobile / `38px` desktop `600 -0.02em leading-[1.15] text-balance mb-[12px]`; description `17px/1.55 text-muted mb-[22px]`; meta row `pb-[20px] border-b border-line mb-[28px]`; attached images `mt-[40px]` with `grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-[12px]` and `aspect-[4/3]` tiles.

- [ ] **Step 1: Write `src/app/(app)/notes/[id]/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { noteService } from '@/lib/notes/service';
import { DetailClient } from '@/components/features/note-detail/detail-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: 'Ghi chú' };
  const note = await noteService.getNote(session.userId, (await params).id);
  return { title: note?.title ?? 'Ghi chú' };
}

export default async function NoteDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const note = await noteService.getNote(session.userId, id);
  if (!note) notFound();

  const rawV = (await searchParams).v;
  const wanted = typeof rawV === 'string' ? Number.parseInt(rawV, 10) : NaN;
  const latestVersion = note.versions[note.versions.length - 1]?.v ?? 1;
  const picked = note.versions.find((v) => v.v === wanted);
  const viewingOld = Boolean(picked) && wanted !== latestVersion;

  return (
    <DetailClient
      data={{
        note,
        shownContent: viewingOld && picked ? picked.content : note.content,
        viewingOld,
        selectedVersion: viewingOld && picked ? picked.v : latestVersion,
        latestVersion,
      }}
    />
  );
}
```

- [ ] **Step 2: Write `src/app/(app)/notes/[id]/loading.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="w-full max-w-[1120px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[80px] flex flex-wrap gap-[56px]">
      <div className="flex-[1_1_560px] max-w-[740px] flex flex-col gap-[16px]">
        <Skeleton className="h-[26px] w-[180px] rounded-[999px]" />
        <Skeleton className="h-[44px] w-[80%] rounded-[6px]" />
        <Skeleton className="h-[320px] rounded-[12px]" />
      </div>
      <Skeleton className="flex-[1_1_260px] max-w-[300px] h-[280px] rounded-[12px]" />
    </div>
  );
}
```

- [ ] **Step 3: Write the failing actions test**

`src/components/features/note-detail/detail-actions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailActions } from './detail-actions';

const push = vi.fn(); const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push, refresh }) }));
vi.mock('@/components/providers/toast-provider', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('DetailActions', () => {
  beforeEach(() => {
    push.mockClear(); refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ favorite: true }) }));
  });

  it('shows "Yêu thích" when not favourited and "Đã yêu thích" after toggling', async () => {
    const user = userEvent.setup();
    render(<DetailActions noteId="n1" favorite={false} disabled={false} onStartQuiz={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Yêu thích/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Yêu thích/ }));
    expect(await screen.findByRole('button', { name: /Đã yêu thích/ })).toBeInTheDocument();
  });

  it('asks for confirmation inline before deleting, and Huỷ cancels', async () => {
    const user = userEvent.setup();
    render(<DetailActions noteId="n1" favorite={false} disabled={false} onStartQuiz={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(screen.getByText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?')).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith('/api/notes/n1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('deletes and returns to the dashboard on confirm', async () => {
    const user = userEvent.setup();
    render(<DetailActions noteId="n1" favorite={false} disabled={false} onStartQuiz={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1', expect.objectContaining({ method: 'DELETE' }));
    expect(push).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npm test -- src/components/features/note-detail/detail-actions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/components/features/note-detail/detail-actions.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { DeleteConfirmBanner } from '@/components/shared/delete-confirm-banner';
import { useToast } from '@/components/providers/toast-provider';
import { noteEditPath } from '@/lib/nav/paths';

export function DetailActions({
  noteId, favorite, disabled, onStartQuiz,
}: { noteId: string; favorite: boolean; disabled: boolean; onStartQuiz: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [fav, setFav] = useState(favorite);
  const [confirming, setConfirming] = useState(false);

  async function toggleFavorite() {
    const next = !fav;
    setFav(next);
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/favorite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: next }),
    });
    if (!res.ok) setFav(!next); else router.refresh();
  }

  async function doDelete() {
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
    if (!res.ok) { toast('Không xoá được ghi chú'); return; }
    toast('Đã xoá ghi chú');
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-[6px]">
        <Button variant="secondary" onClick={toggleFavorite}>
          <Icon name="star" size={16} className={fav ? 'text-med fill-current' : 'text-muted fill-none'} />
          {fav ? 'Đã yêu thích' : 'Yêu thích'}
        </Button>
        <IconButton label="Xoá" size={36} tone="danger" onClick={() => setConfirming(true)}>
          <Icon name="trash" size={16} />
        </IconButton>
        <Button variant="secondary" onClick={onStartQuiz} disabled={disabled}>
          <Icon name="quiz" size={15} />Trắc nghiệm
        </Button>
        <Button asChild variant="ink">
          <Link href={noteEditPath(noteId)}><Icon name="edit" size={15} />Chỉnh sửa</Link>
        </Button>
      </div>
      {confirming ? <DeleteConfirmBanner onCancel={() => setConfirming(false)} onConfirm={doDelete} /> : null}
    </>
  );
}
```

> `DeleteConfirmBanner` (P1) renders the copy `Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?` with a ghost `Huỷ` button and a solid `--hi` confirm button whose accessible name is `Xoá vĩnh viễn`.

- [ ] **Step 6: Run the test and watch it pass**

Run: `npm test -- src/components/features/note-detail/detail-actions.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Implement `src/components/features/note-detail/detail-client.tsx`**

```tsx
'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { PriorityPill } from '@/components/shared/priority-pill';
import { TagChip } from '@/components/shared/tag-chip';
import { Prose } from '@/components/shared/prose';
import { ImageGrid } from '@/components/shared/image-grid';
import { ImageThumb } from '@/components/shared/image-thumb';
import { Lightbox } from '@/components/shared/lightbox';
import { VersionBanner } from '@/components/shared/version-banner';
import { SectionLabel } from '@/components/shared/section-label';
import { DetailActions } from './detail-actions';
import { DetailRail } from './detail-rail';
import { CommentsSection } from './comments-section';
import { useHighlights } from './use-highlights';
import { QuizController } from '@/components/features/quiz/quiz-controller';
import { useToast } from '@/components/providers/toast-provider';
import { buildDashboardHref, notePath } from '@/lib/nav/paths';
import { rel, fmt } from '@/lib/text/date';
import type { Note } from '@/lib/types';

export interface DetailViewData {
  note: Note;
  shownContent: string;
  viewingOld: boolean;
  selectedVersion: number;
  latestVersion: number;
}

export function DetailClient({ data }: { data: DetailViewData }) {
  const { note, shownContent, viewingOld, selectedVersion, latestVersion } = data;
  const router = useRouter();
  const { toast } = useToast();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizReviewId, setQuizReviewId] = useState<string | null>(null);

  const highlight = useHighlights({ noteId: note.id, disabled: viewingOld, content: shownContent });

  const restore = useCallback(async () => {
    const res = await fetch(`/api/notes/${encodeURIComponent(note.id)}/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: selectedVersion }),
    });
    if (!res.ok) { toast('Không khôi phục được'); return; }
    const { version } = (await res.json()) as { version: number };
    toast(`Đã khôi phục thành v${version}`);
    router.push(notePath(note.id));
    router.refresh();
  }, [note.id, router, selectedVersion, toast]);

  const lightboxItems = note.images.map((im) => ({ src: im.url, label: im.label }));
  const words = shownContent.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  return (
    <div className="w-full max-w-[1120px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[80px] flex flex-col gap-[24px]">
      <Link href={buildDashboardHref({})}
        className="self-start h-[32px] pl-[4px] pr-[10px] -ml-[4px] rounded-[8px] text-[13px] text-muted flex items-center gap-[4px] hover:text-text hover:bg-surface2">
        <Icon name="chevron-left" size={16} />Tất cả ghi chú
      </Link>

      <div className="flex flex-wrap gap-[56px] items-start">
        <article className="flex-[1_1_560px] min-w-0 max-w-[740px] flex flex-col">
          <div className="flex flex-wrap gap-[8px] items-center mb-[16px]">
            <PriorityPill priority={note.priority} />
            {note.tags.map((t) => (
              <TagChip key={t} name={t} onClick={() => router.push(buildDashboardHref({ tag: t }))} />
            ))}
          </div>

          <h1 className="m-0 mb-[12px] font-serif text-[28px] min-[820px]:text-[38px] font-semibold tracking-[-0.02em] leading-[1.15] text-balance">
            {note.title}
          </h1>
          <p className="m-0 mb-[22px] text-[17px] leading-[1.55] text-muted text-pretty">{note.desc}</p>

          <div className="flex items-center gap-[12px] flex-wrap pb-[20px] border-b border-line mb-[28px]">
            <div className="flex-1 min-w-[180px] text-[13px] text-faint">
              Cập nhật {rel(note.updatedAt)} · <span className="font-mono">v{latestVersion}</span>
            </div>
            <DetailActions noteId={note.id} favorite={note.favorite} disabled={viewingOld} onStartQuiz={() => { setQuizReviewId(null); setQuizOpen(true); }} />
          </div>

          {viewingOld ? (
            <VersionBanner
              label={`v${selectedVersion}`}
              date={`${fmt(note.versions.find((v) => v.v === selectedVersion)!.date)} · ${note.versions.find((v) => v.v === selectedVersion)!.note}`}
              onBackToCurrent={() => router.push(notePath(note.id))}
              onRestore={restore}
            />
          ) : null}

          <Prose
            html={shownContent}
            proseRef={highlight.proseRef}
            onClick={highlight.onProseClick}
            onMouseUp={highlight.onProseSelect}
            onTouchEnd={highlight.onProseSelect}
          />

          {note.images.length > 0 ? (
            <div className="mt-[40px] flex flex-col gap-[14px]">
              <SectionLabel>Hình ảnh · {note.images.length}</SectionLabel>
              <ImageGrid columns="auto-fill-160">
                {note.images.map((im, i) => (
                  <ImageThumb key={im.id} src={im.url} label={im.label} ratio="4/3" onOpen={() => setLightbox(i)} />
                ))}
              </ImageGrid>
            </div>
          ) : null}

          <CommentsSection noteId={note.id} comments={note.comments} />
        </article>

        <DetailRail
          note={note}
          selectedVersion={selectedVersion}
          latestVersion={latestVersion}
          highlights={highlight.items}
          words={words}
          onStartQuiz={() => { setQuizReviewId(null); setQuizOpen(true); }}
          onOpenQuizAttempt={(id) => { setQuizReviewId(id); setQuizOpen(true); }}
        />
      </div>

      {highlight.popup ? <highlight.Popup /> : null}
      {lightbox !== null ? (
        <Lightbox items={lightboxItems} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
      ) : null}
      {quizOpen ? (
        <QuizController
          note={{ id: note.id, title: note.title }}
          attempts={note.quizzes ?? []}
          reviewAttemptId={quizReviewId}
          onClose={() => setQuizOpen(false)}
        />
      ) : null}
    </div>
  );
}
```

> `DetailRail`, `CommentsSection`, `useHighlights` and `QuizController` arrive in Tasks A9, A10 and A13. Create them as minimal stubs now (rendering `null` / returning `{ proseRef: useRef(null), items: [], popup: null, Popup: () => null, onProseClick: () => {}, onProseSelect: () => {} }`) so this task's build passes, then fill them in.

- [ ] **Step 8: Build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/notes src/components/features/note-detail
git commit -m "feat(detail): note detail article column with actions, version banner and image grid"
```

---

### Task A9: Note detail — right rail and comments

**Files:**
- Create: `src/components/features/note-detail/detail-rail.tsx`, `src/components/features/note-detail/comments-section.tsx`
- Test: `src/components/features/note-detail/comments-section.test.tsx`

**Interfaces:**
- Consumes: `VersionTimeline`, `QuizHistoryList`, `HighlightList`, `InfoGrid`, `SectionLabel`, `Rail`, `CommentList`, `CommentComposer` (P1); `POST/DELETE /api/notes/:id/comments…` (P2); `useIsMobile` (A2); `fmt`, `rel` (P2).
- Produces:
  ```ts
  export function DetailRail(p: {
    note: Note; selectedVersion: number; latestVersion: number;
    highlights: { id: string; text: string; onRemove: () => void }[];
    words: number; onStartQuiz: () => void; onOpenQuizAttempt: (attemptId: string) => void;
  }): JSX.Element;
  export function CommentsSection(p: { noteId: string; comments: NoteComment[] }): JSX.Element;
  ```

**Rail geometry:** `flex-[1_1_260px] min-w-0 max-w-full min-[820px]:max-w-[300px] static min-[820px]:sticky min-[820px]:top-[88px] flex flex-col gap-[28px]`; every section after the first has `pt-[20px] border-t border-line`. This is CSS-only — no JS width check.

- [ ] **Step 1: Implement `src/components/features/note-detail/detail-rail.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { Rail } from '@/components/shared/rail';
import { SectionLabel } from '@/components/shared/section-label';
import { VersionTimeline } from '@/components/shared/version-timeline';
import { QuizHistoryList } from '@/components/shared/quiz-history-list';
import { HighlightList } from '@/components/shared/highlight-list';
import { InfoGrid } from '@/components/shared/info-grid';
import { notePath, noteVersionPath } from '@/lib/nav/paths';
import { fmt, rel } from '@/lib/text/date';
import type { Note } from '@/lib/types';

export function DetailRail({
  note, selectedVersion, latestVersion, highlights, words, onStartQuiz, onOpenQuizAttempt,
}: {
  note: Note; selectedVersion: number; latestVersion: number;
  highlights: { id: string; text: string; onRemove: () => void }[];
  words: number; onStartQuiz: () => void; onOpenQuizAttempt: (attemptId: string) => void;
}) {
  const router = useRouter();

  const versionItems = [...note.versions].reverse().map((v) => ({
    v: v.v,
    note: v.note,
    date: fmt(v.date),
    current: v.v === latestVersion,
    selected: v.v === selectedVersion,
    onClick: () => {
      router.push(v.v === latestVersion ? notePath(note.id) : noteVersionPath(note.id, v.v));
      window.scrollTo(0, 0);
    },
  }));

  const quizItems = (note.quizzes ?? []).map((z) => ({
    id: z.id,
    score: `${z.score}/${z.total}`,
    pct: Math.round((z.score / z.total) * 100),
    date: rel(z.date),
    onOpen: () => onOpenQuizAttempt(z.id),
  }));

  return (
    <Rail mode="sticky">
      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Lịch sử phiên bản</SectionLabel>
        <VersionTimeline items={versionItems} />
      </section>

      <section className="flex flex-col gap-[10px] pt-[20px] border-t border-line">
        <QuizHistoryList items={quizItems} onStart={onStartQuiz} />
      </section>

      <section className="flex flex-col gap-[10px] pt-[20px] border-t border-line">
        <SectionLabel>Đoạn đã đánh dấu</SectionLabel>
        {highlights.length > 0 ? (
          <HighlightList items={highlights} />
        ) : (
          <div className="text-[13px] text-muted leading-[1.5]">Bôi đen một đoạn trong nội dung để đánh dấu.</div>
        )}
      </section>

      <section className="flex flex-col gap-[10px] pt-[20px] border-t border-line">
        <SectionLabel>Thông tin</SectionLabel>
        <InfoGrid rows={[
          { label: 'Tạo', value: fmt(note.createdAt) },
          { label: 'Cập nhật', value: fmt(note.updatedAt) },
          { label: 'Số từ', value: String(words) },
          { label: 'Hình ảnh', value: String(note.images.length) },
        ]} />
      </section>
    </Rail>
  );
}
```

> `QuizHistoryList` (P1) owns the header row — the `LỊCH SỬ TRẮC NGHIỆM` label plus the accent `+ Làm bài` text button — and renders the empty copy `Chưa có lần làm bài nào. Ôn lại kiến thức bằng bộ câu hỏi tạo từ ghi chú này.` when `items` is empty.

- [ ] **Step 2: Write the failing comments test**

`src/components/features/note-detail/comments-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentsSection } from './comments-section';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const comments = [
  { id: 'c1', text: 'Lưu ý bệnh nhân cao tuổi.', date: '2026-09-24T09:00:00.000Z', author: 'Bác sĩ' },
];

describe('CommentsSection', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ id: 'c2', text: 'mới', date: new Date().toISOString(), author: 'Bác sĩ' }),
    }));
  });

  it('renders the count and the existing comments', () => {
    render(<CommentsSection noteId="n1" comments={comments} />);
    expect(screen.getByText('Bình luận')).toBeInTheDocument();
    expect(screen.getByText('Lưu ý bệnh nhân cao tuổi.')).toBeInTheDocument();
  });

  it('does not submit an empty or whitespace-only comment', async () => {
    const user = userEvent.setup();
    render(<CommentsSection noteId="n1" comments={comments} />);
    await user.type(screen.getByRole('textbox'), '   ');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits with Ctrl+Enter and clears the draft', async () => {
    const user = userEvent.setup();
    render(<CommentsSection noteId="n1" comments={comments} />);
    const box = screen.getByRole('textbox');
    await user.type(box, 'ghi chú mới');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/comments', expect.objectContaining({ method: 'POST' }));
    expect(box).toHaveValue('');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- src/components/features/note-detail/comments-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/components/features/note-detail/comments-section.tsx`**

```tsx
'use client';
import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CommentList } from '@/components/shared/comment-list';
import { CommentComposer } from '@/components/shared/comment-composer';
import { rel } from '@/lib/text/date';
import type { NoteComment } from '@/lib/types';

export function CommentsSection({ noteId, comments }: { noteId: string; comments: NoteComment[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      setDraft('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <section className="mt-[56px] pt-[28px] border-t border-line flex flex-col gap-[20px]">
      <CommentList
        count={comments.length}
        comments={comments.map((c) => ({
          id: c.id,
          author: c.author,
          initials: c.author.slice(0, 2),
          text: c.text,
          date: rel(c.date),
          onRemove: () => void remove(c.id),
        }))}
      />
      <CommentComposer value={draft} onChange={setDraft} onSubmit={() => void submit()} onKeyDown={onKeyDown} />
    </section>
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm test -- src/components/features/note-detail/comments-section.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/features/note-detail
git commit -m "feat(detail): right rail with version, quiz, highlight and info sections plus comments"
```

---
### Task A10: Highlight — range wrapping, floating popup, persistence without a version

**Files:**
- Create: `src/lib/highlight/range.ts`, `src/components/features/note-detail/use-highlights.tsx`
- Delete: `src/components/features/note-detail/use-highlights.ts` (the A8 stub)
- Test: `src/lib/highlight/range.test.ts`

**Interfaces:**
- Consumes: `PUT /api/notes/:id/highlights` (P2 — writes `content` and the last version's content, **creates no version**); `HighlightPopup` (P1).
- Produces:
  ```ts
  // src/lib/highlight/range.ts
  export function rangeIntersectsNode(range: Range, node: Node): boolean;
  export function wrapRange(range: Range, id: string): void;
  export function unwrapHl(root: ParentNode, id: string): void;
  export function collectHighlights(html: string): { id: string; text: string }[];
  export function newHighlightId(now?: number): string;   // "h" + timestamp

  // src/components/features/note-detail/use-highlights.tsx
  export function useHighlights(p: { noteId: string; disabled: boolean; content: string }): {
    proseRef: RefObject<HTMLDivElement | null>;
    items: { id: string; text: string; onRemove: () => void }[];
    popup: { mode: 'add' | 'remove'; id?: string; x: number; y: number } | null;
    Popup: () => JSX.Element | null;
    onProseClick: MouseEventHandler<HTMLDivElement>;
    onProseSelect: () => void;
  };
  ```

**Ported semantics (prototype `wrapRange` / `unwrapHl` / `hlCommit`, lines 777–789, 929–934, 1096–1109):**
- Walk every text node under the range's common ancestor; skip nodes not intersecting the range; skip nodes already inside a `mark` (so overlapping selections never nest); split at the range boundaries; wrap each surviving fragment in its own `<mark data-hl="<id>">`. One logical highlight can therefore be several `<mark>` elements sharing one id.
- Removing unwraps every `mark[data-hl="<id>"]` and calls `parent.normalize()`.
- Committing writes `proseEl.innerHTML` back through `PUT /api/notes/:id/highlights` — **no new version**.
- Popup is `position: fixed`, `transform: translate(-50%, calc(-100% - 10px))`, `x` clamped to `[90, innerWidth - 90]`, `y` floored at `56`. It closes on any `mousedown` outside `[data-hlpop]` and on any scroll (capture phase).
- Everything is disabled while an old version is displayed.

**jsdom note:** `Range.prototype.intersectsNode` is not reliably implemented, so `rangeIntersectsNode` is written with `compareBoundaryPoints`, which jsdom does implement. This is behaviour-identical to the prototype and makes the unit tests real.

- [ ] **Step 1: Write the failing range test**

`src/lib/highlight/range.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { wrapRange, unwrapHl, collectHighlights, rangeIntersectsNode } from './range';

function mount(html: string): HTMLDivElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById('root') as HTMLDivElement;
}

function selectAcross(root: HTMLElement, startSel: string, startOffset: number, endSel: string, endOffset: number): Range {
  const start = root.querySelector(startSel)!.firstChild!;
  const end = root.querySelector(endSel)!.firstChild!;
  const r = document.createRange();
  r.setStart(start, startOffset);
  r.setEnd(end, endOffset);
  return r;
}

describe('wrapRange', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('wraps a partial selection inside one text node', () => {
    const root = mount('<p>Adrenalin 0,5 mg tiêm bắp</p>');
    const t = root.querySelector('p')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 0); r.setEnd(t, 9);
    wrapRange(r, 'h1');
    expect(root.innerHTML).toBe('<p><mark data-hl="h1">Adrenalin</mark> 0,5 mg tiêm bắp</p>');
  });

  it('wraps a selection spanning two block elements as two marks with one id', () => {
    const root = mount('<p>Một hai</p><p>Ba bốn</p>');
    const r = selectAcross(root, 'p:nth-of-type(1)', 4, 'p:nth-of-type(2)', 2);
    wrapRange(r, 'h2');
    const marks = root.querySelectorAll('mark[data-hl="h2"]');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('hai');
    expect(marks[1]!.textContent).toBe('Ba');
    expect(root.textContent).toBe('Một haiBa bốn');
  });

  it('never nests a mark inside an existing mark', () => {
    const root = mount('<p>abc <mark data-hl="old">def</mark> ghi</p>');
    const p = root.querySelector('p')!;
    const r = document.createRange();
    r.setStart(p.firstChild!, 1);
    r.setEnd(p.lastChild!, 3);
    wrapRange(r, 'new');
    expect(root.querySelectorAll('mark mark')).toHaveLength(0);
    expect(root.querySelector('mark[data-hl="old"]')!.textContent).toBe('def');
    expect(root.textContent).toBe('abc def ghi');
  });

  it('leaves the document text unchanged', () => {
    const root = mount('<p>Một hai ba</p><ul><li>bốn</li><li>năm</li></ul>');
    const before = root.textContent;
    const r = selectAcross(root, 'p', 4, 'li:nth-of-type(2)', 3);
    wrapRange(r, 'h3');
    expect(root.textContent).toBe(before);
  });
});

describe('unwrapHl', () => {
  it('removes every mark with the id and merges the text back', () => {
    const root = mount('<p>Một <mark data-hl="h2">hai</mark></p><p><mark data-hl="h2">Ba</mark> bốn</p>');
    unwrapHl(root, 'h2');
    expect(root.querySelectorAll('mark')).toHaveLength(0);
    expect(root.innerHTML).toBe('<p>Một hai</p><p>Ba bốn</p>');
  });

  it('leaves other highlights alone', () => {
    const root = mount('<p><mark data-hl="a">x</mark><mark data-hl="b">y</mark></p>');
    unwrapHl(root, 'a');
    expect(root.querySelectorAll('mark')).toHaveLength(1);
    expect(root.querySelector('mark')!.dataset.hl).toBe('b');
  });
});

describe('collectHighlights', () => {
  it('joins the fragments of one highlight, in document order, collapsing whitespace', () => {
    const html = '<p>x <mark data-hl="h1">hai</mark></p><p><mark data-hl="h1">  Ba </mark></p><p><mark data-hl="h2">z</mark></p>';
    expect(collectHighlights(html)).toEqual([
      { id: 'h1', text: 'hai Ba' },
      { id: 'h2', text: 'z' },
    ]);
  });

  it('returns an empty array for content without highlights', () => {
    expect(collectHighlights('<p>plain</p>')).toEqual([]);
  });
});

describe('rangeIntersectsNode', () => {
  it('is true for a node inside the range and false for one outside', () => {
    const root = mount('<p id="a">one</p><p id="b">two</p>');
    const r = document.createRange();
    r.selectNodeContents(root.querySelector('#a')!);
    expect(rangeIntersectsNode(r, root.querySelector('#a')!.firstChild!)).toBe(true);
    expect(rangeIntersectsNode(r, root.querySelector('#b')!.firstChild!)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/lib/highlight/range.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/highlight/range.ts`**

```ts
export function newHighlightId(now: number = Date.now()): string {
  return `h${now}`;
}

/** jsdom-safe replacement for Range.intersectsNode, identical in behaviour. */
export function rangeIntersectsNode(range: Range, node: Node): boolean {
  const owner = node.ownerDocument;
  if (!owner) return false;
  const nodeRange = owner.createRange();
  try {
    nodeRange.selectNodeContents(node);
  } catch {
    return false;
  }
  // intersects  ⇔  range.start < node.end  AND  range.end > node.start
  const startsBeforeNodeEnds = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0;
  const endsAfterNodeStarts = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0;
  return startsBeforeNodeEnds && endsAfterNodeStarts;
}

export function wrapRange(range: Range, id: string): void {
  let root: Node | null = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) root = root.parentNode;
  if (!root || !(root instanceof Element) && !(root instanceof Document) && !(root instanceof DocumentFragment)) return;

  const doc = (root as Node).ownerDocument ?? document;
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    if (t.textContent && t.textContent.length && rangeIntersectsNode(range, t)) nodes.push(t);
  }

  for (const t of nodes) {
    const start = t === range.startContainer ? range.startOffset : 0;
    const end = t === range.endContainer ? range.endOffset : t.length;
    if (start >= end) continue;
    const parentEl = t.parentElement;
    if (parentEl && parentEl.closest('mark')) continue;

    let piece: Text = t;
    if (start > 0) piece = piece.splitText(start);
    if (end - start < piece.length) piece.splitText(end - start);

    const mark = doc.createElement('mark');
    mark.dataset.hl = id;
    piece.parentNode?.insertBefore(mark, piece);
    mark.appendChild(piece);
  }
}

export function unwrapHl(root: ParentNode, id: string): void {
  root.querySelectorAll(`mark[data-hl="${id}"]`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as Element).normalize();
  });
}

export function collectHighlights(html: string): { id: string; text: string }[] {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const order: string[] = [];
  const map = new Map<string, string>();
  doc.querySelectorAll('mark[data-hl]').forEach((m) => {
    const id = (m as HTMLElement).dataset.hl;
    if (!id) return;
    if (!map.has(id)) { map.set(id, ''); order.push(id); }
    const prev = map.get(id) ?? '';
    map.set(id, prev ? `${prev} ${m.textContent ?? ''}` : (m.textContent ?? ''));
  });
  return order.map((id) => ({ id, text: (map.get(id) ?? '').replace(/\s+/g, ' ').trim() }));
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/lib/highlight/range.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Implement `src/components/features/note-detail/use-highlights.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { HighlightPopup } from '@/components/shared/highlight-popup';
import { collectHighlights, newHighlightId, unwrapHl, wrapRange } from '@/lib/highlight/range';

export const HL_POPUP_EDGE_CLAMP = 90;
export const HL_POPUP_MIN_TOP = 56;

interface PopupState { mode: 'add' | 'remove'; id?: string; x: number; y: number }

export function useHighlights({ noteId, disabled, content }: { noteId: string; disabled: boolean; content: string }) {
  const router = useRouter();
  const proseRef = useRef<HTMLDivElement | null>(null);
  const pendingRange = useRef<Range | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [html, setHtml] = useState(content);

  useEffect(() => { setHtml(content); }, [content]);

  useEffect(() => {
    const onDown = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-hlpop]')) return;
      setPopup(null);
    };
    const onScroll = () => setPopup(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const commit = useCallback(async () => {
    const el = proseRef.current;
    if (!el) return;
    const next = el.innerHTML;
    setHtml(next);
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/highlights`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: next }),
    });
    if (res.ok) router.refresh();
  }, [noteId, router]);

  const add = useCallback(() => {
    const range = pendingRange.current;
    if (!range || !proseRef.current) return;
    wrapRange(range, newHighlightId());
    window.getSelection()?.removeAllRanges();
    pendingRange.current = null;
    setPopup(null);
    void commit();
  }, [commit]);

  const remove = useCallback((id: string) => {
    const el = proseRef.current;
    if (!el) return;
    unwrapHl(el, id);
    setPopup(null);
    void commit();
  }, [commit]);

  const onProseClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    const mark = target.closest?.('mark[data-hl]') as HTMLElement | null;
    const selection = window.getSelection();
    if (mark && selection?.isCollapsed) {
      const rect = mark.getBoundingClientRect();
      setPopup({ mode: 'remove', id: mark.dataset.hl, x: rect.left + rect.width / 2, y: rect.top });
    }
  }, [disabled]);

  const onProseSelect = useCallback(() => {
    if (disabled) return;
    // deferred: the browser finalises the selection after mouseup/touchend
    setTimeout(() => {
      const selection = window.getSelection();
      const el = proseRef.current;
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !el) return;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer) || !range.toString().trim()) return;
      pendingRange.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      setPopup({ mode: 'add', x: rect.left + rect.width / 2, y: rect.top });
    }, 0);
  }, [disabled]);

  const items = useMemo(
    () => collectHighlights(html).map((h) => ({ ...h, onRemove: () => remove(h.id) })),
    [html, remove],
  );

  const Popup = useCallback(() => {
    if (!popup) return null;
    const width = typeof window === 'undefined' ? 0 : window.innerWidth;
    const x = Math.max(HL_POPUP_EDGE_CLAMP, Math.min(width - HL_POPUP_EDGE_CLAMP, popup.x));
    const y = Math.max(HL_POPUP_MIN_TOP, popup.y);
    return (
      <HighlightPopup
        x={x}
        y={y}
        mode={popup.mode}
        onAction={() => (popup.mode === 'remove' && popup.id ? remove(popup.id) : add())}
      />
    );
  }, [popup, add, remove]);

  return { proseRef, items, popup, Popup, onProseClick, onProseSelect };
}
```

> `HighlightPopup` (P1) carries `data-hlpop="1"`, `onMouseDown={(e) => e.preventDefault()}` (so the selection survives), `position:fixed`, `transform: translate(-50%, calc(-100% - 10px))`, `z-[80]`, `bg-text` and a `h-[32px] px-[12px] rounded-[7px] text-bg text-[13px]/500` button whose label is `Đánh dấu` in `add` mode and `Bỏ đánh dấu` in `remove` mode, with a `12×12 rounded-[3px]` swatch (`--hl2` in add mode, transparent in remove mode).

- [ ] **Step 6: Delete the A8 stub and build**

```bash
rm -f src/components/features/note-detail/use-highlights.ts
npm run typecheck && npm run build
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/highlight src/components/features/note-detail/use-highlights.tsx
git commit -m "feat(highlight): port wrapRange/unwrapHl with clamped popup and versionless persistence"
```

---
### Task A11: Editor — canvas, toolbar and selection preservation

**Files:**
- Create: `src/components/features/editor/use-editor-commands.ts`, `src/components/features/editor/editor-canvas.tsx`
- Test: `src/components/features/editor/use-editor-commands.test.ts`

**Interfaces:**
- Consumes: `RichTextEditor`, `EditorToolbar` (P1).
- Produces:
  ```ts
  export type EditorCommand =
    | { kind: 'inline'; cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' }
    | { kind: 'block'; tag: '<h2>' | '<h3>' | '<p>' | '<blockquote>' }
    | { kind: 'list'; cmd: 'insertUnorderedList' | 'insertOrderedList' }
    | { kind: 'hr' }
    | { kind: 'history'; cmd: 'undo' | 'redo' }
    | { kind: 'image'; src: string };
  export function applyEditorCommand(doc: Document, command: EditorCommand): boolean;
  export function useEditorCommands(editorRef: RefObject<HTMLDivElement | null>): {
    run: (command: EditorCommand) => (e: ReactMouseEvent) => void;
    saveSelection: () => void;
    restoreSelection: () => void;
    insertImages: (srcs: string[]) => void;
    toolGroups: ToolGroup[];
  };
  ```

**Decision — `document.execCommand`.** `execCommand` is deprecated but is still implemented by every browser Next.js targets, and it is the only API that gives the prototype's exact behaviour (native undo stack, `formatBlock`, list toggling, `⌘/Ctrl+Z/B/I` working for free per Design Spec §08). **We keep `execCommand` for parity.** `applyEditorCommand` is the single choke point: it returns `false` when `execCommand` is absent or throws, at which point `applyFallback` performs the same mutation with the Selection/Range API. The toolbar's behaviour and the resulting HTML are identical either way, and when the browser eventually drops `execCommand` only `applyEditorCommand` changes.

**Selection preservation.** Every toolbar button uses `onMouseDown` + `e.preventDefault()` — mousedown fires before the editor loses focus, and preventing the default stops focus from moving, so the caret/selection is still live when the command runs. The image picker additionally snapshots the range (`saveSelection` on `keyup` / `mouseup` / `blur` in the editor) because the native file dialog *does* steal focus.

- [ ] **Step 1: Write the failing command test**

`src/components/features/editor/use-editor-commands.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyEditorCommand } from './use-editor-commands';

function docWithExec(exec: ((cmd: string, ui: boolean, value?: string) => boolean) | null) {
  const d = document.implementation.createHTMLDocument('t');
  if (exec) Object.defineProperty(d, 'execCommand', { value: exec, configurable: true });
  else Object.defineProperty(d, 'execCommand', { value: undefined, configurable: true });
  return d;
}

describe('applyEditorCommand', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('maps each command kind onto the right execCommand call', () => {
    const exec = vi.fn().mockReturnValue(true);
    const d = docWithExec(exec);

    applyEditorCommand(d, { kind: 'inline', cmd: 'bold' });
    applyEditorCommand(d, { kind: 'block', tag: '<h2>' });
    applyEditorCommand(d, { kind: 'list', cmd: 'insertOrderedList' });
    applyEditorCommand(d, { kind: 'hr' });
    applyEditorCommand(d, { kind: 'history', cmd: 'undo' });
    applyEditorCommand(d, { kind: 'image', src: 'https://x/y.png' });

    expect(exec.mock.calls).toEqual([
      ['bold', false, undefined],
      ['formatBlock', false, '<h2>'],
      ['insertOrderedList', false, undefined],
      ['insertHorizontalRule', false, undefined],
      ['undo', false, undefined],
      ['insertImage', false, 'https://x/y.png'],
    ]);
  });

  it('returns false and does not throw when execCommand is missing', () => {
    const d = docWithExec(null);
    expect(applyEditorCommand(d, { kind: 'inline', cmd: 'bold' })).toBe(false);
  });

  it('returns false when execCommand throws', () => {
    const d = docWithExec(() => { throw new Error('nope'); });
    expect(applyEditorCommand(d, { kind: 'hr' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/features/editor/use-editor-commands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/features/editor/use-editor-commands.ts`**

```ts
'use client';
import { useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

export type EditorCommand =
  | { kind: 'inline'; cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' }
  | { kind: 'block'; tag: '<h2>' | '<h3>' | '<p>' | '<blockquote>' }
  | { kind: 'list'; cmd: 'insertUnorderedList' | 'insertOrderedList' }
  | { kind: 'hr' }
  | { kind: 'history'; cmd: 'undo' | 'redo' }
  | { kind: 'image'; src: string };

interface NativeCall { name: string; value?: string }

function toNative(command: EditorCommand): NativeCall {
  switch (command.kind) {
    case 'inline': return { name: command.cmd };
    case 'block': return { name: 'formatBlock', value: command.tag };
    case 'list': return { name: command.cmd };
    case 'hr': return { name: 'insertHorizontalRule' };
    case 'history': return { name: command.cmd };
    case 'image': return { name: 'insertImage', value: command.src };
  }
}

/**
 * execCommand is deprecated but still universally implemented and is the only
 * API that reproduces the prototype exactly (native undo stack, formatBlock,
 * list toggling). This is the single choke point: when it is unavailable we
 * return false and the caller applies `applyFallback`, which produces the same
 * HTML through the Selection/Range API.
 */
export function applyEditorCommand(doc: Document, command: EditorCommand): boolean {
  const { name, value } = toNative(command);
  const exec = (doc as Document & { execCommand?: (c: string, ui: boolean, v?: string) => boolean }).execCommand;
  if (typeof exec !== 'function') return false;
  try {
    return exec.call(doc, name, false, value) !== false;
  } catch {
    return false;
  }
}

/** Selection/Range implementation of the same commands, used only when execCommand is gone. */
export function applyFallback(doc: Document, command: EditorCommand): void {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  const wrap = (tagName: string) => {
    const el = doc.createElement(tagName);
    el.appendChild(range.extractContents());
    range.insertNode(el);
  };

  switch (command.kind) {
    case 'inline':
      wrap({ bold: 'strong', italic: 'em', underline: 'u', strikeThrough: 's' }[command.cmd]);
      break;
    case 'block': {
      const tag = command.tag.replace(/[<>]/g, '');
      const block = (range.commonAncestorContainer as Element).parentElement?.closest('p,h2,h3,blockquote,li');
      if (block) {
        const replacement = doc.createElement(tag);
        replacement.innerHTML = block.innerHTML;
        block.replaceWith(replacement);
      } else wrap(tag);
      break;
    }
    case 'list': {
      const list = doc.createElement(command.cmd === 'insertOrderedList' ? 'ol' : 'ul');
      const li = doc.createElement('li');
      li.appendChild(range.extractContents());
      list.appendChild(li);
      range.insertNode(list);
      break;
    }
    case 'hr':
      range.insertNode(doc.createElement('hr'));
      break;
    case 'image': {
      const img = doc.createElement('img');
      img.src = command.src;
      range.insertNode(img);
      break;
    }
    case 'history':
      // No portable fallback; the browser's own Ctrl+Z still works on contentEditable.
      break;
  }
}

export interface ToolButton {
  label: string;
  title: string;
  style: 'bold' | 'italic' | 'underline' | 'strike' | 'serif' | 'plain';
  command: EditorCommand;
}
export interface ToolGroup { tools: ToolButton[] }

export const TOOL_GROUPS: ToolGroup[] = [
  { tools: [
    { label: 'B', title: 'Đậm', style: 'bold', command: { kind: 'inline', cmd: 'bold' } },
    { label: 'I', title: 'Nghiêng', style: 'italic', command: { kind: 'inline', cmd: 'italic' } },
    { label: 'U', title: 'Gạch chân', style: 'underline', command: { kind: 'inline', cmd: 'underline' } },
    { label: 'S', title: 'Gạch ngang', style: 'strike', command: { kind: 'inline', cmd: 'strikeThrough' } },
  ] },
  { tools: [
    { label: 'H2', title: 'Tiêu đề lớn', style: 'plain', command: { kind: 'block', tag: '<h2>' } },
    { label: 'H3', title: 'Tiêu đề nhỏ', style: 'plain', command: { kind: 'block', tag: '<h3>' } },
    { label: '¶', title: 'Đoạn văn', style: 'plain', command: { kind: 'block', tag: '<p>' } },
  ] },
  { tools: [
    { label: '•', title: 'Danh sách', style: 'bold', command: { kind: 'list', cmd: 'insertUnorderedList' } },
    { label: '1.', title: 'Danh sách số', style: 'plain', command: { kind: 'list', cmd: 'insertOrderedList' } },
    { label: '❝', title: 'Trích dẫn', style: 'serif', command: { kind: 'block', tag: '<blockquote>' } },
    { label: '—', title: 'Đường kẻ', style: 'plain', command: { kind: 'hr' } },
  ] },
  { tools: [
    { label: '↶', title: 'Hoàn tác', style: 'plain', command: { kind: 'history', cmd: 'undo' } },
    { label: '↷', title: 'Làm lại', style: 'plain', command: { kind: 'history', cmd: 'redo' } },
  ] },
];

export function useEditorCommands(editorRef: RefObject<HTMLDivElement | null>) {
  const savedRange = useRef<Range | null>(null);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (sel && sel.rangeCount > 0 && el && sel.anchorNode && el.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, [editorRef]);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = savedRange.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editorRef]);

  const execute = useCallback((command: EditorCommand) => {
    const el = editorRef.current;
    if (!el) return;
    if (!el.contains(document.activeElement)) restoreSelection();
    if (!applyEditorCommand(document, command)) applyFallback(document, command);
    saveSelection();
  }, [editorRef, restoreSelection, saveSelection]);

  const run = useCallback((command: EditorCommand) => (e: ReactMouseEvent) => {
    e.preventDefault();   // keeps the selection alive — the editor never loses focus
    execute(command);
  }, [execute]);

  const insertImages = useCallback((srcs: string[]) => {
    restoreSelection();
    for (const src of srcs) execute({ kind: 'image', src });
  }, [execute, restoreSelection]);

  const toolGroups = useMemo(
    () => TOOL_GROUPS.map((g) => ({
      tools: g.tools.map((t) => ({ label: t.label, title: t.title, style: t.style, onMouseDown: run(t.command) })),
    })),
    [run],
  );

  return { run, saveSelection, restoreSelection, insertImages, toolGroups };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/components/features/editor/use-editor-commands.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `src/components/features/editor/editor-canvas.tsx`**

```tsx
'use client';
import { useRef, type RefObject } from 'react';
import { RichTextEditor } from '@/components/shared/rich-text-editor';
import { EditorToolbar } from '@/components/shared/editor-toolbar';
import { useEditorCommands } from './use-editor-commands';

export function EditorCanvas({
  editorRef, initialHtml, onPickInlineImage,
}: { editorRef: RefObject<HTMLDivElement | null>; initialHtml: string; onPickInlineImage: () => void }) {
  const { toolGroups, saveSelection } = useEditorCommands(editorRef);
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="border border-line rounded-[14px] bg-surface">
      <EditorToolbar
        groups={toolGroups}
        onPickImage={(e) => { e.preventDefault(); saveSelection(); onPickInlineImage(); }}
      />
      <RichTextEditor
        editorRef={editorRef}
        initialHtml={initialHtml}
        placeholder="Bắt đầu ghi chép…"
        onSelectionChange={saveSelection}
      />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
}
```

> `RichTextEditor` (P1) sets `contentEditable`, `spellcheck={false}`, `data-prose`, `data-ph={placeholder}`, `min-h-[460px]`, `p-[20px_18px] min-[820px]:p-[32px_40px]`, and wires `onKeyUp` / `onMouseUp` / `onBlur` to `onSelectionChange`. It sets `initialHtml` **once** via the ref — never as a controlled value, or the caret jumps on every keystroke.
> `EditorToolbar` (P1) is `sticky top-[64px] z-[5]`, wraps, and renders each tool as a `min-w-[32px] h-[32px] px-[6px] rounded-[7px]` button styled by `style`.

- [ ] **Step 6: Commit**

```bash
git add src/components/features/editor
git commit -m "feat(editor): toolbar commands with execCommand parity and a Selection API fallback"
```

---

### Task A12: Editor page — panel, save and cancel

**Files:**
- Create: `src/app/(app)/notes/new/page.tsx`, `src/app/(app)/notes/[id]/edit/page.tsx`, `src/components/features/editor/editor-client.tsx`, `src/components/features/editor/editor-panel.tsx`, `src/components/features/editor/use-tag-draft.ts`
- Test: `src/components/features/editor/use-tag-draft.test.ts`, `src/components/features/editor/editor-client.test.tsx`

**Interfaces:**
- Consumes: `POST /api/notes`, `PATCH /api/notes/:id`, `POST /api/images` (P2); `noteService.getNote`, `noteService.listTags` (P2); `PrioritySegmented`, `TagInput`, `TagSuggestions`, `ImageDropzone`, `ImageGrid`, `ImageThumb`, `Input`, `Textarea`, `Button`, `SectionLabel` (P1); `useEditorCommands` (A11); `useToast` (A3); `norm` (P2).
- Produces:
  ```ts
  export interface EditorDraft {
    id: string | null; title: string; desc: string; tags: string[];
    priority: PriorityKey; images: { id: string; label: string; url: string }[];
    content: string; changeNote: string;
  }
  export function EditorClient(p: { draft: EditorDraft; nextVersion: number; allTags: string[] }): JSX.Element;
  export function useTagDraft(p: { tags: string[]; onChange: (tags: string[]) => void }): {
    value: string; setValue: (v: string) => void;
    add: (raw: string) => void; remove: (t: string) => void; removeLast: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  };
  ```

**Rules:** `Lưu vN` shows the version that *will* be created — `latestVersion + 1` for an existing note, `v1` for a new one. Cancel goes back to the detail page for an existing note and to the dashboard for a new one. On success the toast reads `Đã lưu · phiên bản v<N>` where `N` is the version the server actually created (unchanged content ⇒ the same version number, per SPEC §3).

- [ ] **Step 1: Write the failing tag-draft test**

`src/components/features/editor/use-tag-draft.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTagDraft } from './use-tag-draft';

function setup(tags: string[] = []) {
  const onChange = vi.fn();
  const { result } = renderHook(() => useTagDraft({ tags, onChange }));
  return { result, onChange };
}

describe('useTagDraft', () => {
  it('adds a tag on Enter and clears the input', () => {
    const { result, onChange } = setup();
    act(() => result.current.setValue('Cấp cứu'));
    act(() => result.current.onKeyDown({ key: 'Enter', preventDefault: () => {} } as never));
    expect(onChange).toHaveBeenCalledWith(['Cấp cứu']);
    expect(result.current.value).toBe('');
  });

  it('adds a tag when the input ends with a comma', () => {
    const { result, onChange } = setup();
    act(() => result.current.setValue('Tim mạch,'));
    expect(onChange).toHaveBeenCalledWith(['Tim mạch']);
  });

  it('strips a leading # and surrounding whitespace', () => {
    const { result, onChange } = setup();
    act(() => result.current.add('  #ECG '));
    expect(onChange).toHaveBeenCalledWith(['ECG']);
  });

  it('rejects a duplicate ignoring Vietnamese diacritics and case', () => {
    const { onChange, result } = setup(['Cấp cứu']);
    act(() => result.current.add('cap cuu'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace only when the input is empty', () => {
    const { result, onChange } = setup(['a', 'b']);
    act(() => result.current.setValue('x'));
    act(() => result.current.onKeyDown({ key: 'Backspace', preventDefault: () => {} } as never));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.setValue(''));
    act(() => result.current.onKeyDown({ key: 'Backspace', preventDefault: () => {} } as never));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('ignores an empty or whitespace-only tag', () => {
    const { result, onChange } = setup();
    act(() => result.current.add('   '));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/features/editor/use-tag-draft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/features/editor/use-tag-draft.ts`**

```ts
'use client';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { norm } from '@/lib/text/vi';

export function useTagDraft({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [value, setValueState] = useState('');

  const add = useCallback((raw: string) => {
    const t = raw.trim().replace(/^#/, '').replace(/,$/, '').trim();
    if (!t) return;
    setValueState('');
    if (tags.some((x) => norm(x) === norm(t))) return;
    onChange([...tags, t]);
  }, [onChange, tags]);

  const setValue = useCallback((v: string) => {
    if (v.endsWith(',')) { add(v); return; }
    setValueState(v);
  }, [add]);

  const remove = useCallback((t: string) => onChange(tags.filter((x) => x !== t)), [onChange, tags]);
  const removeLast = useCallback(() => { if (tags.length) onChange(tags.slice(0, -1)); }, [onChange, tags]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add(value); return; }
    if (e.key === 'Backspace' && value === '') removeLast();
  }, [add, removeLast, value]);

  return { value, setValue, add, remove, removeLast, onKeyDown };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/components/features/editor/use-tag-draft.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `src/components/features/editor/editor-panel.tsx`**

```tsx
'use client';
import { useRef, useState, type DragEvent } from 'react';
import { SectionLabel } from '@/components/shared/section-label';
import { PrioritySegmented } from '@/components/shared/priority-segmented';
import { TagInput } from '@/components/shared/tag-input';
import { TagSuggestions } from '@/components/shared/tag-suggestions';
import { ImageDropzone } from '@/components/shared/image-dropzone';
import { ImageGrid } from '@/components/shared/image-grid';
import { ImageThumb } from '@/components/shared/image-thumb';
import { Input } from '@/components/ui/input';
import { useTagDraft } from './use-tag-draft';
import { norm } from '@/lib/text/vi';
import type { PriorityKey } from '@/lib/nav/paths';

export interface EditorImage { id: string; label: string; url: string }

export function EditorPanel({
  priority, onPriorityChange,
  tags, onTagsChange, allTags,
  images, onImagesChange,
  changeNote, onChangeNoteChange,
  versionHint, uploadImages,
}: {
  priority: PriorityKey; onPriorityChange: (p: PriorityKey) => void;
  tags: string[]; onTagsChange: (t: string[]) => void; allTags: string[];
  images: EditorImage[]; onImagesChange: (i: EditorImage[]) => void;
  changeNote: string; onChangeNoteChange: (v: string) => void;
  versionHint: string; uploadImages: (files: FileList | File[]) => Promise<EditorImage[]>;
}) {
  const tagDraft = useTagDraft({ tags, onChange: onTagsChange });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const query = norm(tagDraft.value.replace(/^#/, ''));
  const suggestions = allTags
    .filter((t) => !tags.includes(t) && (!query || norm(t).includes(query)))
    .slice(0, 6)
    .map((t) => ({ name: t, onAdd: () => tagDraft.add(t) }));

  async function accept(files: FileList | File[]) {
    const uploaded = await uploadImages(files);
    if (uploaded.length) onImagesChange([...images, ...uploaded]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void accept(e.dataTransfer.files);
  }

  return (
    <aside className="flex-[1_1_280px] min-w-0 max-w-full min-[820px]:max-w-[300px] flex flex-col gap-[28px]">
      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Mức ưu tiên</SectionLabel>
        <PrioritySegmented value={priority} onChange={onPriorityChange} />
      </section>

      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Thẻ</SectionLabel>
        <TagInput
          tags={tags}
          value={tagDraft.value}
          onValueChange={tagDraft.setValue}
          onAdd={tagDraft.add}
          onRemove={tagDraft.remove}
          onRemoveLast={tagDraft.removeLast}
          onKeyDown={tagDraft.onKeyDown}
        />
        {suggestions.length > 0 ? <TagSuggestions items={suggestions} /> : null}
      </section>

      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Hình ảnh đính kèm</SectionLabel>
        {images.length > 0 ? (
          <ImageGrid columns={3}>
            {images.map((im) => (
              <ImageThumb key={im.id} src={im.url} label={im.label} ratio="1"
                onRemove={() => onImagesChange(images.filter((x) => x.id !== im.id))} />
            ))}
          </ImageGrid>
        ) : null}
        <ImageDropzone
          dragOver={dragOver}
          onPick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        />
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files) void accept(e.target.files); e.target.value = ''; }} />
      </section>

      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Ghi chú phiên bản</SectionLabel>
        <Input value={changeNote} placeholder="VD: Cập nhật liều theo ESC 2024"
          onChange={(e) => onChangeNoteChange(e.target.value)} className="h-[40px] text-[13px]" />
        <div className="text-[12px] text-faint leading-[1.5]">{versionHint}</div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 6: Write the failing editor-client test**

`src/components/features/editor/editor-client.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorClient } from './editor-client';

const push = vi.fn(); const refresh = vi.fn();
const toast = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push, refresh }) }));
vi.mock('@/components/providers/toast-provider', () => ({ useToast: () => ({ toast }) }));

const newDraft = { id: null, title: '', desc: '', tags: [], priority: 'medium' as const, images: [], content: '', changeNote: '' };
const editDraft = { ...newDraft, id: 'n1', title: 'Cũ', content: '<p>x</p>' };

describe('EditorClient', () => {
  beforeEach(() => { push.mockClear(); toast.mockClear(); vi.unstubAllGlobals(); });

  it('labels the save button with the version that will be created', () => {
    render(<EditorClient draft={newDraft} nextVersion={1} allTags={[]} />);
    expect(screen.getByRole('button', { name: 'Lưu v1' })).toBeInTheDocument();
  });

  it('POSTs a new note and toasts the version the server reports', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'n9', version: 1 }) }));
    const user = userEvent.setup();
    render(<EditorClient draft={newDraft} nextVersion={1} allTags={[]} />);
    await user.type(screen.getByPlaceholderText('Tiêu đề ghi chú'), 'Ghi chú mới');
    await user.click(screen.getByRole('button', { name: 'Lưu v1' }));
    expect(fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' }));
    expect(toast).toHaveBeenCalledWith('Đã lưu · phiên bản v1');
    expect(push).toHaveBeenCalledWith('/notes/n9');
  });

  it('PATCHes an existing note and uses the server version, not the optimistic one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'n1', version: 2, changed: true }) }));
    const user = userEvent.setup();
    render(<EditorClient draft={editDraft} nextVersion={2} allTags={[]} />);
    await user.click(screen.getByRole('button', { name: 'Lưu v2' }));
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1', expect.objectContaining({ method: 'PATCH' }));
    expect(toast).toHaveBeenCalledWith('Đã lưu · phiên bản v2');
  });

  it('cancels to the detail page for an existing note and to the dashboard for a new one', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EditorClient draft={editDraft} nextVersion={2} allTags={[]} />);
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(push).toHaveBeenCalledWith('/notes/n1');
    unmount();
    push.mockClear();
    render(<EditorClient draft={newDraft} nextVersion={1} allTags={[]} />);
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(push).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npm test -- src/components/features/editor/editor-client.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `src/components/features/editor/editor-client.tsx`**

```tsx
'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EditorCanvas } from './editor-canvas';
import { EditorPanel, type EditorImage } from './editor-panel';
import { useEditorCommands } from './use-editor-commands';
import { useToast } from '@/components/providers/toast-provider';
import { dashboardPath, notePath, type PriorityKey } from '@/lib/nav/paths';

export interface EditorDraft {
  id: string | null;
  title: string;
  desc: string;
  tags: string[];
  priority: PriorityKey;
  images: EditorImage[];
  content: string;
  changeNote: string;
}

export function EditorClient({ draft: initial, nextVersion, allTags }: { draft: EditorDraft; nextVersion: number; allTags: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inlineFileRef = useRef<HTMLInputElement | null>(null);
  const { insertImages } = useEditorCommands(editorRef);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);

  const patch = useCallback((p: Partial<EditorDraft>) => setDraft((d) => ({ ...d, ...p })), []);

  const uploadImages = useCallback(async (files: FileList | File[]): Promise<EditorImage[]> => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return [];
    const body = new FormData();
    for (const f of list) body.append('files', f);
    const res = await fetch('/api/images', { method: 'POST', body });
    if (!res.ok) { toast('Không tải được ảnh lên'); return []; }
    const { images } = (await res.json()) as { images: EditorImage[] };
    return images;
  }, [toast]);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const content = editorRef.current?.innerHTML ?? draft.content;
      const payload = {
        title: draft.title.trim() || 'Ghi chú không tiêu đề',
        desc: draft.desc,
        tags: draft.tags,
        priority: draft.priority,
        images: draft.images,
        content,
        changeNote: draft.changeNote.trim(),
      };
      const res = draft.id
        ? await fetch(`/api/notes/${encodeURIComponent(draft.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { toast('Không lưu được ghi chú'); return; }
      const { id, version } = (await res.json()) as { id: string; version: number };
      toast(`Đã lưu · phiên bản v${version}`);
      router.push(notePath(id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, draft, router, toast]);

  const cancel = useCallback(() => {
    router.push(draft.id ? notePath(draft.id) : dashboardPath());
  }, [draft.id, router]);

  const versionHint = draft.id
    ? `Nội dung thay đổi sẽ được lưu thành phiên bản v${nextVersion}; các bản cũ vẫn xem và khôi phục được.`
    : 'Ghi chú mới sẽ bắt đầu từ phiên bản v1.';

  return (
    <div className="w-full max-w-[1120px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[80px] flex flex-col gap-[20px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <Button variant="ghost" onClick={cancel}><Icon name="chevron-left" size={16} />Huỷ</Button>
        <span className="text-[13px] text-faint">{draft.id ? 'Chỉnh sửa ghi chú' : 'Ghi chú mới'}</span>
        <span className="flex-1" />
        <Button variant="primary" size="lg" loading={busy} onClick={save}>Lưu v{nextVersion}</Button>
      </div>

      <div className="flex flex-wrap gap-[40px] items-start">
        <div className="flex-[1_1_600px] min-w-0 flex flex-col gap-[14px]">
          <Input
            value={draft.title}
            placeholder="Tiêu đề ghi chú"
            onChange={(e) => patch({ title: e.target.value })}
            className="border-0 bg-transparent p-0 h-auto font-serif text-[28px] min-[820px]:text-[38px] font-semibold tracking-[-0.02em]"
          />
          <Textarea
            value={draft.desc}
            rows={2}
            placeholder="Mô tả ngắn — giúp tìm kiếm nhanh hơn"
            onChange={(e) => patch({ desc: e.target.value })}
            className="border-0 bg-transparent p-0 resize-none text-[17px] leading-[1.55] text-muted"
          />
          <EditorCanvas
            editorRef={editorRef}
            initialHtml={initial.content}
            onPickInlineImage={() => inlineFileRef.current?.click()}
          />
          <input
            ref={inlineFileRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const files = e.target.files;
              e.target.value = '';
              if (!files) return;
              const uploaded = await uploadImages(files);
              insertImages(uploaded.map((u) => u.url));
            }}
          />
        </div>

        <EditorPanel
          priority={draft.priority} onPriorityChange={(priority) => patch({ priority })}
          tags={draft.tags} onTagsChange={(tags) => patch({ tags })} allTags={allTags}
          images={draft.images} onImagesChange={(images) => patch({ images })}
          changeNote={draft.changeNote} onChangeNoteChange={(changeNote) => patch({ changeNote })}
          versionHint={versionHint}
          uploadImages={uploadImages}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the test and watch it pass**

Run: `npm test -- src/components/features/editor/editor-client.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 10: Write the two editor routes**

`src/app/(app)/notes/new/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { noteService } from '@/lib/notes/service';
import { EditorClient } from '@/components/features/editor/editor-client';

export const metadata: Metadata = { title: 'Ghi chú mới' };
export const dynamic = 'force-dynamic';

export default async function NewNotePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const tags = await noteService.listTags(session.userId);
  return (
    <EditorClient
      draft={{ id: null, title: '', desc: '', tags: [], priority: 'medium', images: [], content: '', changeNote: '' }}
      nextVersion={1}
      allTags={tags.map((t) => t.name)}
    />
  );
}
```

`src/app/(app)/notes/[id]/edit/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { noteService } from '@/lib/notes/service';
import { EditorClient } from '@/components/features/editor/editor-client';

export const metadata: Metadata = { title: 'Chỉnh sửa ghi chú' };
export const dynamic = 'force-dynamic';

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;
  const [note, tags] = await Promise.all([
    noteService.getNote(session.userId, id),
    noteService.listTags(session.userId),
  ]);
  if (!note) notFound();
  const latest = note.versions[note.versions.length - 1]?.v ?? 1;
  return (
    <EditorClient
      draft={{
        id: note.id, title: note.title, desc: note.desc, tags: [...note.tags],
        priority: note.priority, images: note.images.map((i) => ({ id: i.id, label: i.label, url: i.url })),
        content: note.content, changeNote: '',
      }}
      nextVersion={latest + 1}
      allTags={tags.map((t) => t.name)}
    />
  );
}
```

- [ ] **Step 11: Build and commit**

```bash
npm run typecheck && npm run build
git add src/app/\(app\)/notes src/components/features/editor
git commit -m "feat(editor): editor pages with priority, tags, images, version note and save flow"
```

---
### Task A13: Quiz modal flow

**Files:**
- Create: `src/components/features/quiz/quiz-reducer.ts`, `src/components/features/quiz/quiz-controller.tsx`
- Test: `src/components/features/quiz/quiz-reducer.test.ts`, `src/components/features/quiz/quiz-controller.test.tsx`

**Interfaces:**
- Consumes: `POST /api/notes/:id/quiz/generate`, `POST /api/notes/:id/quizzes` (P2); `QuizModal`, `QuizOption`, `QuizFeedback`, `QuizResult`, `Skeleton` (P1); `fmt` (P2).
- Produces:
  ```ts
  export type QuizStatus = 'loading' | 'asking' | 'done';
  export interface QuizState {
    status: QuizStatus; questions: QuizQuestion[]; i: number; picks: (number | null)[];
    source: 'ai' | 'offline' | null; review: boolean; attempt: QuizAttempt | null;
  }
  export type QuizAction =
    | { type: 'loaded'; questions: QuizQuestion[]; source: 'ai' | 'offline' }
    | { type: 'pick'; index: number }
    | { type: 'next' }
    | { type: 'finish'; attempt: QuizAttempt }
    | { type: 'openReview'; attempt: QuizAttempt }
    | { type: 'restart' };
  export const initialQuizState: QuizState;
  export function quizReducer(s: QuizState, a: QuizAction): QuizState;
  export function scoreOf(questions: QuizQuestion[], picks: (number | null)[]): number;
  export function verdictOf(pct: number): string;
  export function optionState(i: number, answer: number, pick: number | null): 'idle' | 'ok' | 'bad' | 'dim';
  export function QuizController(p: { note: { id: string; title: string }; attempts: QuizAttempt[]; reviewAttemptId: string | null; onClose: () => void }): JSX.Element;
  ```

**State machine (SPEC §3, prototype 903–928, 1019–1043):** `loading → asking → done`. One pick per question, locked after the first. Keys `1`–`4` pick, `Enter` advances. Progress `= (i + (answered ? 1 : 0)) / total * 100`, `100` when done. Verdicts: `≥80 → Nắm vững`, `≥50 → Cần ôn thêm`, else `Nên đọc lại ghi chú`. Esc closes. **Closing while loading cancels the pending result** via a monotonically increasing token — the late response is dropped and no attempt is saved. Opening a history entry enters `done` with `review: true` and records nothing.

- [ ] **Step 1: Write the failing reducer test**

`src/components/features/quiz/quiz-reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { quizReducer, initialQuizState, scoreOf, verdictOf, optionState } from './quiz-reducer';
import type { QuizQuestion, QuizAttempt } from '@/lib/types';

const qs: QuizQuestion[] = [
  { q: 'Q1', options: ['a', 'b', 'c', 'd'], answer: 0, explain: 'e1' },
  { q: 'Q2', options: ['a', 'b', 'c', 'd'], answer: 3, explain: 'e2' },
];

describe('quizReducer', () => {
  it('moves from loading to asking with an empty pick slot per question', () => {
    const s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'offline' });
    expect(s.status).toBe('asking');
    expect(s.picks).toEqual([null, null]);
    expect(s.source).toBe('offline');
  });

  it('records a pick and ignores a second pick for the same question', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'pick', index: 2 });
    expect(s.picks[0]).toBe(2);
    s = quizReducer(s, { type: 'pick', index: 0 });
    expect(s.picks[0]).toBe(2);
  });

  it('refuses to advance before the current question is answered', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'next' });
    expect(s.i).toBe(0);
    s = quizReducer(s, { type: 'pick', index: 0 });
    s = quizReducer(s, { type: 'next' });
    expect(s.i).toBe(1);
  });

  it('stays on the last question when next is pressed — the controller finishes instead', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'pick', index: 0 });
    s = quizReducer(s, { type: 'next' });
    s = quizReducer(s, { type: 'pick', index: 3 });
    const before = s.i;
    s = quizReducer(s, { type: 'next' });
    expect(s.i).toBe(before);
    expect(s.status).toBe('asking');
  });

  it('enters review mode from a stored attempt without changing picks', () => {
    const attempt: QuizAttempt = { id: 'q1', date: '2026-09-01T00:00:00.000Z', score: 1, total: 2, questions: qs, picks: [0, 1], source: 'offline' };
    const s = quizReducer(initialQuizState, { type: 'openReview', attempt });
    expect(s.status).toBe('done');
    expect(s.review).toBe(true);
    expect(s.picks).toEqual([0, 1]);
    expect(s.attempt).toBe(attempt);
  });
});

describe('scoreOf / verdictOf / optionState', () => {
  it('counts only exact matches', () => {
    expect(scoreOf(qs, [0, 3])).toBe(2);
    expect(scoreOf(qs, [0, 1])).toBe(1);
    expect(scoreOf(qs, [null, null])).toBe(0);
  });

  it('uses the spec verdict thresholds', () => {
    expect(verdictOf(100)).toBe('Nắm vững');
    expect(verdictOf(80)).toBe('Nắm vững');
    expect(verdictOf(79)).toBe('Cần ôn thêm');
    expect(verdictOf(50)).toBe('Cần ôn thêm');
    expect(verdictOf(49)).toBe('Nên đọc lại ghi chú');
  });

  it('colours the options the way the prototype does', () => {
    expect(optionState(0, 0, null)).toBe('idle');
    expect(optionState(0, 0, 2)).toBe('ok');
    expect(optionState(2, 0, 2)).toBe('bad');
    expect(optionState(3, 0, 2)).toBe('dim');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/features/quiz/quiz-reducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/features/quiz/quiz-reducer.ts`**

```ts
import type { QuizAttempt, QuizQuestion } from '@/lib/types';

export type QuizStatus = 'loading' | 'asking' | 'done';

export interface QuizState {
  status: QuizStatus;
  questions: QuizQuestion[];
  i: number;
  picks: (number | null)[];
  source: 'ai' | 'offline' | null;
  review: boolean;
  attempt: QuizAttempt | null;
}

export type QuizAction =
  | { type: 'loaded'; questions: QuizQuestion[]; source: 'ai' | 'offline' }
  | { type: 'pick'; index: number }
  | { type: 'next' }
  | { type: 'finish'; attempt: QuizAttempt }
  | { type: 'openReview'; attempt: QuizAttempt }
  | { type: 'restart' };

export const initialQuizState: QuizState = {
  status: 'loading', questions: [], i: 0, picks: [], source: null, review: false, attempt: null,
};

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'loaded':
      return { ...initialQuizState, status: 'asking', questions: action.questions, picks: action.questions.map(() => null), source: action.source };
    case 'pick': {
      if (state.status !== 'asking' || state.picks[state.i] != null) return state;
      const picks = [...state.picks];
      picks[state.i] = action.index;
      return { ...state, picks };
    }
    case 'next': {
      if (state.status !== 'asking') return state;
      if (state.picks[state.i] == null) return state;
      if (state.i >= state.questions.length - 1) return state;   // the controller calls 'finish'
      return { ...state, i: state.i + 1 };
    }
    case 'finish':
      return { ...state, status: 'done', attempt: action.attempt, review: false };
    case 'openReview':
      return {
        status: 'done', questions: action.attempt.questions, i: action.attempt.questions.length - 1,
        picks: [...action.attempt.picks], source: action.attempt.source, review: true, attempt: action.attempt,
      };
    case 'restart':
      return initialQuizState;
  }
}

export function scoreOf(questions: QuizQuestion[], picks: (number | null)[]): number {
  return questions.reduce((acc, q, i) => acc + (picks[i] === q.answer ? 1 : 0), 0);
}

export function verdictOf(pct: number): string {
  if (pct >= 80) return 'Nắm vững';
  if (pct >= 50) return 'Cần ôn thêm';
  return 'Nên đọc lại ghi chú';
}

export function optionState(index: number, answer: number, pick: number | null): 'idle' | 'ok' | 'bad' | 'dim' {
  if (pick == null) return 'idle';
  if (index === answer) return 'ok';
  if (index === pick) return 'bad';
  return 'dim';
}

export function progressOf(state: QuizState): number {
  const total = state.questions.length;
  if (state.status === 'done') return 100;
  if (total === 0) return 0;
  const answered = state.picks[state.i] != null ? 1 : 0;
  return ((state.i + answered) / total) * 100;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/components/features/quiz/quiz-reducer.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Implement `src/components/features/quiz/quiz-controller.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QuizModal } from '@/components/shared/quiz-modal';
import { QuizOption } from '@/components/shared/quiz-option';
import { QuizFeedback } from '@/components/shared/quiz-feedback';
import { QuizResult } from '@/components/shared/quiz-result';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { fmt } from '@/lib/text/date';
import {
  initialQuizState, optionState, progressOf, quizReducer, scoreOf, verdictOf,
} from './quiz-reducer';
import type { QuizAttempt } from '@/lib/types';

const KEYS = ['A', 'B', 'C', 'D'] as const;

export function QuizController({
  note, attempts, reviewAttemptId, onClose,
}: { note: { id: string; title: string }; attempts: QuizAttempt[]; reviewAttemptId: string | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(quizReducer, initialQuizState);
  const token = useRef(0);

  const generate = useCallback(async () => {
    const mine = ++token.current;
    dispatch({ type: 'restart' });
    const avoid = attempts.flatMap((a) => a.questions.map((q) => q.q)).slice(-10);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(note.id)}/quiz/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avoid }),
      });
      if (token.current !== mine) return;                       // modal was closed: drop the result
      if (!res.ok) { toast('Ghi chú chưa đủ nội dung để tạo câu hỏi'); onClose(); return; }
      const data = (await res.json()) as { questions: QuizAttempt['questions']; source: 'ai' | 'offline' };
      if (token.current !== mine) return;
      if (!data.questions.length) { toast('Ghi chú chưa đủ nội dung để tạo câu hỏi'); onClose(); return; }
      dispatch({ type: 'loaded', questions: data.questions, source: data.source });
    } catch {
      if (token.current !== mine) return;
      toast('Ghi chú chưa đủ nội dung để tạo câu hỏi');
      onClose();
    }
  }, [attempts, note.id, onClose, toast]);

  useEffect(() => {
    if (reviewAttemptId) {
      const attempt = attempts.find((a) => a.id === reviewAttemptId);
      if (attempt) { dispatch({ type: 'openReview', attempt }); return; }
    }
    void generate();
    // generate/review is chosen once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => { token.current++; onClose(); }, [onClose]);

  const finish = useCallback(async () => {
    const total = state.questions.length;
    const score = scoreOf(state.questions, state.picks);
    const body = { questions: state.questions, picks: state.picks.map((p) => p ?? -1), score, total, source: state.source ?? 'offline' };
    const res = await fetch(`/api/notes/${encodeURIComponent(note.id)}/quizzes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const attempt: QuizAttempt = res.ok
      ? ((await res.json()) as QuizAttempt)
      : { id: 'local', date: new Date().toISOString(), score, total, questions: state.questions, picks: body.picks, source: body.source };
    dispatch({ type: 'finish', attempt });
    router.refresh();
  }, [note.id, router, state.picks, state.questions, state.source]);

  const advance = useCallback(() => {
    if (state.status !== 'asking' || state.picks[state.i] == null) return;
    if (state.i >= state.questions.length - 1) void finish();
    else dispatch({ type: 'next' });
  }, [finish, state.i, state.picks, state.questions.length, state.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (state.status !== 'asking') return;
      if (/^[1-4]$/.test(e.key)) { dispatch({ type: 'pick', index: Number(e.key) - 1 }); return; }
      if (e.key === 'Enter') { e.preventDefault(); advance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, close, state.status]);

  const total = state.questions.length;
  const current = state.questions[state.i];
  const pick = state.picks[state.i] ?? null;
  const counter = state.status === 'asking' ? `${state.i + 1} / ${total}` : state.status === 'done' ? `${total} câu` : '';

  return (
    <QuizModal
      heading={state.review ? 'Kết quả trắc nghiệm' : 'Trắc nghiệm'}
      noteTitle={note.title}
      counter={counter}
      progress={progressOf(state)}
      onClose={close}
    >
      {state.status === 'loading' ? (
        <div className="flex flex-col gap-[18px] pt-[24px]">
          <div className="font-serif text-[26px] font-semibold tracking-[-0.01em]">Đang soạn câu hỏi…</div>
          <div className="text-[15px] text-muted leading-[1.6]">Bộ câu hỏi được tạo từ chính nội dung của ghi chú này.</div>
          <div className="flex flex-col gap-[10px] mt-[12px] animate-qpulse">
            <Skeleton className="h-[22px] w-[80%] rounded-[6px]" />
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[52px] rounded-[12px]" />)}
          </div>
        </div>
      ) : null}

      {state.status === 'asking' && current ? (
        <>
          <div className="flex flex-col gap-[12px]">
            <span className="font-mono text-[12px] font-medium text-accent">CÂU {state.i + 1} / {total}</span>
            <h2 className="m-0 font-serif text-[22px] min-[820px]:text-[28px] font-semibold leading-[1.35] tracking-[-0.01em] text-pretty">{current.q}</h2>
          </div>
          <div className="flex flex-col gap-[10px]">
            {current.options.map((text, k) => (
              <QuizOption
                key={k}
                optionKey={KEYS[k]!}
                text={text}
                state={optionState(k, current.answer, pick)}
                disabled={pick != null}
                onPick={() => dispatch({ type: 'pick', index: k })}
              />
            ))}
          </div>
          {pick != null ? (
            <QuizFeedback correct={pick === current.answer} answerKey={KEYS[current.answer]!} explain={current.explain} />
          ) : null}
          <div className="flex items-center justify-between gap-[12px] pt-[4px]">
            <span className="text-[12px] text-faint">Phím 1–4 để chọn · Enter để tiếp tục</span>
            <Button variant="primary" size="lg" disabled={pick == null} onClick={advance}>
              {state.i < total - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}
            </Button>
          </div>
        </>
      ) : null}

      {state.status === 'done' ? (() => {
        const score = scoreOf(state.questions, state.picks);
        const pct = total ? Math.round((score / total) * 100) : 0;
        return (
          <QuizResult
            score={score}
            total={total}
            pct={pct}
            verdict={verdictOf(pct)}
            caption={state.review ? 'Lần làm bài' : 'Hoàn thành'}
            dateLabel={state.attempt
              ? `${fmt(state.attempt.date)} · ${new Date(state.attempt.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
            onRetry={() => void generate()}
            onClose={close}
            review={state.questions.map((q, i) => {
              const picked = state.picks[i];
              const ok = picked === q.answer;
              return {
                q: `${i + 1}. ${q.q}`,
                picked: picked != null && picked >= 0 ? `${KEYS[picked]}. ${q.options[picked]}` : '—',
                correct: `${KEYS[q.answer]}. ${q.options[q.answer]}`,
                wrong: !ok,
                explain: q.explain,
                ok,
              };
            })}
          />
        );
      })() : null}
    </QuizModal>
  );
}
```

- [ ] **Step 6: Write the failing controller test (Review Focus #4)**

`src/components/features/quiz/quiz-controller.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuizController } from './quiz-controller';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const toast = vi.fn();
vi.mock('@/components/providers/toast-provider', () => ({ useToast: () => ({ toast }) }));

const questions = Array.from({ length: 2 }, (_, i) => ({
  q: `Câu ${i + 1}`, options: ['a', 'b', 'c', 'd'], answer: 0, explain: `giải thích ${i + 1}`,
}));

describe('QuizController', () => {
  beforeEach(() => { refresh.mockClear(); toast.mockClear(); vi.unstubAllGlobals(); });

  it('discards a late generate response when the modal is closed while loading', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => { resolve = r; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
    const onClose = vi.fn();
    render(<QuizController note={{ id: 'n1', title: 'T' }} attempts={[]} reviewAttemptId={null} onClose={onClose} />);
    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();

    resolve({ ok: true, json: async () => ({ questions, source: 'offline' }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Câu 1')).toBeNull();
    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();
  });

  it('locks the answer after the first pick and reveals feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ questions, source: 'offline' }) }));
    const user = userEvent.setup();
    render(<QuizController note={{ id: 'n1', title: 'T' }} attempts={[]} reviewAttemptId={null} onClose={vi.fn()} />);
    await screen.findByText('Câu 1');

    await user.keyboard('2');
    expect(await screen.findByText(/Chưa đúng — đáp án là A/)).toBeInTheDocument();
    await user.keyboard('1');
    expect(screen.getByText(/Chưa đúng — đáp án là A/)).toBeInTheDocument();
  });

  it('opens a stored attempt in review mode without POSTing a new attempt', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const attempt = { id: 'a1', date: '2026-09-01T10:00:00.000Z', score: 1, total: 2, questions, picks: [0, 1], source: 'offline' as const };
    render(<QuizController note={{ id: 'n1', title: 'T' }} attempts={[attempt]} reviewAttemptId="a1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Lần làm bài')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npm test -- src/components/features/quiz/quiz-controller.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/features/quiz
git commit -m "feat(quiz): full-screen quiz flow with cancellation token, keyboard picks and review mode"
```

---
### Task A14: Hybrid ranking, worker protocol and the IndexedDB vector cache

**Files:**
- Create: `src/lib/search/worker-protocol.ts`, `src/lib/search/ranking.ts`, `src/lib/search/vector-store.ts`
- Test: `src/lib/search/ranking.test.ts`, `src/lib/search/vector-store.test.ts`

**Interfaces:**
- Consumes: `norm` (P2); `SearchDoc` (P2).
- Produces:
  ```ts
  // worker-protocol.ts
  export const MODEL_ID = 'Xenova/multilingual-e5-small';
  export const EMBEDDING_DIM = 384;
  export const E5_QUERY_PREFIX = 'query: ';
  export const E5_PASSAGE_PREFIX = 'passage: ';
  export interface EmbedDoc { noteId: string; contentSha: string; text: string }
  export type WorkerRequest =
    | { type: 'init' }
    | { type: 'embedDocs'; batchId: number; docs: EmbedDoc[] }
    | { type: 'embedQuery'; queryId: number; text: string }
    | { type: 'dispose' };
  export type WorkerResponse =
    | { type: 'ready' }
    | { type: 'progress'; loaded: number; total: number }
    | { type: 'docsEmbedded'; batchId: number; vectors: { noteId: string; contentSha: string; vector: Float32Array }[] }
    | { type: 'queryEmbedded'; queryId: number; vector: Float32Array }
    | { type: 'error'; message: string };
  export function embedText(doc: { title: string; desc: string; tags: string[]; plain: string }): string;

  // ranking.ts
  export interface RankableNote { noteId: string; title: string; desc: string; tags: string[] }
  export interface RankedNote extends RankableNote { score: number; keyword: number; cosine: number | null }
  export const KEYWORD_WEIGHT = 0.6;
  export const VECTOR_WEIGHT = 0.4;
  export function keywordScore(query: string, note: RankableNote): number;     // 0..1
  export function cosineSimilarity(a: Float32Array, b: Float32Array): number;  // -1..1
  export function isTagQuery(query: string): boolean;
  export function hybridRank(query: string, notes: RankableNote[], vectors: Map<string, Float32Array> | null, queryVector: Float32Array | null): RankedNote[];

  // vector-store.ts
  export interface StoredVector { key: string; userId: string; noteId: string; sha: string; vector: Float32Array; updatedAt: number }
  export function vectorKey(userId: string, noteId: string): string;
  export function openVectorDb(): Promise<IDBDatabase>;
  export function getVectors(userId: string, noteIds: string[]): Promise<Map<string, StoredVector>>;
  export function putVectors(userId: string, rows: { noteId: string; sha: string; vector: Float32Array }[]): Promise<void>;
  export function pruneVectors(userId: string, keepNoteIds: string[]): Promise<void>;
  export function staleDocs(docs: SearchDoc[], cached: Map<string, StoredVector>): SearchDoc[];
  ```

**Ranking rules (SPEC §2.3):** `score = 0.6 * keywordScore + 0.4 * max(0, cosine)`. A `#` query is tag-only and **never** consults vectors. When `queryVector` or `vectors` is `null` (model not ready, or semantic search disabled) the score is the keyword score alone — the UI is identical, just less clever. `e5` models require the `query: ` / `passage: ` prefixes; omitting them silently degrades relevance, so `embedText` and the worker apply them.

- [ ] **Step 1: Write the failing ranking test (Review Focus #2)**

`src/lib/search/ranking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { keywordScore, cosineSimilarity, hybridRank, isTagQuery, KEYWORD_WEIGHT, VECTOR_WEIGHT } from './ranking';

const notes = [
  { noteId: 'n1', title: 'Xử trí cấp cứu sốc phản vệ', desc: 'Adrenalin tiêm bắp là ưu tiên số một', tags: ['Cấp cứu', 'Dị ứng'] },
  { noteId: 'n2', title: 'Đọc ECG trong 10 bước', desc: 'Trình tự hệ thống', tags: ['Tim mạch', 'ECG'] },
  { noteId: 'n3', title: 'Liều hạ sốt ở trẻ em', desc: 'Paracetamol 10–15 mg/kg', tags: ['Nhi khoa', 'Dược'] },
];

const unit = (...v: number[]) => {
  const a = new Float32Array(v);
  const len = Math.hypot(...v) || 1;
  return new Float32Array(a.map((x) => x / len));
};

describe('keywordScore', () => {
  it('is 0 for an empty query', () => {
    expect(keywordScore('', notes[0]!)).toBe(0);
    expect(keywordScore('   ', notes[0]!)).toBe(0);
  });

  it('ignores Vietnamese diacritics and case', () => {
    expect(keywordScore('SOC PHAN VE', notes[0]!)).toBeGreaterThan(0);
    expect(keywordScore('sốc phản vệ', notes[0]!)).toBe(keywordScore('soc phan ve', notes[0]!));
  });

  it('scores an exact title higher than a prefix, a prefix higher than a substring', () => {
    const exact = keywordScore('Đọc ECG trong 10 bước', notes[1]!);
    const prefix = keywordScore('Đọc ECG', notes[1]!);
    const inside = keywordScore('trong 10', notes[1]!);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
  });

  it('scores a tag hit above a description-only hit', () => {
    expect(keywordScore('Dị ứng', notes[0]!)).toBeGreaterThan(keywordScore('Adrenalin', notes[0]!));
  });

  it('never exceeds 1', () => {
    for (const n of notes) expect(keywordScore(n.title, n)).toBeLessThanOrEqual(1);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity(unit(1, 0, 0), unit(1, 0, 0))).toBeCloseTo(1, 6);
    expect(cosineSimilarity(unit(1, 0, 0), unit(0, 1, 0))).toBeCloseTo(0, 6);
  });
  it('is 0 when a vector is all zeros, instead of NaN', () => {
    expect(cosineSimilarity(new Float32Array([0, 0, 0]), unit(1, 0, 0))).toBe(0);
  });
  it('is 0 when the lengths differ', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))).toBe(0);
  });
});

describe('isTagQuery', () => {
  it('detects a leading hash after trimming', () => {
    expect(isTagQuery('#Cấp cứu')).toBe(true);
    expect(isTagQuery('  #x')).toBe(true);
    expect(isTagQuery('cấp cứu')).toBe(false);
  });
});

describe('hybridRank', () => {
  // The fake embedder: n1 is semantically near the query, n3 far away.
  const vectors = new Map([
    ['n1', unit(1, 0, 0)],
    ['n2', unit(0, 1, 0)],
    ['n3', unit(0, 0, 1)],
  ]);
  const queryVector = unit(0.9, 0.3, 0);

  it('degrades to keyword-only while the embedder is not ready, and still ranks', () => {
    const ranked = hybridRank('ECG', notes, null, null);
    expect(ranked[0]!.noteId).toBe('n2');
    expect(ranked[0]!.cosine).toBeNull();
    expect(ranked[0]!.score).toBeCloseTo(ranked[0]!.keyword, 6);
  });

  it('blends the two signals with the spec weights', () => {
    const ranked = hybridRank('phản vệ', notes, vectors, queryVector);
    const n1 = ranked.find((r) => r.noteId === 'n1')!;
    expect(n1.score).toBeCloseTo(KEYWORD_WEIGHT * n1.keyword + VECTOR_WEIGHT * Math.max(0, n1.cosine!), 6);
  });

  it('lets semantics surface a note the keyword scorer misses entirely', () => {
    const ranked = hybridRank('phản ứng dị nguyên', notes, vectors, queryVector);
    expect(ranked[0]!.noteId).toBe('n1');
    expect(ranked[0]!.keyword).toBe(0);
    expect(ranked[0]!.score).toBeGreaterThan(0);
  });

  it('skips vectors entirely for a #tag query', () => {
    const ranked = hybridRank('#ECG', notes, vectors, queryVector);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.noteId).toBe('n2');
    expect(ranked[0]!.cosine).toBeNull();
  });

  it('drops zero-scoring notes and is stable for ties', () => {
    const ranked = hybridRank('ECG', notes, null, null);
    expect(ranked.every((r) => r.score > 0)).toBe(true);
  });

  it('returns everything, unranked-but-ordered, for an empty query', () => {
    expect(hybridRank('', notes, vectors, queryVector).map((r) => r.noteId)).toEqual(['n1', 'n2', 'n3']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/lib/search/ranking.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/search/worker-protocol.ts`**

```ts
export const MODEL_ID = 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIM = 384;
export const E5_QUERY_PREFIX = 'query: ';
export const E5_PASSAGE_PREFIX = 'passage: ';
export const MAX_PLAIN_CHARS = 2000;   // ≈ 512 tokens for Vietnamese

export interface EmbedDoc { noteId: string; contentSha: string; text: string }

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'embedDocs'; batchId: number; docs: EmbedDoc[] }
  | { type: 'embedQuery'; queryId: number; text: string }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'docsEmbedded'; batchId: number; vectors: { noteId: string; contentSha: string; vector: Float32Array }[] }
  | { type: 'queryEmbedded'; queryId: number; vector: Float32Array }
  | { type: 'error'; message: string };

/** The passage text for one note: title, description, tags and the head of the plaintext body. */
export function embedText(doc: { title: string; desc: string; tags: string[]; plain: string }): string {
  const tags = doc.tags.join(', ');
  const body = doc.plain.slice(0, MAX_PLAIN_CHARS);
  return `${doc.title}. ${doc.desc}. ${tags}. ${body}`.replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Implement `src/lib/search/ranking.ts`**

```ts
import { norm } from '@/lib/text/vi';

export const KEYWORD_WEIGHT = 0.6;
export const VECTOR_WEIGHT = 0.4;

export interface RankableNote { noteId: string; title: string; desc: string; tags: string[] }
export interface RankedNote extends RankableNote { score: number; keyword: number; cosine: number | null }

export function isTagQuery(query: string): boolean {
  return query.trim().startsWith('#');
}

export function keywordScore(query: string, note: RankableNote): number {
  const q = norm(query.trim());
  if (!q) return 0;

  const title = norm(note.title);
  const desc = norm(note.desc);
  const tags = note.tags.map(norm);

  let score = 0;
  if (title === q) score = 1;
  else if (title.startsWith(q)) score = 0.9;
  else if (title.includes(q)) score = 0.75;

  if (tags.some((t) => t === q)) score = Math.max(score, 0.8);
  else if (tags.some((t) => t.includes(q))) score = Math.max(score, 0.6);

  if (desc.includes(q)) score = Math.max(score, 0.45);

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const haystack = `${title} ${desc} ${tags.join(' ')}`;
    const hits = tokens.filter((t) => haystack.includes(t)).length;
    score = Math.max(score, (hits / tokens.length) * 0.7);
  }

  return Math.min(1, score);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function hybridRank(
  query: string,
  notes: RankableNote[],
  vectors: Map<string, Float32Array> | null,
  queryVector: Float32Array | null,
): RankedNote[] {
  const trimmed = query.trim();

  if (!trimmed) {
    return notes.map((n) => ({ ...n, score: 0, keyword: 0, cosine: null }));
  }

  if (isTagQuery(trimmed)) {
    const needle = norm(trimmed.slice(1));
    return notes
      .filter((n) => n.tags.some((t) => norm(t).includes(needle)))
      .map((n) => ({ ...n, score: 1, keyword: 1, cosine: null }));
  }

  const useVectors = vectors != null && queryVector != null;

  return notes
    .map((n) => {
      const keyword = keywordScore(trimmed, n);
      const vec = useVectors ? vectors.get(n.noteId) ?? null : null;
      const cosine = vec ? cosineSimilarity(queryVector, vec) : null;
      const score = cosine == null
        ? keyword
        : KEYWORD_WEIGHT * keyword + VECTOR_WEIGHT * Math.max(0, cosine);
      return { ...n, keyword, cosine, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 5: Run the ranking test and watch it pass**

Run: `npm test -- src/lib/search/ranking.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 6: Write the failing vector-store test**

`src/lib/search/vector-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { vectorKey, staleDocs } from './vector-store';
import type { StoredVector } from './vector-store';

const docs = [
  { noteId: 'n1', title: 'a', desc: '', tags: [], contentSha: 'sha1', plain: '' },
  { noteId: 'n2', title: 'b', desc: '', tags: [], contentSha: 'sha2', plain: '' },
  { noteId: 'n3', title: 'c', desc: '', tags: [], contentSha: 'sha3', plain: '' },
];

const cached = new Map<string, StoredVector>([
  ['n1', { key: 'u1:n1', userId: 'u1', noteId: 'n1', sha: 'sha1', vector: new Float32Array(3), updatedAt: 0 }],
  ['n2', { key: 'u1:n2', userId: 'u1', noteId: 'n2', sha: 'OLD', vector: new Float32Array(3), updatedAt: 0 }],
]);

describe('vectorKey', () => {
  it('scopes the key to the user', () => {
    expect(vectorKey('u1', 'n1')).toBe('u1:n1');
    expect(vectorKey('u2', 'n1')).toBe('u2:n1');
  });
});

describe('staleDocs', () => {
  it('returns only documents whose sha changed or that are missing from the cache', () => {
    expect(staleDocs(docs, cached).map((d) => d.noteId)).toEqual(['n2', 'n3']);
  });
  it('returns everything for an empty cache', () => {
    expect(staleDocs(docs, new Map()).map((d) => d.noteId)).toEqual(['n1', 'n2', 'n3']);
  });
  it('returns nothing when every sha matches', () => {
    const full = new Map(docs.map((d) => [d.noteId, { key: `u1:${d.noteId}`, userId: 'u1', noteId: d.noteId, sha: d.contentSha, vector: new Float32Array(3), updatedAt: 0 }]));
    expect(staleDocs(docs, full)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npm test -- src/lib/search/vector-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `src/lib/search/vector-store.ts`**

```ts
import type { SearchDoc } from '@/lib/types';

export const VECTOR_DB_NAME = 'kno-notes-embeddings';
export const VECTOR_DB_VERSION = 1;
export const VECTOR_STORE = 'vectors';

export interface StoredVector {
  key: string;
  userId: string;
  noteId: string;
  sha: string;
  vector: Float32Array;
  updatedAt: number;
}

export function vectorKey(userId: string, noteId: string): string {
  return `${userId}:${noteId}`;
}

export function staleDocs(docs: SearchDoc[], cached: Map<string, StoredVector>): SearchDoc[] {
  return docs.filter((d) => cached.get(d.noteId)?.sha !== d.contentSha);
}

export function openVectorDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(VECTOR_DB_NAME, VECTOR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VECTOR_STORE)) {
        const store = db.createObjectStore(VECTOR_STORE, { keyPath: 'key' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openVectorDb();
  try {
    const tx = db.transaction(VECTOR_STORE, mode);
    const result = await fn(tx.objectStore(VECTOR_STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    return result;
  } finally {
    db.close();
  }
}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

export async function getVectors(userId: string, noteIds: string[]): Promise<Map<string, StoredVector>> {
  try {
    return await withStore('readonly', async (store) => {
      const out = new Map<string, StoredVector>();
      for (const noteId of noteIds) {
        const row = await request<StoredVector | undefined>(store.get(vectorKey(userId, noteId)));
        if (row) out.set(noteId, { ...row, vector: new Float32Array(row.vector) });
      }
      return out;
    });
  } catch {
    return new Map();   // private mode / blocked storage: behave as a cold cache
  }
}

export async function putVectors(userId: string, rows: { noteId: string; sha: string; vector: Float32Array }[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await withStore('readwrite', (store) => {
      for (const r of rows) {
        store.put({ key: vectorKey(userId, r.noteId), userId, noteId: r.noteId, sha: r.sha, vector: r.vector, updatedAt: Date.now() } satisfies StoredVector);
      }
    });
  } catch { /* best effort */ }
}

export async function pruneVectors(userId: string, keepNoteIds: string[]): Promise<void> {
  const keep = new Set(keepNoteIds);
  try {
    await withStore('readwrite', async (store) => {
      const index = store.index('userId');
      const keys = await request<IDBValidKey[]>(index.getAllKeys(IDBKeyRange.only(userId)));
      for (const key of keys) {
        const noteId = String(key).slice(`${userId}:`.length);
        if (!keep.has(noteId)) store.delete(key);
      }
    });
  } catch { /* best effort */ }
}
```

- [ ] **Step 9: Run the vector-store test and watch it pass**

Run: `npm test -- src/lib/search/vector-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Commit**

```bash
git add src/lib/search
git commit -m "feat(search): hybrid ranking, worker protocol and sha-keyed IndexedDB vector cache"
```

---

### Task A15: Embedding worker, `useSemanticSearch()` and the search suggestion panel

**Files:**
- Create: `src/workers/embedder.worker.ts`, `src/hooks/use-semantic-search.ts`, `src/components/features/search/search-container.tsx`
- Delete: the A4 `search-container.tsx` stub
- Test: `src/hooks/use-semantic-search.test.ts`, `src/components/features/search/search-container.test.tsx`

**Interfaces:**
- Consumes: `GET /api/search/index` (P2); `SearchBox`, `SearchSuggestions` (P1); `usePrefs` (A2); `useNoteFilters` (A6); `hybridRank`, `getVectors`, `putVectors`, `pruneVectors`, `staleDocs`, `embedText` (A14); `rel` (P2).
- Produces:
  ```ts
  export interface SemanticSearch {
    ready: boolean;
    docs: SearchDoc[];
    vectors: Map<string, Float32Array> | null;
    embedQuery: (text: string) => Promise<Float32Array | null>;
    warmUp: () => void;
  }
  export function useSemanticSearch(): SemanticSearch;
  export function SearchContainer(): JSX.Element;
  ```

**Non-negotiables.**
1. **Never block typing or first paint.** The worker is created lazily, from `requestIdleCallback` (falling back to `setTimeout(…, 1500)`), only after the first focus of the search box or the first idle callback on the dashboard — whichever comes first. The input is uncontrolled by the embedder; results simply improve when `ready` flips.
2. **Never download the model in CI.** When `process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH === '1'`, `useSemanticSearch()` returns `{ ready: false, vectors: null, embedQuery: async () => null, warmUp: () => {} }` and the worker is never constructed.
3. **A `#tag` query never touches the embedder** — `hybridRank` short-circuits and `embedQuery` is not called.
4. **Recompute only when `contentSha` changes** — `staleDocs()` decides, per note.
5. **Model files are cached by the Cache API**, which transformers.js uses by default when `env.useBrowserCache = true`; `env.allowLocalModels = false` keeps it from probing a local `/models` path that does not exist.

- [ ] **Step 1: Implement `src/workers/embedder.worker.ts`**

```ts
/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import {
  E5_PASSAGE_PREFIX, E5_QUERY_PREFIX, MODEL_ID,
  type WorkerRequest, type WorkerResponse,
} from '@/lib/search/worker-protocol';

env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (!loading) {
    loading = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (p: { status?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && typeof p.loaded === 'number' && typeof p.total === 'number') {
          post({ type: 'progress', loaded: p.loaded, total: p.total });
        }
      },
    }).then((p) => { extractor = p as FeatureExtractionPipeline; return extractor; });
  }
  return loading;
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  const pipe = await getExtractor();
  const output = await pipe(texts, { pooling: 'mean', normalize: true });
  const data = output.data as Float32Array;
  const dim = data.length / texts.length;
  return texts.map((_, i) => new Float32Array(data.slice(i * dim, (i + 1) * dim)));
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'init':
        await getExtractor();
        post({ type: 'ready' });
        break;
      case 'embedDocs': {
        const vectors: { noteId: string; contentSha: string; vector: Float32Array }[] = [];
        // batches of 4 keep each task short so the worker stays responsive to embedQuery
        for (let i = 0; i < msg.docs.length; i += 4) {
          const chunk = msg.docs.slice(i, i + 4);
          const out = await embed(chunk.map((d) => E5_PASSAGE_PREFIX + d.text));
          chunk.forEach((d, k) => vectors.push({ noteId: d.noteId, contentSha: d.contentSha, vector: out[k]! }));
        }
        post({ type: 'docsEmbedded', batchId: msg.batchId, vectors });
        break;
      }
      case 'embedQuery': {
        const [vector] = await embed([E5_QUERY_PREFIX + msg.text]);
        post({ type: 'queryEmbedded', queryId: msg.queryId, vector: vector! });
        break;
      }
      case 'dispose':
        extractor = null;
        loading = null;
        (self as unknown as DedicatedWorkerGlobalScope).close();
        break;
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
});
```

- [ ] **Step 2: Implement `src/hooks/use-semantic-search.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchDoc } from '@/lib/types';
import { embedText, type WorkerRequest, type WorkerResponse } from '@/lib/search/worker-protocol';
import { getVectors, putVectors, pruneVectors, staleDocs } from '@/lib/search/vector-store';

export const SEMANTIC_DISABLED = process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH === '1';

export interface SemanticSearch {
  ready: boolean;
  docs: SearchDoc[];
  vectors: Map<string, Float32Array> | null;
  embedQuery: (text: string) => Promise<Float32Array | null>;
  warmUp: () => void;
}

function onIdle(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (ric) { const id = ric(fn); return () => (window as Window & { cancelIdleCallback?: (i: number) => void }).cancelIdleCallback?.(id); }
  const id = window.setTimeout(fn, 1500);
  return () => window.clearTimeout(id);
}

export function useSemanticSearch(): SemanticSearch {
  const [docs, setDocs] = useState<SearchDoc[]>([]);
  const [vectors, setVectors] = useState<Map<string, Float32Array> | null>(null);
  const [ready, setReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const startedRef = useRef(false);
  const userIdRef = useRef<string>('');
  const pending = useRef(new Map<number, (v: Float32Array | null) => void>());
  const queryId = useRef(0);

  // The metadata index is cheap and always fetched: keyword search needs it.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/search/index')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { userId: string; items: SearchDoc[] } | null) => {
        if (cancelled || !data) return;
        userIdRef.current = data.userId;
        setDocs(data.items);
      })
      .catch(() => { /* keyword search falls back to the server-rendered list */ });
    return () => { cancelled = true; };
  }, []);

  const warmUp = useCallback(() => {
    if (SEMANTIC_DISABLED || startedRef.current || typeof window === 'undefined' || typeof Worker === 'undefined') return;
    startedRef.current = true;

    const worker = new Worker(new URL('../workers/embedder.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.addEventListener('message', async (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        setReady(true);
        const userId = userIdRef.current;
        if (!userId) return;
        const cached = await getVectors(userId, docs.map((d) => d.noteId));
        setVectors(new Map([...cached].map(([id, row]) => [id, row.vector])));
        const todo = staleDocs(docs, cached);
        if (todo.length) {
          const request: WorkerRequest = {
            type: 'embedDocs', batchId: 1,
            docs: todo.map((d) => ({ noteId: d.noteId, contentSha: d.contentSha, text: embedText(d) })),
          };
          worker.postMessage(request);
        }
        void pruneVectors(userId, docs.map((d) => d.noteId));
      }
      if (msg.type === 'docsEmbedded') {
        await putVectors(userIdRef.current, msg.vectors.map((v) => ({ noteId: v.noteId, sha: v.contentSha, vector: v.vector })));
        setVectors((prev) => {
          const next = new Map(prev ?? []);
          for (const v of msg.vectors) next.set(v.noteId, v.vector);
          return next;
        });
      }
      if (msg.type === 'queryEmbedded') {
        pending.current.get(msg.queryId)?.(msg.vector);
        pending.current.delete(msg.queryId);
      }
      if (msg.type === 'error') {
        // Semantic search is an enhancement; failure is silent and keyword search continues.
        for (const resolve of pending.current.values()) resolve(null);
        pending.current.clear();
        setReady(false);
      }
    });

    worker.postMessage({ type: 'init' } satisfies WorkerRequest);
  }, [docs]);

  // Warm up on idle once the index is loaded.
  useEffect(() => {
    if (SEMANTIC_DISABLED || docs.length === 0) return;
    return onIdle(warmUp);
  }, [docs.length, warmUp]);

  useEffect(() => () => {
    workerRef.current?.postMessage({ type: 'dispose' } satisfies WorkerRequest);
    workerRef.current?.terminate();
  }, []);

  const embedQuery = useCallback(async (text: string): Promise<Float32Array | null> => {
    const worker = workerRef.current;
    if (SEMANTIC_DISABLED || !worker || !ready || !text.trim()) return null;
    const id = ++queryId.current;
    return new Promise<Float32Array | null>((resolve) => {
      pending.current.set(id, resolve);
      worker.postMessage({ type: 'embedQuery', queryId: id, text } satisfies WorkerRequest);
      // never let a slow embedding hold the UI
      setTimeout(() => { if (pending.current.delete(id)) resolve(null); }, 1200);
    });
  }, [ready]);

  return { ready, docs, vectors, embedQuery, warmUp };
}
```

- [ ] **Step 3: Write the failing hook test**

`src/hooks/use-semantic-search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSemanticSearch, SEMANTIC_DISABLED } from './use-semantic-search';

const items = [{ noteId: 'n1', title: 'a', desc: '', tags: [], contentSha: 's1', plain: '' }];

describe('useSemanticSearch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId: 'u1', items }) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the metadata index even though the model is disabled in this environment', async () => {
    const { result } = renderHook(() => useSemanticSearch());
    await waitFor(() => expect(result.current.docs).toHaveLength(1));
    expect(fetch).toHaveBeenCalledWith('/api/search/index');
  });

  it('never constructs a Worker when semantic search is disabled', async () => {
    const WorkerSpy = vi.fn();
    vi.stubGlobal('Worker', WorkerSpy);
    const { result } = renderHook(() => useSemanticSearch());
    await waitFor(() => expect(result.current.docs).toHaveLength(1));
    act(() => result.current.warmUp());
    if (SEMANTIC_DISABLED) expect(WorkerSpy).not.toHaveBeenCalled();
  });

  it('resolves embedQuery to null while the embedder is not ready', async () => {
    const { result } = renderHook(() => useSemanticSearch());
    await expect(result.current.embedQuery('sốc')).resolves.toBeNull();
  });

  it('survives a failing index fetch without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result } = renderHook(() => useSemanticSearch());
    await waitFor(() => expect(result.current.docs).toEqual([]));
    expect(result.current.vectors).toBeNull();
  });
});
```

Add `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1` to `vitest.config.ts` so unit tests never spin the worker:

```ts
// vitest.config.ts — inside defineConfig
define: { 'process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH': JSON.stringify('1') },
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- src/hooks/use-semantic-search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `src/components/features/search/search-container.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBox } from '@/components/shared/search-box';
import { SearchSuggestions } from '@/components/shared/search-suggestions';
import { usePrefs } from '@/components/providers/prefs-provider';
import { useSemanticSearch } from '@/hooks/use-semantic-search';
import { hybridRank, isTagQuery } from '@/lib/search/ranking';
import { buildDashboardHref, notePath } from '@/lib/nav/paths';
import { norm } from '@/lib/text/vi';

export function SearchContainer() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { prefs, pushRecentSearch, clearRecentSearches } = usePrefs();
  const { docs, vectors, ready, embedQuery, warmUp } = useSemanticSearch();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [queryVector, setQueryVector] = useState<Float32Array | null>(null);

  // "/" focuses the search box unless the user is typing somewhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A tag query never consults the embedder.
  useEffect(() => {
    let cancelled = false;
    if (!ready || !value.trim() || isTagQuery(value)) { setQueryVector(null); return; }
    void embedQuery(value).then((v) => { if (!cancelled) setQueryVector(v); });
    return () => { cancelled = true; };
  }, [embedQuery, ready, value]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of docs) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  }, [docs]);

  const q = value.trim();
  const tagNeedle = norm(isTagQuery(q) ? q.slice(1) : q);

  const suggestionTags = useMemo(() => {
    const all = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
    return all
      .filter(([name]) => !tagNeedle || norm(name).includes(tagNeedle))
      .slice(0, q ? 6 : 8)
      .map(([name, count]) => ({
        name, count,
        onClick: () => { pushRecentSearch(`#${name}`); inputRef.current?.blur(); setOpen(false); setValue(''); router.push(buildDashboardHref({ tag: name })); },
      }));
  }, [pushRecentSearch, q, router, tagCounts, tagNeedle]);

  const suggestionNotes = useMemo(() => {
    const source = q
      ? hybridRank(q, docs.map((d) => ({ noteId: d.noteId, title: d.title, desc: d.desc, tags: d.tags })), vectors, queryVector)
      : docs.map((d) => ({ noteId: d.noteId, title: d.title, desc: d.desc, tags: d.tags }));
    return source.slice(0, q ? 6 : 4).map((n) => {
      const doc = docs.find((d) => d.noteId === n.noteId)!;
      return {
        id: n.noteId,
        title: n.title,
        sub: `${doc.tags.map((t) => `#${t}`).join(' ')}`,
        priority: 'medium' as const,
        onClick: () => { if (q) pushRecentSearch(q); inputRef.current?.blur(); setOpen(false); setValue(''); router.push(notePath(n.noteId)); },
      };
    });
  }, [docs, pushRecentSearch, q, queryVector, router, vectors]);

  const submit = useCallback(() => {
    if (q) pushRecentSearch(q);
    inputRef.current?.blur();
    setOpen(false);
    router.push(buildDashboardHref({ q }));
  }, [pushRecentSearch, q, router]);

  return (
    <SearchBox
      value={value}
      inputRef={inputRef}
      open={open}
      showKbdHint={!value}
      onChange={setValue}
      onClear={() => { setValue(''); inputRef.current?.focus(); }}
      onFocus={() => { setOpen(true); warmUp(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); }
      }}
    >
      {open ? (
        <SearchSuggestions
          query={q}
          recent={q ? [] : prefs.recentSearches.map((r) => ({
            label: r,
            onClick: () => { setValue(r); pushRecentSearch(r); setOpen(false); inputRef.current?.blur(); router.push(buildDashboardHref({ q: r })); },
          }))}
          onClearRecent={clearRecentSearches}
          tagsTitle={q ? 'Thẻ khớp' : 'Thẻ'}
          tags={suggestionTags}
          notesTitle={q ? 'Ghi chú khớp' : 'Mở gần đây'}
          notes={suggestionNotes}
          empty={Boolean(q) && suggestionNotes.length === 0 && suggestionTags.length === 0}
          onSubmit={submit}
        />
      ) : null}
    </SearchBox>
  );
}
```

> `SearchSuggestions` (P1) renders the section headers, the `Không có gợi ý cho “…”` empty line, and the bottom `Xem tất cả kết quả cho “…”` row with an `Enter` kbd hint. It closes on an outside click via the `z-[31]` backdrop that `SearchBox` renders when `open`.

- [ ] **Step 6: Write the failing container test**

`src/components/features/search/search-container.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchContainer } from './search-container';
import { PrefsProvider } from '@/components/providers/prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs/cookie';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push, refresh: vi.fn() }) }));

const items = [
  { noteId: 'n1', title: 'Xử trí cấp cứu sốc phản vệ', desc: 'Adrenalin', tags: ['Cấp cứu'], contentSha: 's1', plain: '' },
  { noteId: 'n2', title: 'Đọc ECG trong 10 bước', desc: 'Trình tự', tags: ['ECG'], contentSha: 's2', plain: '' },
];

function renderIt(recent: string[] = []) {
  return render(
    <PrefsProvider initial={{ ...DEFAULT_PREFS, recentSearches: recent }}>
      <SearchContainer />
    </PrefsProvider>,
  );
}

describe('SearchContainer', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId: 'u1', items }) }));
  });

  it('opens the panel on focus and shows recent searches plus tags', async () => {
    const user = userEvent.setup();
    renderIt(['sốc phản vệ']);
    await user.click(screen.getByRole('searchbox'));
    expect(await screen.findByText('Tìm gần đây')).toBeInTheDocument();
    expect(screen.getByText('sốc phản vệ')).toBeInTheDocument();
    expect(await screen.findByText('#Cấp cứu')).toBeInTheDocument();
  });

  it('focuses the box when "/" is pressed outside an input', async () => {
    const user = userEvent.setup();
    renderIt();
    document.body.focus();
    await user.keyboard('/');
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('ranks matching notes keyword-only when the embedder is not ready', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'ECG');
    await waitFor(() => expect(screen.getByText('Đọc ECG trong 10 bước')).toBeInTheDocument());
    expect(screen.queryByText('Xử trí cấp cứu sốc phản vệ')).toBeNull();
  });

  it('navigates to the dashboard on Enter and remembers the term', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'sốc{Enter}');
    expect(push).toHaveBeenCalledWith('/?q=s%E1%BB%91c');
  });

  it('closes on Escape and blurs the input', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('searchbox'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Tìm gần đây')).toBeNull());
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });
});
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npm test -- src/components/features/search/search-container.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 8: Verify the worker bundles**

Run: `npm run build`
Expected: the build emits a separate chunk for `embedder.worker.ts` and does not inline `@huggingface/transformers` into the main bundle. If Next complains about the `new URL(..., import.meta.url)` worker, add to `next.config.ts`:

```ts
const nextConfig = {
  experimental: { esmExternals: true },
  webpack: (config: { output: { workerPublicPath?: string } }) => {
    config.output.workerPublicPath = '/_next/';
    return config;
  },
};
export default nextConfig;
```

- [ ] **Step 9: Commit**

```bash
git add src/workers src/hooks/use-semantic-search.ts src/components/features/search
git commit -m "feat(search): in-browser e5 embedding worker with idle warm-up and hybrid suggestion panel"
```

---
### Task A16: PWA — manifest, generated icons, service worker, registration and install prompt

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `scripts/generate-icons.mjs`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-192.png`, `public/icons/maskable-512.png`, `public/icons/apple-touch-icon.png`
- Create: `src/components/features/pwa/register-sw.tsx`, `src/components/features/pwa/install-prompt.tsx`, `src/lib/pwa/cache-policy.ts`
- Delete: the A4 `register-sw.tsx` stub
- Test: `src/lib/pwa/cache-policy.test.ts`

**Interfaces:**
- Consumes: nothing from P1/P2.
- Produces:
  ```ts
  export type CacheStrategy = 'network-only' | 'network-first-offline-fallback' | 'stale-while-revalidate' | 'cache-first';
  export function strategyFor(input: { method: string; mode: string; url: string; origin: string }): CacheStrategy;
  export function RegisterServiceWorker(): null;
  export function InstallPrompt(): JSX.Element | null;
  ```

**Security decision (Review Focus #5).** The app shell is **not** precached. Every page under `/` is authenticated HTML; caching it would let a logged-out visitor (or a second user on the same device) read another person's notes from `caches`. Navigations are therefore **network-first with an offline fallback to the precached `/offline` page**, and `/api/*` is **network-only** with one exception: `/api/images/*` is immutable, user-scoped by path, and cache-first. Only `/_next/static/*`, the manifest, the icons and `/offline` ever enter the cache.

- [ ] **Step 1: Write the failing cache-policy test**

`src/lib/pwa/cache-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { strategyFor } from './cache-policy';

const origin = 'https://kno-notes.vercel.app';
const at = (url: string, over: Partial<{ method: string; mode: string }> = {}) =>
  strategyFor({ method: 'GET', mode: 'cors', url, origin, ...over });

describe('strategyFor', () => {
  it('never caches a navigation, but falls back to /offline', () => {
    expect(at(`${origin}/`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
    expect(at(`${origin}/notes/n1`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
  });

  it('never caches an API response', () => {
    expect(at(`${origin}/api/notes`)).toBe('network-only');
    expect(at(`${origin}/api/auth/me`)).toBe('network-only');
    expect(at(`${origin}/api/prefs`)).toBe('network-only');
  });

  it('caches immutable images aggressively', () => {
    expect(at(`${origin}/api/images/u1/img1.png`)).toBe('cache-first');
  });

  it('revalidates build assets in the background', () => {
    expect(at(`${origin}/_next/static/chunks/main.js`)).toBe('stale-while-revalidate');
    expect(at(`${origin}/icons/icon-192.png`)).toBe('stale-while-revalidate');
    expect(at(`${origin}/manifest.webmanifest`)).toBe('stale-while-revalidate');
  });

  it('leaves cross-origin and non-GET requests alone', () => {
    expect(at('https://fonts.gstatic.com/x.woff2')).toBe('network-only');
    expect(at(`${origin}/_next/static/chunks/main.js`, { method: 'POST' })).toBe('network-only');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/lib/pwa/cache-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/pwa/cache-policy.ts`**

```ts
export type CacheStrategy = 'network-only' | 'network-first-offline-fallback' | 'stale-while-revalidate' | 'cache-first';

export function strategyFor({ method, mode, url, origin }: { method: string; mode: string; url: string; origin: string }): CacheStrategy {
  if (method !== 'GET') return 'network-only';
  if (!url.startsWith(origin)) return 'network-only';

  const path = new URL(url).pathname;

  if (mode === 'navigate') return 'network-first-offline-fallback';
  if (path.startsWith('/api/images/')) return 'cache-first';
  if (path.startsWith('/api/')) return 'network-only';
  if (path.startsWith('/_next/static/') || path.startsWith('/icons/') || path === '/manifest.webmanifest') {
    return 'stale-while-revalidate';
  }
  return 'network-only';
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/lib/pwa/cache-policy.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `public/manifest.webmanifest`**

```json
{
  "name": "Kno-Notes",
  "short_name": "Kno-Notes",
  "description": "Sổ tay kiến thức cá nhân.",
  "lang": "vi",
  "dir": "ltr",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#17756b",
  "background_color": "#f6f6f3",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 6: Write `scripts/generate-icons.mjs`**

No design tool and no new dependency: Playwright's Chromium (already installed for e2e) rasterises an inline SVG.

```js
// Usage: npm run icons
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('public/icons');
const ACCENT = '#17756b';
const INK = '#ffffff';
const BG = '#f6f6f3';

/** `inset` is the maskable safe-zone padding as a fraction of the canvas. */
function svg(size, { inset, background }) {
  const pad = Math.round(size * inset);
  const box = size - pad * 2;
  const radius = Math.round(box * 0.22);
  const fontSize = Math.round(box * 0.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <rect x="${pad}" y="${pad}" width="${box}" height="${box}" rx="${radius}" fill="${ACCENT}"/>
  <text x="${size / 2}" y="${size / 2}" fill="${INK}" font-family="Georgia, 'Source Serif 4', serif"
        font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central">K</text>
</svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0, background: 'transparent' },
  { file: 'icon-512.png', size: 512, inset: 0, background: 'transparent' },
  { file: 'maskable-192.png', size: 192, inset: 0.1, background: BG },
  { file: 'maskable-512.png', size: 512, inset: 0.1, background: BG },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.06, background: BG },
];

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });
  for (const t of TARGETS) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${svg(t.size, t)}</body></html>`,
      { waitUntil: 'load' },
    );
    const buffer = await page.screenshot({ omitBackground: t.background === 'transparent', type: 'png' });
    await writeFile(path.join(OUT, t.file), buffer);
    await page.close();
    console.log(`wrote public/icons/${t.file}`);
  }
} finally {
  await browser.close();
}
```

Run: `npm run icons`
Expected: five PNGs in `public/icons/`.

- [ ] **Step 7: Write `public/sw.js`**

```js
/* Kno-Notes service worker.
 * SECURITY: authenticated HTML and /api/* responses are NEVER stored.
 * Only build assets, icons, the manifest and /offline enter the cache. */
const VERSION = 'kn-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const IMAGE_CACHE = `${VERSION}-images`;
const OFFLINE_URL = '/offline';

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function strategyFor(request) {
  if (request.method !== 'GET') return 'network-only';
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return 'network-only';
  if (request.mode === 'navigate') return 'network-first-offline-fallback';
  if (url.pathname.startsWith('/api/images/')) return 'cache-first';
  if (url.pathname.startsWith('/api/')) return 'network-only';
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    return 'stale-while-revalidate';
  }
  return 'network-only';
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => { if (response.ok) cache.put(request, response.clone()); return response; })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function navigateWithFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === 'network-only') return;                      // let the browser handle it
  if (strategy === 'stale-while-revalidate') { event.respondWith(staleWhileRevalidate(event.request)); return; }
  if (strategy === 'cache-first') { event.respondWith(cacheFirst(event.request)); return; }
  event.respondWith(navigateWithFallback(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
```

> `strategyFor` is duplicated here on purpose: `public/sw.js` is served raw and cannot import from `src/`. `src/lib/pwa/cache-policy.ts` is the tested specification; any change must be made in both, and the e2e test in Task A22 asserts the real worker's behaviour.

- [ ] **Step 8: Implement `src/components/features/pwa/register-sw.tsx`**

```tsx
'use client';
import { useEffect } from 'react';

export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;          // never intercept dev HMR
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* PWA is optional */ });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
```

- [ ] **Step 9: Implement `src/components/features/pwa/install-prompt.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'kn-install-dismissed';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* blocked storage */ }
    if (dismissed) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!deferred) return null;

  return (
    <div
      role="dialog"
      aria-label="Cài đặt ứng dụng"
      className="fixed left-[16px] right-[16px] bottom-[16px] z-[70] mx-auto max-w-[420px] flex items-center gap-[12px] p-[14px_16px] rounded-[12px] border border-line bg-surface shadow-elevated"
    >
      <Icon name="download" size={18} className="text-accent shrink-0" />
      <span className="flex-1 text-[13px] leading-[1.5]">Cài Kno-Notes lên máy để mở nhanh và dùng ngoại tuyến.</span>
      <Button variant="ghost" onClick={() => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
        setDeferred(null);
      }}>Để sau</Button>
      <Button variant="primary" onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}>Cài đặt</Button>
    </div>
  );
}
```

Mount it inside `src/app/(app)/layout.tsx`, after `<ShellClient>`'s children, so it never appears on `/login` or `/offline`.

- [ ] **Step 10: Build and verify the manifest is reachable**

```bash
npm run build && npm start &
sleep 5
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3000/manifest.webmanifest
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/sw.js
kill %1
```
Expected: `200 application/manifest+json` and `200`.

- [ ] **Step 11: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icons scripts/generate-icons.mjs src/lib/pwa src/components/features/pwa
git commit -m "feat(pwa): manifest, generated icons, privacy-safe service worker and install prompt"
```

---

### Task A17: API keys settings page

**Files:**
- Create: `src/app/(app)/settings/api-keys/page.tsx`, `src/components/features/api-keys/api-keys-client.tsx`, `src/components/features/api-keys/mcp-snippet.tsx`
- Test: `src/components/features/api-keys/api-keys-client.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/api-keys`, `DELETE /api/api-keys/:id` (P2); `Button`, `Input`, `IconButton`, `Icon`, `SectionLabel`, `EmptyState` (P1); `useToast` (A3); `fmt` (P2).
- Produces: nothing other plans depend on.

**Rules:** the secret is returned once by `POST` and shown in a highlighted panel with a copy button and the warning `Chỉ hiển thị một lần. Lưu lại trước khi rời trang.`. Revoking asks inline (same pattern as note delete). The page also shows a ready-to-paste MCP wiring snippet for Claude Code and Codex.

- [ ] **Step 1: Write the page**

`src/app/(app)/settings/api-keys/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { ApiKeysClient } from '@/components/features/api-keys/api-keys-client';

export const metadata: Metadata = { title: 'API key' };
export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return <ApiKeysClient baseUrl={`${proto}://${host}`} />;
}
```

- [ ] **Step 2: Write the failing client test**

`src/components/features/api-keys/api-keys-client.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeysClient } from './api-keys-client';

vi.mock('@/components/providers/toast-provider', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const listBody = { items: [{ id: 'k1', name: 'Claude Code', prefix: 'kn_live_ab12', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null }] };

describe('ApiKeysClient', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('lists existing keys by prefix and never shows a full token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => listBody }));
    render(<ApiKeysClient baseUrl="http://localhost:3000" />);
    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText(/kn_live_ab12/)).toBeInTheDocument();
  });

  it('shows the secret exactly once after creating a key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'k2', name: 'Codex', prefix: 'kn_live_cd34', token: 'kn_live_cd34_SECRET' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => listBody });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ApiKeysClient baseUrl="http://localhost:3000" />);

    await user.type(await screen.findByPlaceholderText('Tên key, VD: Claude Code'), 'Codex');
    await user.click(screen.getByRole('button', { name: 'Tạo key' }));

    expect(await screen.findByText('kn_live_cd34_SECRET')).toBeInTheDocument();
    expect(screen.getByText('Chỉ hiển thị một lần. Lưu lại trước khi rời trang.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đã lưu' }));
    await waitFor(() => expect(screen.queryByText('kn_live_cd34_SECRET')).toBeNull());
  });

  it('asks before revoking and only deletes on confirm', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => listBody })
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ApiKeysClient baseUrl="http://localhost:3000" />);

    await user.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    expect(screen.getByText('Thu hồi key này? Các ứng dụng đang dùng sẽ mất quyền truy cập.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Thu hồi' }));
    await user.click(screen.getByRole('button', { name: 'Thu hồi vĩnh viễn' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/api-keys/k1', expect.objectContaining({ method: 'DELETE' }));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- src/components/features/api-keys/api-keys-client.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/components/features/api-keys/api-keys-client.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/shared/section-label';
import { EmptyState } from '@/components/shared/empty-state';
import { McpSnippet } from './mcp-snippet';
import { useToast } from '@/components/providers/toast-provider';
import { fmt } from '@/lib/text/date';

interface ApiKeyRow { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

export function ApiKeysClient({ baseUrl }: { baseUrl: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/api-keys');
    if (!res.ok) return;
    const data = (await res.json()) as { items: ApiKeyRow[] };
    setRows(data.items);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) { toast('Không tạo được key'); return; }
      const created = (await res.json()) as { token: string };
      setSecret(created.token);
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setConfirming(null);
    if (!res.ok) { toast('Không thu hồi được key'); return; }
    toast('Đã thu hồi key');
    await load();
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('Đã sao chép'); }
    catch { toast('Không sao chép được'); }
  }

  return (
    <div className="w-full max-w-[1120px] mx-auto px-[16px] min-[820px]:px-[40px] pt-[20px] min-[820px]:pt-[36px] pb-[80px] flex flex-col gap-[28px]">
      <div className="flex flex-col gap-[6px]">
        <h1 className="m-0 font-serif text-[26px] min-[820px]:text-[32px] font-semibold tracking-[-0.02em] leading-[1.15]">API key</h1>
        <p className="m-0 text-[14px] text-muted leading-[1.5]">
          Dùng để Claude Code hoặc Codex đọc và soạn ghi chú qua REST API và MCP.
        </p>
      </div>

      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Tạo key mới</SectionLabel>
        <div className="flex gap-[8px] flex-wrap">
          <Input value={name} placeholder="Tên key, VD: Claude Code" className="flex-1 min-w-[220px]"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} />
          <Button variant="primary" loading={busy} onClick={() => void create()}>Tạo key</Button>
        </div>

        {secret ? (
          <div className="flex flex-col gap-[8px] p-[14px_16px] rounded-[12px] bg-accent-soft">
            <div className="flex items-center gap-[10px]">
              <code className="flex-1 min-w-0 break-all font-mono text-[13px] text-text">{secret}</code>
              <Button variant="secondary" onClick={() => void copy(secret)}><Icon name="copy" size={15} />Sao chép</Button>
              <Button variant="ghost" onClick={() => setSecret(null)}>Đã lưu</Button>
            </div>
            <span className="text-[12px] text-muted">Chỉ hiển thị một lần. Lưu lại trước khi rời trang.</span>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-[10px]">
        <SectionLabel>Key đang hoạt động</SectionLabel>
        {rows.length === 0 ? (
          <EmptyState title="Chưa có key nào" description="Tạo key đầu tiên để kết nối trợ lý AI." />
        ) : (
          <div className="flex flex-col border border-line rounded-[14px] bg-surface overflow-hidden">
            {rows.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-[16px] p-[16px_18px] flex-wrap ${i ? 'border-t border-line' : ''}`}>
                <div className="flex-1 min-w-[180px] flex flex-col gap-[3px]">
                  <span className="text-[14px] font-medium">{r.name}</span>
                  <span className="font-mono text-[12px] text-faint">{r.prefix}… · tạo {fmt(r.createdAt)} · {r.lastUsedAt ? `dùng ${fmt(r.lastUsedAt)}` : 'chưa dùng'}</span>
                </div>
                <Button variant="ghost" onClick={() => setConfirming(r.id)}>Thu hồi</Button>
                {confirming === r.id ? (
                  <div className="basis-full flex items-center gap-[12px] flex-wrap p-[14px_16px] rounded-[12px] bg-hi-soft text-hi text-[14px]">
                    <span className="flex-1">Thu hồi key này? Các ứng dụng đang dùng sẽ mất quyền truy cập.</span>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>Huỷ</Button>
                    <Button variant="danger" onClick={() => void revoke(r.id)}>Thu hồi vĩnh viễn</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <McpSnippet baseUrl={baseUrl} onCopy={copy} />
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/components/features/api-keys/mcp-snippet.tsx`**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/shared/section-label';

export function McpSnippet({ baseUrl, onCopy }: { baseUrl: string; onCopy: (text: string) => Promise<void> }) {
  const claudeCli = `claude mcp add --transport http kno-notes ${baseUrl}/api/mcp --header "Authorization: Bearer <API_KEY>"`;

  const codexToml = `[mcp_servers.kno-notes]
url = "${baseUrl}/api/mcp"
http_headers = { Authorization = "Bearer <API_KEY>" }`;

  const rest = `curl -s "${baseUrl}/api/v1/notes?page=1" \\
  -H "Authorization: Bearer <API_KEY>"`;

  const blocks = [
    { label: 'Claude Code (MCP)', code: claudeCli, hint: 'Chạy trong thư mục dự án; thay <API_KEY> bằng key vừa tạo.' },
    { label: 'Codex (~/.codex/config.toml)', code: codexToml, hint: 'Thêm vào cuối file cấu hình rồi khởi động lại Codex.' },
    { label: 'REST', code: rest, hint: 'Mọi endpoint /api/v1/* dùng cùng bearer token.' },
  ];

  return (
    <section className="flex flex-col gap-[14px]">
      <SectionLabel>Kết nối trợ lý AI</SectionLabel>
      {blocks.map((b) => (
        <div key={b.label} className="flex flex-col gap-[6px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[13px] font-medium">{b.label}</span>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => void onCopy(b.code)}><Icon name="copy" size={14} />Sao chép</Button>
          </div>
          <pre className="m-0 p-[12px_14px] rounded-[10px] border border-line bg-surface2 overflow-x-auto font-mono text-[12px] leading-[1.6]">{b.code}</pre>
          <span className="text-[12px] text-faint">{b.hint}</span>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npm test -- src/components/features/api-keys/api-keys-client.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/settings src/components/features/api-keys
git commit -m "feat(settings): API key management with one-time secret reveal and MCP wiring snippets"
```

---

### Task A18: Accessibility and the global keyboard map

**Files:**
- Create: `src/hooks/use-keyboard-shortcuts.ts`, `src/components/features/shell/keyboard-layer.tsx`
- Modify: `src/components/features/shell/shell-client.tsx` (mount `KeyboardLayer`)
- Test: `src/hooks/use-keyboard-shortcuts.test.ts`

**Interfaces:**
- Consumes: `useRouter` (Next); shell state.
- Produces:
  ```ts
  export interface ShortcutContext { inEditableField: boolean; quizOpen: boolean; lightboxOpen: boolean }
  export type ShortcutAction =
    | 'focus-search' | 'close-overlays' | 'lightbox-prev' | 'lightbox-next'
    | 'quiz-pick-1' | 'quiz-pick-2' | 'quiz-pick-3' | 'quiz-pick-4' | 'quiz-advance' | 'none';
  export function resolveShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>, ctx: ShortcutContext): ShortcutAction;
  export function useKeyboardShortcuts(handlers: Partial<Record<ShortcutAction, () => void>>, ctx: ShortcutContext): void;
  ```

**The table (Design Spec §08):**

| Key | Action | Notes |
|---|---|---|
| `/` | Focus the search box | Suppressed inside an input, textarea or `contentEditable` |
| `Enter` (in search) | Show all results + record the term | Owned by `SearchContainer` |
| `Esc` | Close suggestions, settings popover, sort menu, drawer, lightbox, quiz | Innermost first |
| `←` `→` | Previous / next image in the lightbox | Only while the lightbox is open |
| `1`–`4` | Pick answer A–D | Only while the quiz is `asking` |
| `Enter` (in quiz) | Next question / show result | Only while the quiz is `asking` |
| `⌘/Ctrl + Enter` | Send a comment | Owned by `CommentComposer` |
| `Enter` or `,` | Add a tag | Owned by `TagInput` |
| `Backspace` | Delete the last tag when the field is empty | Owned by `TagInput` |
| `⌘/Ctrl + Z / B / I` | Undo, bold, italic in the editor | Browser default on `contentEditable` — do not intercept |

**ARIA requirements handed to P1 (verify at review, do not re-implement):**
- `Select` (sort): trigger `role="combobox" aria-expanded aria-controls aria-haspopup="listbox"`; menu `role="listbox"`; items `role="option" aria-selected`; `↑`/`↓`/`Home`/`End`/`Esc`/`Enter` handled; focus returns to the trigger on close.
- `Segmented` (theme, priority): `role="radiogroup"` with `role="radio" aria-checked` items and arrow-key roving tabindex.
- `ViewToggle`: two `aria-pressed` toggle buttons inside a `role="group" aria-label="Chế độ hiển thị"`.
- `QuizModal`: `role="dialog" aria-modal="true"`, focus trapped, focus restored to the invoking button on close, `aria-label` = the heading.
- `Lightbox`: `role="dialog" aria-modal="true"` with `aria-label` = the image label.
- `SearchSuggestions`: the input is `role="combobox" aria-expanded aria-controls` and the panel is `role="listbox"`; note rows are `role="option"`.
- `ToastViewport`: `role="status" aria-live="polite"`.
- Every icon-only button has a visible-on-focus ring and an accessible name (`aria-label` or `Tooltip` label).
- Focus ring: `outline: 2px solid var(--accent); outline-offset: 2px` applied through `:focus-visible` on the token layer, so it follows the accent token in both themes.

- [ ] **Step 1: Write the failing shortcut test**

`src/hooks/use-keyboard-shortcuts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveShortcut } from './use-keyboard-shortcuts';

const ctx = { inEditableField: false, quizOpen: false, lightboxOpen: false };
const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, ...mods });

describe('resolveShortcut', () => {
  it('focuses search on "/" outside an editable field', () => {
    expect(resolveShortcut(key('/'), ctx)).toBe('focus-search');
  });

  it('does nothing on "/" inside an editable field', () => {
    expect(resolveShortcut(key('/'), { ...ctx, inEditableField: true })).toBe('none');
  });

  it('always closes overlays on Escape, even inside a field', () => {
    expect(resolveShortcut(key('Escape'), ctx)).toBe('close-overlays');
    expect(resolveShortcut(key('Escape'), { ...ctx, inEditableField: true })).toBe('close-overlays');
  });

  it('maps arrows to the lightbox only while it is open', () => {
    expect(resolveShortcut(key('ArrowLeft'), ctx)).toBe('none');
    expect(resolveShortcut(key('ArrowLeft'), { ...ctx, lightboxOpen: true })).toBe('lightbox-prev');
    expect(resolveShortcut(key('ArrowRight'), { ...ctx, lightboxOpen: true })).toBe('lightbox-next');
  });

  it('maps 1-4 and Enter only while the quiz is open', () => {
    expect(resolveShortcut(key('2'), ctx)).toBe('none');
    expect(resolveShortcut(key('2'), { ...ctx, quizOpen: true })).toBe('quiz-pick-2');
    expect(resolveShortcut(key('Enter'), { ...ctx, quizOpen: true })).toBe('quiz-advance');
    expect(resolveShortcut(key('5'), { ...ctx, quizOpen: true })).toBe('none');
  });

  it('never steals the editor shortcuts', () => {
    expect(resolveShortcut(key('b', { metaKey: true }), { ...ctx, inEditableField: true })).toBe('none');
    expect(resolveShortcut(key('z', { ctrlKey: true }), { ...ctx, inEditableField: true })).toBe('none');
    expect(resolveShortcut(key('Enter', { metaKey: true }), { ...ctx, inEditableField: true })).toBe('none');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/hooks/use-keyboard-shortcuts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/use-keyboard-shortcuts.ts`**

```ts
'use client';
import { useEffect } from 'react';

export interface ShortcutContext { inEditableField: boolean; quizOpen: boolean; lightboxOpen: boolean }

export type ShortcutAction =
  | 'focus-search' | 'close-overlays' | 'lightbox-prev' | 'lightbox-next'
  | 'quiz-pick-1' | 'quiz-pick-2' | 'quiz-pick-3' | 'quiz-pick-4' | 'quiz-advance' | 'none';

export function resolveShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>,
  ctx: ShortcutContext,
): ShortcutAction {
  if (e.key === 'Escape') return 'close-overlays';
  if (e.metaKey || e.ctrlKey) return 'none';          // reserved for the browser and the editor

  if (ctx.quizOpen) {
    if (/^[1-4]$/.test(e.key)) return `quiz-pick-${e.key}` as ShortcutAction;
    if (e.key === 'Enter') return 'quiz-advance';
    return 'none';
  }
  if (ctx.lightboxOpen) {
    if (e.key === 'ArrowLeft') return 'lightbox-prev';
    if (e.key === 'ArrowRight') return 'lightbox-next';
    return 'none';
  }
  if (e.key === '/' && !ctx.inEditableField) return 'focus-search';
  return 'none';
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
}

export function useKeyboardShortcuts(
  handlers: Partial<Record<ShortcutAction, () => void>>,
  ctx: ShortcutContext,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const context = { ...ctx, inEditableField: ctx.inEditableField || isEditableTarget(e.target) };
      const action = resolveShortcut(e, context);
      const handler = handlers[action];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, handlers]);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- src/hooks/use-keyboard-shortcuts.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `src/components/features/shell/keyboard-layer.tsx` and mount it**

```tsx
'use client';
import { useMemo } from 'react';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

export function KeyboardLayer({ onCloseOverlays }: { onCloseOverlays: () => void }) {
  const handlers = useMemo(() => ({ 'close-overlays': onCloseOverlays }), [onCloseOverlays]);
  useKeyboardShortcuts(handlers, { inEditableField: false, quizOpen: false, lightboxOpen: false });
  return null;
}
```

In `shell-client.tsx`, render `<KeyboardLayer onCloseOverlays={() => { setDrawerOpen(false); setSettingsOpen(false); }} />` next to `<AppShell>`. `/` is already handled inside `SearchContainer`, the quiz keys inside `QuizController`, and the lightbox arrows inside P1's `Lightbox` — this layer only closes the shell's own overlays.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-keyboard-shortcuts.ts src/hooks/use-keyboard-shortcuts.test.ts src/components/features/shell
git commit -m "feat(a11y): global shortcut resolver and overlay close layer"
```

---
### Task A19: Playwright harness — config, real local test DB, filesystem storage reset, auth fixture

**Files:**
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/fixtures/test.ts`, `e2e/fixtures/seed.ts`, `.env.test`, `e2e/smoke.spec.ts`
- Modify: `package.json` (add `test:e2e:setup`)

**Interfaces:**
- Consumes: `npm run db:migrate`, `npm run db:seed:test` (P2); `DATA_DIR` filesystem storage adapter (P2).
- Produces:
  ```ts
  // e2e/fixtures/test.ts
  export const test: TestType<{ }, { }>;   // Playwright test, extended with `page` already signed in
  export { expect } from '@playwright/test';
  export const TEST_USER = { username: 'bacsi', password: '123456', displayName: 'Bác sĩ' };
  export const STORAGE_STATE = 'e2e/.auth/user.json';
  ```

**Environment.** Postgres 16 runs locally (Homebrew, `localhost:5432`, `psql` on `PATH`). The e2e database is a real database, `kno_notes_test`, dropped and recreated by global setup. Note bodies go through P2's **filesystem** storage adapter (`GITHUB_*` unset), rooted at `DATA_DIR=.data-test`, which global setup also wipes. The embedding model is disabled with `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1`. No Docker, no PGlite, no GitHub, no Gemini.

- [ ] **Step 1: Write `.env.test`**

```bash
DATABASE_URL=postgresql://spt@localhost:5432/kno_notes_test
AUTH_SECRET=e2e-only-secret-not-for-production-use
DATA_DIR=.data-test
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GOOGLE_GENERATIVE_AI_API_KEY=
NEXT_PUBLIC_APP_NAME=Kno-Notes
NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1
```

Add `.env.test` to git (it contains no secret) and `.data-test/` to `.gitignore`.

- [ ] **Step 2: Write `e2e/global-setup.ts`**

```ts
import { execSync } from 'node:child_process';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { TEST_USER, STORAGE_STATE } from './fixtures/test';

const DB_NAME = 'kno_notes_test';
const DATA_DIR = path.resolve('.data-test');

function psql(sql: string) {
  execSync(`psql -v ON_ERROR_STOP=1 -d postgres -c ${JSON.stringify(sql)}`, { stdio: 'inherit' });
}

async function globalSetup(config: FullConfig) {
  // 1. Real local Postgres: drop and recreate so every run starts clean.
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB_NAME}`);

  // 2. Filesystem storage adapter: wipe the note bodies too.
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });

  // 3. Migrate + seed through P2's scripts, with the e2e environment.
  const env = { ...process.env, DATABASE_URL: `postgresql://spt@localhost:5432/${DB_NAME}`, DATA_DIR };
  execSync('npm run db:migrate', { stdio: 'inherit', env });
  execSync('npm run db:seed:test', { stdio: 'inherit', env });

  // 4. Sign in once and save the session cookie for every authenticated spec.
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(TEST_USER.username);
  await page.getByLabel('Mật khẩu').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('/');
  if (!existsSync(path.dirname(STORAGE_STATE))) mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
  await browser.close();
}

export default globalSetup;
```

- [ ] **Step 3: Write `e2e/fixtures/test.ts`**

```ts
import { test as base, expect } from '@playwright/test';

export const TEST_USER = { username: 'bacsi', password: '123456', displayName: 'Bác sĩ' };
export const STORAGE_STATE = 'e2e/.auth/user.json';

/** Authenticated page. Specs that need a signed-out browser use `test.use({ storageState: undefined })`. */
export const test = base.extend({});
export { expect };
```

- [ ] **Step 4: Write `e2e/fixtures/seed.ts`**

```ts
/** Mirrors what `npm run db:seed:test` creates. Keep in sync with P2's seed module. */
export const SEED = {
  user: { username: 'bacsi', displayName: 'Bác sĩ' },
  totalNotes: 14,
  pageSize: 6,
  favouriteCount: 4,
  firstNote: {
    id: 'n1',
    title: 'Phác đồ điều trị tăng huyết áp ở người lớn',
    tags: ['Tim mạch', 'Phác đồ'],
    priority: 'high' as const,
    latestVersion: 3,
    seededHighlightId: 'hseed1',
    quizAttempts: 1,
  },
  anaphylaxis: { id: 'n2', title: 'Xử trí cấp cứu sốc phản vệ' },
  ecg: { id: 'n4', title: 'Đọc ECG trong 10 bước' },
  tagWithFourNotes: 'Tim mạch',
};
```

- [ ] **Step 5: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'node:process';

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,               // one shared seeded database
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    storageState: 'e2e/.auth/user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },   // WebKit, 390×844, touch — the Design Spec's mobile target
    },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: 'postgresql://spt@localhost:5432/kno_notes_test',
      AUTH_SECRET: 'e2e-only-secret-not-for-production-use',
      DATA_DIR: '.data-test',
      NEXT_PUBLIC_APP_NAME: 'Kno-Notes',
      NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH: '1',
      NODE_ENV: 'production',
    },
  },
});
```

> Remove the unused `loadEnv` import — it is listed here only to make the point that env comes from `webServer.env`, not from a dotenv file, so the server the tests drive is unambiguous.

- [ ] **Step 6: Write `e2e/smoke.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

test('the seeded dashboard renders for the signed-in user', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tất cả ghi chú', level: 1 })).toBeVisible();
  await expect(page.getByText(`${SEED.totalNotes} ghi chú`)).toBeVisible();
  await expect(page.getByText(SEED.firstNote.title)).toBeVisible();
});

test('the semantic model is never downloaded in e2e', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('huggingface')) modelRequests.push(r.url()); });
  await page.goto('/');
  await page.waitForTimeout(3000);
  expect(modelRequests).toEqual([]);
});
```

- [ ] **Step 7: Run the harness**

```bash
npm run test:e2e -- e2e/smoke.spec.ts
```
Expected: 4 passes (2 tests × 2 projects). If Postgres refuses the connection, verify `pg_isready` and that the `spt` role exists.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts e2e .env.test .gitignore
git commit -m "test(e2e): playwright harness with real local postgres, filesystem storage reset and auth fixture"
```

---

### Task A20: E2E — auth, shell, dashboard, prefs

**Files:**
- Create: `e2e/auth.spec.ts`, `e2e/dashboard.spec.ts`, `e2e/prefs.spec.ts`, `e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes: the harness from A19.
- Produces: coverage of SPEC §6.3 items *login sai/đúng*, *dashboard filter/sort/grid-list/pagination*, *theme + font-size*, *sidebar collapse desktop + drawer mobile*.

- [ ] **Step 1: Write `e2e/auth.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { TEST_USER } from './fixtures/test';

test.describe('đăng nhập', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('chuyển hướng về /login khi chưa đăng nhập', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Kno-Notes' })).toBeVisible();
    await expect(page.getByText('Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục.')).toBeVisible();
  });

  test('sai mật khẩu hiện đúng câu lỗi và xoá khi gõ lại', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(TEST_USER.username);
    await page.getByLabel('Mật khẩu').fill('sai-mat-khau');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Sai tên đăng nhập hoặc mật khẩu.')).toBeVisible();
    await page.getByLabel('Mật khẩu').fill('1');
    await expect(page.getByText('Sai tên đăng nhập hoặc mật khẩu.')).toHaveCount(0);
  });

  test('Enter gửi form và vào dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(TEST_USER.username);
    await page.getByLabel('Mật khẩu').fill(`${TEST_USER.password}`);
    await page.getByLabel('Mật khẩu').press('Enter');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Tất cả ghi chú', level: 1 })).toBeVisible();
  });

  test('đăng xuất đưa về /login và chặn quay lại', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(TEST_USER.username);
    await page.getByLabel('Mật khẩu').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL('/');
    await page.getByRole('button', { name: 'Đăng xuất' }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/notes/n1');
    await expect(page).toHaveURL(/\/login$/);
  });
});
```

- [ ] **Step 2: Write `e2e/dashboard.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

test.describe('dashboard', () => {
  test('đếm đúng số ghi chú và phân trang 6/trang', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(`${SEED.totalNotes} ghi chú`)).toBeVisible();
    await expect(page.getByText(`Hiển thị 1–6 trên ${SEED.totalNotes}`)).toBeVisible();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await expect(page).toHaveURL('/?page=2');
    await expect(page.getByText(`Hiển thị 7–12 trên ${SEED.totalNotes}`)).toBeVisible();
  });

  test('lọc theo thẻ đổi H1, đặt URL và về trang 1', async ({ page }) => {
    await page.goto('/?page=2');
    await page.getByRole('link', { name: new RegExp(SEED.tagWithFourNotes) }).first().click();
    await expect(page).toHaveURL(new RegExp(`tag=${encodeURIComponent(SEED.tagWithFourNotes)}`));
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${SEED.tagWithFourNotes}`);
  });

  test('lọc theo ưu tiên và xoá bộ lọc', async ({ page }) => {
    await page.goto('/?priority=high');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ưu tiên cao');
    await expect(page.getByRole('button', { name: /Ưu tiên cao/ })).toBeVisible();
    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click();
    await expect(page).toHaveURL('/');
  });

  test('sắp xếp theo Tên A–Z đổi thứ tự và ghi vào URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: /Sắp xếp/ }).click();
    await page.getByRole('option', { name: 'Tên A–Z' }).click();
    await expect(page).toHaveURL('/?sort=title');
    const titles = await page.locator('[data-note-title]').allTextContents();
    const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'vi'));
    expect(titles).toEqual(sorted);
  });

  test('chuyển grid ↔ list và nhớ lựa chọn sau khi tải lại', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dạng danh sách' }).click();
    await expect(page).toHaveURL('/?view=list');
    await page.goto('/');
    await expect(page.locator('[data-note-row]').first()).toBeVisible();
  });

  test('bật yêu thích từ card và thấy trong bộ lọc Yêu thích', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('Đọc ECG')}`);
    const card = page.locator('[data-note-card]').first();
    await card.getByRole('button', { name: 'Yêu thích' }).click();
    await page.goto('/?fav=1');
    await expect(page.getByText(SEED.ecg.title)).toBeVisible();
  });

  test('empty state khi không có kết quả', async ({ page }) => {
    await page.goto('/?q=khongcokhoanaotrungdau');
    await expect(page.getByText('Không tìm thấy ghi chú')).toBeVisible();
    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click();
    await expect(page).toHaveURL('/');
  });

  test('URL rác vẫn render trang đầu, sort mặc định (Review Focus #1)', async ({ page }) => {
    await page.goto('/?page=999&sort=bogus&priority=purple&view=table');
    await expect(page.getByRole('heading', { name: 'Tất cả ghi chú', level: 1 })).toBeVisible();
    await expect(page.getByText(/Hiển thị /)).toBeVisible();
  });
});
```

- [ ] **Step 3: Write `e2e/prefs.spec.ts`**

```ts
import { test, expect } from './fixtures/test';

test('đổi theme và cỡ chữ, giữ nguyên sau khi tải lại', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Giao diện' }).click();
  await page.getByRole('radio', { name: 'Tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const slider = page.getByRole('slider', { name: /Cỡ chữ/ });
  await slider.fill('21');
  await expect(page.locator('html')).toHaveAttribute('style', /--fs:\s*21px/);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('style', /--fs:\s*21px/);
});

test('không nháy theme khi tải trang (server đã render data-theme)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Giao diện' }).click();
  await page.getByRole('radio', { name: 'Tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const response = await page.request.get('/');
  const html = await response.text();
  expect(html).toMatch(/<html[^>]*data-theme="dark"/);
});
```

- [ ] **Step 4: Write `e2e/sidebar.spec.ts`**

```ts
import { test, expect } from './fixtures/test';

test.describe('thanh bên', () => {
  test('desktop: thu gọn và nhớ trạng thái', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await page.goto('/');
    await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    await expect(page.getByRole('button', { name: 'Mở thanh bên' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    await page.getByRole('button', { name: 'Mở thanh bên' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'expanded');
  });

  test('mobile: drawer mở, backdrop và Esc đóng', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile only');
    await page.goto('/');
    await page.getByRole('button', { name: 'Mở thanh bên' }).click();
    const nav = page.getByRole('navigation', { name: 'Thanh bên' });
    await expect(nav).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
  });
});
```

- [ ] **Step 5: Run these specs**

```bash
npm run test:e2e -- e2e/auth.spec.ts e2e/dashboard.spec.ts e2e/prefs.spec.ts e2e/sidebar.spec.ts
```
Expected: all green on both projects. Any failure names a real gap — fix the app, not the assertion.

- [ ] **Step 6: Commit**

```bash
git add e2e/auth.spec.ts e2e/dashboard.spec.ts e2e/prefs.spec.ts e2e/sidebar.spec.ts
git commit -m "test(e2e): auth, dashboard filtering, prefs and sidebar coverage"
```

---

### Task A21: E2E — note lifecycle (create, edit, versions, restore, comments, tags, images)

**Files:**
- Create: `e2e/note-create.spec.ts`, `e2e/note-versions.spec.ts`, `e2e/note-comments.spec.ts`, `e2e/note-images.spec.ts`
- Create: `e2e/fixtures/sample.png` (a 4×4 PNG written by the first spec run — see step 1)

**Interfaces:**
- Consumes: the harness from A19.
- Produces: coverage of SPEC §6.3 items *tạo note → save v1*, *sửa note → v2*, *xem bản cũ + khôi phục*, *comment thêm/xoá*, *tag CRUD trong editor*, *upload ảnh + lightbox*.

- [ ] **Step 1: Create the image fixture**

```bash
node -e "require('node:fs').writeFileSync('e2e/fixtures/sample.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4AWP8z8Dwn4GBgYEJxIAAAAxkAgH0h1r6AAAAAElFTkSuQmCC','base64'))"
```

- [ ] **Step 2: Write `e2e/note-create.spec.ts`**

```ts
import { test, expect } from './fixtures/test';

test('tạo ghi chú mới lưu thành v1 rồi mở chi tiết', async ({ page }) => {
  await page.goto('/notes/new');
  await expect(page.getByRole('button', { name: 'Lưu v1' })).toBeVisible();
  await expect(page.getByText('Ghi chú mới sẽ bắt đầu từ phiên bản v1.')).toBeVisible();

  await page.getByPlaceholder('Tiêu đề ghi chú').fill('Ghi chú E2E đầu tiên');
  await page.getByPlaceholder('Mô tả ngắn — giúp tìm kiếm nhanh hơn').fill('Mô tả cho e2e');
  await page.locator('[data-prose][contenteditable="true"]').click();
  await page.keyboard.type('Nội dung đầu tiên của ghi chú.');

  await page.getByPlaceholder('Thêm thẻ…').fill('E2E');
  await page.getByPlaceholder('Thêm thẻ…').press('Enter');
  await expect(page.getByText('E2E', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Lưu v1' }).click();
  await expect(page.getByRole('status')).toHaveText('Đã lưu · phiên bản v1');
  await expect(page).toHaveURL(/\/notes\/.+/);
  await expect(page.getByRole('heading', { name: 'Ghi chú E2E đầu tiên', level: 1 })).toBeVisible();
  await expect(page.getByText('v1')).toBeVisible();
});

test('huỷ từ ghi chú mới về dashboard, huỷ từ ghi chú cũ về chi tiết', async ({ page }) => {
  await page.goto('/notes/new');
  await page.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/notes/n1/edit');
  await page.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page).toHaveURL('/notes/n1');
});

test('thẻ: thêm bằng dấu phẩy, xoá thẻ cuối bằng Backspace, không trùng khi bỏ dấu', async ({ page }) => {
  await page.goto('/notes/new');
  const input = page.getByPlaceholder('Thêm thẻ…');
  await input.fill('Cấp cứu,');
  await expect(page.getByText('Cấp cứu', { exact: true })).toBeVisible();
  await input.fill('cap cuu');
  await input.press('Enter');
  await expect(page.getByText('cap cuu', { exact: true })).toHaveCount(0);
  await input.press('Backspace');
  await expect(page.getByText('Cấp cứu', { exact: true })).toHaveCount(0);
});
```

- [ ] **Step 3: Write `e2e/note-versions.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

test('sửa nội dung tạo phiên bản mới, xem bản cũ rồi khôi phục', async ({ page }) => {
  await page.goto(`/notes/${SEED.firstNote.id}`);
  const startVersion = SEED.firstNote.latestVersion;

  await page.getByRole('link', { name: 'Chỉnh sửa' }).click();
  await expect(page.getByRole('button', { name: `Lưu v${startVersion + 1}` })).toBeVisible();
  await page.locator('[data-prose][contenteditable="true"]').click();
  await page.keyboard.type(' Bổ sung từ e2e.');
  await page.getByPlaceholder('VD: Cập nhật liều theo ESC 2024').fill('Sửa trong e2e');
  await page.getByRole('button', { name: `Lưu v${startVersion + 1}` }).click();

  await expect(page.getByRole('status')).toHaveText(`Đã lưu · phiên bản v${startVersion + 1}`);
  await expect(page.getByText(`v${startVersion + 1} · Sửa trong e2e`)).toBeVisible();

  await page.getByText('v1 · Tạo ghi chú').click();
  await expect(page).toHaveURL(new RegExp(`\\?v=1`));
  await expect(page.getByText(/Đang xem/)).toBeVisible();

  await page.getByRole('button', { name: 'Khôi phục bản này' }).click();
  await expect(page.getByRole('status')).toHaveText(`Đã khôi phục thành v${startVersion + 2}`);
  await expect(page.getByText(`v${startVersion + 2} · Khôi phục từ v1`)).toBeVisible();
});

test('lưu mà không đổi gì thì không tạo phiên bản mới', async ({ page }) => {
  await page.goto(`/notes/${SEED.ecg.id}/edit`);
  const label = await page.getByRole('button', { name: /^Lưu v\d+$/ }).textContent();
  const nextVersion = Number(label!.replace('Lưu v', ''));
  await page.getByRole('button', { name: `Lưu v${nextVersion}` }).click();
  await expect(page.getByRole('status')).toHaveText(`Đã lưu · phiên bản v${nextVersion - 1}`);
});

test('xoá ghi chú cần xác nhận inline rồi về dashboard', async ({ page }) => {
  await page.goto('/notes/new');
  await page.getByPlaceholder('Tiêu đề ghi chú').fill('Ghi chú sẽ bị xoá');
  await page.getByRole('button', { name: 'Lưu v1' }).click();
  await page.waitForURL(/\/notes\/.+/);

  await page.getByRole('button', { name: 'Xoá' }).click();
  await expect(page.getByText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?')).toBeVisible();
  await page.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?')).toHaveCount(0);

  await page.getByRole('button', { name: 'Xoá' }).click();
  await page.getByRole('button', { name: 'Xoá vĩnh viễn' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('status')).toHaveText('Đã xoá ghi chú');
  await expect(page.getByText('Ghi chú sẽ bị xoá')).toHaveCount(0);
});
```

- [ ] **Step 4: Write `e2e/note-comments.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

test('thêm bình luận bằng ⌘/Ctrl+Enter rồi xoá', async ({ page }) => {
  await page.goto(`/notes/${SEED.anaphylaxis.id}`);
  const box = page.getByPlaceholder('Thêm bình luận, kinh nghiệm thực tế, ca bệnh liên quan…');
  await box.fill('Bình luận từ e2e');
  await box.press('ControlOrMeta+Enter');
  await expect(page.getByText('Bình luận từ e2e')).toBeVisible();
  await expect(box).toHaveValue('');

  await page.getByRole('button', { name: 'Xoá' }).filter({ hasNotText: 'vĩnh viễn' }).last().click();
  await expect(page.getByText('Bình luận từ e2e')).toHaveCount(0);
});

test('không gửi bình luận rỗng', async ({ page }) => {
  await page.goto(`/notes/${SEED.anaphylaxis.id}`);
  const before = await page.locator('[data-comment]').count();
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.locator('[data-comment]')).toHaveCount(before);
});
```

- [ ] **Step 5: Write `e2e/note-images.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import path from 'node:path';

test('tải ảnh lên trong editor rồi mở lightbox ở chi tiết', async ({ page }) => {
  await page.goto('/notes/new');
  await page.getByPlaceholder('Tiêu đề ghi chú').fill('Ghi chú có ảnh');

  await page.setInputFiles('input[type="file"][multiple]', path.resolve('e2e/fixtures/sample.png'));
  await expect(page.locator('[data-image-thumb] img')).toHaveCount(1);

  await page.getByRole('button', { name: 'Lưu v1' }).click();
  await page.waitForURL(/\/notes\/.+/);

  await expect(page.getByText('Hình ảnh · 1')).toBeVisible();
  await page.locator('[data-image-thumb]').first().click();
  const lightbox = page.getByRole('dialog', { name: /sample/ });
  await expect(lightbox).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
});
```

- [ ] **Step 6: Run these specs**

```bash
npm run test:e2e -- e2e/note-create.spec.ts e2e/note-versions.spec.ts e2e/note-comments.spec.ts e2e/note-images.spec.ts
```
Expected: green on both projects.

- [ ] **Step 7: Commit**

```bash
git add e2e/note-*.spec.ts e2e/fixtures/sample.png
git commit -m "test(e2e): note lifecycle coverage for versions, comments, tags and images"
```

---
### Task A22: E2E — highlight, quiz, search, PWA, public API

**Files:**
- Create: `e2e/highlight.spec.ts`, `e2e/quiz.spec.ts`, `e2e/search.spec.ts`, `e2e/pwa.spec.ts`, `e2e/api-v1.spec.ts`

**Interfaces:**
- Consumes: the harness from A19; `/api/v1/*` and `/api/mcp` (P2).
- Produces: coverage of SPEC §6.3 items *highlight thêm/xoá*, *quiz full flow + lưu lịch sử + review*, *search suggestion + #tag + Enter*, *PWA manifest*, *API v1 CRUD với bearer*, *MCP tools list*.

**Quiz reality check:** there is no `GOOGLE_GENERATIVE_AI_API_KEY`, so the real run exercises the **offline fallback generator**. Assertions are therefore structural — never about wording. One extra test stubs the generate endpoint with `page.route()` to prove the AI path renders identically.

- [ ] **Step 1: Write `e2e/highlight.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

test.describe('đánh dấu', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'selection drag is unreliable on mobile webkit');

  test('bôi đen tạo mark, hiện ở rail, bỏ đánh dấu xoá nó — và không tạo phiên bản mới', async ({ page }) => {
    await page.goto(`/notes/${SEED.ecg.id}`);
    const versionsBefore = await page.locator('[data-version-item]').count();

    // select the first paragraph's text node programmatically — deterministic across browsers
    await page.evaluate(() => {
      const prose = document.querySelector('[data-prose]')!;
      const target = prose.querySelector('li, p')!;
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      prose.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await page.getByRole('button', { name: 'Đánh dấu' }).click();
    await expect(page.locator('[data-prose] mark[data-hl]')).toHaveCount(1);
    await expect(page.locator('[data-highlight-item]')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('[data-prose] mark[data-hl]')).toHaveCount(1);
    await expect(page.locator('[data-version-item]')).toHaveCount(versionsBefore);

    await page.locator('[data-prose] mark[data-hl]').first().click();
    await page.getByRole('button', { name: 'Bỏ đánh dấu' }).click();
    await expect(page.locator('[data-prose] mark[data-hl]')).toHaveCount(0);
    await expect(page.locator('[data-version-item]')).toHaveCount(versionsBefore);
  });

  test('không cho đánh dấu khi đang xem bản cũ', async ({ page }) => {
    await page.goto(`/notes/${SEED.firstNote.id}?v=1`);
    await expect(page.getByText(/Đang xem/)).toBeVisible();
    await page.evaluate(() => {
      const prose = document.querySelector('[data-prose]')!;
      const range = document.createRange();
      range.selectNodeContents(prose.querySelector('p')!);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      prose.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.getByRole('button', { name: 'Đánh dấu' })).toHaveCount(0);
  });

  test('đoạn đã đánh dấu trong dữ liệu mẫu hiện ở rail', async ({ page }) => {
    await page.goto(`/notes/${SEED.firstNote.id}`);
    await expect(page.locator(`[data-prose] mark[data-hl="${SEED.firstNote.seededHighlightId}"]`)).toBeVisible();
    await expect(page.locator('[data-highlight-item]')).toHaveCount(1);
  });
});
```

- [ ] **Step 2: Write `e2e/quiz.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

async function answerAll(page: import('@playwright/test').Page) {
  for (let guard = 0; guard < 10; guard++) {
    const counter = await page.locator('[data-quiz-counter]').textContent();
    const options = page.locator('[data-quiz-option]');
    await expect(options).toHaveCount(4);
    await page.keyboard.press('1');
    await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
    const last = counter?.startsWith(counter.split(' / ')[1] ?? '') ?? false;
    await page.keyboard.press('Enter');
    if (await page.getByText('Xem lại đáp án').isVisible().catch(() => false)) return;
    if (last) return;
  }
}

test('làm hết bộ câu hỏi offline, xem kết quả và lưu vào lịch sử', async ({ page }) => {
  await page.goto(`/notes/${SEED.firstNote.id}`);
  const historyBefore = await page.locator('[data-quiz-history-item]').count();

  await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
  const modal = page.getByRole('dialog', { name: /Trắc nghiệm/ });
  await expect(modal).toBeVisible();
  await expect(page.getByText('Đang soạn câu hỏi…')).toBeVisible();

  await expect(page.locator('[data-quiz-option]').first()).toBeVisible({ timeout: 20_000 });
  const total = Number((await page.locator('[data-quiz-counter]').textContent())!.split(' / ')[1]);
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(5);

  await answerAll(page);

  await expect(page.getByText('HOÀN THÀNH')).toBeVisible();
  await expect(page.getByText(/Nắm vững|Cần ôn thêm|Nên đọc lại ghi chú/)).toBeVisible();
  await expect(page.getByText('Xem lại đáp án')).toBeVisible();

  await page.getByRole('button', { name: 'Về ghi chú' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-quiz-history-item]')).toHaveCount(historyBefore + 1);
});

test('chỉ chọn được một lần mỗi câu và phản hồi hiện ngay', async ({ page }) => {
  await page.goto(`/notes/${SEED.firstNote.id}`);
  await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
  await expect(page.locator('[data-quiz-option]').first()).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('2');
  const state = await page.locator('[data-quiz-option]').nth(1).getAttribute('data-state');
  await page.keyboard.press('3');
  await expect(page.locator('[data-quiz-option]').nth(1)).toHaveAttribute('data-state', state!);
  await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
});

test('Esc đóng modal; đóng khi đang tải huỷ kết quả', async ({ page }) => {
  await page.route('**/api/notes/*/quiz/generate', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({ json: { questions: [], source: 'offline' } });
  });
  await page.goto(`/notes/${SEED.firstNote.id}`);
  await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
  await expect(page.getByText('Đang soạn câu hỏi…')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Trắc nghiệm/ })).toBeHidden();
  await page.waitForTimeout(3500);
  await expect(page.getByRole('dialog', { name: /Trắc nghiệm/ })).toBeHidden();
});

test('mở một lần làm bài cũ vào chế độ xem lại, không tạo bản ghi mới', async ({ page }) => {
  await page.goto(`/notes/${SEED.firstNote.id}`);
  const before = await page.locator('[data-quiz-history-item]').count();
  expect(before).toBeGreaterThan(0);
  await page.locator('[data-quiz-history-item]').first().click();
  await expect(page.getByText('Lần làm bài')).toBeVisible();
  await page.getByRole('button', { name: 'Về ghi chú' }).click();
  await expect(page.locator('[data-quiz-history-item]')).toHaveCount(before);
});

test('đường AI render y hệt đường offline (stub endpoint)', async ({ page }) => {
  await page.route('**/api/notes/*/quiz/generate', (route) => route.fulfill({
    json: {
      source: 'ai',
      questions: Array.from({ length: 5 }, (_, i) => ({
        q: `Câu hỏi AI ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        answer: i % 4,
        explain: `Giải thích ${i + 1}`,
      })),
    },
  }));
  await page.goto(`/notes/${SEED.ecg.id}`);
  await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
  await expect(page.getByText('Câu hỏi AI 1')).toBeVisible();
  await expect(page.locator('[data-quiz-counter]')).toHaveText('1 / 5');
  await expect(page.locator('[data-quiz-option]')).toHaveCount(4);
});
```

- [ ] **Step 3: Write `e2e/search.spec.ts`**

```ts
import { test, expect } from './fixtures/test';
import { SEED } from './fixtures/seed';

test('mở panel gợi ý khi focus, hiện thẻ và ghi chú mở gần đây', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').click();
  await expect(page.getByText('Thẻ', { exact: true })).toBeVisible();
  await expect(page.getByText('Mở gần đây')).toBeVisible();
});

test('phím / focus ô tìm kiếm, Esc đóng và bỏ focus', async ({ page }) => {
  await page.goto('/');
  await page.locator('body').click();
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('searchbox')).not.toBeFocused();
});

test('gõ từ khoá hiện "Ghi chú khớp" và Enter đi tới trang kết quả', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').click();
  await page.getByRole('searchbox').fill('ECG');
  await expect(page.getByText('Ghi chú khớp')).toBeVisible();
  await expect(page.getByText(SEED.ecg.title)).toBeVisible();
  await page.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL('/?q=ECG');
  await expect(page.getByRole('heading', { name: 'Kết quả tìm kiếm', level: 1 })).toBeVisible();
});

test('tìm không dấu vẫn khớp có dấu', async ({ page }) => {
  await page.goto(`/?q=${encodeURIComponent('soc phan ve')}`);
  await expect(page.getByText(SEED.anaphylaxis.title)).toBeVisible();
});

test('#thẻ chỉ tìm trong thẻ và lọc dashboard theo thẻ', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').click();
  await page.getByRole('searchbox').fill(`#${SEED.tagWithFourNotes}`);
  await expect(page.getByText('Thẻ khớp')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`#${SEED.tagWithFourNotes}`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`tag=${encodeURIComponent(SEED.tagWithFourNotes)}`));
});

test('lưu và xoá tìm gần đây', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').click();
  await page.getByRole('searchbox').fill('adrenalin');
  await page.getByRole('searchbox').press('Enter');
  await page.goto('/');
  await page.getByRole('searchbox').click();
  await expect(page.getByText('Tìm gần đây')).toBeVisible();
  await expect(page.getByText('adrenalin')).toBeVisible();
  await page.getByRole('button', { name: 'Xoá' }).first().click();
  await expect(page.getByText('Tìm gần đây')).toHaveCount(0);
});
```

- [ ] **Step 4: Write `e2e/pwa.spec.ts`**

```ts
import { test, expect } from './fixtures/test';

test('manifest có đủ trường bắt buộc và icon', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toBe('Kno-Notes');
  expect(manifest.short_name).toBe('Kno-Notes');
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toBe('#17756b');
  expect(manifest.background_color).toBe('#f6f6f3');
  expect(manifest.start_url).toBe('/');
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']));
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).status()).toBe(200);
  }
});

test('trang được khai báo manifest và theme-color', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveCount(1);
});

test('service worker không bao giờ cache HTML đã đăng nhập hay /api (Review Focus #5)', async ({ page }) => {
  const res = await page.request.get('/sw.js');
  expect(res.status()).toBe(200);
  const source = await res.text();
  // The precache list must not contain an authenticated route.
  const precache = source.slice(source.indexOf('const PRECACHE'), source.indexOf('];', source.indexOf('const PRECACHE')));
  expect(precache).toContain('/offline');
  expect(precache).not.toMatch(/['"]\/['"]/);
  expect(precache).not.toContain('/notes');
  // Navigations and /api are never written to a cache.
  expect(source).toContain("if (request.mode === 'navigate') return 'network-first-offline-fallback'");
  expect(source).toContain("if (url.pathname.startsWith('/api/')) return 'network-only'");
});

test('trang /offline render không cần phiên đăng nhập', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/offline');
  await expect(page.getByText('Đang ngoại tuyến')).toBeVisible();
  await context.close();
});
```

- [ ] **Step 5: Write `e2e/api-v1.spec.ts`**

```ts
import { test, expect } from './fixtures/test';

let token = '';

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
  const res = await context.request.post('/api/api-keys', { data: { name: 'e2e' } });
  expect(res.status()).toBe(201);
  token = (await res.json()).token;
  await context.close();
});

test('bearer sai bị từ chối', async ({ request }) => {
  const res = await request.get('/api/v1/notes', { headers: { Authorization: 'Bearer nope' } });
  expect(res.status()).toBe(401);
});

test('CRUD ghi chú qua /api/v1 với bearer', async ({ request }) => {
  const headers = { Authorization: `Bearer ${token}` };

  const list = await request.get('/api/v1/notes?page=1', { headers });
  expect(list.status()).toBe(200);
  expect((await list.json()).items.length).toBeGreaterThan(0);

  const created = await request.post('/api/v1/notes', {
    headers,
    data: { title: 'Ghi chú từ API', desc: 'mô tả', tags: ['API'], priority: 'low', content: '<p>xin chào</p>' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  const read = await request.get(`/api/v1/notes/${id}`, { headers });
  expect((await read.json()).title).toBe('Ghi chú từ API');

  const patched = await request.patch(`/api/v1/notes/${id}`, { headers, data: { title: 'Đã sửa qua API' } });
  expect(patched.status()).toBe(200);

  const tags = await request.get('/api/v1/tags', { headers });
  expect((await tags.json()).items.some((t: { name: string }) => t.name === 'API')).toBe(true);

  const removed = await request.delete(`/api/v1/notes/${id}`, { headers });
  expect(removed.status()).toBe(204);
  expect((await request.get(`/api/v1/notes/${id}`, { headers })).status()).toBe(404);
});

test('MCP liệt kê đủ 9 tool', async ({ request }) => {
  const res = await request.post('/api/mcp', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  for (const tool of ['list_notes', 'search_notes', 'get_note', 'create_note', 'update_note', 'delete_note', 'list_tags', 'create_quiz', 'list_quizzes']) {
    expect(body).toContain(tool);
  }
});
```

- [ ] **Step 6: Run the whole e2e suite**

```bash
npm run test:e2e
```
Expected: every spec green on both projects.

- [ ] **Step 7: Commit**

```bash
git add e2e/highlight.spec.ts e2e/quiz.spec.ts e2e/search.spec.ts e2e/pwa.spec.ts e2e/api-v1.spec.ts
git commit -m "test(e2e): highlight, offline+AI quiz, search, PWA privacy and public API coverage"
```

---

### Task A23: Visual check — screenshots in both themes and the review loop

**Files:**
- Create: `scripts/visual-check.mjs`, `e2e/visual.spec.ts`
- Produces: `test-results/screenshots/<screen>-<viewport>-<theme>.png` and `test-results/screenshots/manifest.json`

**Interfaces:**
- Consumes: the harness from A19 (reuses `e2e/.auth/user.json`).
- Produces:
  ```ts
  // manifest.json
  { generatedAt: string; baseUrl: string; shots: { screen: string; viewport: 'desktop'|'mobile'; theme: 'light'|'dark'; file: string; url: string }[] }
  ```

**Matrix:** 6 screens × 2 viewports × 2 themes = **24 screenshots**.

| Screen key | URL / interaction |
|---|---|
| `login` | `/login`, signed out |
| `dashboard-grid` | `/?view=grid` |
| `dashboard-list` | `/?view=list` |
| `detail` | `/notes/n1` |
| `editor` | `/notes/n1/edit` |
| `quiz` | `/notes/n1`, click `Trắc nghiệm`, wait for the first option |

- [ ] **Step 1: Write `scripts/visual-check.mjs`**

```js
// Usage: npm run visual   (requires `npm start` on :3000, or set BASE_URL)
import { chromium, webkit, devices } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve('test-results/screenshots');
const STORAGE = path.resolve('e2e/.auth/user.json');

const VIEWPORTS = [
  { name: 'desktop', engine: chromium, options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  { name: 'mobile', engine: webkit, options: { ...devices['iPhone 13'] } },
];

const SCREENS = [
  { key: 'login', url: '/login', anonymous: true },
  { key: 'dashboard-grid', url: '/?view=grid' },
  { key: 'dashboard-list', url: '/?view=list' },
  { key: 'detail', url: '/notes/n1' },
  { key: 'editor', url: '/notes/n1/edit' },
  {
    key: 'quiz',
    url: '/notes/n1',
    async prepare(page) {
      await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
      await page.locator('[data-quiz-option]').first().waitFor({ timeout: 30_000 });
    },
  },
];

function prefsCookie(theme) {
  return {
    name: 'kn_prefs',
    value: encodeURIComponent(JSON.stringify({ theme, fontSize: 17, view: 'grid', sidebarCollapsed: false, recentSearches: [] })),
    url: BASE_URL,
  };
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const shots = [];

for (const vp of VIEWPORTS) {
  const browser = await vp.engine.launch();
  for (const theme of ['light', 'dark']) {
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        ...vp.options,
        ...(screen.anonymous ? {} : { storageState: STORAGE }),
        colorScheme: theme,
      });
      await context.addCookies([prefsCookie(theme)]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}${screen.url}`, { waitUntil: 'networkidle' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (screen.prepare) await screen.prepare(page);
      await page.waitForTimeout(400);           // let fonts settle
      const file = `${screen.key}-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: screen.key !== 'quiz' });
      shots.push({ screen: screen.key, viewport: vp.name, theme, file, url: screen.url });
      console.log(`captured ${file}`);
      await context.close();
    }
  }
  await browser.close();
}

await writeFile(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, shots }, null, 2),
);
console.log(`\n${shots.length} screenshots in test-results/screenshots`);
```

- [ ] **Step 2: Write `e2e/visual.spec.ts` so CI fails when a screen cannot even be captured**

```ts
import { test, expect } from './fixtures/test';

const SCREENS = ['/login', '/?view=grid', '/?view=list', '/notes/n1', '/notes/n1/edit'];

for (const url of SCREENS) {
  test(`chụp được ${url} ở cả hai theme`, async ({ page, context }) => {
    for (const theme of ['light', 'dark'] as const) {
      await context.addCookies([{
        name: 'kn_prefs',
        value: encodeURIComponent(JSON.stringify({ theme, fontSize: 17, view: 'grid', sidebarCollapsed: false, recentSearches: [] })),
        url: 'http://localhost:3000',
      }]);
      await page.goto(url);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect((await page.screenshot({ fullPage: true })).length).toBeGreaterThan(1000);
    }
  });
}
```

- [ ] **Step 3: Generate the screenshots**

```bash
npm run build && npm start &
sleep 8
npm run visual
kill %1
```
Expected: 24 PNGs plus `manifest.json`.

- [ ] **Step 4: Run the review checklist**

Open every screenshot alongside `docs/reference/Design Spec.dc.html` and `docs/reference/So Lam Sang.dc.html`. For each row, record PASS or the exact pixel/colour that is wrong. **Iterate: fix, re-run `npm run visual`, re-check — until every row is PASS in all four variants of that screen.**

**Global (check on every screenshot)**
- [ ] Background is `#f6f6f3` (light) / `#0f1112` (dark); surfaces `#ffffff` / `#16191a`.
- [ ] Accent is `#17756b` (light) / `#5cc3b3` (dark) — buttons, links, list markers, quote bars, progress.
- [ ] Body text `#1a1c1e` / `#e6e7e5`; muted `#63676c` / `#9ca1a5`; faint `#989ca1` / `#6b7175`.
- [ ] Sans is IBM Plex Sans, serif is Source Serif 4, mono is IBM Plex Mono. No fallback-font rendering.
- [ ] Section labels are UPPERCASE, 11–12px, weight 600, `letter-spacing:.08em`, faint.
- [ ] Nothing says "Sổ Lâm Sàng"; the logo glyph is `K`.
- [ ] No horizontal scrollbar at 390px.
- [ ] Every interactive element shows the accent focus ring on `:focus-visible` (verify one per screen with the keyboard).

**`login`**
- [ ] Form is 380px wide, centred, `gap 28`.
- [ ] Logo tile is 40×40, radius 11, accent background, serif 22/700 `K`.
- [ ] Title is serif 32/600, `-0.02em`; description 15px muted.
- [ ] Inputs are 46px tall, radius 10, 1px `--line2` border.
- [ ] Submit button is 46px, radius 10, `--text` background with `--bg` text.
- [ ] Demo hint is 12px faint mono (dev only).

**`dashboard-grid`**
- [ ] Container max 1160; padding 36/40/64 desktop, 20/16/64 mobile.
- [ ] H1 serif 32 (26 on mobile); sub-line reads `14 ghi chú`.
- [ ] Cards: radius 14, padding 18/20/16, min-height 200, gap 16; grid is `auto-fill minmax(min(100%,300px),1fr)`; mobile is exactly one column.
- [ ] Card title serif 20/600; description clamped to 2 lines; footer separated by a 1px `--line` rule with 12px faint meta and a mono `vN`.
- [ ] Priority label colour matches the priority (`--hi` / `--med` / `--low`); favourite star is filled `--med` when on.
- [ ] Pagination: `Hiển thị 1–6 trên 14`, 36×36 buttons, current page `--text` background with `--bg` text.

**`dashboard-list`**
- [ ] One `--surface` container, radius 14, rows separated by 1px `--line`, first row has no top border.
- [ ] Row padding 16/18, gap 16, 8px priority dot, serif 17 title with ellipsis, meta right-aligned at min-width 150.
- [ ] On mobile the row wraps instead of truncating.

**`detail`**
- [ ] Container max 1120; article max 740; rail max 300 and `sticky top 88` on desktop, stacked below on mobile, gap 56.
- [ ] Priority pill is 26px tall, radius 999, soft background, reads `Ưu tiên cao`.
- [ ] H1 serif 38 (28 mobile), `text-wrap: balance`; description 17 muted.
- [ ] Meta row sits above a 1px `--line` rule with 20px padding below and 28px margin.
- [ ] Prose uses `--fs` (17 by default) and Source Serif 4 at line-height 1.72; `h2` is sans 1.12em; `li::marker` is accent; blockquote has a 2px accent left border.
- [ ] Seeded `<mark>` is `#fbe9a6` in light and a translucent amber in dark.
- [ ] Attached-image grid is `minmax(160px,1fr)` with 4:3 tiles and 12px gaps.
- [ ] Rail sections separated by `pt-20 border-t --line`; version dots are 9px with a 2px ring; the current version reads `· hiện tại`.

**`editor`**
- [ ] Title input is serif 38 (28 mobile) with no border.
- [ ] Toolbar is sticky at top 64 with 8/10 padding, tool buttons 32×32 radius 7, groups separated by a 1px `--line` right border.
- [ ] `B` is serif 700, `I` italic, `U` underlined, `S` struck through.
- [ ] Editor body min-height 460, padding 32/40 desktop and 20/18 mobile.
- [ ] Panel: priority segmented on a `--surface2` track with a raised selected item; tag chips are `--accent-soft` with accent text; dropzone is dashed `--line2`.
- [ ] Save button reads `Lưu v4` for the seeded first note.

**`quiz`**
- [ ] Modal covers the viewport with `--bg`; header 64px with a 32px `--accent-soft` icon tile and a mono counter.
- [ ] Progress bar is 3px, accent fill.
- [ ] Question is serif 28 (22 mobile), line-height 1.35; the `CÂU n / 5` label is mono 12 accent.
- [ ] Options are radius 12 with 14/16 padding, gap 14, and 26×26 radius-7 mono key tiles.
- [ ] Correct/incorrect states use `--ok`/`--ok-soft` and `--hi`/`--hi-soft`.
- [ ] Content column is max 760 with 56px (28 mobile) top padding.

- [ ] **Step 5: Commit the tooling (not the screenshots)**

```bash
git add scripts/visual-check.mjs e2e/visual.spec.ts
git commit -m "test(visual): dual-theme dual-viewport screenshot capture with a design review checklist"
```

---

### Task A24: Definition-of-Done gate

**Files:**
- Modify: `package.json` (add a `verify` script)
- Create: `docs/superpowers/plans/part-3-app.checklist.md` is **not** created — the checklist lives in this plan.

**Interfaces:**
- Consumes: every preceding task.
- Produces: `npm run verify`.

- [ ] **Step 1: Add the gate script**

```json
{
  "scripts": {
    "verify": "npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e"
  }
}
```

- [ ] **Step 2: Run it**

Run: `npm run verify`
Expected: clean typecheck, clean lint, all Vitest suites green, a successful production build, and the whole Playwright suite green on both projects.

- [ ] **Step 3: Walk SPEC §6 and tick every line**

- [ ] §6.1 `npm run build` + `tsc --noEmit` + `eslint` clean.
- [ ] §6.2 unit tests exist for: `norm`, `rel`, `fmt` (P2), sort/filter/pagination (P2 service + `parseNoteFilters` here), version logic (P2), highlight wrap/unwrap (**A10**), `offlineQuiz` (P2), hybrid search scoring (**A14**), storage path scoping (P2).
- [ ] §6.3 e2e covers: login wrong/right (**A20**), dashboard filter/sort/grid-list/pagination (**A20**), create → v1 (**A21**), edit → v2 (**A21**), old version + restore (**A21**), favourite (**A20**), comment add/delete (**A21**), tag CRUD in the editor (**A21**), image upload + lightbox (**A21**), highlight add/remove (**A22**), quiz full flow + history + review (**A22**), search suggestions + `#tag` + Enter (**A22**), theme + font size (**A20**), sidebar collapse + drawer (**A20**), PWA manifest (**A22**), API v1 CRUD with bearer (**A22**), MCP tools list (**A22**).
- [ ] §6.4 24 screenshots captured and every checklist row PASS (**A23**).
- [ ] §6.5 no duplicated components — grep `src/components/features` for `rounded-[14px]`, `bg-surface`, `h-[36px]` and similar literals; every hit must be a layout container, never a control that P1 already owns.
- [ ] §6.6 one conventional commit per task.

- [ ] **Step 4: Final commit**

```bash
git add package.json
git commit -m "chore: add verify gate running typecheck, lint, unit tests, build and e2e"
```

---

## Self-Review

**1. Spec coverage.** Every SPEC section that belongs to this plan maps to a task: §1.1 routes/responsive/pagination/favourite/comment/login/theme/font/priority → A4–A9, A20; §1.2 grid+list, custom select, suggestion panel, collapsible sidebar → A7, A15, A4, A20; §1.3 quiz, quiz history, highlight → A13, A9, A10; §1.4 Next.js+Tailwind (A1), PWA (A16), local vector search (A14–A15), Playwright self-review (A19–A23); §3 behaviour parity → A6 (filters/pagination), A10 (highlight), A13 (quiz), A15 (suggestions), A3 (toast), A12 (tag input); §4 routes → A4, A5, A7, A8, A12, A17; §5 shared-component rule → A1 (CLAUDE.md) and enforced in A24; §6 DoD → A24. Sections §2.2, §2.4, §2.5, §7 belong to P2 and appear here only as consumed contracts.

**2. Placeholder scan.** No "TBD", no "similar to Task N", no "handle edge cases". Three deliberate forward references exist — the A4 stubs for `RegisterServiceWorker` and `SearchContainer`, and the A8 stubs for `DetailRail`/`CommentsSection`/`useHighlights`/`QuizController` — each names the exact stub body and the task that replaces it.

**3. Type consistency.** `NoteFilters`, `SortKey`, `ViewKey`, `PriorityKey`, `NoteSummaryVM`, `EditorDraft`, `QuizState`, `RankableNote`, `StoredVector`, `WorkerRequest`/`WorkerResponse`, `CacheStrategy` and `ShortcutAction` are each defined in exactly one task and referenced by that name everywhere else. `parseNoteFilters` is used both client-side (A6) and server-side (A7) — it is a pure function with no `'use client'`-only dependency at the point of use, and the module's `'use client'` directive is at the top of a file whose pure exports Next.js still allows the server to import; if the executor hits a build error there, extract `parseNoteFilters`/`serializeNoteFilters`/`nextFilters`/`filtersTitle` into `src/lib/notes/filters.ts` and re-export them from the hook.

**4. Review Focus.** All five lines have a pinned test: garbage URL → `use-note-filters.test.ts` + `dashboard.spec.ts`; typing before the model is ready → `ranking.test.ts` ("degrades to keyword-only") + `search-container.test.tsx`; cross-block overlapping highlight → `range.test.ts` ("never nests a mark"); closing the quiz while loading → `quiz-controller.test.tsx` + `quiz.spec.ts`; service worker leaking authenticated pages → `cache-policy.test.ts` + `pwa.spec.ts`.
