import { test as base, expect, type Page } from '@playwright/test';

/**
 * The seeded demo account (`docs/SPEC.md`, contracts §4 — the hint line
 * `Demo · bacsi / 123456` is only rendered outside production).
 */
export const TEST_USER = {
  username: 'bacsi',
  password: '123456',
  displayName: 'Bác sĩ',
} as const;

/** Where `global-setup` writes the signed-in session cookie. */
export const STORAGE_STATE = 'e2e/.auth/user.json';

/**
 * Drives the real login form. Used once by `global-setup` to mint
 * `STORAGE_STATE`; specs get the session for free through `use.storageState`.
 */
export async function login(page: Page, user: { username: string; password: string } = TEST_USER): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(user.username);
  await page.getByLabel('Mật khẩu').fill(user.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * The project-wide `test`. `page` is already authenticated because
 * `playwright.config.ts` sets `use.storageState`.
 *
 * A spec that needs a signed-out browser opts out with
 * `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
export const test = base;

export { expect };
export type { Page };
