import { test, expect, type Page } from './fixtures/auth';

/**
 * The quiz modal (SPEC §1.3 items 19–20, §3 "Quiz state machine").
 *
 * `.env.test` has no `GOOGLE_GENERATIVE_AI_API_KEY`, so every real run here
 * exercises the **offline generator**. Its wording is derived from the note's
 * own headings and is not a contract, so nothing below asserts on question
 * text: the assertions are structural (at most 5 questions, exactly 4 options,
 * exactly one correct) plus the state machine. One test stubs the endpoint
 * with a fixed AI payload to prove the AI path renders through the same UI.
 */

const NOTE = 'n1'; // the only seeded note that already has an attempt
const PLAIN_NOTE = 'n4'; // "Đọc ECG trong 10 bước" — no attempts, plenty of headings

const GENERATE = '**/api/notes/*/quiz/generate';

const dialog = (page: Page) => page.getByRole('dialog');

/** Answer questions `from`..`total` with key `1`, advancing with Enter. */
async function answerAllFrom(page: Page, from: number, total: number): Promise<void> {
  for (let i = from; i <= total; i++) {
    await expect(page.locator('[data-quiz-counter]')).toHaveText(`${i} / ${total}`);
    await expect(page.locator('[data-quiz-option]')).toHaveCount(4);
    await page.keyboard.press('1');
    await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
    await page.keyboard.press('Enter');
  }
}

