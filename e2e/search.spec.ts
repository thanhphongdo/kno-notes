import { test, expect, type Page } from './fixtures/auth';

/**
 * The header search box and its suggestion panel (SPEC §1.2 item 17, §3
 * "Suggestion", Design Spec §06 "Gợi ý tìm kiếm").
 *
 * `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1` is forced by `playwright.config.ts`,
 * so the embedder never starts and ranking is keyword-only. That is the point
 * of the last test in this file: the panel is specified to *degrade*, not to
 * break, when the model is unavailable — so every behaviour below must hold
 * with no vectors at all.
 *
 * `recentSearches` is persisted per user, so any test that needs it creates
 * its own entry rather than relying on what another test left behind.
 */

const SEED = {
  anaphylaxis: 'Xử trí cấp cứu sốc phản vệ',
  ecg: 'Đọc ECG trong 10 bước',
  tag: 'Tim mạch',
} as const;

const box = (page: Page) => page.getByRole('searchbox');
const panel = (page: Page) => page.locator('[data-search-suggestions]');

/**
 * Clear whatever the current user has stored, so "Tìm gần đây" starts hidden.
 * The call has to come from inside the page: Playwright's API request context
 * will not send the `Secure` session cookie over plain http.
 */
async function clearRecent(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const res = await fetch('/api/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recentSearches: [] }),
    });
    return res.status;
  });
  expect(status).toBe(200);
}

/**
 * Type a query and wait until React has actually committed it.
 *
 * `fill()` sets the DOM value in one shot; the component's `value` state
 * catches up a tick later, and `Enter` handled before that commit submits the
 * *previous* value. The clear button only renders once the state is non-empty,
 * so waiting for it is the exact signal needed. A human typing can never
 * outrun React the way `fill()` can, so this is harness timing, not behaviour.
 */
async function type(page: Page, term: string): Promise<void> {
  await box(page).fill(term);
  await expect(page.getByRole('button', { name: 'Xoá từ khoá' })).toBeVisible();
}

/**
 * Submit the box and wait for the debounced `PATCH /api/prefs` that records
 * the term, so a following hard navigation cannot outrun it. The app itself
 * never hard-navigates here — `setQuery` uses `router.replace` — so this only
 * removes a race the test creates.
 */
async function submitAndPersist(page: Page): Promise<void> {
  const patched = page.waitForResponse(
    (r) => r.url().includes('/api/prefs') && r.request().method() === 'PATCH' && r.status() === 200,
  );
  await box(page).press('Enter');
  await patched;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await clearRecent(page);
  await page.reload();
});

test.describe('mở và đóng ô tìm kiếm', () => {
  test('phím / focus ô tìm kiếm, Esc đóng panel và bỏ focus', async ({ page }) => {
    await expect(box(page)).not.toBeFocused();
    await page.locator('h1').first().click();

    await page.keyboard.press('/');
    await expect(box(page)).toBeFocused();
    await expect(panel(page)).toBeVisible();
    // `/` is a shortcut, not a character: it must not land in the field.
    await expect(box(page)).toHaveValue('');

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(box(page)).not.toBeFocused();
  });

  test('panel mở khi focus và hiện Tìm gần đây, thẻ, Mở gần đây', async ({ page }) => {
    // Seed one recent term through the real flow so the section can appear.
    await box(page).click();
    await type(page, 'adrenalin');
    await submitAndPersist(page);
    await expect(page).toHaveURL(/[?&]q=adrenalin/);

    await page.goto('/');
    await box(page).click();

    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByText('Tìm gần đây')).toBeVisible();
    await expect(panel(page).getByText('adrenalin')).toBeVisible();
    // Idle titles (Design Spec §09): bare "Thẻ" and "Mở gần đây".
    await expect(panel(page).getByText('Thẻ', { exact: true })).toBeVisible();
    await expect(panel(page).getByText('Mở gần đây')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: new RegExp(`#${SEED.tag}`) }).first()).toBeVisible();

    // "Xoá" empties the list (contracts §4).
    await panel(page).getByRole('button', { name: 'Xoá', exact: true }).click();
    await expect(panel(page).getByText('Tìm gần đây')).toHaveCount(0);
  });
});

