import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RichTextEditorHandle } from '@/components/shared';
import { EditorCanvas } from './editor-canvas';

function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

const png = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/png' });

describe('EditorCanvas', () => {
  it('seeds the surface with the note content and exposes it through the handle', () => {
    const handleRef = createRef<RichTextEditorHandle>();
    render(
      <EditorCanvas
        initialHtml="<p>Nội dung cũ</p>"
        handleRef={handleRef}
        onPickFiles={vi.fn().mockResolvedValue([])}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Nội dung ghi chú' })).toHaveTextContent('Nội dung cũ');
    expect(handleRef.current?.getHtml()).toBe('<p>Nội dung cũ</p>');
  });

  it('renders the shared toolbar rather than its own markup', () => {
    render(
      <EditorCanvas initialHtml="" handleRef={createRef()} onPickFiles={vi.fn().mockResolvedValue([])} />,
    );
    expect(screen.getByRole('button', { name: 'Đậm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trích dẫn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' })).toBeInTheDocument();
  });

  it('opens the hidden picker when the toolbar image button is pressed', () => {
    const { container } = render(
      <EditorCanvas initialHtml="" handleRef={createRef()} onPickFiles={vi.fn().mockResolvedValue([])} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' }));
    expect(click).toHaveBeenCalled();
  });

  it('uploads the picked files and inserts every returned image at the caret', async () => {
    const handleRef = createRef<RichTextEditorHandle>();
    const onPickFiles = vi.fn().mockResolvedValue([
      { id: 'i1', label: 'a.png', src: '/api/images/u/i1' },
      { id: 'i2', label: 'b.png', src: '/api/images/u/i2' },
    ]);
    const { container } = render(
      <EditorCanvas initialHtml="<p>x</p>" handleRef={handleRef} onPickFiles={onPickFiles} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    pick(input, [png('a.png'), png('b.png')]);

    await waitFor(() => expect(onPickFiles).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const imgs = screen.getByRole('textbox', { name: 'Nội dung ghi chú' }).querySelectorAll('img');
      expect(imgs).toHaveLength(2);
      expect(imgs[0]!.getAttribute('src')).toBe('/api/images/u/i1');
      expect(imgs[0]!.getAttribute('alt')).toBe('a.png');
    });
  });

  it('does nothing when the picker is dismissed with no file', () => {
    const onPickFiles = vi.fn();
    const { container } = render(
      <EditorCanvas initialHtml="" handleRef={createRef()} onPickFiles={onPickFiles} />,
    );
    pick(container.querySelector('input[type="file"]') as HTMLInputElement, []);
    expect(onPickFiles).not.toHaveBeenCalled();
  });
});
