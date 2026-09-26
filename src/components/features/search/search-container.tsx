'use client';

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBox, SearchSuggestions, type SuggestionNote, type SuggestionTag } from '@/components/shared';
import { usePrefs } from '@/hooks/use-prefs';
import { useNoteFilters } from '@/hooks/use-note-filters';
import { useSemanticSearch } from '@/hooks/use-semantic-search';
import { hybridRank, isTagQuery, tagNeedle } from '@/lib/search';
import { notePath } from '@/lib/nav/paths';
import { norm, rel } from '@/lib/text';

/** Long enough that a fast typist embeds once, short enough to feel live. */
export const QUERY_DEBOUNCE_MS = 180;

/** Prototype counts: idle shows 8 tags / 4 notes, typing narrows to 6 / 6. */
const TAGS_IDLE = 8;
const TAGS_TYPING = 6;
const NOTES_IDLE = 4;
const NOTES_TYPING = 6;

export interface SearchContainerProps {
  /** Server-rendered tag counts from `GET /api/tags`, via the shell layout. */
  tags: readonly SuggestionTag[];
  isMobile: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The header search box and its suggestion panel.
 *
 * Ranking is hybrid but never blocking: `hybridRank` runs on every keystroke
 * with whatever vectors exist, and `vectors: null` / `queryVector: null` simply
 * mean keyword-only. The embedder is started on first focus, a `#tag` query
 * short-circuits before it is ever consulted, and a query embedding that is
 * slow, failed or superseded resolves to `null` — the panel keeps working.
 *
 * `/` focus is the shell's `KeyboardLayer`; this component only owns the box.
 */
export function SearchContainer({ tags, isMobile, inputRef, open, onOpenChange }: SearchContainerProps) {
  const router = useRouter();
  const { prefs, pushRecentSearch, clearRecentSearches } = usePrefs();
  const { filters, setFilters, setQuery } = useNoteFilters();
  const { docs, vectors, ready, embedQuery, warmUp } = useSemanticSearch();

  const [value, setValue] = useState(filters.q);
  const [queryVector, setQueryVector] = useState<Float32Array | null>(null);

  const committed = filters.q;
  // Back/forward changes the committed query behind our back.
  useEffect(() => setValue(committed), [committed]);

  const q = value.trim();

  // Debounced query embedding. A tag query never reaches the embedder.
  useEffect(() => {
    if (!ready || !q || isTagQuery(q)) {
      setQueryVector(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void embedQuery(q).then((v) => {
        if (!cancelled) setQueryVector(v);
      });
    }, QUERY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [embedQuery, q, ready]);

  const close = useCallback(() => {
    onOpenChange(false);
    inputRef.current?.blur();
  }, [inputRef, onOpenChange]);

  const submit = useCallback(
    (raw?: string) => {
      const term = (raw ?? value).trim();
      if (term) pushRecentSearch(term);
      close();
      setQuery(term);
    },
    [close, pushRecentSearch, setQuery, value],
  );

  const onTagSelect = useCallback(
    (name: string) => {
      pushRecentSearch(`#${name}`);
      setValue('');
      close();
      setFilters({ tag: name, q: '', priority: null, fav: false });
    },
    [close, pushRecentSearch, setFilters],
  );

  const onNoteSelect = useCallback(
    (id: string) => {
      if (q) pushRecentSearch(q);
      setValue('');
      close();
      router.push(notePath(id));
    },
    [close, pushRecentSearch, q, router],
  );

  const suggestionTags = useMemo<SuggestionTag[]>(() => {
    const needle = isTagQuery(q) ? tagNeedle(q) : norm(q);
    return tags
      .filter((tag) => !needle || norm(tag.name).includes(needle))
      .slice(0, q ? TAGS_TYPING : TAGS_IDLE);
  }, [q, tags]);

  const suggestionNotes = useMemo<SuggestionNote[]>(() => {
    // Idle is "Mở gần đây": newest first, four of them, exactly like the
    // prototype's `sugSrc`. Typing hands the order to the ranker.
    const ranked = q
      ? hybridRank({ query: q, docs, vectors, queryVector, maxResults: NOTES_TYPING })
      : [...docs].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, NOTES_IDLE);
    return ranked.map((doc) => ({
      id: doc.noteId,
      title: doc.title,
      sub: `${doc.tags.map((t) => `#${t}`).join(' ')} · ${rel(doc.updated)}`,
      priority: doc.priority,
    }));
  }, [docs, q, queryVector, vectors]);

  return (
    <SearchBox
      value={value}
      onValueChange={setValue}
      onSubmit={() => submit()}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) warmUp();
      }}
      showKbdHint={!value && !isMobile}
      inputRef={inputRef}
      suggestions={
        <SearchSuggestions
          query={value}
          recent={prefs.recentSearches}
          onRecentSelect={(term) => {
            setValue(term);
            submit(term);
          }}
          onClearRecent={clearRecentSearches}
          tags={suggestionTags}
          tagsTitle={q ? 'Thẻ khớp' : 'Thẻ'}
          onTagSelect={onTagSelect}
          notes={suggestionNotes}
          notesTitle={q ? 'Ghi chú khớp' : 'Mở gần đây'}
          onNoteSelect={onNoteSelect}
          onSubmit={() => submit()}
        />
      }
    />
  );
}
