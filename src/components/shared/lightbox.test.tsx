import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Lightbox } from './lightbox';

const IMAGES = [
  { id: 'i1', label: 'ECG mẫu', src: 'blob:a' },
  { id: 'i2', label: 'X-quang', src: '' },
];

describe('Lightbox', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(<Lightbox images={[]} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('covers the viewport with the fixed 88% scrim at z100', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Xem ảnh' });
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('bg-[rgba(8,9,10,.88)]');
    expect(dialog.style.zIndex).toBe('100');
  });

  it('shows the label and a mono "i / n" position', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByText('ECG mẫu')).toBeInTheDocument();
    expect(screen.getByText('1 / 2').className).toContain('font-mono');
  });

  it('falls back to a striped placeholder when src is empty', () => {
    render(<Lightbox images={IMAGES} index={1} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByText('hình ảnh · X-quang')).toBeInTheDocument();
  });

  it('hides the arrows for a single image', () => {
    render(<Lightbox images={[IMAGES[0]!]} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Ảnh trước' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ảnh sau' })).toBeNull();
  });

  it('steps with the arrow buttons and wraps around', async () => {
    const onIndexChange = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={onIndexChange} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('steps with ArrowLeft/ArrowRight and closes on Escape', async () => {
    const onIndexChange = vi.fn();
    const onClose = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={onIndexChange} onClose={onClose} />);
    await userEvent.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the scrim but not on the image', async () => {
    const onClose = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByAltText('ECG mẫu'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog', { name: 'Xem ảnh' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
