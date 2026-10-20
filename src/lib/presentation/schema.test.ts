import { describe, it, expect } from 'vitest';
import {
  BRAND_KITS,
  ICON_NAMES,
  PRESENTATION_MOTIONS,
  PRESENTATION_PATTERNS,
  bulletIcon,
  bulletItem,
  bulletText,
  MAX_SLIDES,
  PRESENTATION_TEMPLATES,
  PresentationSchema,
  SLIDE_LAYOUTS,
  SlideSchema,
} from './schema';

const deck = (slides: unknown[]) => ({ template: 'deck', brandKit: 'mint', slides });

const ok = (slide: unknown) => expect(SlideSchema.safeParse(slide).success).toBe(true);
const bad = (slide: unknown) => expect(SlideSchema.safeParse(slide).success).toBe(false);

describe('hằng số', () => {
  it('liệt kê đúng ba template và bốn brand kit', () => {
    expect(PRESENTATION_TEMPLATES).toEqual(['editorial', 'deck', 'clinical']);
    expect(BRAND_KITS).toEqual(['mint', 'midnight', 'paper', 'clinic']);
    expect(MAX_SLIDES).toBe(60);
  });

  it('liệt kê đúng tám layout', () => {
    expect(SLIDE_LAYOUTS).toEqual([
      'title',
      'section',
      'bullets',
      'two-col',
      'image',
      'quote',
      'stat',
      'end',
    ]);
  });
});

describe('SlideSchema — bản hợp lệ của từng layout', () => {
  it('title', () => {
    ok({ layout: 'title', title: 'Đái tháo đường type 2' });
    ok({ layout: 'title', title: 'T', subtitle: 'Cập nhật 2025', kicker: 'Nội tiết' });
  });

  it('section', () => {
    ok({ layout: 'section', title: 'Chẩn đoán' });
  });

  it('bullets', () => {
    ok({ layout: 'bullets', title: 'Tiêu chuẩn', bullets: ['HbA1c ≥ 6.5%'] });
  });

  it('two-col', () => {
    ok({
      layout: 'two-col',
      title: 'So sánh',
      left: { heading: 'Type 1', bullets: ['Tự miễn'] },
      right: { bullets: ['Đề kháng insulin'] },
    });
  });

  it('image', () => {
    ok({ layout: 'image', imageId: 'n1i0' });
    ok({ layout: 'image', title: 'Sơ đồ', imageId: 'n1i0', caption: 'Bậc điều trị', bullets: ['A'] });
  });

  it('quote', () => {
    ok({ layout: 'quote', text: 'Điều trị sớm thay đổi tiên lượng.' });
    ok({ layout: 'quote', text: 'Trích', attribution: 'ADA 2025' });
  });

  it('stat', () => {
    ok({ layout: 'stat', value: '6.5%', label: 'Ngưỡng HbA1c' });
    ok({ layout: 'stat', value: '6.5%', label: 'Ngưỡng', support: 'Theo ADA' });
  });

  it('end', () => {
    ok({ layout: 'end', title: 'Cảm ơn' });
    ok({ layout: 'end', title: 'Cảm ơn', subtitle: 'Hỏi đáp' });
  });
});

