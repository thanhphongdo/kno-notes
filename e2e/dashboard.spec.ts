/**
 * SPEC §6.3 — "dashboard filter/sort/grid-list/pagination" and "favorite".
 *
 * The spec never mutates a seeded note: the favourite test creates its own and
 * deletes them again, so the file can run in any order, twice in a row, and
 * next to a sibling spec that is adding notes of its own. Anything that depends
 * on *how many* notes exist reads the number from the API first.
 *
 * Every control here navigates by writing the query string, so each assertion
 * follows the URL that control is supposed to produce.
 */
import { test, expect } from './fixtures/auth';
import {
  PAGE_SIZE, cleanupNotes, createNote, listNotes, rangeText, resetPrefs, withPrefsSync,
} from './helpers/app';
import { SEED_TOP_TAG } from './helpers/seed';

const created: string[] = [];

/**
 * Runs `action` and waits for the favourite write it starts to be acknowledged.
 * The star is optimistic, so reloading straight after the click would race the
 * `POST /api/notes/:id/favorite` that makes it stick.
 */
async function favouriteWritten(
  page: Parameters<typeof resetPrefs>[0],
  noteId: string,
  action: () => Promise<void>,
): Promise<void> {
  const written = page.waitForResponse(
    (res) => res.url().includes(`/api/notes/${noteId}/favorite`) && res.request().method() === 'POST' && res.ok(),
  );
  await action();
  await written;
}

