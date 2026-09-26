import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_OVERLAY_LABEL, SearchOverlay } from './search-overlay';

const SCROLL_Y = 420;

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn();
  Object.defineProperty(window, 'scrollY', { value: SCROLL_Y, writable: true, configurable: true });
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true, configurable: true });
});

afterEach(() => {
  document.body.removeAttribute('style');
});

function show(onClose = vi.fn()) {
  const view = render(
    <SearchOverlay input={<input aria-label="ô tìm kiếm" />} onClose={onClose}>
      <div data-testid="panel">gợi ý</div>
    </SearchOverlay>,
  );
  return { ...view, onClose };
}

describe('SearchOverlay', () => {
  it('is a labelled modal dialog carrying the data-search-overlay hook', () => {
    show();
    const dialog = screen.getByRole('dialog', { name: SEARCH_OVERLAY_LABEL });
    expect(dialog).toHaveAttribute('data-search-overlay');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('portals itself to the body so the sticky header cannot trap it', () => {
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('[data-search-overlay]')).not.toBeNull();
  });

  it('covers the viewport on --bg, above the chrome and below the quiz modal', () => {
    show();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('bg-bg');
    expect(dialog.style.zIndex).toBe('70');
  });

  it('animates in only when motion is welcome', () => {
    show();
    expect(screen.getByRole('dialog').className).toContain('motion-safe:');
  });

  it('renders the real input in the top bar and the suggestions below it', () => {
    show();
    expect(screen.getByLabelText('ô tìm kiếm')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('closes from the close control, which is a 44px touch target', async () => {
    const { onClose } = show();
    const close = screen.getByRole('button', { name: 'Đóng' });
    expect(close.className).toContain('h-44');
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks the body while open and restores the exact scroll position on close', () => {
    const { unmount } = show();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe(`-${SCROLL_Y}px`);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, SCROLL_Y);
  });
});
