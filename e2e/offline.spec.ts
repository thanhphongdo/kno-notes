/**
 * Chế độ ngoại tuyến: đọc được khi mất mạng, và những gì làm lúc đó được gửi
 * lên khi có mạng lại.
 *
 * Spec này thật sự ngắt mạng của trình duyệt (`context.setOffline`), không giả
 * lập bằng mock — thứ duy nhất chứng minh được là người dùng ngồi trên tàu
 * điện vẫn đọc được ghi chú.
 *
 * Chạy trên một context riêng: service worker, IndexedDB và localStorage đều
 * là trạng thái dính, không được để rớt sang spec khác.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, STORAGE_STATE } from './fixtures/auth';

/**
 * Số ghi chú đang nằm trong bản sao ngoại tuyến.
 *
 * Hàm dò này TUYỆT ĐỐI không được tự tạo database: mở `open(name, 1)` khi
 * database chưa tồn tại sẽ dựng nó ở version 1 mà không có object store nào,
 * và lần mở sau của app cũng sẽ không kích hoạt `onupgradeneeded` nữa — app
 * kẹt với một kho rỗng vĩnh viễn. Nên: hỏi danh sách database trước, chỉ mở
 * khi nó đã có, và mở không kèm version.
 */
async function cachedNoteCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const known = await indexedDB.databases();
      if (!known.some((d) => d.name === 'kno-notes-offline')) return 0;

      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open('kno-notes-offline');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db) return 0;
      if (!db.objectStoreNames.contains('entries')) {
        db.close();
        return 0;
      }

      const keys = await new Promise<string[]>((resolve) => {
        const req = db.transaction('entries', 'readonly').objectStore('entries').getAllKeys();
        req.onsuccess = () => resolve(req.result.map(String));
        req.onerror = () => resolve([]);
      });
      db.close();
      return keys.filter((k) => k.startsWith('n:')).length;
    } catch {
      return 0;
    }
  });
}

/** Số thao tác đang chờ gửi lên. */
async function pendingCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const known = await indexedDB.databases();
      if (!known.some((d) => d.name === 'kno-notes-offline')) return 0;
      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open('kno-notes-offline');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db?.objectStoreNames.contains('entries')) {
        db?.close();
        return 0;
      }
      const keys = await new Promise<string[]>((resolve) => {
        const req = db.transaction('entries', 'readonly').objectStore('entries').getAllKeys();
        req.onsuccess = () => resolve(req.result.map(String));
        req.onerror = () => resolve([]);
      });
      db.close();
      return keys.filter((k) => k.startsWith('q:')).length;
    } catch {
      return 0;
    }
  });
}

/** Chờ tới khi kho có ít nhất `n` ghi chú. */
async function waitForCache(page: Page, n = 1): Promise<void> {
  await expect.poll(() => cachedNoteCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(n);
}

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => Boolean((await navigator.serviceWorker.getRegistration('/'))?.active),
    undefined,
    { timeout: 30_000 },
  );
}

async function signedIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await waitForServiceWorker(page);
  return page;
}

