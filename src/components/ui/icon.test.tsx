import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon, type IconName } from './icon';

/** Design Spec §05 — bộ icon của chrome app. */
const CHROME_ICONS = [
  'check', 'chevron-down', 'chevron-left', 'chevron-right', 'close', 'comment',
  'copy', 'download', 'edit', 'grid', 'highlight', 'history', 'image', 'list',
  'logout', 'moon', 'plus', 'quiz', 'search', 'sidebar-collapse', 'sidebar-open',
  'star', 'sun', 'trash',
] as const;

/** Chế độ trình chiếu: ba icon của thanh điều khiển + lối vào. */
const PRESENT_CHROME_ICONS = ['arrow-left', 'sliders', 'present'] as const;

/**
 * Mười lăm trong mười tám icon của slide. Ba tên còn lại (`check`, `list`,
 * `clock`) KHÔNG nằm ở đây vì chúng trỏ về hình app đã có — xem `SLIDE_ICON`
 * trong `shared/presentation-slide.tsx`.
 */
const SLIDE_ICONS = [
  'alert', 'info', 'question', 'target', 'chart', 'compare', 'layers', 'book',
  'idea', 'heart', 'lungs', 'bone', 'scan', 'stethoscope', 'pill',
] as const;

describe('Icon', () => {
  it('exposes exactly the §05 chrome set plus the presentation set', () => {
    expect([...ICON_NAMES].sort()).toEqual(
      [...CHROME_ICONS, ...PRESENT_CHROME_ICONS, ...SLIDE_ICONS].sort(),
    );
  });

  it('draws every slide icon in the one stroke the mockup uses', () => {
    for (const name of SLIDE_ICONS) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg, name).toHaveAttribute('stroke-width', '1.5');
      expect(svg, name).toHaveAttribute('stroke-linecap', 'round');
      expect(svg, name).toHaveAttribute('stroke-linejoin', 'round');
    }
  });

  it('accepts a CSS length so a slide icon can follow its container font size', () => {
    const { container } = render(<Icon name="scan" size="1em" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '1em');
    expect(container.querySelector('svg')).toHaveAttribute('height', '1em');
  });

  it.each(ICON_NAMES)('renders %s with a 24x24 viewBox and currentColor stroke', (name: IconName) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path, rect, circle')).not.toBeNull();
  });

  it('draws copy and download in the §05 house style', () => {
    for (const name of ['copy', 'download'] as const) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke-width', '1.7');
      expect(svg).toHaveAttribute('stroke-linecap', 'round');
      expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    }
  });

  it('defaults to 16px and honours an explicit size', () => {
    const { container, rerender } = render(<Icon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
    rerender(<Icon name="search" size={17} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '17');
    expect(container.querySelector('svg')).toHaveAttribute('height', '17');
  });

  it('uses the per-icon default stroke width unless overridden', () => {
    const { container, rerender } = render(<Icon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.8');
    rerender(<Icon name="close" strokeWidth={2.6} />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '2.6');
    rerender(<Icon name="check" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '2.2');
  });

  it('fills the star when filled is set', () => {
    const { container, rerender } = render(<Icon name="star" />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none');
    rerender(<Icon name="star" filled />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
  });

  it('labels the icon when an aria-label is given, otherwise hides it', () => {
    render(<Icon name="trash" aria-label="Xoá" />);
    expect(screen.getByLabelText('Xoá')).toBeInTheDocument();
  });
});
