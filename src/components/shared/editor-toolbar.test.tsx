import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EDITOR_TOOL_GROUPS, EditorToolbar } from './editor-toolbar';

describe('EditorToolbar', () => {
  it('has the four prototype groups in order', () => {
    expect(EDITOR_TOOL_GROUPS.map((g) => g.map((t) => t.label))).toEqual([
      ['B', 'I', 'U', 'S'],
      ['H2', 'H3', '¶'],
      ['•', '1.', '❝', '—'],
      ['↶', '↷'],
    ]);
  });

  it('uses typographic glyphs, never emoji', () => {
    const labels = EDITOR_TOOL_GROUPS.flat().map((t) => t.label).join('');
    expect(/\p{Extended_Pictographic}/u.test(labels)).toBe(false);
  });

  it('is sticky beneath the 64px header at z5', () => {
    const { container } = render(<EditorToolbar onCommand={() => {}} onPickImage={() => {}} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('top-64');
    expect(bar.style.zIndex).toBe('5');
    expect(bar.className).toContain('gap-6');
    expect(bar.className).toContain('py-8');
    expect(bar.className).toContain('px-10');
  });

  it('renders 32px tools with a 7px radius', () => {
    render(<EditorToolbar onCommand={() => {}} onPickImage={() => {}} />);
    const bold = screen.getByRole('button', { name: 'Đậm' });
    expect(bold.className).toContain('h-32');
    expect(bold.className).toContain('min-w-32');
    expect(bold.className).toContain('rounded-7');
  });

  it('emits the command on mousedown, not click, and prevents the default', () => {
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} onPickImage={() => {}} />);
    const h2 = screen.getByRole('button', { name: 'Tiêu đề lớn' });
    const notPrevented = fireEvent.mouseDown(h2);
    expect(onCommand).toHaveBeenCalledWith('formatBlock', '<h2>');
    expect(notPrevented).toBe(false); // preventDefault() was called — the selection survives
  });

  it('emits simple commands without a value', () => {
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} onPickImage={() => {}} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(onCommand).toHaveBeenCalledWith('undo', undefined);
  });

  it('offers the image button', () => {
    const onPickImage = vi.fn();
    render(<EditorToolbar onCommand={() => {}} onPickImage={onPickImage} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' }));
    expect(onPickImage).toHaveBeenCalledTimes(1);
  });
});
