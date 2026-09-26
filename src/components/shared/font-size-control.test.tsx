import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FONT_PREVIEW_TEXT, FontSizeControl } from './font-size-control';

describe('FontSizeControl', () => {
  it('shows the current size in mono and the serif preview', () => {
    render(<FontSizeControl value={17} onChange={() => {}} />);
    expect(screen.getByText('17px').className).toContain('font-mono');
    const preview = screen.getByText(FONT_PREVIEW_TEXT);
    expect(preview.className).toContain('font-serif');
    expect(preview.style.fontSize).toBe('17px');
  });

  it('exposes a 14–22 range with step 1', () => {
    render(<FontSizeControl value={17} onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Cỡ chữ nội dung' });
    expect(range).toHaveAttribute('min', '14');
    expect(range).toHaveAttribute('max', '22');
    expect(range).toHaveAttribute('step', '1');
  });

  it('steps down and up with the 30px A buttons', async () => {
    const onChange = vi.fn();
    render(<FontSizeControl value={17} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Giảm cỡ chữ' }));
    expect(onChange).toHaveBeenCalledWith(16);
    await userEvent.click(screen.getByRole('button', { name: 'Tăng cỡ chữ' }));
    expect(onChange).toHaveBeenCalledWith(18);
  });

  it('never steps outside 14–22', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<FontSizeControl value={14} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Giảm cỡ chữ' }));
    expect(onChange).toHaveBeenLastCalledWith(14);
    rerender(<FontSizeControl value={22} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tăng cỡ chữ' }));
    expect(onChange).toHaveBeenLastCalledWith(22);
  });

  it('emits a clamped integer from the range input', () => {
    const onChange = vi.fn();
    render(<FontSizeControl value={17} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Cỡ chữ nội dung' }), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('clamps a corrupt incoming value instead of rendering NaN', () => {
    render(<FontSizeControl value={99} onChange={() => {}} />);
    expect(screen.getByText('22px')).toBeInTheDocument();
  });
});