test.describe('gợi ý khi đang gõ', () => {
  test('hiện "Thẻ khớp" / "Ghi chú khớp" và dòng xem tất cả kết quả', async ({ page }) => {
    await box(page).click();
    await type(page, 'ECG');

    await expect(panel(page).getByText('Ghi chú khớp')).toBeVisible();
    await expect(panel(page).getByText(SEED.ecg)).toBeVisible();
    await expect(panel(page).getByText('Thẻ khớp')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: /Xem tất cả kết quả cho/ })).toBeVisible();
    await expect(panel(page).getByText('Xem tất cả kết quả cho “ECG”')).toBeVisible();

    // While typing, the recent-search section is replaced by the matches.
    await expect(panel(page).getByText('Tìm gần đây')).toHaveCount(0);
  });

  test('Enter đi tới dashboard và ghi lại từ khoá', async ({ page }) => {
    await box(page).click();
    await type(page, 'ECG');
    await submitAndPersist(page);

    await expect(page).toHaveURL('/?q=ECG');
    await expect(page.getByRole('heading', { name: 'Kết quả tìm kiếm', level: 1 })).toBeVisible();
    await expect(page.locator('[data-note-card], [data-note-row]').first()).toBeVisible();
    await expect(panel(page)).toHaveCount(0);

    // The term is now in "Tìm gần đây", and survives a full reload (Postgres).
    await page.goto('/');
    await box(page).click();
    await expect(panel(page).getByText('Tìm gần đây')).toBeVisible();
    await expect(panel(page).getByText('ECG', { exact: true })).toBeVisible();
  });

  test('bấm một ghi chú mở trang chi tiết của nó', async ({ page }) => {
    await box(page).click();
    await type(page, 'Glasgow');
    // `getByRole` alone would also match the "Xem tất cả kết quả cho …" row.
    const row = panel(page).getByRole('button').filter({ hasText: 'Thang điểm Glasgow' });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page).toHaveURL(/\/notes\/n7$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Glasgow');
  });

  test('bấm một thẻ lọc dashboard theo thẻ đó', async ({ page }) => {
    await box(page).click();
    await type(page, SEED.tag);
    const chip = panel(page).getByRole('button', { name: new RegExp(`#${SEED.tag}`) }).first();
    await expect(chip).toBeVisible();
    await chip.click();

    await expect(page).toHaveURL(new RegExp(`tag=${encodeURIComponent(SEED.tag).replace(/%20/g, '\\+')}`));
    await expect(page.getByRole('heading', { name: `#${SEED.tag}`, level: 1 })).toBeVisible();
    await expect(page.locator('[data-note-card], [data-note-row]').first()).toBeVisible();
  });

  test('không có kết quả thì hiện "Không có gợi ý cho …"', async ({ page }) => {
    await box(page).click();
    await type(page, 'zzzkhongcogi');

    await expect(panel(page).getByText('Không có gợi ý cho “zzzkhongcogi”')).toBeVisible();
    await expect(panel(page).getByText('Ghi chú khớp')).toHaveCount(0);
    await expect(panel(page).getByText('Thẻ khớp')).toHaveCount(0);
    // The "see all results" row is still offered — the dashboard is allowed
    // to disagree with the suggestion panel.
    await expect(panel(page).getByRole('button', { name: /Xem tất cả kết quả cho/ })).toBeVisible();
  });
});

test.describe('tiếng Việt không dấu', () => {
  test('"soc phan ve" khớp "Xử trí cấp cứu sốc phản vệ" ở gợi ý và ở dashboard', async ({ page }) => {
    await box(page).click();
    await type(page, 'soc phan ve');
    await expect(panel(page).getByText(SEED.anaphylaxis)).toBeVisible();

    await submitAndPersist(page);
    await expect(page).toHaveURL(/q=soc\+phan\+ve/);
    await expect(page.locator('[data-note-title]', { hasText: SEED.anaphylaxis })).toBeVisible();
  });

  test('"#tim mach" chỉ khớp thẻ "Tim mạch"', async ({ page }) => {
    await box(page).click();
    await type(page, '#tim mach');

    await expect(panel(page).getByText('Thẻ khớp')).toBeVisible();
    const chip = panel(page).getByRole('button', { name: new RegExp(`#${SEED.tag}`) }).first();
    await expect(chip).toBeVisible();

    // A `#` query is tag-only: no other tag may sneak in.
    const chips = await panel(page)
      .locator('button')
      .filter({ hasText: /^#/ })
      .allTextContents();
    expect(chips.every((c) => c.startsWith(`#${SEED.tag}`))).toBe(true);

    await chip.click();
    await expect(page.getByRole('heading', { name: `#${SEED.tag}`, level: 1 })).toBeVisible();
  });

  test('dashboard lọc "#cap cuu" không dấu qua URL', async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent('#cap cuu')}`);
    await expect(page.getByRole('heading', { name: 'Kết quả tìm kiếm', level: 1 })).toBeVisible();
    await expect(page.locator('[data-note-title]', { hasText: SEED.anaphylaxis })).toBeVisible();
  });
});

test('panel vẫn hoạt động khi bộ nhúng ngữ nghĩa không khả dụng', async ({ page }) => {
  // The kill switch is on for the whole suite (contracts §4), so this is the
  // app's real state here: no worker, no vectors, keyword ranking only.
  const modelRequests: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (/huggingface|\.onnx|transformers|worker/i.test(url)) modelRequests.push(url);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await box(page).click();
  await expect(panel(page)).toBeVisible();

  // Typing fast must not throw or blank the panel.
  for (const term of ['t', 'ti', 'tim', 'tim m', 'tim ma']) {
    await type(page, term);
    await expect(panel(page)).toBeVisible();
  }
  await expect(panel(page).getByText('Thẻ khớp')).toBeVisible();

  // Diacritics still rank, with no vectors anywhere in sight.
  await type(page, 'huyết áp');
  await expect(panel(page).getByText('Ghi chú khớp')).toBeVisible();

  expect(errors).toEqual([]);
  expect(modelRequests).toEqual([]);
});
