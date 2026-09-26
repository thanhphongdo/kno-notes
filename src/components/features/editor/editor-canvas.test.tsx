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
        onInsertFiles={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Nội dung ghi chú' })).toHaveTextContent('Nội dung cũ');
    expect(handleRef.current?.getHtml()).toBe('<p>Nội dung cũ</p>');
  });

  it('renders the shared toolbar rather than its own markup', () => {
    render(
      <EditorCanvas initialHtml="" handleRef={createRef()} onInsertFiles={vi.fn().mockResolvedValue(undefined)} />,
    );
    expect(screen.getByRole('button', { name: 'Đậm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trích dẫn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' })).toBeInTheDocument();
  });

  it('opens the hidden picker when the toolbar image button is pressed', () => {
    const { container } = render(
      <EditorCanvas initialHtml="" handleRef={createRef()} onInsertFiles={vi.fn().mockResolvedValue(undefined)} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' }));
    expect(click).toHaveBeenCalled();
  });

  it('hands the picked files over once; placement is the editor hook\'s call', async () => {
    const onInsertFiles = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <EditorCanvas initialHtml="<p>x</p>" handleRef={createRef()} onInsertFiles={onInsertFiles} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [png('a.png'), png('b.png')];
    pick(input, files);

    await waitFor(() => expect(onInsertFiles).toHaveBeenCalledTimes(1));
    expect(onInsertFiles.mock.calls[0]![0]).toHaveLength(2);
  });

  it('does nothing when the picker is dismissed with no file', () => {
    const onInsertFiles = vi.fn();
    const { container } = render(
      <EditorCanvas initialHtml="" handleRef={createRef()} onInsertFiles={onInsertFiles} />,
    );
    pick(container.querySelector('input[type="file"]') as HTMLInputElement, []);
    expect(onInsertFiles).not.toHaveBeenCalled();
  });
});
