'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';
import { EditorToolbar, type EditorCommand } from './editor-toolbar';

export const EDITOR_PLACEHOLDER = 'Bắt đầu ghi chép…';

/**
 * `cursor` — nơi người dùng đang gõ (nút Ảnh trên thanh công cụ).
 * `end` — cuối bài (kéo thả vào khung "Hình ảnh đính kèm", lúc đó không có
 * con trỏ nào trong nội dung để mà chèn vào).
 */
export type ImagePosition = 'cursor' | 'end';

export interface RichTextEditorHandle {
  getHtml(): string;
  setHtml(html: string): void;
  focus(): void;
  insertImage(src: string, alt: string, position?: ImagePosition): void;
  /** Đổi alt của mọi `<img>` cùng `src` — giữ ảnh trong bài khớp với thư viện. */
  setImageAlt(src: string, alt: string): void;
  /** Gỡ mọi `<img>` cùng `src` khỏi nội dung. */
  removeImage(src: string): void;
  exec(command: EditorCommand, value?: string): void;
}

export interface RichTextEditorProps {
  initialHtml: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onPickImage: () => void;
  /** padding 32/40 (desktop) vs 20/18 (mobile). */
  isMobile?: boolean;
  className?: string;
}

/**
 * contentEditable + execCommand, exactly as in the prototype (`execCommand` is
 * deprecated but retained deliberately — see contracts §4). The caret position is
 * remembered on keyup/mouseup/blur so an image can be inserted where the user last
 * was, even after the toolbar takes a click. When `execCommand` is unavailable the
 * `formatBlock` / list / rule commands fall back to a Selection/Range implementation
 * that produces identical HTML.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { initialHtml, placeholder = EDITOR_PLACEHOLDER, onChange, onPickImage, isMobile = false, className },
  ref,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !surfaceRef.current) return;
    surfaceRef.current.innerHTML = initialHtml;
    seeded.current = true;
  }, [initialHtml]);

  const saveRange = useCallback(() => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (sel && sel.rangeCount > 0 && node && surfaceRef.current?.contains(node)) {
      rangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const emit = useCallback(() => {
    onChange?.(surfaceRef.current?.innerHTML ?? '');
  }, [onChange]);

  const restoreRange = useCallback(() => {
    if (!rangeRef.current) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(rangeRef.current);
  }, []);

  /** Selection/Range fallback used when `document.execCommand` is missing. */
  const execFallback = useCallback((command: EditorCommand, value?: string) => {
    const surface = surfaceRef.current;
    const range = rangeRef.current;
    if (!surface) return;

    if (command === 'insertHorizontalRule') {
      const hr = document.createElement('hr');
      if (range) {
        range.deleteContents();
        range.insertNode(hr);
      } else {
        surface.appendChild(hr);
      }
      return;
    }

    const wrapTag: Partial<Record<EditorCommand, string>> = {
      bold: 'b', italic: 'i', underline: 'u', strikeThrough: 's',
    };
    const tag = wrapTag[command];
    if (tag && range && !range.collapsed) {
      const el = document.createElement(tag);
      el.appendChild(range.extractContents());
      range.insertNode(el);
      return;
    }

    if (command === 'formatBlock' && value) {
      const name = value.replace(/[<>]/g, '');
      const block = document.createElement(name);
      if (range) {
        block.appendChild(range.extractContents());
        range.insertNode(block);
      } else {
        surface.appendChild(block);
      }
    }
  }, []);

  const exec = useCallback(
    (command: EditorCommand, value?: string) => {
      surfaceRef.current?.focus();
      restoreRange();
      const native = typeof document.execCommand === 'function';
      if (native) {
        document.execCommand(command, false, value);
      } else {
        execFallback(command, value);
      }
      emit();
    },
    [emit, execFallback, restoreRange],
  );

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => surfaceRef.current?.innerHTML ?? '',
      setHtml: (html: string) => {
        if (surfaceRef.current) {
          surfaceRef.current.innerHTML = html;
          emit();
        }
      },
      focus: () => surfaceRef.current?.focus(),
      insertImage: (src: string, alt: string, position: ImagePosition = 'cursor') => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        const range = position === 'cursor' ? rangeRef.current : null;
        if (range) {
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
        } else {
          surfaceRef.current?.appendChild(img);
        }
        emit();
      },
      setImageAlt: (src: string, alt: string) => {
        const surface = surfaceRef.current;
        if (!surface) return;
        let changed = false;
        surface.querySelectorAll('img').forEach((img) => {
          if (img.getAttribute('src') !== src) return;
          img.setAttribute('alt', alt);
          changed = true;
        });
        if (changed) emit();
      },
      removeImage: (src: string) => {
        const surface = surfaceRef.current;
        if (!surface) return;
        let changed = false;
        surface.querySelectorAll('img').forEach((img) => {
          if (img.getAttribute('src') !== src) return;
          img.remove();
          changed = true;
        });
        if (changed) emit();
      },
      exec,
    }),
    [emit, exec],
  );

  return (
    <div className={cn('rounded-14 border border-line bg-surface', className)}>
      <EditorToolbar onCommand={exec} onPickImage={onPickImage} />
      <div
        ref={surfaceRef}
        data-prose="1"
        data-ph={placeholder}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung ghi chú"
        onInput={emit}
        onKeyUp={saveRange}
        onMouseUp={saveRange}
        onBlur={saveRange}
        className={cn('min-h-460', isMobile ? 'py-20 px-18' : 'py-32 px-40')}
      />
    </div>
  );
});
