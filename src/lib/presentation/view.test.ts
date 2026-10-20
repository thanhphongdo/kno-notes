import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRESENTATION_PATTERNS, type Presentation } from './schema';
import {
  BACKGROUND_LABEL, PRESENTATION_BACKGROUNDS, TEMPLATE_DEFAULT_BACKGROUND,
  clampSlideIndex, clearViewerPrefs, hasSlides, isBackgroundName, presentationPrefsKey,
  readViewerPrefs, resolvePresentationView, sanitizeViewerPrefs, slideNumber, splitBoldRuns,
  stepSlideIndex, writeViewerPrefs, type PrefsStore,
} from './view';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../app/presentation.css'),
  'utf8',
);

const base: Presentation = {
  template: 'editorial',
  brandKit: 'mint',
  slides: [{ layout: 'section', title: 'Phần một' }],
};

/** Kho giả: nhìn thấy được từng lượt đọc/ghi, và ném được theo yêu cầu. */
function fakeStore(initial: Record<string, string> = {}, throws = false): PrefsStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => {
      if (throws) throw new Error('site data bị chặn');
      return k in data ? data[k] : null;
    },
    setItem: (k, v) => {
      if (throws) throw new Error('hết dung lượng');
      data[k] = v;
    },
    removeItem: (k) => {
      if (throws) throw new Error('site data bị chặn');
      delete data[k];
    },
  };
}

describe('danh sách nền', () => {
  it('khớp đúng enum đóng của schema, cả tên lẫn thứ tự', () => {
    expect([...PRESENTATION_BACKGROUNDS]).toEqual([...PRESENTATION_PATTERNS]);
  });

  it('có 20 nền cộng `none`, và nền nào cũng có nhãn tiếng Việt', () => {
    expect(PRESENTATION_BACKGROUNDS).toHaveLength(21);
    for (const name of PRESENTATION_BACKGROUNDS) {
      expect(BACKGROUND_LABEL[name], name).toBeTruthy();
    }
  });

  it('nền nào cũng có rule trong presentation.css', () => {
    for (const name of PRESENTATION_BACKGROUNDS) {
      if (name === 'none') continue;
      expect(CSS, name).toContain(`.kn-bg[data-pattern="${name}"]`);
    }
  });

  it('không nhận tên lạ do LLM bịa ra', () => {
    expect(isBackgroundName('grid')).toBe(false);
    expect(isBackgroundName('')).toBe(false);
    expect(isBackgroundName(null)).toBe(false);
    expect(isBackgroundName('margin-rule')).toBe(true);
  });
});

describe('chỉ số slide', () => {
  it('kẹp về trong khoảng', () => {
    expect(clampSlideIndex(-5, 3)).toBe(0);
    expect(clampSlideIndex(9, 3)).toBe(2);
    expect(clampSlideIndex(1, 3)).toBe(1);
  });

  it('chịu được số không hợp lệ và bộ slide rỗng', () => {
    expect(clampSlideIndex(Number.NaN, 3)).toBe(0);
    expect(clampSlideIndex(1.7, 3)).toBe(1);
    expect(clampSlideIndex(2, 0)).toBe(0);
  });

  it('không vòng lại ở hai đầu', () => {
    expect(stepSlideIndex(0, -1, 4)).toBe(0);
    expect(stepSlideIndex(3, 1, 4)).toBe(3);
    expect(stepSlideIndex(0, 1, 4)).toBe(1);
  });

  it('đánh số hai chữ số như mockup', () => {
    expect(slideNumber(0)).toBe('01');
    expect(slideNumber(10)).toBe('11');
  });
});

describe('resolvePresentationView', () => {
  it('lấy mặc định của bài khi người xem chưa chọn gì', () => {
    const view = resolvePresentationView({
      presentation: { ...base, brandKit: 'clinic', pattern: 'wave-field', motion: 'subtle' },
    });
    expect(view.brandKit).toBe('clinic');
    expect(view.pattern).toBe('wave-field');
    expect(view.motion).toBe('subtle');
    expect(view.hasOverride).toBe(false);
  });

  it('thiếu `pattern` thì để mẫu tự quyết', () => {
    for (const template of ['editorial', 'deck', 'clinical'] as const) {
      const view = resolvePresentationView({ presentation: { ...base, template } });
      expect(view.pattern).toBe(TEMPLATE_DEFAULT_BACKGROUND[template]);
    }
  });

  it('tên nền cũ hoặc tên bịa cũng rơi về mặc định của mẫu, không phải lỗi', () => {
    const view = resolvePresentationView({ presentation: { ...base, pattern: 'grid' } });
    expect(view.pattern).toBe(TEMPLATE_DEFAULT_BACKGROUND.editorial);
  });

  it('thiếu `motion` thì mặc định là `full`', () => {
    expect(resolvePresentationView({ presentation: base }).motion).toBe('full');
  });

  it('lựa chọn của người xem đè lên mặc định của bài', () => {
    const view = resolvePresentationView({
      presentation: { ...base, brandKit: 'mint', pattern: 'margin-rule', motion: 'full' },
      prefs: { brandKit: 'paper', pattern: 'stone-vein', motion: 'subtle' },
    });
    expect(view.brandKit).toBe('paper');
    expect(view.pattern).toBe('stone-vein');
    expect(view.motion).toBe('subtle');
    expect(view.overridden).toEqual({ brandKit: true, pattern: true, motion: true });
    expect(view.hasOverride).toBe(true);
    expect(view.noteDefaults).toEqual({ brandKit: 'mint', pattern: 'margin-rule', motion: 'full' });
  });

  it('lựa chọn trùng với mặc định của bài thì không tính là đang đè', () => {
    const view = resolvePresentationView({
      presentation: { ...base, brandKit: 'paper' },
      prefs: { brandKit: 'paper' },
    });
    expect(view.brandKit).toBe('paper');
    expect(view.hasOverride).toBe(false);
  });

  it('người xem KHÔNG đổi được mẫu — mẫu luôn là của bài', () => {
    const view = resolvePresentationView({
      presentation: { ...base, template: 'clinical' },
      // @ts-expect-error `template` không phải là thứ người xem chọn được.
      prefs: { template: 'deck' },
    });
    expect(view.template).toBe('clinical');
  });

  it('prefers-reduced-motion thắng cả khi người dùng tự chọn `full`', () => {
    const view = resolvePresentationView({
      presentation: { ...base, motion: 'full' },
      prefs: { motion: 'full' },
      reducedMotion: true,
    });
    expect(view.motion).toBe('none');
    expect(view.motionChoice).toBe('full');
    expect(view.reducedMotionWins).toBe(true);
  });

  it('không báo "trợ năng đã thắng" khi người dùng vốn đã tắt chuyển động', () => {
    const view = resolvePresentationView({
      presentation: { ...base, motion: 'none' },
      reducedMotion: true,
    });
    expect(view.motion).toBe('none');
    expect(view.reducedMotionWins).toBe(false);
  });
});

