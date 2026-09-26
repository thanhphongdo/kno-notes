import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditor, type RichTextEditorHandle } from './rich-text-editor';

describe('RichTextEditor', () => {
  it('renders a contenteditable prose surface with the placeholder attribute', () => {
    const { container } = render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface).toHaveAttribute('contenteditable', 'true');
    expect(surface).toHaveAttribute('data-ph', 'Bắt đầu ghi chép…');
  });

  it('seeds the initial HTML exactly once', () => {
    const { container, rerender } = render(<RichTextEditor initialHtml="<p>Ban đầu</p>" onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface.innerHTML).toBe('<p>Ban đầu</p>');
    rerender(<RichTextEditor initialHtml="<p>Khác</p>" onPickImage={() => {}} />);
    expect(surface.innerHTML).toBe('<p>Ban đầu</p>');
  });

  it('uses 460px min-height and 32/40 padding on desktop, 20/18 on mobile', () => {
    const { container, rerender } = render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    let surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface.className).toContain('min-h-460');
    expect(surface.className).toContain('py-32');
    expect(surface.className).toContain('px-40');
    rerender(<RichTextEditor initialHtml="" onPickImage={() => {}} isMobile />);
    surface = container.querySelector('[data-prose]') as HTMLElement;
    expect(surface.className).toContain('py-20');
    expect(surface.className).toContain('px-18');
  });

  it('wraps the toolbar and the surface in the 14px editor panel', () => {
    const { container } = render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('rounded-14');
    expect(panel.className).toContain('border-line');
    expect(panel.className).toContain('bg-surface');
  });

  it('exposes getHtml/setHtml through the imperative handle', () => {
    const ref = createRef<RichTextEditorHandle>();
    render(<RichTextEditor ref={ref} initialHtml="<p>A</p>" onPickImage={() => {}} />);
    expect(ref.current?.getHtml()).toBe('<p>A</p>');
    ref.current?.setHtml('<p>B</p>');
    expect(ref.current?.getHtml()).toBe('<p>B</p>');
  });

  it('reports edits through onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<RichTextEditor initialHtml="" onChange={onChange} onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;
    surface.innerHTML = '<p>Mới</p>';
    fireEvent.input(surface);
    expect(onChange).toHaveBeenCalledWith('<p>Mới</p>');
  });

  it('routes toolbar commands to document.execCommand', () => {
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
    render(<RichTextEditor initialHtml="" onPickImage={() => {}} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Đậm' }));
    expect(exec).toHaveBeenCalledWith('bold', false, undefined);
  });

  it('inserts an image at the end when there is no saved caret', () => {
    const ref = createRef<RichTextEditorHandle>();
    const { container } = render(<RichTextEditor ref={ref} initialHtml="<p>A</p>" onPickImage={() => {}} />);
    ref.current?.insertImage('blob:x', 'ECG mẫu');
    const img = container.querySelector('[data-prose] img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('alt')).toBe('ECG mẫu');
  });

  it('puts an end-positioned image at the end even when a caret is saved', () => {
    const ref = createRef<RichTextEditorHandle>();
    const { container } = render(<RichTextEditor ref={ref} initialHtml="<p>A</p>" onPickImage={() => {}} />);
    const surface = container.querySelector('[data-prose]') as HTMLElement;

    const range = document.createRange();
    range.setStart(surface.firstChild!.firstChild!, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(surface);

    ref.current?.insertImage('blob:end', 'cuối bài', 'end');
    expect(surface.lastElementChild?.tagName).toBe('IMG');
  });

  it('retitles every copy of one image and reports the change', () => {
    const ref = createRef<RichTextEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        ref={ref}
        initialHtml='<img src="/a" alt="cũ"><img src="/b" alt="khác"><img src="/a" alt="cũ">'
        onPickImage={() => {}}
        onChange={onChange}
      />,
    );
    ref.current?.setImageAlt('/a', 'mới');

    const alts = [...container.querySelectorAll('[data-prose] img')].map((i) => i.getAttribute('alt'));
    expect(alts).toEqual(['mới', 'khác', 'mới']);
    expect(onChange).toHaveBeenCalled();
  });

  it('removes every copy of one image and leaves the others', () => {
    const ref = createRef<RichTextEditorHandle>();
    const { container } = render(
      <RichTextEditor
        ref={ref}
        initialHtml='<img src="/a" alt="a"><img src="/b" alt="b"><img src="/a" alt="a">'
        onPickImage={() => {}}
      />,
    );
    ref.current?.removeImage('/a');

    const srcs = [...container.querySelectorAll('[data-prose] img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['/b']);
  });

  it('does nothing for a src the note does not have', () => {
    const ref = createRef<RichTextEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor ref={ref} initialHtml='<img src="/a" alt="a">' onPickImage={() => {}} onChange={onChange} />,
    );
    onChange.mockClear();
    ref.current?.setImageAlt('/zzz', 'x');
    ref.current?.removeImage('/zzz');
    expect(container.querySelectorAll('[data-prose] img')).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('relays the toolbar image button', () => {
    const onPickImage = vi.fn();
    render(<RichTextEditor initialHtml="" onPickImage={onPickImage} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Chèn ảnh vào nội dung' }));
    expect(onPickImage).toHaveBeenCalledTimes(1);
  });
});
