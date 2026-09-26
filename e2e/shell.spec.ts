/**
 * SPEC §6.3 — "sidebar collapse desktop + drawer mobile", plus the sidebar's
 * navigation counts and the shell's two global keys.
 *
 * Counts are checked against `GET /api/notes` rather than against hard-coded
 * numbers: the sidebar's job is to agree with the data, and a sibling spec is
 * free to add a note of its own during the same run. The *seed* itself is
 * asserted separately, note by note, which is the part that cannot drift.
 */
import { test, expect } from './fixtures/auth';
import {
  actAndWaitForURL, expectedTags, isMobileProject, listNotes, openSidebar,
  parseTagItem, resetPrefs,
  sidebarItem, sidebarTagItems, withPrefsSync,
} from './helpers/app';
import { SEED_FAVOURITES, SEED_NOTES, SEED_PRIORITY, SEED_TOP_TAG, SEED_TOTAL } from './helpers/seed';

test.describe('Khung ứng dụng', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetPrefs(page);
    await page.goto('/');
  });

  test('desktop: thu gọn thanh bên, hiện nút menu, nhớ trạng thái sau khi tải lại', async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), 'desktop only');

    const sidebar = page.locator('aside');
    const menuButton = page.getByRole('button', { name: 'Mở thanh bên' });

    await expect(sidebar).toBeVisible();
    await expect(menuButton).toHaveCount(0);

    await withPrefsSync(page, async () => {
      await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
      await expect(sidebar).toBeHidden();
      await expect(menuButton).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    });

    // Persisted through `user_prefs`, so it survives a full reload.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    await expect(sidebar).toBeHidden();
    await expect(menuButton).toBeVisible();

    await withPrefsSync(page, async () => {
      await menuButton.click();
      await expect(sidebar).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'expanded');
    });
    await page.reload();
    await expect(page.locator('aside')).toBeVisible();
  });

  test('mobile: drawer mở từ header, đóng bằng backdrop và bằng Esc', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), 'mobile only');

    const sidebar = page.locator('aside');
    const backdrop = page.getByTestId('drawer-backdrop');
    const menuButton = page.getByRole('button', { name: 'Mở thanh bên' });

    // On mobile the sidebar starts off-canvas and the header always offers the menu.
    await expect(sidebar).toBeHidden();
    await expect(backdrop).toHaveCount(0);
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    await expect(sidebar).toBeVisible();
    await expect(backdrop).toBeVisible();

    // To the right of the 256px drawer, which sits above the backdrop.
    await backdrop.click({ position: { x: 340, y: 500 } });
    await expect(sidebar).toBeHidden();
    await expect(backdrop).toHaveCount(0);

    await menuButton.click();
    await expect(sidebar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
    await expect(backdrop).toHaveCount(0);

    // The drawer is transient: it must not become a persisted pref.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'expanded');
    await expect(page.locator('aside')).toBeHidden();
  });

  test('bộ đếm thanh bên khớp dữ liệu và danh sách thẻ sắp theo số lượng rồi A–Z', async ({
    page,
  }, testInfo) => {
    await openSidebar(page, isMobileProject(testInfo.project.name));
    const { notes, total } = await listNotes(page);

    const favourites = notes.filter((n) => n.fav).length;
    const byPriority = {
      Cao: notes.filter((n) => n.priority === 'high').length,
      'Trung bình': notes.filter((n) => n.priority === 'medium').length,
      Thấp: notes.filter((n) => n.priority === 'low').length,
    };

    await expect(sidebarItem(page, 'Tất cả ghi chú')).toHaveText(`Tất cả ghi chú${total}`);
    await expect(sidebarItem(page, 'Yêu thích')).toHaveText(`Yêu thích${favourites}`);
    for (const [label, count] of Object.entries(byPriority)) {
      await expect(sidebarItem(page, label)).toHaveText(`${label}${count}`);
    }

    const rows = (await sidebarTagItems(page).allTextContents()).map(parseTagItem);
    expect(rows).toEqual(expectedTags(notes));
    expect(rows[0]).toEqual({ name: SEED_TOP_TAG.name, count: SEED_TOP_TAG.count });
    // Sorted by count desc, then by name — restated as an invariant.
    for (let i = 1; i < rows.length; i += 1) {
      const [prev, cur] = [rows[i - 1], rows[i]];
      expect(
        prev.count > cur.count || (prev.count === cur.count && prev.name.localeCompare(cur.name, 'vi') <= 0),
        `tag order broken at ${prev.name} → ${cur.name}`,
      ).toBe(true);
    }
  });

  test('hạt giống còn nguyên: 14 ghi chú với đúng mức ưu tiên, yêu thích và thẻ', async ({ page }) => {
    const { notes } = await listNotes(page);
    const seeded = new Map(notes.map((n) => [n.id, n]));

    for (const expected of SEED_NOTES) {
      const actual = seeded.get(expected.id);
      expect(actual, `seeded note ${expected.id} is missing`).toBeTruthy();
      expect(actual?.title).toBe(expected.title);
      expect(actual?.priority).toBe(expected.priority);
      expect(actual?.tags).toEqual(expected.tags);
      expect(actual?.fav).toBe(expected.fav);
    }
    expect(SEED_NOTES.length).toBe(SEED_TOTAL);
    expect(SEED_NOTES.filter((n) => n.fav).length).toBe(SEED_FAVOURITES);
    expect(SEED_PRIORITY).toEqual({ high: 5, medium: 5, low: 4 });
  });

  test('bấm một thẻ để lọc, bấm lại để bỏ lọc', async ({ page }, testInfo) => {
    const mobile = isMobileProject(testInfo.project.name);
    await openSidebar(page, mobile);

    const tag = sidebarTagItems(page).first();
    const { name } = parseTagItem((await tag.textContent()) ?? '');

    await actAndWaitForURL(
      page,
      async () => {
        await openSidebar(page, mobile);
        await tag.click();
      },
      /\?tag=/,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${name}`);
    for (const title of await page.locator('[data-note-title]').allTextContents()) {
      expect(title.length).toBeGreaterThan(0);
    }

    // Clicking the active tag again is a toggle, not a second filter. Reload
    // first so the shell is unambiguously rendered from `?tag=` — a click sent
    // before it has seen the new query string would re-apply the same filter.
    await page.reload();
    await openSidebar(page, mobile);
    const activeTag = sidebarTagItems(page).filter({ hasText: name }).first();
    await expect(activeTag).toHaveAttribute('aria-current', 'page');
    // Clicking closes the drawer even when the navigation does not land, so a
    // retry has to reopen it first.
    await actAndWaitForURL(
      page,
      async () => {
        await openSidebar(page, mobile);
        await activeTag.click();
      },
      '/',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tất cả ghi chú');
  });

  test('phím / đưa con trỏ vào ô tìm kiếm, Esc đóng lớp phủ', async ({ page }) => {
    const searchbox = page.getByRole('searchbox');
    await expect(searchbox).not.toBeFocused();

    await page.locator('body').press('/');
    await expect(searchbox).toBeFocused();
    await expect(page.locator('[data-search-suggestions]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-search-suggestions]')).toHaveCount(0);

    // `/` inside a field is a literal slash, not a shortcut.
    await searchbox.click();
    await searchbox.fill('a/b');
    await expect(searchbox).toHaveValue('a/b');
    await page.keyboard.press('Escape');

    // Esc also closes the settings popover.
    await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Giao diện' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Giao diện' })).toHaveCount(0);
  });
});
