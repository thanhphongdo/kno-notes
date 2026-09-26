import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './icon-button';

describe('IconButton', () => {
  it('exposes the label as both accessible name and tooltip title', () => {
    render(<IconButton icon="trash" label="Xoá" />);
    const el = screen.getByRole('button', { name: 'Xoá' });
    expect(el).toHaveAttribute('title', 'Xoá');
  });

  it('is square at the requested size', () => {
    render(<IconButton icon="close" label="Đóng" size={40} radius="10" />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('h-40');
    expect(el.className).toContain('w-40');
    expect(el.className).toContain('rounded-10');
  });

  it('applies the bordered variant tokens', () => {
    render(<IconButton icon="chevron-left" label="Trang trước" variant="bordered" size={36} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-line');
    expect(el.className).toContain('bg-surface');
  });

  it('applies the tone to the glyph colour', () => {
    render(<IconButton icon="star" label="Yêu thích" tone="med" iconFilled />);
    expect(screen.getByRole('button').className).toContain('text-med');
  });

  it('fires onClick and stops nothing by default', async () => {
    const onClick = vi.fn();
    render(<IconButton icon="star" label="Yêu thích" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
