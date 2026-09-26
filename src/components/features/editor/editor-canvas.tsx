'use client';

import { useRef, type ChangeEvent, type RefObject } from 'react';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/shared';

export interface EditorCanvasProps {
  /** Seeded into the surface once; never a controlled value, or the caret jumps. */
  initialHtml: string;
  isMobile?: boolean;
  /** The save handler reads the HTML back through this handle. */
  handleRef: RefObject<RichTextEditorHandle | null>;
  onChange?: (html: string) => void;
  /**
   * Uploads the picked files, registers them as the note's images and inserts
   * them at the caret. The canvas only supplies the files — where an image
   * ends up is one decision, made in `useNoteEditor` for every entry point.
   */
  onInsertFiles: (files: File[]) => Promise<void>;
}

/**
 * The editor surface plus its inline-image picker (prototype lines 492-505).
 * The toolbar, `execCommand` and its Selection/Range fallback all live inside
 * `RichTextEditor`; the caret is saved on keyup/mouseup/blur there, which is why
 * an image lands where the user last was even though the file dialog stole focus.
 */
export function EditorCanvas({
  initialHtml, isMobile, handleRef, onChange, onInsertFiles,
}: EditorCanvasProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    await onInsertFiles(files);
  }

  return (
    <>
      <RichTextEditor
        ref={handleRef}
        initialHtml={initialHtml}
        isMobile={isMobile}
        onChange={onChange}
        onPickImage={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Chèn ảnh vào nội dung"
        onChange={(e) => void onFiles(e)}
      />
    </>
  );
}
