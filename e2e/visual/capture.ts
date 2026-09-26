import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { STORAGE_STATE } from '../fixtures/auth';

/**
 * Screenshot harness for the design review (SPEC §6.4, plan task A23).
 *
 * Ten screens × two themes × two viewports = forty PNGs under
 * `test-results/screenshots/<viewport>-<theme>-<screen>.png`, which is what the
 * review in `docs/visual-review.md` is written against.
 *
 * Everything here exists to make a shot depend on nothing but the design:
 *  • one seeded database, never a note created by another spec;
 *  • `document.fonts.ready` before every capture, so no shot catches a
 *    fallback face and gets reported as a typography defect;
 *  • transitions, animations and caret blink switched off, plus
 *    `prefers-reduced-motion: reduce`;
 *  • the quiz generator stubbed with fixed Vietnamese questions, because the
 *    offline generator's wording is derived from the note and would otherwise
 *    change the moment the seed does.
 */

export type Theme = 'light' | 'dark';
export const THEMES: readonly Theme[] = ['light', 'dark'];

/**
 * `<outputDir>/screenshots`. With no `E2E_SLOT` that is the documented
 * `test-results/screenshots/`; with a slot it follows the run's own output
 * directory, so two agents capturing at once cannot clear each other's PNGs.
 */
export function shotDir(info: TestInfo): string {
  return path.join(info.project.outputDir, 'screenshots');
}

/** Mirrors `src/lib/prefs.ts`. Read by the server on the very first render. */
const PREFS_COOKIE = 'kn_prefs';
/** Mirrors `src/lib/theme.ts`. Read by `ThemeScript` before first paint. */
const THEME_STORAGE_KEY = 'kno-notes-prefs';

const FONT_SIZE = 17;

/**
 * Two different mechanisms decide the theme and both have to agree, or the
 * pre-paint script repaints the page to `light` the instant it loads:
 * the `kn_prefs` cookie drives the server render, and `localStorage` drives
 * `ThemeScript`. Setting only one produces a light screenshot in a dark run.
 */
export async function themedContext(
  browser: Browser,
  info: TestInfo,
  theme: Theme,
  options: { signedIn?: boolean } = {},
): Promise<BrowserContext> {
  const { signedIn = true } = options;
  const use = info.project.use;

  const context = await browser.newContext({
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    locale: use.locale,
    timezoneId: use.timezoneId,
    colorScheme: theme,
    reducedMotion: 'reduce',
    baseURL: use.baseURL,
    storageState: signedIn ? STORAGE_STATE : { cookies: [], origins: [] },
  });

  const prefs = {
    theme,
    fontSize: FONT_SIZE,
    view: 'grid',
    sidebarCollapsed: false,
    recentSearches: [] as string[],
  };

  await context.addCookies([
    {
      name: PREFS_COOKIE,
      value: encodeURIComponent(JSON.stringify(prefs)),
      url: use.baseURL!,
    },
  ]);

  await context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* a blocked store just means the cookie decides */
      }
    },
    { key: THEME_STORAGE_KEY, value: JSON.stringify({ theme, accent: 'teal', fontSize: FONT_SIZE }) },
  );

  return context;
}

/**
 * Hold everything still: fonts loaded, motion off, caret hidden, and any
 * lazily decoded image resolved. Called immediately before every capture.
 */
export async function stabilise(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        scroll-behavior: auto !important;
      }
      /* A blinking caret in a contentEditable surface flips pixels between runs. */
      [contenteditable] { caret-color: transparent !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => img.decode().catch(() => undefined)),
    );
  });
  // One paint after the style tag lands.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** `test-results/screenshots/<viewport>-<theme>-<screen>.png`, full page. */
