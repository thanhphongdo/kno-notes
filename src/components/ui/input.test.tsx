import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('renders a controlled value and reports changes', async () => {
    const onChange = vi.fn();
    render(<Input value="bacsi" onChange={onChange} aria-label="Tên đăng nhập" />);
    const el = screen.getByLabelText('Tên đăng nhập');
    expect(el).toHaveValue('bacsi');
    await userEvent.type(el, 'x');
    expect(onChange).toHaveBeenCalled();
  });

  it('applies the 46px login geometry with the strong border', () => {
    render(<Input inputSize="46" tone="strong" aria-label="Mật khẩu" />);
    const el = screen.getByLabelText('Mật khẩu');
    expect(el.className).toContain('h-46');
    expect(el.className).toContain('px-14');
    expect(el.className).toContain('rounded-10');
    expect(el.className).toContain('border-line2');
    expect(el.className).toContain('text-15');
  });

  it('applies the 40px default geometry', () => {
    render(<Input aria-label="Ghi chú phiên bản" />);
    const el = screen.getByLabelText('Ghi chú phiên bản');
    expect(el.className).toContain('h-40');
    expect(el.className).toContain('px-12');
    expect(el.className).toContain('text-13');
    expect(el.className).toContain('border-line');
  });

  it('drops the frame entirely in ghost tone (editor title)', () => {
    render(<Input tone="ghost" aria-label="Tiêu đề ghi chú" />);
    const el = screen.getByLabelText('Tiêu đề ghi chú');
    expect(el.className).toContain('border-0');
    expect(el.className).toContain('bg-transparent');
  });

  it('marks invalid inputs for assistive tech', () => {
    render(<Input invalid aria-label="Tên đăng nhập" />);
    expect(screen.getByLabelText('Tên đăng nhập')).toHaveAttribute('aria-invalid', 'true');
  });
});
