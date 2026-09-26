import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Mobile (< 820px). `useIsMobile()` reads `window.innerWidth`, so the whole
 * branch is reachable from jsdom by resizing the window before mounting.
 *
 * jsdom implements neither pointer capture nor `PointerEvent`, so the gestures
 * are driven by mouse events carrying a `pointerId` — React's event plugin
 * dispatches them by type name, which is exactly what the component listens
 * for. The arithmetic behind each decision is tested in
 * `src/lib/gesture/lightbox.test.ts`; these tests only prove it is wired up.
 */
describe('Lightbox on a phone', () => {
  const DESKTOP_WIDTH = window.innerWidth;

  const setWidth = (value: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value });
  };

  beforeAll(() => {
    for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
      if (!(name in Element.prototype)) {
        Object.defineProperty(Element.prototype, name, { value: () => {}, writable: true });
      }
    }
    if (!('hasPointerCapture' in Element.prototype)) {
      Object.defineProperty(Element.prototype, 'hasPointerCapture', { value: () => false, writable: true });
    }
  });

  beforeEach(() => {
    setWidth(390);
    // The commit animation's rAF callbacks would land after the test ended.
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setWidth(DESKTOP_WIDTH);
  });

  const stage = () => screen.getByRole('dialog', { name: 'Xem ảnh' }).querySelector('div');

  function pointer(el: Element, type: string, x: number, y: number, id = 1) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: id });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    fireEvent(el, event);
  }

  function swipe(el: Element, dx: number, dy = 0) {
    pointer(el, 'pointerdown', 200, 400);
    pointer(el, 'pointermove', 200 + dx / 2, 400 + dy / 2);
    pointer(el, 'pointermove', 200 + dx, 400 + dy);
    pointer(el, 'pointerup', 200 + dx, 400 + dy);
  }

  it('fills the viewport with dvh instead of the desktop 92vw × 78vh cap', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Xem ảnh' });
    expect(dialog).toHaveAttribute('data-lightbox-mobile');
    expect(dialog.style.height).toBe('100dvh');
    expect(screen.getByAltText('ECG mẫu').className).toContain('object-contain');
    expect(screen.getByAltText('ECG mẫu').className).not.toContain('max-w-[92vw]');
  });

  it('keeps the close button clear of the notch', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    const close = screen.getByRole('button', { name: 'Đóng' });
    // jsdom mangles `env(x, fallback)` when it serialises the declaration, so
    // match the variable rather than the whole expression.
    expect(close.style.top).toContain('safe-area-inset-top');
    expect(close.style.right).toContain('safe-area-inset-right');
    // The Tailwind `top-16 right-16` classes stay as the fallback for a
    // browser that drops the `env()` declaration outright.
    expect(close.className).toContain('top-16');
  });

  it('marks only the centre slide, so the e2e hook stays unique', () => {
    const { container } = render(
      <Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />,
    );
    expect(container.querySelectorAll('[data-lightbox-image]')).toHaveLength(1);
    // The neighbours are rendered for the swipe, and hidden from assistive tech.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('advances on a leftward swipe and goes back on a rightward one', () => {
    const onIndexChange = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={onIndexChange} onClose={() => {}} />);
    const el = stage();
    expect(el).not.toBeNull();
    swipe(el as Element, -200);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    swipe(el as Element, 200);
    expect(onIndexChange).toHaveBeenLastCalledWith(1); // wraps from 0 back to the last
  });

  it('springs back instead of stepping for a nudge', () => {
    const onIndexChange = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={onIndexChange} onClose={() => {}} />);
    swipe(stage() as Element, -8);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('never swipes a single image', () => {
    const onIndexChange = vi.fn();
    render(<Lightbox images={[IMAGES[0]!]} index={0} onIndexChange={onIndexChange} onClose={() => {}} />);
    swipe(stage() as Element, -300);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('dismisses on a downward swipe', () => {
    const onClose = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={onClose} />);
    swipe(stage() as Element, 0, 400);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the image itself is tapped', () => {
    const onClose = vi.fn();
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={onClose} />);
    swipe(stage() as Element, 0, 0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still offers the arrows and the counter', () => {
    render(<Lightbox images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Ảnh sau' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });
});