export async function shoot(
  page: Page,
  info: TestInfo,
  theme: Theme,
  screen: string,
  options: { fullPage?: boolean } = {},
): Promise<string> {
  // Overlays (`fixed inset-0`) pass `fullPage: false`: a full-page shot of a
  // modal captures the scrollable page *behind* it and reads as a bug.
  const { fullPage = true } = options;
  await stabilise(page);
  const file = path.join(shotDir(info), `${info.project.name}-${theme}-${screen}.png`);
  await page.screenshot({ path: file, fullPage });
  await info.attach(`${info.project.name}-${theme}-${screen}`, { path: file, contentType: 'image/png' });
  return file;
}

/**
 * Put the theme where the app actually reads it from for a signed-in visitor.
 *
 * The cookie and `localStorage` set in `themedContext` only carry the *first
 * paint*. `RootLayout` then resolves prefs from Postgres (`resolvePrefs`) and
 * `ThemeProvider` re-applies them, so a database row saying `light` repaints
 * the page light no matter what the cookie said. Writing through
 * `PATCH /api/prefs` is the same path the settings popover uses.
 */
export async function applyThemePrefs(page: Page, theme: Theme): Promise<void> {
  await page.goto('/');
  const status = await page.evaluate(
    async ({ theme, fontSize }) => {
      const res = await fetch('/api/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          fontSize,
          view: 'grid',
          sidebarCollapsed: false,
          recentSearches: [],
        }),
      });
      return res.status;
    },
    { theme, fontSize: FONT_SIZE },
  );
  expect(status, 'PATCH /api/prefs must accept the review theme').toBe(200);
}

/** Assert the theme actually took, so a light shot can never be filed as dark. */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/**
 * A fixed quiz, so `quiz-question` and `quiz-result` are byte-stable.
 *
 * The real run uses the offline generator (there is no Gemini key in
 * `.env.test`), whose questions are derived from the note's headings — good
 * for behaviour tests, useless for a screenshot that has to be comparable
 * across runs. The shape is identical either way: 5 questions, 4 options.
 */
export const QUIZ_STUB = {
  source: 'offline' as const,
  questions: [
    {
      q: 'Mục tiêu huyết áp cho đa số bệnh nhân nếu dung nạp tốt là bao nhiêu?',
      options: ['< 130/80 mmHg', '< 140/90 mmHg', '< 150/90 mmHg', '< 120/70 mmHg'],
      answer: 0,
      explain: 'Đa số bệnh nhân hướng tới < 130/80 mmHg nếu dung nạp tốt.',
    },
    {
      q: 'Ngưỡng huyết áp đo tại nhà để chẩn đoán tăng huyết áp?',
      options: ['≥ 140/90 mmHg', '≥ 130/80 mmHg', '≥ 135/85 mmHg', '≥ 125/75 mmHg'],
      answer: 2,
      explain: 'Huyết áp tại nhà trung bình ≥ 135/85 mmHg.',
    },
    {
      q: 'Thuốc nào được thêm vào khi tăng huyết áp kháng trị?',
      options: ['Hydralazin', 'Spironolacton', 'Clonidin', 'Doxazosin'],
      answer: 1,
      explain: 'Spironolacton 25–50 mg là lựa chọn bậc bốn.',
    },
    {
      q: 'Phối hợp thuốc nào KHÔNG được khuyến cáo?',
      options: ['ACEi + CCB', 'ARB + lợi tiểu', 'CCB + lợi tiểu', 'ACEi + ARB'],
      answer: 3,
      explain: 'Không phối hợp ACEi với ARB.',
    },
    {
      q: 'Sau khi khởi trị ACEi/ARB, nên kiểm tra creatinin và kali khi nào?',
      options: ['Sau 2–4 tuần', 'Sau 6 tháng', 'Không cần kiểm tra', 'Ngay trong ngày đầu'],
      answer: 0,
      explain: 'Kiểm tra creatinin và kali 2–4 tuần sau khởi trị.',
    },
  ],
};

export const QUIZ_GENERATE_ROUTE = '**/api/notes/*/quiz/generate';
export const QUIZ_SAVE_ROUTE = '**/api/notes/*/quizzes';
