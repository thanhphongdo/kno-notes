import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagChip } from './tag-chip';

describe('TagChip', () => {
  it('renders as a span when there is no handler', () => {
    const { container } = render(<TagChip name="Cấp cứu" size="card" />);
    expect(container.querySelector('button')).toBeNull();
    expect(screen.getByText('Cấp cứu')).toBeInTheDocument();
  });

  it('uses the card geometry: px-9 py-3 rounded-full surface2/muted', () => {
    const { container } = render(<TagChip name="Tim mạch" size="card" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('px-9');
    expect(el.className).toContain('py-3');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('bg-surface2');
    expect(el.className).toContain('text-muted');
  });

  it('uses the 26px geometry by default', () => {
    const { container } = render(<TagChip name="Tim mạch" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('h-26');
  });

  it('becomes a button and fires onClick', async () => {
    const onClick = vi.fn();
    render(<TagChip name="Cấp cứu" hash onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: '#Cấp cứu' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the accent-soft tone with an 18px remove button', async () => {
    const onRemove = vi.fn();
    const { container } = render(<TagChip name="Nội tiết" tone="soft" onRemove={onRemove} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-accent-soft');
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ thẻ Nội tiết' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps the dashed frame on a clickable suggestion chip', () => {
    const { container } = render(<TagChip name="+ Hô hấp" tone="dashed" onClick={() => {}} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('border-dashed');
    expect(el.className).toContain('border-line2');
    expect(el.className).not.toContain('border-0');
  });

  it('shows a mono count when given one', () => {
    render(<TagChip name="Cấp cứu" hash count={4} onClick={() => {}} />);
    expect(screen.getByText('4').className).toContain('font-mono');
  });

  it('never wraps: long tags ellipsis instead of breaking the row', () => {
    const { container } = render(<TagChip name={'a'.repeat(80)} size="card" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('whitespace-nowrap');
  });
});