describe('lựa chọn lưu trong localStorage', () => {
  it('scope theo userId đúng quy ước khoá của app', () => {
    expect(presentationPrefsKey('u1')).toBe('m:u1:presentation');
    expect(presentationPrefsKey('u1')).not.toBe(presentationPrefsKey('u2'));
  });

  it('kho trống nghĩa là "theo bài", không phải lỗi', () => {
    expect(readViewerPrefs('u1', fakeStore())).toEqual({});
  });

  it('kho ném lỗi thì vẫn chạy, chỉ là không nhớ được', () => {
    const store = fakeStore({}, true);
    expect(readViewerPrefs('u1', store)).toEqual({});
    expect(() => writeViewerPrefs('u1', { brandKit: 'paper' }, store)).not.toThrow();
    expect(() => clearViewerPrefs('u1', store)).not.toThrow();
  });

  it('không có `localStorage` (render trên máy chủ) cũng không ném', () => {
    expect(readViewerPrefs('u1', null)).toEqual({});
    expect(() => writeViewerPrefs('u1', { motion: 'none' }, null)).not.toThrow();
  });

  it('JSON hỏng rơi về "theo bài"', () => {
    const store = fakeStore({ 'm:u1:presentation': '{nope' });
    expect(readViewerPrefs('u1', store)).toEqual({});
  });

  it('một trường rác không làm mất hai trường còn lại', () => {
    const store = fakeStore({
      'm:u1:presentation': JSON.stringify({ brandKit: 'nope', pattern: 'stone-vein', motion: 'subtle' }),
    });
    expect(readViewerPrefs('u1', store)).toEqual({ pattern: 'stone-vein', motion: 'subtle' });
  });

  it('bỏ qua tên nền đã bị thay thế', () => {
    expect(sanitizeViewerPrefs({ pattern: 'hatch' })).toEqual({});
    expect(sanitizeViewerPrefs(null)).toEqual({});
    expect(sanitizeViewerPrefs('x')).toEqual({});
  });

  it('ghi rồi đọc lại ra đúng thứ đã ghi', () => {
    const store = fakeStore();
    writeViewerPrefs('u1', { brandKit: 'midnight' }, store);
    expect(readViewerPrefs('u1', store)).toEqual({ brandKit: 'midnight' });
  });

  it('ghi bản rỗng là xoá hẳn khoá — "về mặc định của bài"', () => {
    const store = fakeStore();
    writeViewerPrefs('u1', { brandKit: 'midnight' }, store);
    writeViewerPrefs('u1', {}, store);
    expect(store.data['m:u1:presentation']).toBeUndefined();
    expect(readViewerPrefs('u1', store)).toEqual({});
  });
});

describe('splitBoldRuns', () => {
  it('tách phần in đậm ra khỏi phần chữ thường', () => {
    expect(splitBoldRuns('<b>Xoay.</b> Đầu trong hai xương đòn.')).toEqual([
      { text: 'Xoay.', bold: true },
      { text: ' Đầu trong hai xương đòn.', bold: false },
    ]);
  });

  it('hiểu cả `<strong>`, và chữ thường thì trả về một khúc', () => {
    expect(splitBoldRuns('<strong>A</strong>')).toEqual([{ text: 'A', bold: true }]);
    expect(splitBoldRuns('chỉ là chữ')).toEqual([{ text: 'chỉ là chữ', bold: false }]);
  });

  it('thẻ khác KHÔNG được hiểu là định dạng — nó là chữ, và React tự thoát', () => {
    expect(splitBoldRuns('<img src=x onerror=alert(1)>')).toEqual([
      { text: '<img src=x onerror=alert(1)>', bold: false },
    ]);
  });
});

describe('hasSlides', () => {
  it('chỉ đúng khi bộ slide thật sự có slide', () => {
    expect(hasSlides(base)).toBe(true);
    expect(hasSlides({ ...base, slides: [] })).toBe(false);
    expect(hasSlides(null)).toBe(false);
    expect(hasSlides(undefined)).toBe(false);
  });
});