/** Opens the custom sort menu, if it is not already open, and picks an option. */
async function pickSort(
  page: Parameters<typeof resetPrefs>[0],
  label: string,
  url: string,
): Promise<void> {
  const trigger = page.getByRole('combobox', { name: 'Sắp xếp' });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.waitForURL(url);
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetPrefs(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupNotes(page, created);
  });

  test('H1 và dòng “n ghi chú” đổi theo bộ lọc', async ({ page }) => {
    const cases: { url: string; heading: string; query?: Record<string, string> }[] = [
      { url: '/', heading: 'Tất cả ghi chú' },
      { url: '/?fav=1', heading: 'Yêu thích', query: { fav: '1' } },
      { url: '/?priority=high', heading: 'Ưu tiên cao', query: { priority: 'high' } },
      {
        url: `/?tag=${encodeURIComponent(SEED_TOP_TAG.name)}`,
        heading: `#${SEED_TOP_TAG.name}`,
        query: { tag: SEED_TOP_TAG.name },
      },
      { url: '/?q=ECG', heading: 'Kết quả tìm kiếm', query: { q: 'ECG' } },
    ];

    for (const { url, heading, query } of cases) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      const { total } = await listNotes(page, query ?? {});
      await expect(page.getByText(`${total} ghi chú`, { exact: true })).toBeVisible();
    }
  });

  test('ô sắp xếp là component tuỳ biến, không phải <select>, và dấu tích đi theo lựa chọn', async ({
    page,
  }) => {
    await page.goto('/');
    // SPEC §1.2 #16: no native <select> anywhere.
    await expect(page.locator('select')).toHaveCount(0);

    const trigger = page.getByRole('combobox', { name: 'Sắp xếp' });
    await expect(trigger).toHaveText(/Mới cập nhật/);

    await trigger.click();
    const listbox = page.getByRole('listbox', { name: 'Sắp xếp' });
    await expect(listbox.getByRole('option')).toHaveText(['Mới cập nhật', 'Ưu tiên', 'Tên A–Z']);
    await expect(listbox.getByRole('option', { name: 'Mới cập nhật' })).toHaveAttribute('aria-selected', 'true');

    // Choosing an option closes the menu, so reopening it is part of the action.
    await pickSort(page, 'Tên A–Z', '/?sort=title');
    await expect(trigger).toHaveText(/Tên A–Z/);

    // The tick follows the selection.
    await trigger.click();
    await expect(listbox.getByRole('option', { name: 'Tên A–Z' })).toHaveAttribute('aria-selected', 'true');
    await expect(listbox.getByRole('option', { name: 'Mới cập nhật' })).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('Escape');
    await pickSort(page, 'Ưu tiên', '/?sort=priority');
    await expect(trigger).toHaveText(/Ưu tiên/);

    // And the order on screen really is the server's order for that sort.
    await page.goto('/?sort=title');
    const { notes } = await listNotes(page, { sort: 'title', pageSize: String(PAGE_SIZE), page: '1' });
    await expect(page.locator('[data-note-title]')).toHaveText(notes.map((n) => n.title));
  });

  test('chuyển lưới ↔ danh sách và nhớ lựa chọn sau khi tải lại', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-note-card]').first()).toBeVisible();
    await expect(page.locator('[data-note-row]')).toHaveCount(0);

    await withPrefsSync(page, async () => {
      await page.getByRole('radio', { name: 'Dạng danh sách' }).click();
      await page.waitForURL('/?view=list');
      await expect(page.locator('[data-note-row]').first()).toBeVisible();
    });

    // A fresh visit to the bare dashboard still remembers the choice (prefs).
    await page.goto('/');
    await expect(page.locator('[data-note-row]').first()).toBeVisible();
    await expect(page.locator('[data-note-card]')).toHaveCount(0);

    // `grid` is the default, so the URL drops the parameter entirely.
    await withPrefsSync(page, async () => {
      await page.getByRole('radio', { name: 'Dạng lưới' }).click();
      await expect(page.locator('[data-note-card]').first()).toBeVisible();
    });
    await page.goto('/');
    await expect(page.locator('[data-note-card]').first()).toBeVisible();
  });

  test('phân trang 6 mỗi trang, tiến và lùi, trang cuối hiện đúng khoảng', async ({ page }) => {
    await page.goto('/');
    const { total } = await listNotes(page);
    const pageCount = Math.ceil(total / PAGE_SIZE);
    expect(pageCount, 'the seed needs at least three pages for this test').toBeGreaterThanOrEqual(3);

    await expect(page.getByText(rangeText(1, total))).toBeVisible();
    await expect(page.locator('[data-note-card]')).toHaveCount(PAGE_SIZE);
    await expect(page.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    await page.getByRole('button', { name: 'Trang sau' }).click();
    await page.waitForURL('/?page=2');
    await expect(page.getByText(rangeText(2, total))).toBeVisible();

    await page.getByRole('button', { name: `Trang ${pageCount}`, exact: true }).click();
    await page.waitForURL(`/?page=${pageCount}`);
    await expect(page.getByText(rangeText(pageCount, total))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trang sau' })).toBeDisabled();

    await page.getByRole('button', { name: 'Trang trước' }).click();
    await page.waitForURL(`/?page=${pageCount - 1}`);
    await expect(page.getByText(rangeText(pageCount - 1, total))).toBeVisible();
  });

  test('đổi bộ lọc thì quay về trang 1', async ({ page }) => {
    await page.goto('/?page=2');
    await expect(page.getByRole('button', { name: 'Trang 2', exact: true })).toHaveAttribute('aria-current', 'page');

    await pickSort(page, 'Tên A–Z', '/?sort=title');
    expect(new URL(page.url()).searchParams.get('page')).toBeNull();

    // Removing a filter chip is a filter change too, so it also resets the page.
    await page.goto('/?page=2&priority=high');
    await page.getByRole('button', { name: 'Gỡ bộ lọc Ưu tiên cao' }).click();
    await page.waitForURL('/');
  });

  test('tham số rác vẫn ra trang 1 của sắp xếp mặc định', async ({ page }) => {
    await page.goto('/?page=999&sort=bogus&priority=purple&view=table');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tất cả ghi chú');
    await expect(page.getByRole('combobox', { name: 'Sắp xếp' })).toHaveText(/Mới cập nhật/);
    await expect(page.locator('[data-note-card]')).toHaveCount(PAGE_SIZE);
    await expect(page.locator('[data-note-row]')).toHaveCount(0);

    const { total } = await listNotes(page);
    await expect(page.getByText(rangeText(1, total))).toBeVisible();
    // No chip either: `priority=purple` is not a filter, it is noise.
    await expect(page.getByRole('button', { name: /^Gỡ bộ lọc/ })).toHaveCount(0);
  });

  test('chip bộ lọc gỡ được từng cái và “Xoá bộ lọc” xoá tất cả', async ({ page }) => {
    // A combination that still has results, so the empty state — which offers a
    // second "Xoá bộ lọc" — is not on screen.
    const url = `/?q=Tim&priority=high&tag=${encodeURIComponent(SEED_TOP_TAG.name)}`;
    await page.goto(url);
    await expect(page.locator('[data-empty-state]')).toHaveCount(0);

    const chipQ = page.getByRole('button', { name: 'Gỡ bộ lọc “Tim”' });
    const chipPriority = page.getByRole('button', { name: 'Gỡ bộ lọc Ưu tiên cao' });
    const chipTag = page.getByRole('button', { name: `Gỡ bộ lọc #${SEED_TOP_TAG.name}` });
    for (const chip of [chipQ, chipPriority, chipTag]) await expect(chip).toBeVisible();

    await chipPriority.click();
    await page.waitForURL(`/?q=Tim&tag=${encodeURIComponent(SEED_TOP_TAG.name).replace(/%20/g, '+')}`);
    await expect(chipPriority).toHaveCount(0);
    await expect(chipQ).toBeVisible();
    await expect(chipTag).toBeVisible();

    await chipTag.click();
    await page.waitForURL('/?q=Tim');
    await expect(chipTag).toHaveCount(0);
    await expect(chipQ).toBeVisible();

    await page.goto(url);
    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click();
    await page.waitForURL('/');
    await expect(page.getByRole('button', { name: /^Gỡ bộ lọc/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tất cả ghi chú');
  });

  test('không có kết quả thì hiện trạng thái rỗng', async ({ page }) => {
    await page.goto('/?q=khongcotukhoanaokhopvoidieunay');

    const empty = page.locator('[data-empty-state]');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('Không tìm thấy ghi chú');
    await expect(page.getByText('0 ghi chú', { exact: true })).toBeVisible();
    await expect(page.locator('[data-note-card]')).toHaveCount(0);

    await empty.getByRole('button', { name: 'Xoá bộ lọc' }).click();
    await page.waitForURL('/');
    await expect(page.locator('[data-note-card]').first()).toBeVisible();
  });

  test('bật yêu thích từ thẻ và từ dòng danh sách, giữ nguyên sau khi tải lại', async ({ page }) => {
    await page.goto('/');
    const cardNote = await createNote(page, { title: 'E2E · yêu thích từ thẻ', priority: 'low' });
    const rowNote = await createNote(page, { title: 'E2E · yêu thích từ dòng', priority: 'low' });
    created.push(cardNote, rowNote);

    // From a card in the grid.
    await page.goto('/');
    const cardStar = page
      .locator(`[data-note-card][data-note-id="${cardNote}"]`)
      .getByRole('button', { name: 'Yêu thích' });
    await expect(cardStar).toHaveAttribute('aria-pressed', 'false');
    await favouriteWritten(page, cardNote, async () => {
      await cardStar.click();
      // Optimistic: the star flips before the server has answered.
      await expect(cardStar).toHaveAttribute('aria-pressed', 'true');
    });
    await page.reload();
    await expect(
      page.locator(`[data-note-card][data-note-id="${cardNote}"]`).getByRole('button', { name: 'Yêu thích' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // From a row in the list view.
    await page.goto('/?view=list');
    const rowStar = page
      .locator(`[data-note-row][data-note-id="${rowNote}"]`)
      .getByRole('button', { name: 'Yêu thích' });
    await expect(rowStar).toHaveAttribute('aria-pressed', 'false');
    await favouriteWritten(page, rowNote, async () => {
      await rowStar.click();
      await expect(rowStar).toHaveAttribute('aria-pressed', 'true');
    });
    await page.reload();
    await expect(
      page.locator(`[data-note-row][data-note-id="${rowNote}"]`).getByRole('button', { name: 'Yêu thích' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Both now show up under the Yêu thích filter.
    await page.goto('/?fav=1&view=grid');
    await expect(page.locator(`[data-note-id="${cardNote}"]`)).toBeVisible();
    await expect(page.locator(`[data-note-id="${rowNote}"]`)).toBeVisible();
  });
});
