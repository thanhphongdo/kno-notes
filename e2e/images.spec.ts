/**
 * Ảnh của ghi chú: lồng trong bài (WYSIWYG), vẫn liệt kê ở cuối bài, có alt,
 * và alt đó tìm kiếm được.
 *
 * Một ảnh chỉ tồn tại MỘT lần trong ghi chú nhưng hiện ở hai chỗ, nên mọi bài
 * test ở đây đều kiểm tra cả hai chỗ cùng lúc — đó chính là chỗ dễ lệch nhất.
 *
 * Spec này tự tạo ghi chú của mình và tự xoá, không đụng dữ liệu seed.
 */
import { test, expect, type Page } from './fixtures/auth';
import { cleanupNotes, forbidNativeDialogs } from './helpers/app';

const created: string[] = [];

/**
 * PNG 64×64 hợp lệ. Phải là ảnh thật: `uploadImage` kiểm magic bytes. Và phải
 * đủ lớn: một tấm 1×1 render ra đúng một pixel, cú click của Playwright rơi
 * trúng thẻ cha chứ không trúng ảnh.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsGthSN/2N4JvYbACS02/FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLDonDiin9hRAAAAABJRU5ErkJggg==',
  'base64',
);

const canvas = (page: Page) => page.locator('[data-prose][contenteditable="true"]');
const bodyImages = (page: Page) => canvas(page).locator('img');

/** Khung kéo thả ở rail — ảnh thêm từ đây rơi xuống cuối bài. */
async function attach(page: Page, name = 'ct-scan.png'): Promise<void> {
  await page
    .locator('input[type="file"][accept="image/*"]:not([aria-label])')
    .setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
}

/** Nút "Ảnh" trên thanh công cụ — chèn ngay tại con trỏ. */
async function insertAtCursor(page: Page, name = 'mri.png'): Promise<void> {
  await page
    .locator('input[type="file"][aria-label="Chèn ảnh vào nội dung"]')
    .setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
}

/**
 * Hai project (desktop + mobile) chạy cùng spec này trên CÙNG một database,
 * nên tiêu đề phải là duy nhất — nếu không, câu truy vấn trong bài test cuối
 * sẽ khớp cả ghi chú của project kia.
 */
const unique = (name: string): string => `${name} ${Date.now().toString(36)}`;

function noteIdFromUrl(url: string): string {
  const id = new URL(url).pathname.split('/').pop();
  expect(id, `no note id in ${url}`).toBeTruthy();
  return decodeURIComponent(id as string);
}

