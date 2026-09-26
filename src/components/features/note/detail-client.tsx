'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  ImageGrid, Lightbox, PriorityPill, Prose, SectionLabel, TagChip, VersionBanner,
} from '@/components/shared';
import { Icon, useToast } from '@/components/ui';
import { fmt, rel } from '@/lib/text';
import type { Note, NoteImage } from '@/lib/types';
import { dashboardPath, notePath, tagPath } from './routes';
import { DetailActions } from './detail-actions';

export interface DetailViewData {
  note: Note;
  /** The selected version's content when `?v=` points at an old one, else `note.content`. */
  shownContent: string;
  viewingOld: boolean;
  selectedVersion: number;
  latestVersion: number;
}

const INLINE_IMAGE_LABEL = 'Ảnh trong nội dung';

/** Prototype lines 342-419 — the detail screen's article column. */
export function DetailClient({ data }: { data: DetailViewData }) {
  const { note, shownContent, viewingOld, selectedVersion, latestVersion } = data;
  const router = useRouter();
  const { flash } = useToast();
  const [lightbox, setLightbox] = useState<{ images: NoteImage[]; index: number } | null>(null);

  const selected = note.versions.find((v) => v.v === selectedVersion);

  const restore = useCallback(async () => {
    const res = await fetch(
      `/api/notes/${encodeURIComponent(note.id)}/versions/${selectedVersion}/restore`,
      { method: 'POST' },
    );
    if (!res.ok) {
      flash('Không khôi phục được');
      return;
    }
    const { version } = (await res.json()) as { version: number };
    flash(`Đã khôi phục thành v${version}`);
    // Contracts §4: always land back on the clean URL, never `?v=`.
    router.push(notePath(note.id));
    router.refresh();
  }, [flash, note.id, router, selectedVersion]);

  const onProseClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      setLightbox({ images: [{ id: 'inline', label: INLINE_IMAGE_LABEL, src: img.src }], index: 0 });
    }
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-1120 flex-col gap-24 px-16 pt-20 pb-80 min-[820px]:px-40 min-[820px]:pt-36">
      <Link
        href={dashboardPath()}
        className="-ml-4 flex h-32 items-center gap-4 self-start rounded-8 pr-10 pl-4 text-13 text-muted hover:bg-surface2 hover:text-text"
      >
        <Icon name="chevron-left" size={16} />
        Tất cả ghi chú
      </Link>

      <div className="flex flex-wrap items-start gap-56">
        <article className="flex min-w-0 max-w-740 flex-[1_1_560px] flex-col">
          <div className="mb-16 flex flex-wrap items-center gap-8">
            <PriorityPill priority={note.priority} />
            {note.tags.map((tag) => (
              <TagChip key={tag} name={tag} hash onClick={() => router.push(tagPath(tag))} />
            ))}
          </div>

          <h1 className="m-0 mb-12 font-serif text-28 font-semibold leading-[1.15] tracking-[-.02em] [text-wrap:balance] min-[820px]:text-38">
            {note.title}
          </h1>
          <p className="m-0 mb-22 text-17 leading-[1.55] text-muted [text-wrap:pretty]">{note.desc}</p>

          <DetailActions
            noteId={note.id}
            fav={note.fav}
            updatedLabel={rel(note.updated)}
            versionLabel={`v${latestVersion}`}
            disabled={viewingOld}
            onStartQuiz={() => undefined}
          />

          {viewingOld && selected ? (
            <VersionBanner
              className="mb-28"
              versionLabel={`v${selected.v}`}
              dateLabel={`${fmt(selected.date)} · ${selected.note}`}
              onBackToCurrent={() => router.push(notePath(note.id))}
              onRestore={() => void restore()}
            />
          ) : null}

          <Prose html={shownContent} onClick={onProseClick} />

          {note.images.length > 0 ? (
            <div className="mt-40 flex flex-col gap-14">
              <SectionLabel>{`Hình ảnh · ${note.images.length}`}</SectionLabel>
              <ImageGrid
                images={note.images}
                variant="detail"
                onOpen={(index) => setLightbox({ images: note.images, index })}
              />
            </div>
          ) : null}
        </article>
      </div>

      {lightbox ? (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((l) => (l ? { ...l, index } : l))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
