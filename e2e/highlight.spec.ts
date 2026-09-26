import { test, expect, type Page } from './fixtures/auth';

/**
 * Highlighting (SPEC §1.3 item 21, §3 "Highlight").
 *
 * The one rule that is easy to break and expensive to get wrong: a highlight
 * is an annotation, not an edit. It is written into `content` *and* into the
 * last version's content, and it must never create a new version — so every
 * test here counts `[data-version-item]` before and after.
 *
 * Selections are made with `document.createRange` rather than a mouse drag.
 * A drag over prose is flaky in every browser and would test Playwright's
 * pointer emulation; the app only ever reads `window.getSelection()`, so
 * building the selection directly exercises exactly the same code path. The
 * `mouseup` that follows is the real event the component listens for.
 */

const NOTE = 'n1'; // seeded with 3 versions, a quiz and one `<mark data-hl="hseed1">`
const SEEDED_HIGHLIGHT = 'hseed1';

/**
 * Bring a prose element on screen and wait for the scroll to finish.
 *
 * Two reasons this is a separate step. The bubble is `position: fixed` at the
 * selection's top, so an off-screen selection puts it outside the viewport
 * where it can never be clicked — a real reader only ever selects visible
 * text. And the bubble closes on *any* scroll, so the scroll event has to be
 * delivered before the selection is made, not after.
 */
async function scrollIntoView(page: Page, selector: string, nth = 0): Promise<void> {
  await page.evaluate(
    ({ selector, nth }) =>
      new Promise<void>((resolve) => {
        const prose = document.querySelector('[data-prose]');
        if (!prose) throw new Error('no [data-prose] on this page');
        const target = prose.querySelectorAll(selector)[nth];
        if (!target) throw new Error(`no ${selector}[${nth}] inside [data-prose]`);
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.removeEventListener('scroll', onScroll, true);
          resolve();
        };
        const twoFrames = () => requestAnimationFrame(() => requestAnimationFrame(finish));
        function onScroll() {
          twoFrames();
        }
        window.addEventListener('scroll', onScroll, true);
        target.scrollIntoView({ block: 'center' });
        // Nothing fires when the element was already in view.
        twoFrames();
      }),
    { selector, nth },
  );
}

/**
 * Click a `<mark>` to open the remove bubble.
 *
 * The scroll has to happen and settle first. Playwright's own auto-scroll runs
 * as part of the click, and the scroll event it produces arrives a frame later
 * — after the bubble has opened — which correctly dismisses it, leaving the
 * bubble detached mid-click.
 */
async function clickMark(page: Page, id: string): Promise<void> {
  const selector = `mark[data-hl="${id}"]`;
  await scrollIntoView(page, selector);
  await page.locator(`[data-prose] ${selector}`).first().click();
}

