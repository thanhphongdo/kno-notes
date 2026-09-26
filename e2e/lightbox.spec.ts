import { test, expect, type Page } from './fixtures/auth';
import { api, cleanupNotes } from './helpers/app';

/**
 * The lightbox (Design Spec §06, SPEC §3 "Chi tiết").
 *
 * Two entry points have to keep working — the attached-image grid under the
 * article and an `<img>` inside the prose — and the two viewports are
 * deliberately different products: desktop is the spec's 92vw × 78vh panel
 * driven by the arrow buttons and the keyboard, mobile is a full-screen
 * viewer driven by the finger. Both are asserted here so neither can be
 * "improved" into the other by accident.
 *
 * The fixture note is created through the API rather than reusing a seeded
 * one: the labels, the image count and the inline image all have to be known
 * exactly, and a spec may never assume another spec left the seed alone.
 */

/** A labelled 800×600 SVG, the shape of the diagrams this feature exists for. */
const swatch = (digit: string, fill: string): string =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">` +
      `<rect width="800" height="600" fill="#${fill}"/>` +
      `<text x="400" y="380" font-size="280" font-family="monospace" text-anchor="middle" fill="#fff">${digit}</text>` +
      `</svg>`,
  );

const ATTACHED = [
  { id: 'lbx-1', label: 'Sơ đồ bậc điều trị', src: swatch('1', '17756b') },
  { id: 'lbx-2', label: 'Bảng liều thuốc hạ áp', src: swatch('2', 'b3382e') },
  { id: 'lbx-3', label: 'Đường cong đáp ứng', src: swatch('3', '3b4a99') },
] as const;

const INLINE_SRC = swatch('P', '5b4636');
/** Alt của ảnh dán thẳng vào nội dung — chính nó là chú thích trong lightbox. */
const INLINE_ALT = 'Sơ đồ trong nội dung';

const CONTENT =
  '<h2>Nội dung</h2><p>Đoạn văn trước ảnh.</p>' +
  `<p><img src="${INLINE_SRC}" alt="${INLINE_ALT}"></p>` +
  '<p>Đoạn văn sau ảnh.</p>';

const lightbox = (page: Page) => page.locator('[data-lightbox]');
const lightboxImage = (page: Page) => page.locator('[data-lightbox-image]');
const counter = (page: Page) => page.locator('[data-lightbox-counter]');

async function createFixtureNote(page: Page): Promise<string> {
  const res = await api<{ note: { id: string } }>(page, '/api/notes', {
    method: 'POST',
    body: {
      title: 'Ghi chú có hình để xem ảnh',
      desc: 'Ba ảnh đính kèm và một ảnh trong nội dung.',
      tags: [],
      priority: 'medium',
      content: CONTENT,
      images: ATTACHED,
      changeNote: '',
    },
  });
  expect(res.status, `POST /api/notes → ${res.status}`).toBe(200);
  return res.body.note.id;
}

/** Opens the lightbox from the nth thumbnail of the attached-image grid. */
async function openFromGrid(page: Page, nth = 0): Promise<void> {
  await page.locator('[data-image-thumb]').nth(nth).click();
  await expect(lightbox(page)).toBeVisible();
}

/**
 * A horizontal drag across the viewer.
 *
 * `page.mouse` is the right tool even for the mobile project: Chromium emits
 * real `pointerdown`/`pointermove`/`pointerup` for it, which is exactly what
 * the component listens for, and `page.touchscreen` can only tap.
 */
async function swipe(page: Page, from: number, to: number): Promise<void> {
  const box = await lightbox(page).boundingBox();
  if (!box) throw new Error('the lightbox has no box to swipe across');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + to, y, { steps: 12 });
  await page.mouse.up();
}