test.describe('Ngoại tuyến', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ storageState: STORAGE_STATE });
    page = await signedIn(context);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('tải trước toàn bộ ghi chú về máy lúc rảnh', async () => {
    await waitForCache(page, 3);
    expect(await cachedNoteCount(page)).toBeGreaterThanOrEqual(3);
  });

  test('bảng Giao diện nói rõ đã tải được bao nhiêu', async () => {
    await page.getByRole('button', { name: 'Giao diện' }).click();
    await expect(page.locator('[data-offline-status]')).toBeVisible();
    await expect(page.getByText(/Đã tải \d+/)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('mất mạng vẫn mở và đọc được ghi chú đã tải', async () => {
    await waitForCache(page, 3);
    await context.setOffline(true);
    try {
      // Điều hướng thật tới một ghi chú: mạng hỏng nên service worker trả
      // trang ngoại tuyến, và trình đọc dựng lại danh sách từ IndexedDB.
      await page.goto('/notes/n1');
      await expect(page.getByRole('heading', { name: 'Đang ngoại tuyến' })).toBeVisible();

      const rows = page.locator('[data-note-brief]');
      await expect(rows.first()).toBeVisible({ timeout: 20_000 });

      // Chọn đúng một ghi chú mẫu chứ không phải "dòng đầu tiên": thứ tự phụ
      // thuộc ghi chú mà các spec khác vừa tạo, và nội dung của chúng không
      // phải điều bài test này muốn nói.
      const seeded = rows.filter({ hasText: 'Phác đồ điều trị tăng huyết áp' }).first();
      await expect(seeded).toBeVisible();
      await seeded.click();

      await expect(page.locator('[data-offline-note]')).toBeVisible();
      await expect(page.locator('[data-prose]')).toContainText('Ngưỡng chẩn đoán');
    } finally {
      await context.setOffline(false);
    }
  });

  test('tìm được trong những ghi chú đã tải, ngay khi không có mạng', async () => {
    await context.setOffline(true);
    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Đang ngoại tuyến' })).toBeVisible();
      const rows = page.locator('[data-note-brief]');
      await expect(rows.first()).toBeVisible({ timeout: 20_000 });

      const before = await rows.count();
      await page.getByLabel('Tìm trong ghi chú đã tải').fill('khong-co-gi-khop-ca');
      await expect(rows).toHaveCount(0);
      expect(before).toBeGreaterThan(0);
    } finally {
      await context.setOffline(false);
    }
  });

  /**
   * Chiều ngược lại: làm gì đó khi mạng vừa rớt, rồi có mạng lại.
   *
   * Trang vẫn đang mở nên người dùng vẫn bấm được — chỉ có request là không đi
   * nổi. Thao tác phải được giữ lại chứ không âm thầm mất, và phải tự lên máy
   * chủ khi kết nối trở lại, không cần ai bấm gì thêm.
   */
  test('thao tác lúc mất mạng được gửi lên khi có mạng lại', async () => {
    // Bài này chờ hai nhịp mạng thật (rớt, rồi lên lại) nên cần rộng hơn mặc định.
    test.setTimeout(120_000);
    // Ghi chú riêng của bài test: dữ liệu mẫu là của chung, đổi trạng thái
    // yêu thích của nó sẽ làm các spec khác đọc thấy một dashboard khác.
    const title = `Ghi chú E2E ngoại tuyến ${Date.now().toString(36)}`;
    const created = await page.evaluate(async (noteTitle) => {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteTitle, desc: 'Do e2e tạo', tags: [], priority: 'medium',
          content: '<p>Nội dung ngoại tuyến.</p>', images: [], changeNote: '',
        }),
      });
      return ((await res.json()) as { note: { id: string } }).note.id;
    }, title);

    await page.goto('/');
    await waitForCache(page, 3);

    const card = page.locator('[data-note-card]').filter({ hasText: title }).first();
    await expect(card).toBeVisible();

    const star = card.getByRole('button', { name: 'Yêu thích' });
    const wasOn = (await star.getAttribute('aria-pressed')) === 'true';

    await context.setOffline(true);
    try {
      await star.click();
      // Sao đổi ngay và Ở NGUYÊN: thao tác đã được nhận, không bị trả ngược.
      await expect(star).toHaveAttribute('aria-pressed', String(!wasOn));
      await expect.poll(() => pendingCount(page), { timeout: 20_000 }).toBeGreaterThan(0);
    } finally {
      await context.setOffline(false);
    }

    // Có mạng lại: hàng đợi tự rỗng, không ai bấm gì.
    await expect.poll(() => pendingCount(page), { timeout: 40_000 }).toBe(0);

    // Và máy chủ thật sự đã nhận — hỏi lại qua API chứ không tin giao diện.
    const favourited = await page.evaluate(async (wanted) => {
      const res = await fetch('/api/notes?pageSize=100');
      const body = (await res.json()) as { notes: { title: string; fav: boolean }[] };
      return body.notes.find((n) => n.title.trim() === wanted)?.fav ?? null;
    }, title);
    expect(favourited).toBe(!wasOn);

    await page.evaluate(
      (id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }).then(() => undefined),
      created,
    );
  });
});
