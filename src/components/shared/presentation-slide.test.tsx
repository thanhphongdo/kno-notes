import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Slide } from '@/lib/presentation/schema';
import { PresentationSlide } from './presentation-slide';

const common = {
  index: 2,
  total: 11,
  noteTitle: 'Đọc X-quang ngực theo ABCDE',
  pattern: 'margin-rule' as const,
  motion: 'none' as const,
};

function renderSlide(slide: Slide, extra: Partial<React.ComponentProps<typeof PresentationSlide>> = {}) {
  return render(
    <PresentationSlide slide={slide} template="editorial" {...common} {...extra} />,
  );
}

describe('PresentationSlide', () => {
  it('dựng layout `title` với kicker, tiêu đề và phụ đề', () => {
    const { container } = renderSlide({
      layout: 'title',
      kicker: 'Chẩn đoán hình ảnh',
      title: 'Đọc X-quang ngực theo ABCDE',
      subtitle: 'Một thứ tự cố định.',
      icon: 'scan',
    });
    expect(container.querySelector('.kn-slide')).toHaveAttribute('data-layout', 'title');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Đọc X-quang ngực theo ABCDE');
    expect(container.querySelector('.kn-kicker')).toHaveTextContent('Chẩn đoán hình ảnh');
    expect(container.querySelector('.kn-sub')).toHaveTextContent('Một thứ tự cố định.');
    // Icon cấp slide nằm ở chrome, không phải trong dòng chữ.
    expect(container.querySelector('.kn-chrome-ico')).not.toBeNull();
  });

  it('dựng layout `bullets`, đánh số dấu đầu dòng và hiểu `<b>` ở đầu dòng', () => {
    const { container } = renderSlide({
      layout: 'bullets',
      title: 'RIPE',
      bullets: ['<b>Xoay.</b> Đầu trong hai xương đòn.', { text: 'Hít vào.', icon: 'lungs' }],
    });
    const items = container.querySelectorAll('.kn-bullets li');
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('.kn-b-mark span')).toHaveTextContent('01');
    expect(items[0]?.querySelector('.kn-b-text b')).toHaveTextContent('Xoay.');
    expect(items[0]?.querySelector('.kn-b-text')).toHaveTextContent('Xoay. Đầu trong hai xương đòn.');
    // Dòng có icon thì dấu đầu dòng là icon, không còn số.
    expect(items[1]?.querySelector('.kn-b-mark--icon svg')).not.toBeNull();
  });

  it('không bao giờ cho HTML lạ đi vào DOM dưới dạng thẻ', () => {
    const { container } = renderSlide({
      layout: 'bullets',
      title: 'An toàn',
      bullets: ['<img src=x onerror=alert(1)>'],
    });
    expect(container.querySelector('.kn-bullets img')).toBeNull();
    expect(container.querySelector('.kn-b-text')).toHaveTextContent('<img src=x onerror=alert(1)>');
  });

  it('dựng layout `two-col` thành hai cột có đầu đề riêng', () => {
    const { container } = renderSlide({
      layout: 'two-col',
      title: 'A và B',
      left: { heading: 'A · Airway', bullets: ['Khí quản.'] },
      right: { heading: 'B · Bones', bullets: ['Xương sườn.'] },
    });
    const cols = container.querySelectorAll('.kn-cols > .kn-col');
    expect(cols).toHaveLength(2);
    expect(cols[0]?.querySelector('.kn-col-head')).toHaveTextContent('A · Airway');
    expect(cols[1]?.querySelector('.kn-col-head')).toHaveTextContent('B · Bones');
  });

  it('dựng layout `quote` tách từng từ, để mức "Đầy đủ" hiện dần theo dòng đọc', () => {
    const { container } = renderSlide({
      layout: 'quote',
      text: 'Phim không bỏ sót tổn thương.',
      attribution: 'Lý do phải đọc theo thứ tự',
    });
    expect(container.querySelectorAll('.kn-q-text .kn-w')).toHaveLength(6);
    expect(container.querySelector('.kn-q-text')).toHaveTextContent('Phim không bỏ sót tổn thương.');
    expect(container.querySelector('.kn-q-at')).toHaveTextContent('Lý do phải đọc theo thứ tự');
  });

  it('dựng layout `stat` và giữ nguyên con số khi chuyển động đang tắt', () => {
    const { container } = renderSlide({
      layout: 'stat',
      value: '0,50',
      label: 'Ngưỡng chỉ số tim – lồng ngực',
      support: 'Đo trên phim thẳng.',
    });
    expect(container.querySelector('.kn-stat-value')).toHaveTextContent('0,50');
    expect(container.querySelector('.kn-stat-label')).toHaveTextContent('Ngưỡng chỉ số tim');
    expect(container.querySelector('.kn-stat-support')).toHaveTextContent('Đo trên phim thẳng.');
  });

  it('đánh số slide `section` theo thứ tự các phần, không theo thứ tự slide', () => {
    const { container } = renderSlide(
      { layout: 'section', title: 'Phần hai' },
      { sectionIndex: 1 },
    );
    expect(container.querySelector('.kn-sec-index')).toHaveTextContent('02');
  });

  it('slide `image` lấy ảnh qua đường dẫn ảnh sẵn có của app', () => {
    const { container } = renderSlide(
      { layout: 'image', title: 'D · Diaphragm', imageId: 'i1', caption: 'Phim thẳng.' },
      { images: [{ id: 'i1', label: 'Phim ngực', src: '/api/images/u1/i1' }] },
    );
    const img = container.querySelector('.kn-film img');
    expect(img).toHaveAttribute('src', '/api/images/u1/i1');
    expect(img).toHaveAttribute('alt', 'Phim ngực');
    expect(container.querySelector('.kn-cap')).toHaveTextContent('Phim thẳng.');
  });

  it('`imageId` không tồn tại thì slide vẫn đủ chữ, không vỡ và không trang trắng', () => {
    const { container } = renderSlide(
      { layout: 'image', title: 'D · Diaphragm', imageId: 'khong-co', caption: 'Phim thẳng.' },
      { images: [] },
    );
    expect(container.querySelector('.kn-film img')).toBeNull();
    expect(container.querySelector('.kn-film-missing')).toHaveTextContent('Ảnh không còn trong ghi chú');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('D · Diaphragm');
    expect(container.querySelector('.kn-cap')).toHaveTextContent('Phim thẳng.');
  });

  it('mẫu "Bệnh án" thêm nhãn phiếu cho mọi dạng slide trừ `title`', () => {
    const { container } = renderSlide(
      { layout: 'bullets', title: 'RIPE', bullets: ['Xoay.'] },
      { template: 'clinical' },
    );
    expect(container.querySelector('.kn-kicker')).toHaveTextContent('Nội dung');
    expect(container.querySelector('.kn-kicker')).toHaveTextContent('03 / 11');
  });

  it('mẫu "Thuyết trình" ghi cả tổng số slide ở chrome; hai mẫu kia chỉ ghi số hiện tại', () => {
    const slide: Slide = { layout: 'section', title: 'Phần một' };
    const deck = renderSlide(slide, { template: 'deck' });
    expect(deck.container.querySelector('.kn-chrome-index')).toHaveTextContent('03 / 11');
    const editorial = renderSlide(slide);
    expect(editorial.container.querySelector('.kn-chrome-index')).toHaveTextContent('03');
  });

  it('nền là một lớp duy nhất dưới nội dung, và `none` thì không dựng lớp nào', () => {
    const on = renderSlide({ layout: 'section', title: 'A' });
    expect(on.container.querySelector('.kn-bg')).toHaveAttribute('data-pattern', 'margin-rule');
    const off = renderSlide({ layout: 'section', title: 'A' }, { pattern: 'none' });
    expect(off.container.querySelector('.kn-bg')).toBeNull();
  });

  it('đánh thứ tự `--d` tăng dần để CSS giãn nhịp vào của từng phần', () => {
    const { container } = renderSlide({
      layout: 'bullets',
      title: 'RIPE',
      bullets: ['Một', 'Hai'],
    });
    const parts = [...container.querySelectorAll('[data-anim]')];
    expect(parts.map((el) => el.getAttribute('style'))).toEqual([
      '--d: 0;', '--d: 1;', '--d: 2;',
    ]);
  });

  it('mang đúng pha vào / ra để CSS chọn chuyển động của mẫu', () => {
    const enter = renderSlide({ layout: 'section', title: 'A' });
    expect(enter.container.querySelector('.kn-slide')).toHaveClass('kn-enter');
    const leave = renderSlide({ layout: 'section', title: 'A' }, { phase: 'leaving', dir: -1 });
    expect(leave.container.querySelector('.kn-slide')).toHaveClass('kn-leaving');
    expect(leave.container.querySelector('.kn-slide')).toHaveAttribute('style', '--dir: -1;');
  });
});