test.describe('Ảnh trong ghi chú', () => {
  test.beforeEach(async ({ page }) => {
    forbidNativeDialogs(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupNotes(page, created);
  });

  test('ảnh kéo thả vào rail nằm luôn trong bài và trong danh sách', async ({ page }) => {
    await page.goto('/notes/new');
    await attach(page);

    await expect(bodyImages(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Gỡ ảnh ct-scan.png' })).toBeVisible();
  });

  test('nút Ảnh trên thanh công cụ cũng ghi tên ảnh vào danh sách', async ({ page }) => {
    await page.goto('/notes/new');
    await insertAtCursor(page);

    await expect(bodyImages(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Gỡ ảnh mri.png' })).toBeVisible();
  });

  test('gỡ ảnh khỏi danh sách thì ảnh rời khỏi bài luôn', async ({ page }) => {
    await page.goto('/notes/new');
    await attach(page);
    await expect(bodyImages(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Gỡ ảnh ct-scan.png' }).click();
    await expect(bodyImages(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gỡ ảnh ct-scan.png' })).toHaveCount(0);
  });

  test('alt gõ ở rail ghi thẳng vào ảnh trong bài, lưu lại và tìm được', async ({ page }) => {
    const ALT = 'Phim CT sọ não không cản quang';

    const title = unique('Ghi chú E2E · ảnh có alt');

    await page.goto('/notes/new');
    await page.getByLabel('Tiêu đề ghi chú').fill(title);
    await page.getByLabel('Mô tả ngắn').fill('Mô tả không chứa từ khoá cần tìm.');
    await attach(page);
    await expect(bodyImages(page)).toHaveCount(1);

    const altBox = page.getByLabel('Mô tả ảnh ct-scan.png');
    await altBox.fill(ALT);
    await expect(bodyImages(page).first()).toHaveAttribute('alt', ALT);

    await page.getByRole('button', { name: 'Lưu v1' }).click();
    await page.waitForURL(/\/notes\/[^/]+$/);
    created.push(noteIdFromUrl(page.url()));

    // Ảnh vẫn nằm trong bài, và alt đi theo nó tới trang chi tiết.
    await expect(page.locator('[data-prose] img')).toHaveCount(1);
    await expect(page.locator('[data-prose] img').first()).toHaveAttribute('alt', ALT);
    // ...và vẫn có mục "Hình ảnh" ở cuối bài như trước.
    await expect(page.getByText('Hình ảnh · 1')).toBeVisible();

    // Alt giờ là thứ tìm kiếm soi tới — không chữ nào của nó ở tiêu đề/mô tả.
    await page.goto('/');
    await page.getByRole('searchbox').click();
    await page.getByRole('searchbox').fill('sọ não không cản quang');
    await expect(
      page.locator('[data-search-suggestions]').getByRole('button').filter({ hasText: title }),
    ).toBeVisible();
  });

  test('bấm ảnh giữa bài mở lightbox của cả bộ ảnh, không cụt một tấm', async ({ page }) => {
    await page.goto('/notes/new');
    await page.getByLabel('Tiêu đề ghi chú').fill(unique('Ghi chú E2E · hai ảnh'));
    await attach(page, 'mot.png');
    await expect(bodyImages(page)).toHaveCount(1);
    await attach(page, 'hai.png');
    await expect(bodyImages(page)).toHaveCount(2);

    await page.getByRole('button', { name: 'Lưu v1' }).click();
    await page.waitForURL(/\/notes\/[^/]+$/);
    created.push(noteIdFromUrl(page.url()));

    // Lưu xong là client navigation: DOM có ngay, nhưng handler chỉ gắn khi
    // React hydrate xong trang chi tiết. Bấm sớm một nhịp thì không có gì xảy
    // ra — nên thử lại cho tới khi lớp xem ảnh mở, thay vì chờ mù một con số.
    await expect(async () => {
      await page.locator('[data-prose] img').first().click();
      await expect(page.locator('[data-lightbox]')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.locator('[data-lightbox-counter]')).toHaveText('1 / 2');
  });

  /**
   * Chú thích ảnh giờ là alt do người dùng viết, nên nó dài như một câu thật.
   * Thư viện ảnh cuối bài phải chịu được điều đó: trên iPhone, một chú thích
   * dài từng kéo cả cột lưới rộng ra, đẩy trang tràn ngang và các dòng chữ
   * chồng lên nhau.
   */
  test('chú thích ảnh dài không làm trang tràn ngang', async ({ page }) => {
    const captions = [
      'Siêu âm phổi: dấu bờ biển, mã vạch và điểm phổi cùng ý nghĩa của từng dấu hiệu',
      'Đối chiếu X-quang và siêu âm trong tràn khí màng phổi, kèm cách ước lượng kích thước',
      'Sơ đồ tiếp cận tràn khí màng phổi tại giường khi chưa có phim chụp',
    ];

    await page.goto('/notes/new');
    await page.getByLabel('Tiêu đề ghi chú').fill(unique('Ghi chú E2E · chú thích dài'));
    for (let i = 0; i < captions.length; i += 1) {
      await attach(page, `anh-${i}.png`);
      await expect(bodyImages(page)).toHaveCount(i + 1);
      await page.getByLabel(`Mô tả ảnh anh-${i}.png`).fill(captions[i]!);
    }

    await page.getByRole('button', { name: 'Lưu v1' }).click();
    await page.waitForURL(/\/notes\/[^/]+$/);
    created.push(noteIdFromUrl(page.url()));

    await expect(page.getByText('Hình ảnh · 3')).toBeVisible();

    const measure = () =>
      page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        view: document.documentElement.clientWidth,
      }));

    const overflow = await measure();
    expect(overflow.doc, 'trang không được rộng hơn màn hình').toBeLessThanOrEqual(overflow.view);

    // Và vẫn phải đúng khi chữ to hơn dự kiến: iOS có thể tự phóng chữ, người
    // dùng có thể chỉnh cỡ chữ hệ thống. Bố cục không được phụ thuộc vào việc
    // chú thích vừa đúng một dòng.
    await page.addStyleTag({
      content: '[data-image-thumb] span { font-size: 22px !important; line-height: 1.3 !important }',
    });
    await page.waitForTimeout(300);
    const inflated = await measure();
    expect(inflated.doc, 'chữ to hơn vẫn không được làm tràn trang').toBeLessThanOrEqual(inflated.view);

    // Và không thumbnail nào được rộng hơn màn hình.
    const thumbs = page.locator('[data-image-thumb]');
    for (let i = 0; i < (await thumbs.count()); i += 1) {
      const box = (await thumbs.nth(i).boundingBox())!;
      expect(box.width, `thumbnail ${i} rộng hơn màn hình`).toBeLessThanOrEqual(overflow.view);
    }
  });
});
