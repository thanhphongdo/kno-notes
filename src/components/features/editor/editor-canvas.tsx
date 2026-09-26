'use client';

import { useRef, type ChangeEvent, type RefObject } from 'react';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/shared';
import type { NoteImage } from '@/lib/types';

export interface EditorCanvasProps {
  /** Seeded into the surface once; never a controlled value, or the caret jumps. */
  initialHtml: string;
  isMobile?: boolean;
  /** The save handler reads the HTML back through this handle. */
  handleRef: RefObject<RichTextEditorHandle | null>;
  onChange?: (html: string) => void;
  /** Uploads the picked files and returns the stored images. */
  onPickFiles: (files: File[]) => Promise<NoteImage[]>;
}

/**
 * The editor surface plus its inline-image picker (prototype lines 492-505).
 * The toolbar, `execCommand` and its Selection/Range fallback all live inside
 * `RichTextEditor`; the caret is saved on keyup/mouseup/blur there, which is why
 * an image lands where the user last was even though the file dialog stole focus.
 */
export function EditorCanvas({
  initialHtml, isMobile, handleRef, onChange, onPickFiles,
}: EditorCanvasProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const images = await onPickFiles(files);
    for (const image of images) handleRef.current?.insertImageAtCursor(image.src, image.label);
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
