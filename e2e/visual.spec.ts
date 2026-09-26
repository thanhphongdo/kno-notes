import { test, expect, type Page } from './fixtures/auth';
import {
  QUIZ_GENERATE_ROUTE, QUIZ_SAVE_ROUTE, QUIZ_STUB, THEMES, applyThemePrefs, expectTheme, shoot,
  themedContext, type Theme,
} from './visual/capture';

/**
 * The design-review capture run (SPEC §6.4, plan task A23).
 *
 * Ten screens in light and dark, on whichever viewport the project defines —
 * `desktop` 1440×900 and `mobile` 390×844 — written to
 * `test-results/screenshots/<viewport>-<theme>-<screen>.png`.
 *
 * These tests are a *capture harness*, not pixel-diff tests. There is no
 * committed baseline to drift against: the reviewer's eye and
 * `docs/reference/Design Spec.dc.html` are the comparison, and the findings
 * live in `docs/visual-review.md`. What the assertions here guarantee is that
 * a screenshot is never silently wrong — the theme really is applied, the
 * screen really did reach the state it claims, and the PNG is not blank.
 *
 * `test-results/` is gitignored, so nothing here is committed.
 */

const NOTE = 'n1';

/** Every capture is a fresh context: one theme, one page, no leftovers. */
function visual(
  screen: string,
  body: (page: Page, theme: Theme) => Promise<void>,
  options: { signedIn?: boolean; fullPage?: boolean } = {},
): void {
  for (const theme of THEMES) {
    test(`${screen} · ${theme}`, async ({ browser }, info) => {
      const context = await themedContext(browser, info, theme, options);
      try {
        const page = await context.newPage();
        // A signed-in visitor's theme lives in Postgres and overrides the
        // cookie on every render, so it has to be written there first.
        if (options.signedIn !== false) await applyThemePrefs(page, theme);
        await body(page, theme);
        await expectTheme(page, theme);
        const file = await shoot(page, info, theme, screen, { fullPage: options.fullPage });
        expect(file).toContain(`${info.project.name}-${theme}-${screen}.png`);
      } finally {
        await context.close();
      }
    });
  }
}

test.describe('ảnh chụp đối chiếu Design Spec', () => {
  visual('login', async (page) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.getByLabel('Tên đăng nhập')).toBeVisible();
  }, { signedIn: false });

  visual('dashboard-grid', async (page) => {
    await page.goto('/?view=grid');
    await expect(page.locator('[data-note-card]').first()).toBeVisible();
    await expect(page.locator('[data-note-card]')).toHaveCount(6);
  });

  visual('dashboard-list', async (page) => {
    await page.goto('/?view=list');
    await expect(page.locator('[data-note-row]').first()).toBeVisible();
    await expect(page.locator('[data-note-row]')).toHaveCount(6);
  });

  visual('detail', async (page) => {
    await page.goto(`/notes/${NOTE}`);
    await expect(page.locator('[data-prose]')).toBeVisible();
    // The rail, the seeded highlight and the seeded quiz attempt are all part
    // of what this screen is supposed to show.
    await expect(page.locator('[data-prose] mark[data-hl]').first()).toBeVisible();
    await expect(page.locator('[data-version-item]')).toHaveCount(3);
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(1);
    await expect(page.locator('[data-image-thumb]')).toHaveCount(2);
  });

  visual('editor', async (page) => {
    await page.goto(`/notes/${NOTE}/edit`);
    await expect(page.locator('[data-prose]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Lưu v\d+$/ })).toBeVisible();
  });

  visual('quiz-question', async (page) => {
    await page.route(QUIZ_GENERATE_ROUTE, (route) => route.fulfill({ json: QUIZ_STUB }));
    await page.goto(`/notes/${NOTE}`);
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
    await expect(page.locator('[data-quiz-option]')).toHaveCount(4);
    // Answer the first question so the shot carries the feedback block and
    // all four option states (ok / bad / dim) at once — §06 "Option".
    // A click rather than the `2` key: the key handler is bound in an effect,
    // and on the mobile project a keypress can land before it is attached.
    await page.locator('[data-quiz-option]').nth(1).click();
    await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
    await expect(page.locator('[data-quiz-option]').first()).toHaveAttribute('data-state', 'ok');
    await expect(page.locator('[data-quiz-option]').nth(1)).toHaveAttribute('data-state', 'bad');
  }, { fullPage: false });

  visual('quiz-result', async (page) => {
    await page.route(QUIZ_GENERATE_ROUTE, (route) => route.fulfill({ json: QUIZ_STUB }));
    // Stub the save too. Finishing a quiz normally appends an attempt to n1,
    // which would grow the detail rail with every capture and make the
    // `detail` shots depend on how many times this file has run.
    await page.route(QUIZ_SAVE_ROUTE, (route) =>
      route.fulfill({
        json: {
          quiz: {
            id: 'visual-attempt',
            date: new Date('2026-01-02T03:04:05.000Z').toISOString(),
            score: 2,
            total: QUIZ_STUB.questions.length,
            source: QUIZ_STUB.source,
            picks: [0, 0, 0, 0, 0],
            questions: QUIZ_STUB.questions,
          },
        },
      }),
    );
    await page.goto(`/notes/${NOTE}`);
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
    await expect(page.locator('[data-quiz-option]')).toHaveCount(4);

    // Always picking option A against answers [0, 2, 1, 3, 0] scores 2/5 =
    // 40%, which lands in the lowest verdict band — a deterministic result.
    const total = QUIZ_STUB.questions.length;
    for (let i = 1; i <= total; i++) {
      await expect(page.locator('[data-quiz-counter]')).toHaveText(`${i} / ${total}`);
      await page.locator('[data-quiz-option]').first().click();
      await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
      await page.getByRole('button', { name: i < total ? 'Câu tiếp theo' : 'Xem kết quả' }).click();
    }
    const result = page.getByRole('dialog');
    await expect(result.getByText('2/5', { exact: true })).toBeVisible();
    await expect(result.getByText('40% · Nên đọc lại ghi chú')).toBeVisible();
    await expect(result.getByText('Xem lại đáp án')).toBeVisible();
  }, { fullPage: false });

  visual('search-suggestions', async (page) => {
    // Seed one recent term so the panel shows all three of its sections.
    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentSearches: ['sốc phản vệ'] }),
      });
      return res.status;
    });
    expect(status).toBe(200);

    await page.reload();
    await page.getByRole('searchbox').click();
    const panel = page.locator('[data-search-suggestions]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Tìm gần đây')).toBeVisible();
    await expect(panel.getByText('Mở gần đây')).toBeVisible();
  }, { fullPage: false });

  visual('settings-popover', async (page) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Giao diện' }).click();
    await expect(page.getByText('Đăng xuất')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Sáng' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Tối' })).toBeVisible();
  }, { fullPage: false });

  visual('lightbox', async (page) => {
    await page.goto(`/notes/${NOTE}`);
    await page.locator('[data-image-thumb]').first().click();
    const box = page.getByRole('dialog', { name: 'Xem ảnh' });
    await expect(box).toBeVisible();
    await expect(box.getByText('1 / 2')).toBeVisible();
  }, { fullPage: false });
});
