import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Chỉnh sửa</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the primary variant tokens', () => {
    render(<Button variant="primary" size="40">Ghi chú mới</Button>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('bg-accent');
    expect(el.className).toContain('text-accent-ink');
    expect(el.className).toContain('h-40');
    expect(el.className).toContain('rounded-10');
    expect(el.className).toContain('text-14');
  });

  it('applies the ink variant tokens', () => {
    render(<Button variant="ink" size="46">Đăng nhập</Button>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('bg-text');
    expect(el.className).toContain('text-bg');
    expect(el.className).toContain('h-46');
    expect(el.className).toContain('text-15');
  });

  it('lets radius override the size default', () => {
    render(<Button size="36" radius="8">Xoá bộ lọc</Button>);
    expect(screen.getByRole('button').className).toContain('rounded-8');
    expect(screen.getByRole('button').className).not.toContain('rounded-9');
  });

  it('renders a leading icon without an accessible name of its own', () => {
    const { container } = render(<Button icon="plus" variant="primary">Ghi chú mới</Button>);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button')).toHaveAccessibleName('Ghi chú mới');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Gửi</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Huỷ</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
