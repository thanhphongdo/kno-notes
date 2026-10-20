import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Presentation } from '@/lib/presentation/schema';
import { REDUCED_MOTION_QUERY } from '@/hooks/use-reduced-motion';
import type { PrefsStore } from '@/lib/presentation/view';
import { PresentationViewer } from './presentation-viewer';

const presentation: Presentation = {
  template: 'editorial',
  brandKit: 'mint',
  pattern: 'margin-rule',
  motion: 'full',
  slides: [
    { layout: 'title', title: 'Slide một' },
    { layout: 'section', title: 'Slide hai' },
    { layout: 'bullets', title: 'Slide ba', bullets: ['Một'] },
  ],
};

function fakeStore(initial: Record<string, string> = {}, throws = false): PrefsStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => {
      if (throws) throw new Error('bị chặn');
      return k in data ? data[k] : null;
    },
    setItem: (k, v) => {
      if (throws) throw new Error('bị chặn');
      data[k] = v;
    },
    removeItem: (k) => {
      if (throws) throw new Error('bị chặn');
      delete data[k];
    },
  };
}

function setup(store: PrefsStore | null = fakeStore(), onClose = vi.fn()) {
  const utils = render(
    <PresentationViewer
      presentation={presentation}
      noteTitle="Đọc X-quang ngực theo ABCDE"
      userId="u1"
      onClose={onClose}
      prefsStore={store}
    />,
  );
  const root = () => utils.container.querySelector('.kn-present')!;
  return { ...utils, root, onClose };
}

/** Giả trả lời `true` cho đúng một media query, như trình duyệt thật. */
function stubMatchMedia(trueFor: string) {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === trueFor,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return () => Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
}

const counter = () => screen.getByTestId('kn-counter').textContent;
const openOptions = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Bộ màu, nền và mức chuyển động' }));

afterEach(() => vi.restoreAllMocks());

describe('PresentationViewer — điều hướng', () => {
  it('mở ở slide đầu và hiện số slide hiện tại', () => {
    setup();
    expect(counter()).toBe('01 / 3');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Slide một');
  });

  it('mũi tên, Space và PageDown / PageUp đều chuyển slide', () => {
    setup();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(counter()).toBe('02 / 3');
    fireEvent.keyDown(window, { key: ' ' });
    expect(counter()).toBe('03 / 3');
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(counter()).toBe('02 / 3');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toBe('01 / 3');
  });

  it('Home và End nhảy về hai đầu', () => {
    setup();
    fireEvent.keyDown(window, { key: 'End' });
    expect(counter()).toBe('03 / 3');
    fireEvent.keyDown(window, { key: 'Home' });
    expect(counter()).toBe('01 / 3');
  });

  it('không đi quá hai đầu, và nút ở đầu / cuối bị tắt', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Slide trước' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toBe('01 / 3');
    fireEvent.keyDown(window, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Slide sau' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(counter()).toBe('03 / 3');
  });

  it('nút lùi / tiến trên thanh điều khiển cũng chuyển slide', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Slide sau' }));
    expect(counter()).toBe('02 / 3');
    fireEvent.click(screen.getByRole('button', { name: 'Slide trước' }));
    expect(counter()).toBe('01 / 3');
  });

  it('Esc thoát chế độ trình chiếu', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc trong lúc bảng tuỳ chọn đang mở chỉ đóng bảng', () => {
    const { onClose } = setup();
    openOptions();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('vuốt ngang trên sân khấu chuyển slide', () => {
    const { container } = setup();
    const stage = container.querySelector('.kn-stage')!;
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 120, clientY: 108 }] });
    expect(counter()).toBe('02 / 3');
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 120, clientY: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 300, clientY: 108 }] });
    expect(counter()).toBe('01 / 3');
  });

  it('vuốt dọc KHÔNG chuyển slide', () => {
    const { container } = setup();
    const stage = container.querySelector('.kn-stage')!;
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 200, clientY: 60 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 210, clientY: 320 }] });
    expect(counter()).toBe('01 / 3');
  });
});

