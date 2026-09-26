import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  PRIORITY_LABEL, PRIORITY_ORDER, PriorityDot, PriorityLabel, PriorityPill, PrioritySegmented,
} from './priority';

describe('priority family', () => {
  it('keeps the prototype ordering high → medium → low', () => {
    expect(PRIORITY_ORDER).toEqual({ high: 0, medium: 1, low: 2 });
  });

  it('uses the Vietnamese labels from the design spec', () => {
    expect(PRIORITY_LABEL).toEqual({ high: 'Cao', medium: 'Trung bình', low: 'Thấp' });
  });

  it('PriorityDot is a coloured 8px circle by default', () => {
    render(<PriorityDot priority="high" size={8} data-testid="dot" />);
    const el = screen.getByTestId('dot');
    expect(el.className).toContain('bg-hi');
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-8');
    expect(el.className).toContain('rounded-circle');
  });

  it('PriorityLabel shows the bare label in the priority colour', () => {
    render(<PriorityLabel priority="medium" />);
    const el = screen.getByText('Trung bình');
    expect(el.className).toContain('text-med');
    expect(el.className).toContain('text-12');
  });

  it('PriorityPill prefixes "Ưu tiên" and lower-cases the label', () => {
    render(<PriorityPill priority="low" />);
    expect(screen.getByText('Ưu tiên thấp')).toBeInTheDocument();
  });

  it('PriorityPill paints the soft background for its tone', () => {
    const { container } = render(<PriorityPill priority="high" />);
    expect(container.firstElementChild?.className).toContain('bg-hi-soft');
    expect(container.firstElementChild?.className).toContain('text-hi');
  });
});

describe('PrioritySegmented', () => {
  it('renders a 3-column radiogroup with the active priority checked', () => {
    const { container } = render(<PrioritySegmented value="medium" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Mức ưu tiên' })).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns)
      .toBe('repeat(3, minmax(0, 1fr))');
    expect(screen.getByRole('radio', { name: 'Trung bình' })).toHaveAttribute('aria-checked', 'true');
  });

  it('emits the chosen priority', async () => {
    const onChange = vi.fn();
    render(<PrioritySegmented value="medium" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Thấp' }));
    expect(onChange).toHaveBeenCalledWith('low');
  });
});
