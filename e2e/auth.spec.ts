/**
 * SPEC §6.3 — "login sai/đúng".
 *
 * The whole file runs signed out (`storageState: {}`), so it also proves the
 * middleware guard rather than relying on the session `global-setup` minted.
 */
import { test, expect, TEST_USER, login } from './fixtures/auth';
import { SESSION_COOKIE, isMobileProject, listNotes, openSidebar } from './helpers/app';
import { SEED_NEWEST } from './helpers/seed';

const LOGIN_DESCRIPTION = 'Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục.';
const LOGIN_ERROR = 'Sai tên đăng nhập hoặc mật khẩu.';

test.describe('Đăng nhập', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/login hiển thị thương hiệu và đúng một dòng mô tả', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Kno-Notes', level: 1 })).toBeVisible();
    const description = page.getByText(LOGIN_DESCRIPTION, { exact: true });
    await expect(description).toBeVisible();
    await expect(description).toHaveCount(1);
    await expect(page.getByLabel('Tên đăng nhập')).toBeVisible();
    await expect(page.getByLabel('Mật khẩu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('chưa đăng nhập thì mọi trang trong app đều quay về /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    // A deep link keeps where the visitor was going.
    await page.goto(`/notes/${SEED_NEWEST.id}`);
    await expect(page).toHaveURL(/\/login\?next=%2Fnotes%2F/);
  });

  test('sai mật khẩu hiện đúng câu lỗi, gõ lại thì lỗi biến mất', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(TEST_USER.username);
    await page.getByLabel('Mật khẩu').fill('mat-khau-sai');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    const alert = page.locator('form [role="alert"]');
    await expect(alert).toHaveText(LOGIN_ERROR);
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Mật khẩu').fill('1');
    await expect(alert).toHaveCount(0);

    // And an unknown username is told exactly the same thing.
    await page.getByLabel('Tên đăng nhập').fill('khong-ton-tai');
    await page.getByLabel('Mật khẩu').fill('bat-ky');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(LOGIN_ERROR);
  });

  test('Enter gửi form, đăng nhập đúng thì có phiên và vào dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(TEST_USER.username);
    await page.getByLabel('Mật khẩu').fill(TEST_USER.password);
    await page.getByLabel('Mật khẩu').press('Enter');

    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Tất cả ghi chú', level: 1 })).toBeVisible();

    const session = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE);
    expect(session, 'login must set the session cookie').toBeTruthy();
    expect(session?.httpOnly).toBe(true);

    // The session is real: /login now bounces back to the dashboard.
    await page.goto('/login');
    await expect(page).toHaveURL('/');
  });

  test('đăng xuất từ thanh bên rồi đăng nhập lại — dữ liệu còn nguyên', async ({ page }, testInfo) => {
    const mobile = isMobileProject(testInfo.project.name);
    await login(page);
    await page.waitForURL('/');
    const before = await listNotes(page);

    await openSidebar(page, mobile);
    await page.locator('aside').getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL(/\/login/);

    // The cookie is really gone, not merely unused.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    await login(page);
    await page.waitForURL('/');
    const after = await listNotes(page);
    expect(after.total).toBe(before.total);
    expect(after.notes.map((n) => n.id).sort()).toEqual(before.notes.map((n) => n.id).sort());
    await expect(page.locator('[data-note-title]').first()).toBeVisible();
  });

  test('đăng xuất từ popover Giao diện cũng hoạt động và giữ dữ liệu', async ({ page }) => {
    await login(page);
    await page.waitForURL('/');
    const before = await listNotes(page);

    await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Giao diện' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL(/\/login/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    await login(page);
    await page.waitForURL('/');
    const after = await listNotes(page);
    expect(after.total).toBe(before.total);
  });
});
