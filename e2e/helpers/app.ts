/**
 * Shared e2e helpers.
 *
 * Two rules shape everything here:
 *
 *  • **Specs must be independent.** `global-setup` reseeds once per *run*, not
 *    per test, so a spec may never assume a pristine database. Anything a spec
 *    creates it also deletes (`trackNote` + `cleanupNotes`), and anything it
 *    reads it reads from the API rather than hard-coding a number that a
 *    sibling spec could have moved.
 *  • **Prefs leak through Postgres.** `use.storageState` gives every test a
 *    fresh cookie jar, but `user_prefs` is one row per user for the whole run,
 *    so a spec that touches theme / font size / view / sidebar must call
 *    `resetPrefs` first.
 */
import { expect, type Page } from '@playwright/test';

/** Mirrors `src/lib/prefs.ts` / `src/lib/auth/jwt.ts`. */
export const PREFS_COOKIE = 'kn_prefs';
export const SESSION_COOKIE = 'kn_session';

/** `DEFAULT_PAGE_SIZE` — the dashboard paginates by six. */
export const PAGE_SIZE = 6;

/** `DEFAULT_PREFS` from `src/lib/prefs.ts`. */
export const DEFAULT_PREFS = {
  theme: 'light',
  fontSize: 17,
  view: 'grid',
  sidebarCollapsed: false,
  recentSearches: [] as string[],
} as const;

export interface ApiNoteSummary {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  fav: boolean;
  created: string;
  updated: string;
  latestVersion: number;
  imageCount: number;
  commentCount: number;
  quizCount: number;
}

/**
 * Calls the app's own API **from inside the page**.
 *
 * `page.request` cannot be used here: the session cookie is `Secure`, which
 * Playwright's API cookie jar refuses to send over `http://127.0.0.1`, while
 * Chromium happily does because localhost is a trustworthy origin. Going
 * through the page's own `fetch` keeps the browser's rules — and exercises the
 * same path the app uses.
 *
 * The caller must already be on an app page.
 */
export async function api<T>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const payload = { path, method: init.method ?? 'GET', body: init.body ?? null };
  return page.evaluate(async (arg: { path: string; method: string; body: unknown }) => {
    const res = await fetch(arg.path, {
      method: arg.method,
      headers: arg.body === null ? undefined : { 'Content-Type': 'application/json' },
      body: arg.body === null ? undefined : JSON.stringify(arg.body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed as T };
  }, payload);
}

/** Puts `user_prefs` back to the shipped defaults and drops the cookie mirror. */
export async function resetPrefs(page: Page): Promise<void> {
  if (!page.url().startsWith('http')) await page.goto('/');
  const res = await api(page, '/api/prefs', { method: 'PATCH', body: DEFAULT_PREFS });
  expect(res.status, `PATCH /api/prefs → ${res.status}`).toBe(200);
  await page.context().clearCookies({ name: PREFS_COOKIE });
}

export interface NoteListResponse {
  notes: ApiNoteSummary[];
  total: number;
  pages: number;
  page: number;
}

/** Every note the signed-in user owns, in the API's own order. */
export async function listNotes(
  page: Page,
  query: Record<string, string> = {},
): Promise<NoteListResponse> {
  const sp = new URLSearchParams({ pageSize: '100', ...query });
  const res = await api<NoteListResponse>(page, `/api/notes?${sp.toString()}`);
  expect(res.status, `GET /api/notes → ${res.status}`).toBe(200);
  return res.body;
}

export interface NoteDraft {
  title: string;
  desc?: string;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  content?: string;
  changeNote?: string;
}

const writeBody = (draft: NoteDraft, fallbackContent: string) => ({
  title: draft.title,
  desc: draft.desc ?? '',
  tags: draft.tags ?? [],
  priority: draft.priority ?? 'medium',
  content: draft.content ?? fallbackContent,
  images: [],
  changeNote: draft.changeNote ?? '',
});

/** Creates a note through the real API so a UI spec can start from a known one. */
export async function createNote(page: Page, draft: NoteDraft): Promise<string> {
  const res = await api<{ note: { id: string } }>(page, '/api/notes', {
    method: 'POST',
    body: writeBody(draft, '<p>Nội dung khởi tạo cho e2e.</p>'),
  });
  expect(res.status, `POST /api/notes → ${res.status}`).toBe(200);
  return res.body.note.id;
}

/** Saves a new version through the API — used to set up "an older version exists". */
export async function updateNote(page: Page, id: string, patch: NoteDraft): Promise<number> {
  const res = await api<{ version: number }>(page, `/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: writeBody(patch, ''),
  });
  expect(res.status, `PATCH /api/notes/${id} → ${res.status}`).toBe(200);
  return res.body.version;
}

/** Best-effort delete: a spec that already removed the note through the UI still passes. */
export async function deleteNote(page: Page, id: string): Promise<void> {
  try {
    if (!page.url().startsWith('http')) await page.goto('/');
    await api(page, `/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    /* the page may already be closed, or the note already gone */
  }
}

/** `test.afterEach` companion for the array a spec pushes new ids onto. */
export async function cleanupNotes(page: Page, ids: string[]): Promise<void> {
  for (const id of ids.splice(0)) await deleteNote(page, id);
}

/** The 390×844 project. `useIsMobile()` flips at 820px, so the name is the truth. */
export const isMobileProject = (projectName: string): boolean => projectName === 'mobile';

/**
 * The sidebar is `visibility: hidden` on mobile until the drawer opens, so a
 * spec that wants to click inside it must open the drawer first.
 */
export async function openSidebar(page: Page, mobile: boolean): Promise<void> {
  if (!mobile) return;
  if (await page.getByTestId('drawer-backdrop').isVisible()) return;
  await page.getByRole('button', { name: 'Mở thanh bên' }).click();
  await expect(page.getByTestId('drawer-backdrop')).toBeVisible();
}

/** A sidebar entry, located by its visible label rather than by a utility class. */
export function sidebarItem(page: Page, label: string) {
  return page.locator('aside button').filter({ hasText: label }).first();
}

/** Every tag row in the sidebar — they are the only ones prefixed with `#`. */
export function sidebarTagItems(page: Page) {
  return page.locator('aside button').filter({ hasText: /^\s*#/ });
}

/** `#Tim mạch4` → `{ name: 'Tim mạch', count: 4 }`. */
export function parseTagItem(text: string): { name: string; count: number } {
  const match = /^\s*#\s*(.*?)\s*(\d+)\s*$/.exec(text);
  if (!match) throw new Error(`Unexpected sidebar tag row: ${JSON.stringify(text)}`);
  return { name: match[1], count: Number(match[2]) };
}

/** The tag cloud the sidebar should be showing, derived from the API. */
export function expectedTags(notes: readonly ApiNoteSummary[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}

/** `Hiển thị 1–6 trên 14`, built the way `Pagination` builds it. */
export function rangeText(page: number, total: number, pageSize = PAGE_SIZE): string {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `Hiển thị ${from}–${to} trên ${total}`;
}

/** Fails the test if the app ever reaches for a native `confirm()`/`alert()`. */
export function forbidNativeDialogs(page: Page): void {
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
    throw new Error(`Native ${dialog.type()} dialog is forbidden: ${dialog.message()}`);
  });
}
