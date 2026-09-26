import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HIGHLIGHT_EMPTY, HighlightList } from './highlight-list';
import { HighlightPopup, clampHighlightPosition } from './highlight-popup';

describe('clampHighlightPosition', () => {
  it('keeps 90px clearance on both edges', () => {
    expect(clampHighlightPosition(10, 300, 1440)).toEqual({ x: 90, y: 300 });
    expect(clampHighlightPosition(1430, 300, 1440)).toEqual({ x: 1350, y: 300 });
    expect(clampHighlightPosition(700, 300, 1440)).toEqual({ x: 700, y: 300 });
  });

  it('never lets the bubble go above y = 56', () => {
    expect(clampHighlightPosition(700, 10, 1440).y).toBe(56);
  });
});

describe('HighlightPopup', () => {
  it('labels "Đánh dấu" in add mode and shows the hl2 swatch', () => {
    const { container } = render(<HighlightPopup mode="add" x={700} y={300} viewportWidth={1440} onAction={() => {}} />);
    expect(screen.getByRole('button', { name: /Đánh dấu/ })).toBeInTheDocument();
    expect(container.querySelector('.bg-hl2')).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute('data-hlpop', '1');
    expect(container.firstElementChild).toHaveAttribute('data-mode', 'add');
  });

  it('labels "Bỏ đánh dấu" in remove mode with a transparent swatch', () => {
    const { container } = render(<HighlightPopup mode="remove" x={700} y={300} viewportWidth={1440} onAction={() => {}} />);
    expect(screen.getByRole('button', { name: /Bỏ đánh dấu/ })).toBeInTheDocument();
    expect(container.querySelector('.bg-transparent')).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute('data-mode', 'remove');
  });

  it('positions itself above the selection at z80', () => {
    const { container } = render(<HighlightPopup mode="add" x={700} y={300} viewportWidth={1440} onAction={() => {}} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.left).toBe('700px');
    expect(el.style.top).toBe('300px');
    expect(el.style.transform).toBe('translate(-50%, calc(-100% - 10px))');
    expect(el.style.zIndex).toBe('80');
  });

  it('fires the action', async () => {
    const onAction = vi.fn();
    render(<HighlightPopup mode="add" x={700} y={300} viewportWidth={1440} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: /Đánh dấu/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('HighlightList', () => {
  it('shows the empty hint when there is nothing highlighted', () => {
    render(<HighlightList highlights={[]} onRemove={() => {}} />);
    expect(screen.getByText(HIGHLIGHT_EMPTY)).toBeInTheDocument();
  });

  it('renders each excerpt on the --hl background, clamped to 3 lines', () => {
    const { container } = render(
      <HighlightList highlights={[{ id: 'h1', text: 'Adrenalin 0,5 mg' }]} onRemove={() => {}} />,
    );
    const excerpt = screen.getByText('Adrenalin 0,5 mg');
    expect(excerpt.className).toContain('bg-hl');
    expect(excerpt.className).toContain('line-clamp-3');
    expect(excerpt.className).toContain('font-serif');
    expect(container.querySelector('[data-highlight-item]')).not.toBeNull();
  });

  it('removes by id', async () => {
    const onRemove = vi.fn();
    render(<HighlightList highlights={[{ id: 'h1', text: 'x' }]} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect(onRemove).toHaveBeenCalledWith('h1');
  });
});
