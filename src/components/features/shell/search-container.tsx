'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchBox, SearchSuggestions, type SuggestionTag } from '@/components/shared';
import { usePrefs } from '@/hooks/use-prefs';
import { buildDashboardHref } from '@/lib/nav/paths';
import { norm } from '@/lib/text';

export interface SearchContainerProps {
  tags: readonly SuggestionTag[];
  isMobile: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_TAG_SUGGESTIONS = 6;

/**
 * BRIDGE — task A15 (`useSemanticSearch` + note suggestions) replaces the body
 * of this file. It deliberately implements only what the shell itself owns:
 * the query lives in the URL, Enter commits it and records it in
 * `recentSearches`, and the panel offers recent terms plus matching tags.
 * Note-level suggestions and hybrid ranking arrive with A15.
 */
export function SearchContainer({ tags, isMobile, inputRef, open, onOpenChange }: SearchContainerProps) {
  const router = useRouter();
  const params = useSearchParams();
  const { prefs, pushRecentSearch, clearRecentSearches } = usePrefs();

  const committed = params.get('q') ?? '';
  const [value, setValue] = useState(committed);

  // A back/forward navigation changes the committed query behind our back.
  useEffect(() => setValue(committed), [committed]);

  const matchingTags = useMemo(() => {
    const query = norm(value.trim().replace(/^#/, ''));
    if (!query) return tags.slice(0, MAX_TAG_SUGGESTIONS);
    return tags.filter((tag) => norm(tag.name).includes(query)).slice(0, MAX_TAG_SUGGESTIONS);
  }, [tags, value]);

  const typing = value.trim().length > 0;

  const commit = (next: string) => {
    const term = next.trim();
    if (term) pushRecentSearch(term);
    onOpenChange(false);
    inputRef.current?.blur();
    router.replace(buildDashboardHref({ q: term }));
  };

  const selectTag = (name: string) => {
    pushRecentSearch(`#${name}`);
    onOpenChange(false);
    inputRef.current?.blur();
    router.push(buildDashboardHref({ tag: name }));
  };

  return (
    <SearchBox
      value={value}
      onValueChange={setValue}
      onSubmit={() => commit(value)}
      open={open}
      onOpenChange={onOpenChange}
      showKbdHint={!value && !isMobile}
      inputRef={inputRef}
      suggestions={
        <SearchSuggestions
          query={value}
          recent={prefs.recentSearches}
          onRecentSelect={(term) => { setValue(term); commit(term); }}
          onClearRecent={clearRecentSearches}
          tags={matchingTags}
          tagsTitle={typing ? 'Thẻ khớp' : 'Thẻ'}
          onTagSelect={selectTag}
          notes={[]}
          notesTitle={typing ? 'Ghi chú khớp' : 'Mở gần đây'}
          onNoteSelect={() => {}}
          onSubmit={() => commit(value)}
        />
      }
    />
  );
}
