/**
 * SPEC §6.3 — "theme + font-size", plus the view mode and the recent-search
 * list that live in the same `user_prefs` row.
 *
 * Prefs are per-user and survive the whole run, so every test here resets them
 * before and after itself.
 */
import { test, expect } from './fixtures/auth';
import { DEFAULT_PREFS, api, resetPrefs, withPrefsSync } from './helpers/app';

const html = (page: Parameters<typeof resetPrefs>[0]) => page.locator('html');

/** What the *server* sent, before a single line of client JavaScript ran. */
async function serverHtml(page: Parameters<typeof resetPrefs>[0], path = '/'): Promise<string> {
  const res = await api<string>(page, path);
  expect(res.status).toBe(200);
  return String(res.body);
}

/** The live value of `--fs`, wherever it was set from. */
const fontSize = (page: Parameters<typeof resetPrefs>[0]) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs').trim());

async function openSettings(page: Parameters<typeof resetPrefs>[0]) {
  await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Giao diện' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('Tuỳ chọn hiển thị', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetPrefs(page);
    await page.goto('/');
  });

  test.afterEach(async ({ page }) => {
    await resetPrefs(page);
  });

  test('đổi giao diện sáng/tối, giữ nguyên sau khi tải lại và không nháy', async ({ page }) => {
    await expect(html(page)).toHaveAttribute('data-theme', 'light');

    const panel = await openSettings(page);
    await withPrefsSync(page, async () => {
      await panel.getByRole('radio', { name: 'Tối' }).click();
      await expect(html(page)).toHaveAttribute('data-theme', 'dark');
      await expect(panel.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'true');
    });
    await page.keyboard.press('Escape');

    // No flash: the *server* already renders data-theme="dark", so there is no
    // light frame to repaint over. This is the HTML before any hydration.
    expect(await serverHtml(page)).toMatch(/<html[^>]*data-theme="dark"/);

    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');

    // …and it is the same on a different route, not just the dashboard.
    expect(await serverHtml(page, '/notes/new')).toMatch(/<html[^>]*data-theme="dark"/);

    const back = await openSettings(page);
    await withPrefsSync(page, async () => {
      await back.getByRole('radio', { name: 'Sáng' }).click();
      await expect(html(page)).toHaveAttribute('data-theme', 'light');
    });
    expect(await serverHtml(page)).toMatch(/<html[^>]*data-theme="light"/);
  });

  test('thanh trượt và hai nút A đổi cỡ chữ trong khoảng 14–22 và được nhớ', async ({ page }) => {
    const panel = await openSettings(page);
    const slider = panel.getByRole('slider', { name: 'Cỡ chữ nội dung' });
    await expect(slider).toHaveAttribute('min', '14');
    await expect(slider).toHaveAttribute('max', '22');
    expect(await fontSize(page)).toBe(`${DEFAULT_PREFS.fontSize}px`);

    await withPrefsSync(page, async () => {
      await slider.fill('21');
      await expect(panel.getByText('21px')).toBeVisible();
    });
    expect(await fontSize(page)).toBe('21px');

    // Persisted, and rendered by the server on the next load.
    expect(await serverHtml(page)).toMatch(/--fs:\s*21px/);
    await page.reload();
    expect(await fontSize(page)).toBe('21px');

    // A+ stops at 22, A- stops at 14.
    const again = await openSettings(page);
    await again.getByRole('button', { name: 'Tăng cỡ chữ' }).click();
    expect(await fontSize(page)).toBe('22px');
    await again.getByRole('button', { name: 'Tăng cỡ chữ' }).click();
    expect(await fontSize(page)).toBe('22px');

    await again.getByRole('slider', { name: 'Cỡ chữ nội dung' }).fill('15');
    expect(await fontSize(page)).toBe('15px');
    await again.getByRole('button', { name: 'Giảm cỡ chữ' }).click();
    expect(await fontSize(page)).toBe('14px');
    await withPrefsSync(page, async () => {
      await again.getByRole('button', { name: 'Giảm cỡ chữ' }).click();
      expect(await fontSize(page)).toBe('14px');
    });

    await page.reload();
    expect(await fontSize(page)).toBe('14px');
    const prefs = await api<{ prefs: { fontSize: number } }>(page, '/api/prefs');
    expect(prefs.body.prefs.fontSize).toBe(14);
  });

  test('chế độ hiển thị lưới/danh sách được nhớ', async ({ page }) => {
    await expect(page.locator('[data-note-card]').first()).toBeVisible();

    await withPrefsSync(page, async () => {
      await page.getByRole('radio', { name: 'Dạng danh sách' }).click();
      await expect(page.locator('[data-note-row]').first()).toBeVisible();
    });

    const stored = await api<{ prefs: { view: string } }>(page, '/api/prefs');
    expect(stored.body.prefs.view).toBe('list');

    // A bare `/` — no `view=` in the URL — still comes back as a list.
    await page.goto('/');
    await expect(page.locator('[data-note-row]').first()).toBeVisible();
    await expect(page.locator('[data-note-card]')).toHaveCount(0);
  });

  test('tìm kiếm gần đây được ghi lại, tối đa 5, và nút Xoá dọn sạch', async ({ page }) => {
    const terms = ['alfa', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
    const searchbox = page.getByRole('searchbox');
    const suggestions = page.locator('[data-search-suggestions]');

    for (const term of terms) {
      await searchbox.click();
      await expect(suggestions).toBeVisible();
      await searchbox.fill(term);
      await searchbox.press('Enter');
      // `submit()` records the term and closes the panel synchronously; the
      // navigation it starts afterwards is not what this test is about.
      await expect(suggestions).toHaveCount(0);
    }

    const newestFirst = [...terms].reverse().slice(0, 5);
    await expect
      .poll(async () => (await api<{ prefs: { recentSearches: string[] } }>(page, '/api/prefs')).body.prefs.recentSearches)
      .toEqual(newestFirst);

    // Unique, newest first, capped at five — and it survives a reload.
    await page.goto('/');
    await searchbox.click();
    await expect(suggestions.getByText('Tìm gần đây')).toBeVisible();
    for (const term of newestFirst) {
      await expect(suggestions.getByText(term, { exact: true })).toBeVisible();
    }
    await expect(suggestions.getByText('alfa', { exact: true })).toHaveCount(0);

    await suggestions.getByText('Xoá', { exact: true }).click();
    await expect(suggestions.getByText('Tìm gần đây')).toHaveCount(0);
    await expect
      .poll(async () => (await api<{ prefs: { recentSearches: string[] } }>(page, '/api/prefs')).body.prefs.recentSearches)
      .toEqual([]);
  });
});
