import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon, type IconName } from './icon';

describe('Icon', () => {
  it('exposes exactly the 22 names from Design Spec §05', () => {
    expect([...ICON_NAMES].sort()).toEqual(
      [
        'check', 'chevron-down', 'chevron-left', 'chevron-right', 'close', 'comment',
        'edit', 'grid', 'highlight', 'history', 'image', 'list', 'logout', 'moon',
        'plus', 'quiz', 'search', 'sidebar-collapse', 'sidebar-open', 'star', 'sun', 'trash',
      ].sort(),
    );
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