test.describe('trắc nghiệm — bộ sinh offline', () => {
  test('mở từ nút chi tiết: loading → câu hỏi → kết quả → lưu vào lịch sử', async ({ page }) => {
    await page.goto(`/notes/${PLAIN_NOTE}`);
    const historyBefore = await page.locator('[data-quiz-history-item]').count();

    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-label', 'Trắc nghiệm');
    // The loading state has its own test below: the offline generator can
    // answer faster than an assertion can run, so racing it here would flake.
    await expect(page.locator('[data-quiz-option]').first()).toBeVisible({ timeout: 20_000 });

    // Structure, never wording (SPEC §2.5: 5 questions, 4 options, one answer).
    const counter = (await page.locator('[data-quiz-counter]').textContent())!;
    const total = Number(counter.split('/')[1].trim());
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(5);
    await expect(page.locator('[data-quiz-option]')).toHaveCount(4);
    await expect(page.getByText(`CÂU 1 / ${total}`)).toBeVisible();

    // The progress bar grows as questions are answered. Read the declared
    // width, not the painted one: the bar animates over 300ms.
    const progressPct = async () =>
      Number(
        (await page.locator('[data-quiz-progress]').getAttribute('style'))!.match(/width:\s*([\d.]+)%/)![1],
      );
    const pctAtStart = await progressPct();
    expect(pctAtStart).toBe(0);

    await page.locator('[data-quiz-option]').first().click();
    await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
    expect(await progressPct()).toBeCloseTo(100 / total, 5);

    // Exactly one option is the answer; the picked one is either it or wrong.
    const states = await page.$$eval('[data-quiz-option]', (els) =>
      els.map((e) => (e as HTMLElement).dataset.state),
    );
    expect(states.filter((s) => s === 'ok')).toHaveLength(1);
    expect(states.filter((s) => s === 'bad').length).toBeLessThanOrEqual(1);
    const feedbackCorrect = await page.locator('[data-quiz-feedback]').getAttribute('data-correct');
    expect(feedbackCorrect).toBe(states[0] === 'ok' ? 'true' : 'false');

    await page.keyboard.press('Enter');
    await answerAllFrom(page, 2, total);

    // ── result screen ───────────────────────────────────────────────────────
    await expect(page.getByText('Hoàn thành', { exact: true })).toBeVisible();
    const score = (await page.locator('[data-quiz-counter]').textContent())!;
    expect(score).toBe(`${total} câu`);
    const summary = page.getByText(/%\s·\s(Nắm vững|Cần ôn thêm|Nên đọc lại ghi chú)/);
    await expect(summary).toBeVisible();

    // The verdict band must agree with the percentage it is printed next to.
    const text = (await summary.textContent())!;
    const pct = Number(text.match(/(\d+)%/)![1]);
    const expected = pct >= 80 ? 'Nắm vững' : pct >= 50 ? 'Cần ôn thêm' : 'Nên đọc lại ghi chú';
    expect(text).toContain(expected);
    await expect(page.getByText('Xem lại đáp án')).toBeVisible();

    await page.getByRole('button', { name: 'Về ghi chú' }).click();
    await expect(dialog(page)).toHaveCount(0);

    // ── the attempt reaches the rail ────────────────────────────────────────
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(historyBefore + 1);
    await page.reload();
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(historyBefore + 1);
  });

  test('trạng thái đang tải hiện tiêu đề và skeleton', async ({ page }) => {
    // Hold the response open so the loading state is observable at all.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(GENERATE, async (route) => {
      await held;
      await route.fulfill({
        json: {
          source: 'offline',
          questions: [{ q: 'Câu duy nhất?', options: ['A', 'B', 'C', 'D'], answer: 0, explain: '' }],
        },
      });
    });

    await page.goto(`/notes/${PLAIN_NOTE}`);
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();

    await expect(page.getByText('Đang soạn câu hỏi…').first()).toBeVisible();
    await expect(page.getByText('Bộ câu hỏi được tạo từ chính nội dung của ghi chú này.')).toBeVisible();
    await expect(page.locator('[data-quiz-option]')).toHaveCount(0);
    // Counter and progress are empty until the questions land.
    await expect(page.locator('[data-quiz-counter]')).toHaveText('');

    release();
    await expect(page.getByText('Câu duy nhất?')).toBeVisible();
    await expect(page.locator('[data-quiz-option]')).toHaveCount(4);
    await page.keyboard.press('Escape');
  });

  test('mở từ "+ Làm bài" ở rail', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await page.getByRole('button', { name: '+ Làm bài' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('[data-quiz-option]').first()).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('chọn bằng chuột và bằng phím 1–4; lần chọn thứ hai không đổi đáp án', async ({ page }) => {
    await page.goto(`/notes/${PLAIN_NOTE}`);
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
    await expect(page.locator('[data-quiz-option]').first()).toBeVisible({ timeout: 20_000 });

    // Keyboard.
    await page.keyboard.press('2');
    await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
    const locked = await page.$$eval('[data-quiz-option]', (els) =>
      els.map((e) => (e as HTMLElement).dataset.state),
    );
    // Every option now carries a decided state — no `idle` left.
    expect(locked).not.toContain('idle');

    // A second key press and a second click are both ignored.
    await page.keyboard.press('3');
    await page.locator('[data-quiz-option]').nth(2).click({ force: true });
    expect(
      await page.$$eval('[data-quiz-option]', (els) => els.map((e) => (e as HTMLElement).dataset.state)),
    ).toEqual(locked);

    // Mouse, on the next question.
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-quiz-feedback]')).toHaveCount(0);
    await page.locator('[data-quiz-option]').nth(3).click();
    await expect(page.locator('[data-quiz-feedback]')).toBeVisible();
    await expect(page.locator('[data-quiz-option]').nth(3)).not.toHaveAttribute('data-state', 'idle');
  });

  test('Enter chỉ chuyển câu sau khi đã trả lời', async ({ page }) => {
    await page.goto(`/notes/${PLAIN_NOTE}`);
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
    await expect(page.locator('[data-quiz-option]').first()).toBeVisible({ timeout: 20_000 });

    const total = Number((await page.locator('[data-quiz-counter]').textContent())!.split('/')[1].trim());
    test.skip(total < 2, 'the offline generator produced a single question for this note');

    await page.keyboard.press('Enter');
    await expect(page.locator('[data-quiz-counter]')).toHaveText(`1 / ${total}`);

    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-quiz-counter]')).toHaveText(`2 / ${total}`);
  });

  test('mở một lần làm bài cũ vào chế độ xem lại và KHÔNG tạo bản ghi mới', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    const before = await page.locator('[data-quiz-history-item]').count();
    expect(before).toBeGreaterThan(0);

    await page.locator('[data-quiz-history-item]').first().click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-label', 'Kết quả trắc nghiệm');
    await expect(page.getByText('Lần làm bài', { exact: true })).toBeVisible();
    await expect(page.getByText('Xem lại đáp án')).toBeVisible();
    // Review opens straight at the result — never at a question.
    await expect(page.locator('[data-quiz-option]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Về ghi chú' }).click();
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(before);
    await page.reload();
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(before);
  });

  test('Esc đóng modal', async ({ page }) => {
    await page.goto(`/notes/${NOTE}`);
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('đóng khi đang tải huỷ kết quả về muộn — không lưu lần làm bài nào', async ({ page }) => {
    // The response is held back until after the modal has been closed.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(GENERATE, async (route) => {
      await held;
      await route.fulfill({
        json: {
          source: 'offline',
          questions: [
            { q: 'Câu muộn?', options: ['A', 'B', 'C', 'D'], answer: 0, explain: 'x' },
          ],
        },
      });
    });

    await page.goto(`/notes/${NOTE}`);
    const before = await page.locator('[data-quiz-history-item]').count();

    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();
    await expect(page.getByText('Đang soạn câu hỏi…').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    release();
    // The late payload must not reopen the modal or record anything.
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText('Câu muộn?')).toHaveCount(0);
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(before);
    await page.unroute(GENERATE);
    await page.reload();
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(before);
  });
});

