'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { NoteBriefRow } from './note-brief-row';
import type { Priority } from './priority';
import { SectionLabel } from './section-label';
import { TagChip } from './tag-chip';

export interface SuggestionTag {
  name: string;
  count: number;
}

export interface SuggestionNote {
  id: string;
  title: string;
  sub: string;
  priority: Priority;
  /**
   * Đoạn đã đánh dấu khiến ghi chú này khớp. Có mặt khi từ khoá không nằm ở
   * tiêu đề — không có dòng này, kết quả trông như vô cớ.
   */
  highlight?: string;
}

/**
 * `compact` — the desktop dropdown, exactly the prototype's metrics.
 * `comfortable` — the mobile full-screen overlay: same type, same order, rows
 * grown to the ≥ 44px touch target of Design Spec §06.
 */
export type SuggestionDensity = 'compact' | 'comfortable';

export interface SearchSuggestionsProps {
  query: string;
  /** Hidden while the query is non-empty. */
  recent: readonly string[];
  onRecentSelect: (query: string) => void;
  onClearRecent: () => void;
  tags: readonly SuggestionTag[];
  /** 'Thẻ' (idle) | 'Thẻ khớp' (typing). */
  tagsTitle: string;
  onTagSelect: (name: string) => void;
  notes: readonly SuggestionNote[];
  /** 'Mở gần đây' (idle) | 'Ghi chú khớp' (typing). */
  notesTitle: string;
  onNoteSelect: (id: string) => void;
  onSubmit: () => void;
  /** `isMobile ? 'comfortable' : 'compact'`. Defaults to the desktop dropdown. */
  density?: SuggestionDensity;
}

export function SearchSuggestions({
  query, recent, onRecentSelect, onClearRecent,
  tags, tagsTitle, onTagSelect, notes, notesTitle, onNoteSelect, onSubmit,
  density = 'compact',
}: SearchSuggestionsProps) {
  const typing = query.trim().length > 0;
  const showRecent = !typing && recent.length > 0;
  const empty = typing && tags.length === 0 && notes.length === 0;
  const roomy = density === 'comfortable';

  const padX = roomy ? 'px-14' : 'px-10';
  const heading = cn(padX, roomy ? 'pt-12 pb-6' : 'pt-6 pb-4');

  return (
    <div
      data-search-suggestions=""
      data-density={density}
      className={cn('flex min-w-0 flex-col', roomy ? 'gap-10' : 'gap-6')}
    >
      {showRecent ? (
        <div className="flex flex-col">
          <div className={cn('flex items-center justify-between', heading)}>
            <SectionLabel size={11}>Tìm gần đây</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className={cn(
                'flex items-center border-0 bg-transparent p-0 text-12 text-faint hover:text-text',
                roomy && 'h-44 px-10 -my-12 -mr-10',
              )}
            >
              Xoá
            </button>
          </div>
          {recent.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => onRecentSelect(term)}
              className={cn(
                'flex items-center gap-10 rounded-8 border-0 bg-transparent text-left text-14 text-text hover:bg-surface2',
                padX,
                roomy ? 'h-48' : 'h-36',
              )}
            >
              <Icon name="history" size={15} className="text-faint" />
              {term}
            </button>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className={cn('flex flex-col gap-6', padX, roomy ? 'pt-8 pb-10' : 'pt-4 pb-8')}>
          <SectionLabel size={11}>{tagsTitle}</SectionLabel>
          <div className={cn('flex flex-wrap', roomy ? 'gap-8' : 'gap-6')}>
            {tags.map((tag) => (
              <TagChip
                key={tag.name}
                name={tag.name}
                hash
                count={tag.count}
                onClick={() => onTagSelect(tag.name)}
                className={roomy ? 'h-36 px-12' : 'h-28'}
              />
            ))}
          </div>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="flex flex-col">
          <SectionLabel size={11} className={heading}>{notesTitle}</SectionLabel>
          {notes.map((note) => (
            <NoteBriefRow
              key={note.id}
              title={note.title}
              sub={note.sub}
              priority={note.priority}
              highlight={note.highlight}
              density={density}
              onClick={() => onNoteSelect(note.id)}
            />
          ))}
        </div>
      ) : null}

      {empty ? (
        <div className={cn('text-center text-13 text-muted', padX, roomy ? 'py-28' : 'py-20')}>
          {`Không có gợi ý cho “${query}”`}
        </div>
      ) : null}

      {typing ? (
        <button
          type="button"
          onClick={onSubmit}
          className={cn(
            'mt-2 flex items-center gap-10 border-0 border-t border-line bg-transparent text-left text-13 text-accent hover:bg-surface2',
            'rounded-b-8',
            padX,
            roomy ? 'h-52' : 'h-38',
          )}
        >
          <Icon name="search" size={15} />
          {`Xem tất cả kết quả cho “${query}”`}
          <Kbd bare className="ml-auto">Enter</Kbd>
        </button>
      ) : null}
    </div>
  );
}
