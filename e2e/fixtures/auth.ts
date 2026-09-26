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
/**
 * Signed-in browser state, isolated per `E2E_SLOT`.
 *
 * Playwright re-reads this file for every test context, so a shared path lets
 * one slot's global-setup overwrite another's session. Because every slot uses
 * the same AUTH_SECRET the stolen JWT still verifies, and the run proceeds as a
 * user that does not exist in its own database — surfacing much later as a
 * foreign-key violation on the first write rather than as an auth failure.
 */
const SLOT = (process.env.E2E_SLOT ?? '').trim();
export const STORAGE_STATE = SLOT ? `e2e/.auth/user-${SLOT}.json` : 'e2e/.auth/user.json';

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