describe('PresentationViewer — lựa chọn của người xem', () => {
  it('mặc định bám đúng những gì người soạn đã chọn', () => {
    const { root } = setup();
    expect(root()).toHaveAttribute('data-template', 'editorial');
    expect(root()).toHaveAttribute('data-kit', 'mint');
    expect(root()).toHaveAttribute('data-pattern', 'margin-rule');
    expect(root()).toHaveAttribute('data-motion', 'full');
  });

  it('đổi bộ màu, nền và chuyển động — và ghi lại vào localStorage', () => {
    const store = fakeStore();
    const { root } = setup(store);
    openOptions();
    const panel = screen.getByRole('dialog');

    fireEvent.click(within(panel).getByRole('button', { name: 'Bộ màu Giấy' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Nền Vân đá' }));
    fireEvent.click(within(panel).getByRole('radio', { name: 'Nhẹ' }));

    expect(root()).toHaveAttribute('data-kit', 'paper');
    expect(root()).toHaveAttribute('data-pattern', 'stone-vein');
    expect(root()).toHaveAttribute('data-motion', 'subtle');
    expect(JSON.parse(store.data['m:u1:presentation'] ?? '{}')).toEqual({
      brandKit: 'paper', pattern: 'stone-vein', motion: 'subtle',
    });
  });

  it('lựa chọn đã lưu từ bài khác đè lên mặc định của bài này, và nói rõ điều đó', () => {
    const store = fakeStore({
      'm:u1:presentation': JSON.stringify({ brandKit: 'clinic', motion: 'none' }),
    });
    const { root } = setup(store);
    expect(root()).toHaveAttribute('data-kit', 'clinic');
    expect(root()).toHaveAttribute('data-motion', 'none');
    openOptions();
    expect(screen.getByText(/lựa chọn của bạn/i)).toBeInTheDocument();
  });

  it('"Về mặc định của bài" bỏ lựa chọn cá nhân và xoá luôn khoá đã lưu', () => {
    const store = fakeStore({
      'm:u1:presentation': JSON.stringify({ brandKit: 'clinic', pattern: 'bokeh-soft' }),
    });
    const { root } = setup(store);
    openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Về mặc định của bài' }));
    expect(root()).toHaveAttribute('data-kit', 'mint');
    expect(root()).toHaveAttribute('data-pattern', 'margin-rule');
    expect(store.data['m:u1:presentation']).toBeUndefined();
  });

  it('chưa lưu gì thì chưa cần nút "Về mặc định của bài"', () => {
    setup();
    openOptions();
    expect(screen.queryByRole('button', { name: 'Về mặc định của bài' })).toBeNull();
  });

  it('KHÔNG cho người xem đổi mẫu — bảng tuỳ chọn không có hàng nào cho mẫu', () => {
    setup();
    openOptions();
    const panel = screen.getByRole('dialog');
    expect(within(panel).queryByText('Mẫu')).toBeNull();
    for (const label of ['Biên tập', 'Thuyết trình', 'Bệnh án']) {
      expect(within(panel).queryByRole('radio', { name: label })).toBeNull();
    }
  });

  it('localStorage hỏng thì vẫn xem được, chỉ là không nhớ', () => {
    const store = fakeStore({}, true);
    const { root } = setup(store);
    expect(counter()).toBe('01 / 3');
    openOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Bộ màu Giấy' }));
    expect(root()).toHaveAttribute('data-kit', 'paper');
  });

  it('không có localStorage nào cả (ẩn danh, bị chặn) cũng dựng được', () => {
    const { root } = setup(null);
    expect(root()).toHaveAttribute('data-kit', 'mint');
    expect(counter()).toBe('01 / 3');
  });

  it('prefers-reduced-motion thắng cả lựa chọn `full` của người xem', () => {
    const restore = stubMatchMedia(REDUCED_MOTION_QUERY);
    try {
      const store = fakeStore({ 'm:u1:presentation': JSON.stringify({ motion: 'full' }) });
      const { root } = setup(store);
      expect(root()).toHaveAttribute('data-motion', 'none');
      openOptions();
      // Lựa chọn của người dùng vẫn còn nguyên, chỉ là không được áp.
      expect(screen.getByRole('radio', { name: 'Đầy đủ' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByText(/giảm chuyển động/i)).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