/** Select the contents of the nth element matching `selector` inside the prose. */
async function selectInProse(page: Page, selector: string, nth = 0): Promise<void> {
  await scrollIntoView(page, selector, nth);
  await page.evaluate(
    ({ selector, nth }) => {
      const prose = document.querySelector('[data-prose]');
      if (!prose) throw new Error('no [data-prose] on this page');
      const target = prose.querySelectorAll(selector)[nth];
      if (!target) throw new Error(`no ${selector}[${nth}] inside [data-prose]`);
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      prose.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { selector, nth },
  );
}

/** Select from the start of one element to the end of another — crosses blocks. */
async function selectAcrossProse(page: Page, fromSelector: string, toSelector: string): Promise<void> {
  await scrollIntoView(page, fromSelector);
  await page.evaluate(
    ({ fromSelector, toSelector }) => {
      const prose = document.querySelector('[data-prose]')!;
      const from = prose.querySelector(fromSelector)!;
      const to = prose.querySelector(toSelector)!;
      const range = document.createRange();
      range.setStart(from, 0);
      range.setEnd(to, to.childNodes.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      prose.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { fromSelector, toSelector },
  );
}

/** The ids of every highlight currently in the prose, in document order. */
async function highlightIds(page: Page): Promise<string[]> {
  return page.$$eval('[data-prose] mark[data-hl]', (marks) =>
    marks.map((m) => (m as HTMLElement).dataset.hl ?? ''),
  );
}

test.describe('đánh dấu', () => {
  test('bôi đen → Đánh dấu bọc mark, thêm mục ở rail, và KHÔNG tạo phiên bản mới', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await expect(page.locator('[data-prose]')).toBeVisible();

    const versionsBefore = await page.locator('[data-version-item]').count();
    expect(versionsBefore).toBeGreaterThan(0);
    const marksBefore = await highlightIds(page);
    const railBefore = await page.locator('[data-highlight-item]').count();

    await selectInProse(page, 'li');

    // The bubble is in "add" mode and sits above the selection.
    const popup = page.locator('[data-hlpop]');
    await expect(popup).toHaveAttribute('data-mode', 'add');
    await expect(popup.getByRole('button', { name: 'Đánh dấu' })).toBeVisible();
    const selection = (await page.locator('[data-prose] li').first().boundingBox())!;
    const bubble = (await popup.boundingBox())!;
    // `clampHighlightPosition` pins the bubble at y = 56, so "above the
    // selection" is only meaningful when the selection is below that.
    expect(selection.y).toBeGreaterThan(120);
    expect(bubble.y).toBeGreaterThanOrEqual(0);
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(selection.y + 2);
    // Horizontally centred on the selection, within the 90px edge clamp.
    expect(Math.abs(bubble.x + bubble.width / 2 - (selection.x + selection.width / 2)))
      .toBeLessThan(selection.width / 2 + 90);

    await popup.getByRole('button', { name: 'Đánh dấu' }).click();

    await expect(page.locator('[data-highlight-item]')).toHaveCount(railBefore + 1);
    const idsAfter = await highlightIds(page);
    expect(idsAfter.length).toBe(marksBefore.length + 1);

    // The whole point: annotating is not editing.
    await expect(page.locator('[data-version-item]')).toHaveCount(versionsBefore);

    // …and it survives a reload, which proves the PUT reached storage.
    await page.reload();
    await expect(page.locator('[data-highlight-item]')).toHaveCount(railBefore + 1);
    await expect(page.locator('[data-version-item]')).toHaveCount(versionsBefore);
    expect(await highlightIds(page)).toEqual(idsAfter);

    // ── remove it again, restoring the seeded state for every other test ────
    const added = idsAfter.find((id) => !marksBefore.includes(id))!;
    await clickMark(page, added);
    const removePopup = page.locator('[data-hlpop]');
    await expect(removePopup).toHaveAttribute('data-mode', 'remove');
    await removePopup.getByRole('button', { name: 'Bỏ đánh dấu' }).click();

    await expect(page.locator(`[data-prose] mark[data-hl="${added}"]`)).toHaveCount(0);
    await expect(page.locator('[data-highlight-item]')).toHaveCount(railBefore);
    await expect(page.locator('[data-version-item]')).toHaveCount(versionsBefore);

    await page.reload();
    await expect(page.locator('[data-highlight-item]')).toHaveCount(railBefore);
    expect(await highlightIds(page)).toEqual(marksBefore);
  });

  test('đoạn đánh dấu sẵn trong dữ liệu mẫu hiện ở nội dung và ở rail', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await expect(page.locator(`[data-prose] mark[data-hl="${SEEDED_HIGHLIGHT}"]`)).toBeVisible();
    await expect(page.locator('[data-highlight-item]')).toHaveCount(1);
    await expect(page.locator('[data-highlight-item]').first()).toContainText(
      'Ưu tiên viên phối hợp liều cố định',
    );
  });

  test('popup đóng khi mousedown ra ngoài và khi cuộn trang', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await expect(page.locator('[data-prose]')).toBeVisible();

    await selectInProse(page, 'li');
    await expect(page.locator('[data-hlpop]')).toBeVisible();
    // Anywhere outside the bubble — the heading is always present and inert.
    await page.locator('h1').first().dispatchEvent('mousedown');
    await expect(page.locator('[data-hlpop]')).toHaveCount(0);

    await selectInProse(page, 'li', 1);
    await expect(page.locator('[data-hlpop]')).toBeVisible();
    await page.mouse.wheel(0, 240);
    await expect(page.locator('[data-hlpop]')).toHaveCount(0);
  });

  test('vùng chọn qua hai khối là MỘT highlight và không lồng vào mark có sẵn', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await expect(page.locator('[data-prose]')).toBeVisible();

    const versionsBefore = await page.locator('[data-version-item]').count();
    const railBefore = await page.locator('[data-highlight-item]').count();
    const before = await highlightIds(page);

    // The `<ol>` is virgin text and the `<blockquote>` right after it is
    // entirely inside the seeded `<mark>`, so one range covers both cases.
    await selectAcrossProse(page, 'ol', 'blockquote');
    await expect(page.locator('[data-hlpop][data-mode="add"]')).toBeVisible();
    await page.locator('[data-hlpop]').getByRole('button', { name: 'Đánh dấu', exact: true }).click();

    await expect(page.locator('[data-highlight-item]')).toHaveCount(railBefore + 1);

    const after = await highlightIds(page);
    const added = after.filter((id) => !before.includes(id));
    // Several `<mark>` fragments, but exactly ONE id: one logical highlight.
    expect(new Set(added).size).toBe(1);
    expect(added.length).toBeGreaterThan(1);

    // Never nested: no mark contains another mark.
    expect(await page.$$eval('[data-prose] mark[data-hl] mark', (n) => n.length)).toBe(0);
    // The seeded highlight is untouched.
    await expect(page.locator(`[data-prose] mark[data-hl="${SEEDED_HIGHLIGHT}"]`)).toHaveCount(1);
    await expect(page.locator('[data-version-item]')).toHaveCount(versionsBefore);

    // Clean up so the seeded state is what the next test sees.
    await clickMark(page, added[0]);
    await page.locator('[data-hlpop]').getByRole('button', { name: 'Bỏ đánh dấu' }).click();
    await expect(page.locator('[data-highlight-item]')).toHaveCount(railBefore);
    await page.reload();
    expect(await highlightIds(page)).toEqual(before);
  });

  test('xoá từ rail cũng gỡ mark khỏi nội dung', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await expect(page.locator('[data-prose]')).toBeVisible();

    // The first `<p>` sits above the seeded blockquote, so the new highlight
    // is the FIRST rail entry — the rail is in document order.
    await selectInProse(page, 'p');
    await page.locator('[data-hlpop]').getByRole('button', { name: 'Đánh dấu', exact: true }).click();
    await expect(page.locator('[data-highlight-item]')).toHaveCount(2);
    // That paragraph contains a `<strong>`, so the range spans three text
    // nodes and yields three `<mark>` fragments — still two logical highlights.
    expect(new Set(await highlightIds(page)).size).toBe(2);

    await page.locator('[data-highlight-item]').first().getByRole('button', { name: 'Bỏ đánh dấu' }).click();

    await expect(page.locator('[data-highlight-item]')).toHaveCount(1);
    await page.reload();
    expect(await highlightIds(page)).toEqual([SEEDED_HIGHLIGHT]);
  });

  test('không cho đánh dấu khi đang xem bản cũ', async ({ page }) => {
    await page.goto(`/notes/${NOTE}?v=1`);
    await expect(page.getByText(/Đang xem/)).toBeVisible();

    await selectInProse(page, 'p');
    await expect(page.locator('[data-hlpop]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đánh dấu', exact: true })).toHaveCount(0);

    // Clicking an existing mark on an old version must not offer removal either.
    await page.goto(`/notes/${NOTE}`);
    const seeded = page.locator(`[data-prose] mark[data-hl="${SEEDED_HIGHLIGHT}"]`);
    await expect(seeded).toBeVisible();
    await page.goto(`/notes/${NOTE}?v=1`);
    const onOld = page.locator(`[data-prose] mark[data-hl="${SEEDED_HIGHLIGHT}"]`);
    if (await onOld.count()) {
      await scrollIntoView(page, `mark[data-hl="${SEEDED_HIGHLIGHT}"]`);
      await onOld.first().click();
      await expect(page.locator('[data-hlpop]')).toHaveCount(0);
    }
  });
});
