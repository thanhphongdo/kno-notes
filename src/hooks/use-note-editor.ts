'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { uploadImages } from '@/components/features/editor/upload';
import type { ImagePosition, RichTextEditorHandle } from '@/components/shared';
import { useToast } from '@/components/ui';
import { useOffline } from '@/components/providers/offline-provider';
import { isNetworkFailure } from '@/lib/offline/queue';
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
  const offline = useOffline();
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

  /**
   * Một ảnh của ghi chú sống ở ĐÚNG MỘT danh sách (`draft.images`) nhưng hiện
   * ở hai chỗ: lồng trong bài và trong thư viện cuối bài. Nên mọi đường thêm
   * ảnh đều làm cả hai việc — khác đi thì ảnh chèn từ thanh công cụ sẽ biến
   * mất khỏi thư viện, còn ảnh kéo thả sẽ không bao giờ nằm trong bài.
   */
  const addImages = useCallback(
    async (files: File[], position: ImagePosition) => {
      const images = await pickFiles(files);
      if (images.length === 0) return;
      setDraft((d) => ({ ...d, images: [...d.images, ...images] }));
      for (const image of images) handleRef.current?.insertImage(image.src, image.label, position);
    },
    [pickFiles],
  );

  /** Nút "Ảnh" trên thanh công cụ: chèn ngay tại chỗ người dùng đang gõ. */
  const insertFiles = useCallback((files: File[]) => addImages(files, 'cursor'), [addImages]);

  /** Kéo thả vào khung đính kèm: không có con trỏ, nên ảnh rơi xuống cuối bài. */
  const attachFiles = useCallback((files: File[]) => addImages(files, 'end'), [addImages]);

  /**
   * Alt là thứ người đọc nghe được thay cho tấm ảnh — và từ nay cũng là thứ
   * tìm kiếm soi tới. Sửa ở thư viện thì `<img>` trong bài phải đổi theo, nếu
   * không sẽ có hai alt khác nhau cho cùng một tấm ảnh.
   */
  const setImageLabel = useCallback(
    (id: string, label: string) => {
      const image = draft.images.find((im) => im.id === id);
      if (image) handleRef.current?.setImageAlt(image.src, label);
      setDraft((d) => ({
        ...d,
        images: d.images.map((im) => (im.id === id ? { ...im, label } : im)),
      }));
    },
    [draft.images],
  );

  /** Gỡ ảnh: khỏi thư viện VÀ khỏi bài — vẫn là một tấm ảnh duy nhất. */
  const removeImage = useCallback(
    (id: string) => {
      const image = draft.images.find((im) => im.id === id);
      if (image) handleRef.current?.removeImage(image.src);
      setDraft((d) => ({ ...d, images: d.images.filter((im) => im.id !== id) }));
    },
    [draft.images],
  );

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // PATCH is a full replace, so every field travels on every save.
      const payload = {
        title: draft.title,
        desc: draft.desc,
        tags: draft.tags,
        priority: draft.priority,
        content: handleRef.current?.getHtml() ?? draft.content,
        images: draft.images,
        changeNote: draft.changeNote.trim(),
      };
      const body = JSON.stringify(payload);
      const path = draft.id ? `/api${notePath(draft.id)}` : '/api/notes';
      const method = draft.id ? 'PATCH' : 'POST';

      let res: Response;
      try {
        res = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch (error) {
        // Mất mạng giữa lúc bấm Lưu là lúc dễ mất công nhất. Giữ bài lại
        // trong hàng đợi và nói thật rằng nó chưa lên máy chủ.
        const queued =
          isNetworkFailure(error) &&
          (await offline?.queueWrite({
            kind: draft.id ? 'note.update' : 'note.create',
            path,
            method,
            body: payload,
            label: `Lưu “${payload.title || 'Ghi chú không tiêu đề'}”`,
            noteId: draft.id,
          }));
        flash(queued ? 'Chưa có mạng — sẽ lưu khi kết nối lại' : 'Không lưu được ghi chú');
        return;
      }

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
  }, [draft, flash, offline, router, saving]);

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
    insertFiles,
    attachFiles,
    setImageLabel,
    removeImage,
    saveLabel: saveLabelFor(nextVersion),
    versionHint: versionHintFor(Boolean(initial.id), nextVersion),
  };
}
