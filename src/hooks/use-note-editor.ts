'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { uploadImages } from '@/components/features/editor/upload';
import type { RichTextEditorHandle } from '@/components/shared';
import { useToast } from '@/components/ui';
import { dashboardPath, notePath } from '@/lib/nav/paths';
import type { NoteImage, Priority } from '@/lib/types';

export interface EditorDraft {
  /** `null` for a brand-new note. */
  id: string | null;
  title: string;
  desc: string;
  tags: string[];
  priority: Priority;
  images: NoteImage[];
  content: string;
  changeNote: string;
}

export interface UseNoteEditorOptions {
  initial: EditorDraft;
  /** The version the save *will* create — `latest + 1`, or 1 for a new note. */
  nextVersion: number;
}

/** Prototype line 490: the save button always names the version it will create. */
export const saveLabelFor = (nextVersion: number): string => `Lưu v${nextVersion}`;

export const versionHintFor = (isExisting: boolean, nextVersion: number): string =>
  isExisting
    ? `Nội dung thay đổi sẽ được lưu thành phiên bản v${nextVersion}; các bản cũ vẫn xem và khôi phục được.`
    : 'Ghi chú mới sẽ bắt đầu từ phiên bản v1.';

export function useNoteEditor({ initial, nextVersion }: UseNoteEditorOptions) {
  const router = useRouter();
  const { flash } = useToast();
  const handleRef = useRef<RichTextEditorHandle | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(initial);
  const [saving, setSaving] = useState(false);

  const patch = useCallback(
    (part: Partial<EditorDraft>) => setDraft((d) => ({ ...d, ...part })),
    [],
  );

  /** Uploads and reports failures; the caller decides where the images go. */
  const pickFiles = useCallback(
    async (files: File[]): Promise<NoteImage[]> => {
      const { images, failed } = await uploadImages(files);
      if (failed > 0) flash('Không tải được ảnh lên');
      return images;
    },
    [flash],
  );

  /** Gallery pick/drop: the uploaded images are appended to the attachments. */
  const attachFiles = useCallback(
    async (files: File[]) => {
      const images = await pickFiles(files);
      if (images.length > 0) setDraft((d) => ({ ...d, images: [...d.images, ...images] }));
    },
    [pickFiles],
  );

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // PATCH is a full replace, so every field travels on every save.
      const body = JSON.stringify({
        title: draft.title,
        desc: draft.desc,
        tags: draft.tags,
        priority: draft.priority,
        content: handleRef.current?.getHtml() ?? draft.content,
        images: draft.images,
        changeNote: draft.changeNote.trim(),
      });
      const res = draft.id
        ? await fetch(`/api${notePath(draft.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        : await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
      if (!res.ok) {
        flash('Không lưu được ghi chú');
        return;
      }
      const { note, version } = (await res.json()) as { note: { id: string }; version: number };
      flash(`Đã lưu · phiên bản v${version}`);
      router.push(notePath(note.id));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [draft, flash, router, saving]);

  const cancel = useCallback(() => {
    router.push(draft.id ? notePath(draft.id) : dashboardPath());
  }, [draft.id, router]);

  return {
    draft,
    patch,
    handleRef,
    saving,
    save,
    cancel,
    pickFiles,
    attachFiles,
    saveLabel: saveLabelFor(nextVersion),
    versionHint: versionHintFor(Boolean(initial.id), nextVersion),
  };
}
