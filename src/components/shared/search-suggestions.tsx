'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { PriorityDot, type Priority } from './priority';
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
}

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
}

export function SearchSuggestions({
  query, recent, onRecentSelect, onClearRecent,
  tags, tagsTitle, onTagSelect, notes, notesTitle, onNoteSelect, onSubmit,
}: SearchSuggestionsProps) {
  const typing = query.trim().length > 0;
  const showRecent = !typing && recent.length > 0;
  const empty = typing && tags.length === 0 && notes.length === 0;

  return (
    <div data-search-suggestions="" className="flex min-w-0 flex-col gap-6">
      {showRecent ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-10 pt-6 pb-4">
            <SectionLabel size={11}>Tìm gần đây</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className="border-0 bg-transparent p-0 text-12 text-faint hover:text-text"
            >
              Xoá
            </button>
          </div>
          {recent.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => onRecentSelect(term)}
              className="flex h-36 items-center gap-10 rounded-8 border-0 bg-transparent px-10 text-left text-14 text-text hover:bg-surface2"
            >
              <Icon name="history" size={15} className="text-faint" />
              {term}
            </button>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="flex flex-col gap-6 px-10 pt-4 pb-8">
          <SectionLabel size={11}>{tagsTitle}</SectionLabel>
          <div className="flex flex-wrap gap-6">
            {tags.map((tag) => (
              <TagChip
                key={tag.name}
                name={tag.name}
                hash
                count={tag.count}
                onClick={() => onTagSelect(tag.name)}
                className="h-28"
              />
            ))}
          </div>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="flex flex-col">
          <SectionLabel size={11} className="px-10 pt-6 pb-4">{notesTitle}</SectionLabel>
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onNoteSelect(note.id)}
              className="flex items-start gap-10 rounded-8 border-0 bg-transparent px-10 py-9 text-left text-text hover:bg-surface2"
            >
              <PriorityDot priority={note.priority} size={7} className="mt-7" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="truncate font-serif text-15 font-semibold">{note.title}</span>
                <span className="truncate text-12 text-muted">{note.sub}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {empty ? (
        <div className="px-10 py-20 text-center text-13 text-muted">{`Không có gợi ý cho “${query}”`}</div>
      ) : null}

      {typing ? (
        <button
          type="button"
          onClick={onSubmit}
          className={cn(
            'mt-2 flex h-38 items-center gap-10 border-0 border-t border-line bg-transparent px-10 text-left text-13 text-accent hover:bg-surface2',
            'rounded-b-8',
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
