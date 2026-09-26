'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ImageDropzoneProps {
  onFiles: (files: FileList) => void;
  className?: string;
}

/** py-20 px-16 · 1px dashed --line2 → --accent while dragging · r10 · 13px muted. */
export function ImageDropzone({ onFiles, className }: ImageDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Kéo thả ảnh vào đây hoặc chọn từ máy"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
        }}
        className={cn(
          'cursor-pointer rounded-10 border border-dashed py-20 px-16 text-center text-13 leading-[1.5] text-muted',
          dragOver ? 'border-accent bg-accent-soft' : 'border-line2 bg-transparent',
          className,
        )}
      >
        Kéo thả ảnh vào đây
        <br />
        <span className="font-medium text-accent">hoặc chọn từ máy</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
