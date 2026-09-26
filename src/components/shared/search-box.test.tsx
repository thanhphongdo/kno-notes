import { useRef, useState, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SEARCH_PLACEHOLDER, SearchBox } from './search-box';

function renderBox(overrides: Partial<ComponentProps<typeof SearchBox>> = {}) {
  const props: ComponentProps<typeof SearchBox> = {
    value: '',
    onValueChange: vi.fn(),
    onSubmit: vi.fn(),
    open: false,
    onOpenChange: vi.fn(),
    suggestions: <div data-testid="panel" />,
    showKbdHint: true,
    ...overrides,
  };
  render(<SearchBox {...props} />);
  return props;
}

describe('SearchBox', () => {
  it('uses the prototype placeholder', () => {
    renderBox();
    expect(SEARCH_PLACEHOLDER).toBe('Tìm theo tiêu đề, mô tả hoặc #thẻ');
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeInTheDocument();
  });

  it('is 42px tall with a 10px radius and a --line border when closed', () => {
    const { container } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint />,
    );
    const box = container.querySelector('[data-search-box]') as HTMLElement;
    expect(box.className).toContain('h-42');
    expect(box.className).toContain('rounded-10');
    expect(box.className).toContain('border-line');
  });

  it('switches the border to accent while the panel is open', () => {
    const { container } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
        onOpenChange={() => {}} suggestions={null} showKbdHint />,
    );
    expect((container.querySelector('[data-search-box]') as HTMLElement).className).toContain('border-accent');
  });

  it('shows the "/" hint only when asked', () => {
    const { rerender } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint />,
    );
    expect(screen.getByText('/')).toBeInTheDocument();
    rerender(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint={false} />,
    );
    expect(screen.queryByText('/')).toBeNull();
  });

  it('shows a clear button only when there is a value, and clears', async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <SearchBox value="" onValueChange={onValueChange} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Xoá từ khoá' })).toBeNull();
    rerender(
      <SearchBox value="sốc" onValueChange={onValueChange} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={null} showKbdHint={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xoá từ khoá' }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('opens the panel on focus and on click', async () => {
    const onOpenChange = vi.fn();
    renderBox({ onOpenChange });
    await userEvent.click(screen.getByPlaceholderText(SEARCH_PLACEHOLDER));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('submits on Enter and closes on Escape', async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    renderBox({ onSubmit, onOpenChange, open: true });
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
    input.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders the suggestion panel only while open', () => {
    const { rerender } = render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
        onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false} />,
    );
    expect(screen.queryByTestId('panel')).toBeNull();
    rerender(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
        onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false} />,
    );
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('renders the anchored dropdown on desktop, never the overlay', () => {
    render(
      <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
        onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false} />,
    );
    expect(document.body.querySelector('[data-search-overlay]')).toBeNull();
    expect(screen.getByTestId('search-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  describe('variant="overlay" (mobile)', () => {
    it('keeps the plain box in the header while closed', () => {
      const { container } = render(
        <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={false}
          onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false}
          variant="overlay" />,
      );
      expect(container.querySelector('[data-search-box]')).not.toBeNull();
      expect(document.body.querySelector('[data-search-overlay]')).toBeNull();
      expect(screen.queryByTestId('panel')).toBeNull();
    });

    it('moves the one real input into a full-screen overlay when open', () => {
      const { container } = render(
        <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
          onOpenChange={() => {}} suggestions={<div data-testid="panel" />} showKbdHint={false}
          variant="overlay" />,
      );
      const overlay = document.body.querySelector('[data-search-overlay]');
      expect(overlay).not.toBeNull();
      // Exactly one box and one input, and both live inside the overlay.
      expect(document.querySelectorAll('[data-search-box]')).toHaveLength(1);
      expect(screen.getAllByRole('searchbox')).toHaveLength(1);
      expect(overlay?.querySelector('[data-search-box]')).not.toBeNull();
      expect(overlay?.contains(screen.getByTestId('panel'))).toBe(true);
      // The header keeps the box's height so nothing underneath shifts.
      expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('h-42');
      // The anchored dropdown's backdrop has no job here.
      expect(screen.queryByTestId('search-backdrop')).toBeNull();
    });

    it('focuses the overlay input as it opens, and reports it through inputRef', () => {
      function Harness() {
        const ref = useRef<HTMLInputElement | null>(null);
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>mở</button>
            <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open={open}
              onOpenChange={setOpen} suggestions={null} showKbdHint={false}
              variant="overlay" inputRef={ref} />
            <button type="button" onClick={() => { probe = ref.current; }}>đọc ref</button>
          </>
        );
      }
      let probe: HTMLInputElement | null = null;
      render(<Harness />);
      expect(screen.getByRole('searchbox')).not.toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'mở' }));
      const input = screen.getByRole('searchbox');
      expect(input).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'đọc ref' }));
      expect(probe).toBe(input);
    });

    it('closes from the overlay close control', async () => {
      const onOpenChange = vi.fn();
      render(
        <SearchBox value="" onValueChange={() => {}} onSubmit={() => {}} open
          onOpenChange={onOpenChange} suggestions={null} showKbdHint={false} variant="overlay" />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