test.describe('trắc nghiệm — đường AI', () => {
  test('payload AI dựng lên đúng giao diện như đường offline', async ({ page }) => {
    await page.route(GENERATE, (route) =>
      route.fulfill({
        json: {
          source: 'ai',
          questions: Array.from({ length: 5 }, (_, i) => ({
            q: `Câu hỏi AI ${i + 1}`,
            options: ['Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C', 'Lựa chọn D'],
            answer: i % 4,
            explain: `Giải thích ${i + 1}`,
          })),
        },
      }),
    );

    await page.goto(`/notes/${PLAIN_NOTE}`);
    const before = await page.locator('[data-quiz-history-item]').count();
    await page.getByRole('button', { name: 'Trắc nghiệm' }).click();

    await expect(page.getByText('Câu hỏi AI 1')).toBeVisible();
    await expect(page.locator('[data-quiz-counter]')).toHaveText('1 / 5');
    await expect(page.getByText('CÂU 1 / 5')).toBeVisible();
    await expect(page.locator('[data-quiz-option]')).toHaveCount(4);

    // Picking the known answer of question 1 (index 0) must read "Chính xác".
    await page.keyboard.press('1');
    await expect(page.locator('[data-quiz-feedback]')).toHaveAttribute('data-correct', 'true');
    await expect(page.getByText('Chính xác')).toBeVisible();
    await expect(page.getByText('Giải thích 1')).toBeVisible();
    await expect(page.locator('[data-quiz-option]').first()).toHaveAttribute('data-state', 'ok');

    await page.keyboard.press('Enter');
    // Question 2's answer is index 1, so key `1` is wrong here.
    await expect(page.getByText('Câu hỏi AI 2')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('[data-quiz-feedback]')).toHaveAttribute('data-correct', 'false');
    await expect(page.getByText('Chưa đúng — đáp án là B')).toBeVisible();
    await expect(page.locator('[data-quiz-option]').first()).toHaveAttribute('data-state', 'bad');
    await expect(page.locator('[data-quiz-option]').nth(1)).toHaveAttribute('data-state', 'ok');
    await expect(page.locator('[data-quiz-option]').nth(2)).toHaveAttribute('data-state', 'dim');

    await page.keyboard.press('Enter');
    await answerAllFrom(page, 3, 5);

    // Key `1` picks option A every time and the stub's answers are
    // [0, 1, 2, 3, 0], so exactly questions 1 and 5 are right: 2/5 = 40%.
    // Scoped to the dialog: an earlier run of this test leaves a `2/5` attempt
    // in the rail behind the modal, and an unscoped match would find both.
    const result = dialog(page);
    await expect(result.getByText('2/5', { exact: true })).toBeVisible();
    await expect(result.getByText('40% · Nên đọc lại ghi chú')).toBeVisible();

    await page.getByRole('button', { name: 'Về ghi chú' }).click();
    await expect(page.locator('[data-quiz-history-item]')).toHaveCount(before + 1);
  });
});
