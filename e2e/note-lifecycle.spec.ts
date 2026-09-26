/**
 * SPEC §6.3 — "tạo note → save v1", "sửa note → v2", "xem bản cũ + khôi phục",
 * "comment thêm/xoá", "tag CRUD trong editor", and the inline delete confirm.
 *
 * Every test owns the note it works on: the create test makes one through the
 * UI, the others start from one made through the API. Nothing here touches a
 * seeded note, and `afterEach` deletes whatever is left, so the file is
 * re-runnable and order-independent.
 */
import { test, expect } from './fixtures/auth';
import { cleanupNotes, createNote, forbidNativeDialogs, updateNote } from './helpers/app';

const created: string[] = [];

/** The editor's writing surface — the only contenteditable on the page. */
const canvas = (page: Parameters<typeof cleanupNotes>[0]) =>
  page.locator('[data-prose][contenteditable="true"]');

const toast = (page: Parameters<typeof cleanupNotes>[0]) => page.locator('[data-toast]');

/** `/notes/<id>` from the current URL, after a save has landed on the detail page. */
function noteIdFromUrl(url: string): string {
  const id = new URL(url).pathname.split('/').pop();
  expect(id, `no note id in ${url}`).toBeTruthy();
  return decodeURIComponent(id as string);
}

test.describe('Vòng đời ghi chú', () => {
  test.beforeEach(async ({ page }) => {
    forbidNativeDialogs(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupNotes(page, created);
  });

  test('tạo ghi chú mới: nội dung định dạng, thẻ, ưu tiên rồi lưu thành v1', async ({ page }) => {
    await page.goto('/notes/new');

    await expect(page.getByRole('button', { name: 'Lưu v1' })).toBeVisible();
    await expect(page.getByText('Ghi chú mới sẽ bắt đầu từ phiên bản v1.')).toBeVisible();

    await page.getByLabel('Tiêu đề ghi chú').fill('Ghi chú E2E · vòng đời');
    await page.getByLabel('Mô tả ngắn').fill('Mô tả ngắn do e2e tạo ra.');

    // Rich text, entirely through the toolbar. The heading goes first: applying
    // `formatBlock` to the only block in an empty editor is unambiguous, and
    // Enter at the end of an <h2> leaves it behind for the next block.
    await canvas(page).click();
    await page.keyboard.type('Phần một');
    // Select the line. `ControlOrMeta+a` inside a contenteditable selects only
    // that element's content, and unlike Shift+Home it behaves the same under
    // the mobile emulation profile.
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByRole('button', { name: 'Tiêu đề lớn' }).click();
    await expect(canvas(page).locator('h2')).toHaveText('Phần một');

    // Collapse the selection to its end. `End` does not collapse it under the
    // mobile emulation profile, so Enter would replace the heading text.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Đậm' }).click();
    await page.keyboard.type('Trọng tâm');
    await page.getByRole('button', { name: 'Đậm' }).click();
    await page.keyboard.type(' của ghi chú.');
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
    await page.keyboard.type('Mục một');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Mục hai');

    await expect(canvas(page).locator('h2')).toHaveText('Phần một');
    await expect(canvas(page).locator('ul li')).toHaveText(['Mục một', 'Mục hai']);

    // Tags: Enter adds, a trailing comma adds, Backspace on an empty field pops.
    const tagInput = page.getByLabel('Thêm thẻ');
    await tagInput.fill('E2E');
    await tagInput.press('Enter');
    await tagInput.fill('Thử nghiệm');
    await tagInput.press('Enter');
    await tagInput.fill('Tạm thời,');
    // The chips carry a per-tag remove button, which names them unambiguously —
    // the tag *suggestion* list below repeats the same words.
    const chip = (name: string) => page.getByRole('button', { name: `Gỡ thẻ ${name}` });
    await expect(chip('Tạm thời')).toBeVisible();
    await expect(tagInput).toHaveValue('');
    await tagInput.press('Backspace');
    await expect(chip('Tạm thời')).toHaveCount(0);
    await expect(chip('E2E')).toBeVisible();
    await expect(chip('Thử nghiệm')).toBeVisible();

    await page.getByRole('radio', { name: 'Cao' }).click();
    await expect(page.getByRole('radio', { name: 'Cao' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Lưu v1' }).click();
    await expect(toast(page)).toHaveText('Đã lưu · phiên bản v1');
    await page.waitForURL(/\/notes\/[^/]+$/);
    created.push(noteIdFromUrl(page.url()));

    // The detail page shows everything that was typed.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ghi chú E2E · vòng đời');
    await expect(page.getByText('Mô tả ngắn do e2e tạo ra.')).toBeVisible();
    await expect(page.getByText('Ưu tiên cao')).toBeVisible();
    await expect(page.getByText('#E2E', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('#Thử nghiệm', { exact: true }).first()).toBeVisible();

    const prose = page.locator('[data-prose]');
    await expect(prose.locator('h2')).toHaveText('Phần một');
    await expect(prose.locator('ul li')).toHaveText(['Mục một', 'Mục hai']);
    await expect(prose.locator('b, strong')).toHaveText('Trọng tâm');

    await expect(page.locator('[data-version-item]')).toHaveCount(1);
    await expect(page.locator('[data-version-item][data-version="1"]')).toContainText('v1 · Tạo ghi chú');
  });

  test('sửa nội dung tạo v2 và dòng thời gian xếp mới nhất trước', async ({ page }) => {
    const id = await createNote(page, {
      title: 'E2E · sửa thành v2',
      content: '<p>Bản đầu tiên.</p>',
      changeNote: 'Tạo ghi chú',
    });
    created.push(id);

    await page.goto(`/notes/${id}`);
    await page.getByRole('link', { name: 'Chỉnh sửa' }).click();
    await page.waitForURL(`/notes/${id}/edit`);
    await expect(page.getByRole('button', { name: 'Lưu v2' })).toBeVisible();

    await canvas(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Bổ sung từ e2e.');
    await page.getByLabel('Ghi chú phiên bản').fill('Sửa trong e2e');

    await page.getByRole('button', { name: 'Lưu v2' }).click();
    await expect(toast(page)).toHaveText('Đã lưu · phiên bản v2');
    await page.waitForURL(`/notes/${id}`);

    await expect(page.locator('[data-prose]')).toContainText('Bổ sung từ e2e.');
    const timeline = page.locator('[data-version-item]');
    await expect(timeline).toHaveCount(2);
    // Newest first.
    await expect(timeline.nth(0)).toHaveAttribute('data-version', '2');
    await expect(timeline.nth(1)).toHaveAttribute('data-version', '1');
    await expect(timeline.nth(0)).toContainText('v2 · Sửa trong e2e');
    await expect(timeline.nth(0)).toContainText('hiện tại');
  });

  test('lưu mà không đổi gì thì không tạo phiên bản mới', async ({ page }) => {
    const id = await createNote(page, {
      title: 'E2E · lưu không đổi',
      content: '<p>Không đổi một chữ nào.</p>',
    });
    created.push(id);

    await page.goto(`/notes/${id}/edit`);
    const save = page.getByRole('button', { name: 'Lưu v2' });
    await expect(save).toBeVisible();
    // Touch a field that is not title or content: it must not bump the version.
    await page.getByLabel('Ghi chú phiên bản').fill('Không nên tạo phiên bản');

    await save.click();
    await expect(toast(page)).toHaveText('Đã lưu · phiên bản v1');
    await page.waitForURL(`/notes/${id}`);
    await expect(page.locator('[data-version-item]')).toHaveCount(1);
    await expect(page.locator('[data-version-item][data-version="1"]')).toBeVisible();
  });

  test('mở bản cũ: banner hiện ra, đánh dấu bị khoá, khôi phục tạo v3', async ({ page }) => {
    const id = await createNote(page, {
      title: 'E2E · khôi phục',
      content: '<p>Bản một.</p>',
      changeNote: 'Tạo ghi chú',
    });
    created.push(id);
    expect(await updateNote(page, id, {
      title: 'E2E · khôi phục',
      content: '<p>Bản một.</p><p>Bản hai.</p>',
      changeNote: 'Thêm đoạn hai',
    })).toBe(2);

    await page.goto(`/notes/${id}`);
    await page.locator('[data-version-item][data-version="1"]').click();
    await page.waitForURL(`/notes/${id}?v=1`);

    // The old-version banner, and only the old content.
    const banner = page.getByText('Đang xem');
    await expect(banner).toBeVisible();
    await expect(page.locator('[data-prose]')).toContainText('Bản một.');
    await expect(page.locator('[data-prose]')).not.toContainText('Bản hai.');

    // Every mutation is off while an old version is on screen…
    const actions = page.locator('article');
    await expect(actions.getByRole('button', { name: 'Yêu thích' })).toBeDisabled();
    await expect(actions.getByRole('button', { name: 'Xoá', exact: true })).toBeDisabled();
    await expect(actions.getByRole('button', { name: 'Trắc nghiệm' })).toBeDisabled();

    // …including highlighting: selecting text offers no "Đánh dấu" popup.
    await page.evaluate(() => {
      const prose = document.querySelector('[data-prose]');
      const node = prose?.querySelector('p')?.firstChild;
      if (!node) throw new Error('no text node to select');
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(4, node.textContent?.length ?? 0));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.locator('[data-prose]').dispatchEvent('mouseup');
    await expect(page.locator('[data-hlpop]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Khôi phục bản này' }).click();
    await expect(toast(page)).toHaveText('Đã khôi phục thành v3');

    // Back on the clean URL — no `?v=`.
    await page.waitForURL(`/notes/${id}`);
    expect(new URL(page.url()).search).toBe('');
    await expect(page.getByText('Đang xem')).toHaveCount(0);

    const timeline = page.locator('[data-version-item]');
    await expect(timeline).toHaveCount(3);
    await expect(timeline.nth(0)).toHaveAttribute('data-version', '3');
    await expect(timeline.nth(0)).toContainText('v3 · Khôi phục từ v1');
    await expect(page.locator('[data-prose]')).toContainText('Bản một.');
    await expect(page.locator('[data-prose]')).not.toContainText('Bản hai.');
  });

  test('bình luận: gửi bằng nút và bằng ⌘/Ctrl+Enter, rồi xoá một cái', async ({ page }) => {
    const id = await createNote(page, { title: 'E2E · bình luận' });
    created.push(id);

    await page.goto(`/notes/${id}`);
    const box = page.getByLabel('Thêm bình luận');
    const comments = page.locator('[data-comment]');
    await expect(comments).toHaveCount(0);

    // Empty comments are not sent.
    await expect(page.getByRole('button', { name: 'Gửi' })).toBeDisabled();

    await box.fill('Bình luận thứ nhất, gửi bằng nút.');
    await page.getByRole('button', { name: 'Gửi' }).click();
    // The draft is only cleared once the POST came back ok.
    await expect(box).toHaveValue('');
    await expect(comments).toHaveCount(1);

    await box.fill('Bình luận thứ hai, gửi bằng phím tắt.');
    await box.press('ControlOrMeta+Enter');
    await expect(box).toHaveValue('');
    await expect(comments).toHaveCount(2);

    const second = comments.filter({ hasText: 'Bình luận thứ hai' });
    await expect(second).toHaveCount(1);
    await second.getByRole('button', { name: /^Xoá bình luận/ }).click();
    await expect(comments).toHaveCount(1);
    await expect(page.getByText('Bình luận thứ hai, gửi bằng phím tắt.')).toHaveCount(0);
    await expect(page.getByText('Bình luận thứ nhất, gửi bằng nút.')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-comment]')).toHaveCount(1);
  });

  test('xoá ghi chú: xác nhận trong trang, Huỷ bỏ qua, Xoá thì về dashboard', async ({ page }) => {
    const id = await createNote(page, { title: 'E2E · sẽ bị xoá' });
    created.push(id);

    await page.goto(`/notes/${id}`);
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toHaveCount(0);

    await page.getByRole('button', { name: 'Xoá', exact: true }).click();
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?');

    await confirm.getByRole('button', { name: 'Huỷ' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page).toHaveURL(`/notes/${id}`);

    await page.getByRole('button', { name: 'Xoá', exact: true }).click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Xoá', exact: true }).click();

    await expect(toast(page)).toHaveText('Đã xoá ghi chú');
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tất cả ghi chú');
    await expect(page.locator(`[data-note-id="${id}"]`)).toHaveCount(0);

    // Really gone: a direct visit lands on the not-found page, not on a stale
    // copy of the note. (The status stays 200 because the App Router has
    // already begun streaming the shell before `notFound()` runs.)
    await page.goto(`/notes/${id}`);
    await expect(page.getByText('Không tìm thấy trang')).toBeVisible();
    await expect(page.getByText('E2E · sẽ bị xoá')).toHaveCount(0);
  });
});