test.describe('Lightbox', () => {
  const created: string[] = [];

  test.beforeEach(async ({ page }) => {
    const id = await createFixtureNote(page);
    created.push(id);
    await page.goto(`/notes/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupNotes(page, created);
  });

  test('opens from the attached-image grid, on the image that was clicked', async ({ page }) => {
    await expect(page.locator('[data-image-thumb]')).toHaveCount(ATTACHED.length);

    await openFromGrid(page, 1);
    await expect(counter(page)).toHaveText(`2 / ${ATTACHED.length}`);
    // Scoped to the overlay: the grid thumbnail behind it carries the same caption.
    await expect(lightbox(page)).toContainText(ATTACHED[1].label);
    await expect(lightboxImage(page)).toHaveCount(1);
    await expect(lightboxImage(page)).toHaveAttribute('alt', ATTACHED[1].label);
  });

  /**
   * Ảnh này được dán thẳng vào HTML nên không nằm trong `note.images` — mở
   * riêng một mình, và chú thích lấy từ chính alt của nó.
   */
  test('opens from an inline image in the prose, as a gallery of one', async ({ page }) => {
    await page.locator('[data-prose] img').click();

    await expect(lightbox(page)).toBeVisible();
    await expect(counter(page)).toHaveText('1 / 1');
    await expect(lightbox(page)).toContainText(INLINE_ALT);
    await expect(lightboxImage(page)).toHaveAttribute('src', INLINE_SRC);
    // One image: nothing to step to.
    await expect(page.getByRole('button', { name: 'Ảnh sau' })).toHaveCount(0);
  });

  test('closes on Esc', async ({ page }) => {
    await openFromGrid(page);
    await page.keyboard.press('Escape');
    await expect(lightbox(page)).toHaveCount(0);
  });

  test('closes with the close button', async ({ page }) => {
    await openFromGrid(page);
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(lightbox(page)).toHaveCount(0);
  });

  test.describe('desktop', () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 820, 'desktop only');

    test('steps with the arrow buttons and wraps around', async ({ page }) => {
      await openFromGrid(page);
      await expect(counter(page)).toHaveText('1 / 3');

      await page.getByRole('button', { name: 'Ảnh sau' }).click();
      await expect(counter(page)).toHaveText('2 / 3');
      await expect(lightboxImage(page)).toHaveAttribute('alt', ATTACHED[1].label);

      await page.getByRole('button', { name: 'Ảnh trước' }).click();
      await expect(counter(page)).toHaveText('1 / 3');

      // Wrapping backwards from the first image lands on the last.
      await page.getByRole('button', { name: 'Ảnh trước' }).click();
      await expect(counter(page)).toHaveText('3 / 3');
      await page.getByRole('button', { name: 'Ảnh sau' }).click();
      await expect(counter(page)).toHaveText('1 / 3');
    });

    test('steps with the arrow keys', async ({ page }) => {
      await openFromGrid(page);
      await page.keyboard.press('ArrowRight');
      await expect(counter(page)).toHaveText('2 / 3');
      await page.keyboard.press('ArrowRight');
      await expect(counter(page)).toHaveText('3 / 3');
      await page.keyboard.press('ArrowLeft');
      await expect(counter(page)).toHaveText('2 / 3');
    });

    test('keeps the image inside the spec cap of 92vw × 78vh', async ({ page }) => {
      await openFromGrid(page);
      const viewport = page.viewportSize();
      const box = await lightboxImage(page).boundingBox();
      if (!viewport || !box) throw new Error('no viewport or image box');
      expect(box.width).toBeLessThanOrEqual(viewport.width * 0.92 + 1);
      expect(box.height).toBeLessThanOrEqual(viewport.height * 0.78 + 1);
      // …and it is genuinely centred rather than full-bleed.
      expect(box.x).toBeGreaterThan(0);
    });

    test('closes when the scrim is clicked', async ({ page }) => {
      await openFromGrid(page);
      await page.mouse.click(12, 12);
      await expect(lightbox(page)).toHaveCount(0);
    });
  });

  test.describe('mobile', () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) >= 820, 'mobile only');

    test('a horizontal swipe moves to the next image and back', async ({ page }) => {
      await openFromGrid(page);
      await expect(counter(page)).toHaveText('1 / 3');
      const box = await lightbox(page).boundingBox();
      if (!box) throw new Error('no lightbox box');

      await swipe(page, box.width - 40, 40);
      await expect(counter(page)).toHaveText('2 / 3');
      await expect(lightboxImage(page)).toHaveAttribute('alt', ATTACHED[1].label);

      await swipe(page, 40, box.width - 40);
      await expect(counter(page)).toHaveText('1 / 3');
      await expect(lightboxImage(page)).toHaveAttribute('alt', ATTACHED[0].label);
    });

    test('a nudge springs back instead of stepping', async ({ page }) => {
      await openFromGrid(page);
      const box = await lightbox(page).boundingBox();
      if (!box) throw new Error('no lightbox box');
      await swipe(page, box.width / 2, box.width / 2 - 12);
      await expect(counter(page)).toHaveText('1 / 3');
    });

    test('fills the whole viewport, and the image is not letterboxed into 92vw', async ({ page }) => {
      await openFromGrid(page);
      const viewport = page.viewportSize();
      const dialog = await lightbox(page).boundingBox();
      const image = await lightboxImage(page).boundingBox();
      if (!viewport || !dialog || !image) throw new Error('no viewport or boxes');

      expect(dialog.width).toBe(viewport.width);
      expect(Math.round(dialog.height)).toBe(viewport.height);
      // 800×600 inside 390 wide: width-limited, so it uses the full width.
      expect(image.width).toBeCloseTo(viewport.width, 0);
    });

    test('the close button clears the safe area and still closes', async ({ page }) => {
      await openFromGrid(page);
      const close = await page.getByRole('button', { name: 'Đóng' }).boundingBox();
      if (!close) throw new Error('no close button');
      expect(close.y).toBeGreaterThanOrEqual(12);
      await page.getByRole('button', { name: 'Đóng' }).click();
      await expect(lightbox(page)).toHaveCount(0);
    });
  });
});