describe('SlideSchema — bản không hợp lệ', () => {
  it('từ chối layout lạ', () => {
    bad({ layout: 'carousel', title: 'X' });
    bad({ title: 'Thiếu layout' });
  });

  it('từ chối khi thiếu trường bắt buộc', () => {
    bad({ layout: 'title' });
    bad({ layout: 'section' });
    bad({ layout: 'bullets', title: 'T' });
    bad({ layout: 'two-col', title: 'T', left: { bullets: ['a'] } });
    bad({ layout: 'image', caption: 'Thiếu imageId' });
    bad({ layout: 'quote', attribution: 'Thiếu text' });
    bad({ layout: 'stat', value: '10%' });
    bad({ layout: 'end' });
  });

  it('từ chối bullets rỗng hoặc quá nhiều', () => {
    bad({ layout: 'bullets', title: 'T', bullets: [] });
    bad({ layout: 'bullets', title: 'T', bullets: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    bad({ layout: 'bullets', title: 'T', bullets: [''] });
    bad({ layout: 'two-col', title: 'T', left: { bullets: [] }, right: { bullets: ['a'] } });
  });

  it('từ chối chuỗi quá dài', () => {
    bad({ layout: 'title', title: 'x'.repeat(201) });
    bad({ layout: 'bullets', title: 'T', bullets: ['x'.repeat(301)] });
    bad({ layout: 'quote', text: 'x'.repeat(601) });
    bad({ layout: 'stat', value: 'x'.repeat(25), label: 'L' });
  });

  it('từ chối imageId không hợp lệ', () => {
    bad({ layout: 'image', imageId: '' });
    bad({ layout: 'image', imageId: '../../etc/passwd' });
    bad({ layout: 'image', imageId: 'a'.repeat(129) });
    bad({ layout: 'image', imageId: 42 });
  });
});

describe('PresentationSchema', () => {
  it('nhận một bộ trình chiếu tối thiểu', () => {
    const parsed = PresentationSchema.parse(deck([{ layout: 'section', title: 'Mở đầu' }]));
    expect(parsed.slides).toHaveLength(1);
    expect(parsed.template).toBe('deck');
    expect(parsed.brandKit).toBe('mint');
  });

  it('từ chối template hoặc brand kit lạ', () => {
    expect(PresentationSchema.safeParse({ ...deck([{ layout: 'section', title: 'A' }]), template: 'poster' }).success).toBe(false);
    expect(PresentationSchema.safeParse({ ...deck([{ layout: 'section', title: 'A' }]), brandKit: 'neon' }).success).toBe(false);
  });

  it('từ chối khi thiếu template hoặc brandKit', () => {
    expect(PresentationSchema.safeParse({ slides: [{ layout: 'section', title: 'A' }] }).success).toBe(false);
  });

  it('từ chối slides rỗng', () => {
    expect(PresentationSchema.safeParse(deck([])).success).toBe(false);
  });

  it('từ chối quá 60 slide', () => {
    const slide = { layout: 'section', title: 'A' };
    expect(PresentationSchema.safeParse(deck(Array.from({ length: 60 }, () => slide))).success).toBe(true);
    expect(PresentationSchema.safeParse(deck(Array.from({ length: 61 }, () => slide))).success).toBe(false);
  });

  it('từ chối cả bộ khi chỉ một slide hỏng', () => {
    expect(
      PresentationSchema.safeParse(
        deck([{ layout: 'section', title: 'A' }, { layout: 'bullets', title: 'B', bullets: [] }]),
      ).success,
    ).toBe(false);
  });
});

describe('icon', () => {
  it('liệt kê đúng 18 icon', () => {
    expect(ICON_NAMES).toEqual([
      'alert', 'check', 'info', 'question', 'target', 'clock', 'chart', 'compare', 'layers',
      'list', 'book', 'idea', 'heart', 'lungs', 'bone', 'scan', 'stethoscope', 'pill',
    ]);
  });

  it('nhận icon ở cấp slide cho title/section/bullets/stat/end', () => {
    ok({ layout: 'title', title: 'T', icon: 'book' });
    ok({ layout: 'section', title: 'T', icon: 'layers' });
    ok({ layout: 'bullets', title: 'T', bullets: ['a'], icon: 'list' });
    ok({ layout: 'stat', value: '6.5%', label: 'L', icon: 'chart' });
    ok({ layout: 'end', title: 'Cảm ơn', icon: 'heart' });
  });

  it('từ chối icon ngoài danh sách', () => {
    bad({ layout: 'section', title: 'T', icon: 'rocket' });
    bad({ layout: 'bullets', title: 'T', bullets: [{ text: 'a', icon: 'rocket' }] });
  });
});

describe('bullet hai dạng', () => {
  it('nhận chuỗi trần (dữ liệu cũ) và object có icon', () => {
    ok({ layout: 'bullets', title: 'T', bullets: ['chuỗi trần', { text: 'có icon', icon: 'alert' }] });
    ok({ layout: 'bullets', title: 'T', bullets: [{ text: 'không icon' }] });
  });

  it('áp dụng cho cột của two-col và cho image', () => {
    ok({
      layout: 'two-col',
      title: 'T',
      left: { bullets: [{ text: 'a', icon: 'check' }] },
      right: { bullets: ['b'] },
    });
    ok({ layout: 'image', imageId: 'n1i0', bullets: [{ text: 'a', icon: 'scan' }] });
  });

  it('từ chối bullet object thiếu text hoặc text rỗng', () => {
    bad({ layout: 'bullets', title: 'T', bullets: [{ icon: 'alert' }] });
    bad({ layout: 'bullets', title: 'T', bullets: [{ text: '', icon: 'alert' }] });
    bad({ layout: 'bullets', title: 'T', bullets: [{ text: 'x'.repeat(301) }] });
    bad({ layout: 'bullets', title: 'T', bullets: [42] });
  });
});

describe('bulletText / bulletIcon / bulletItem', () => {
  it('đọc được cả hai dạng mà nơi gọi không phải phân nhánh', () => {
    expect(bulletText('trần')).toBe('trần');
    expect(bulletIcon('trần')).toBeUndefined();
    expect(bulletText({ text: 'có icon', icon: 'alert' })).toBe('có icon');
    expect(bulletIcon({ text: 'có icon', icon: 'alert' })).toBe('alert');
    expect(bulletIcon({ text: 'không icon' })).toBeUndefined();
    expect(bulletItem('trần')).toEqual({ text: 'trần', icon: undefined });
    expect(bulletItem({ text: 'a', icon: 'pill' })).toEqual({ text: 'a', icon: 'pill' });
  });
});

describe('pattern và motion', () => {
  it('liệt kê "none" cộng đúng 20 nền, giữ thứ tự đã chốt', () => {
    expect(PRESENTATION_PATTERNS).toEqual([
      'none',
      'corner-brackets',
      'edge-ticks',
      'margin-rule',
      'frame-inset',
      'corner-contour',
      'corner-fan',
      'side-pinstripe',
      'edge-weave',
      'paper-fiber',
      'linen-weave',
      'terrain-contour',
      'wave-field',
      'ecg-baseline',
      'concentric-arc',
      'halftone-drift',
      'mesh-wash',
      'color-block',
      'radiograph-grid',
      'stone-vein',
      'bokeh-soft',
    ]);
    expect(PRESENTATION_PATTERNS).toHaveLength(21);
    expect(PRESENTATION_MOTIONS).toEqual(['full', 'subtle', 'none']);
  });

  it('nhận mọi tên nền trong danh sách', () => {
    for (const pattern of PRESENTATION_PATTERNS) {
      const p = PresentationSchema.parse({
        ...deck([{ layout: 'section', title: 'A' }]),
        pattern,
      });
      expect(p.pattern).toBe(pattern);
    }
  });

  it('từ chối bộ tên nền CŨ', () => {
    for (const old of ['grid', 'dots', 'rule', 'hatch']) {
      expect(
        PresentationSchema.safeParse({
          ...deck([{ layout: 'section', title: 'A' }]),
          pattern: old,
        }).success,
      ).toBe(false);
    }
  });

  it('nhận pattern và motion hợp lệ', () => {
    const p = PresentationSchema.parse({
      ...deck([{ layout: 'section', title: 'A' }]),
      pattern: 'ecg-baseline',
      motion: 'subtle',
    });
    expect(p.pattern).toBe('ecg-baseline');
    expect(p.motion).toBe('subtle');
  });

  it('từ chối giá trị lạ', () => {
    expect(
      PresentationSchema.safeParse({ ...deck([{ layout: 'section', title: 'A' }]), pattern: 'waves' })
        .success,
    ).toBe(false);
    expect(
      PresentationSchema.safeParse({ ...deck([{ layout: 'section', title: 'A' }]), motion: 'fast' })
        .success,
    ).toBe(false);
  });

  it('KHÔNG tự điền giá trị mặc định — thiếu vẫn là thiếu', () => {
    const p = PresentationSchema.parse(deck([{ layout: 'section', title: 'A' }]));
    expect('pattern' in p).toBe(false);
    expect('motion' in p).toBe(false);
  });
});

describe('dữ liệu đã lưu trước khi có icon/pattern/motion', () => {
  it('parse nguyên vẹn, không mất trường nào', () => {
    const legacy = {
      template: 'editorial',
      brandKit: 'paper',
      slides: [
        { layout: 'title', title: 'Bài cũ', subtitle: 'v1' },
        { layout: 'bullets', title: 'Ý chính', bullets: ['một', 'hai'] },
        {
          layout: 'two-col',
          title: 'So sánh',
          left: { heading: 'A', bullets: ['x'] },
          right: { bullets: ['y'] },
        },
        { layout: 'image', imageId: 'n1i0', caption: 'Sơ đồ' },
        { layout: 'end', title: 'Hết' },
      ],
    };
    expect(PresentationSchema.parse(legacy)).toEqual(legacy);
  });
});
