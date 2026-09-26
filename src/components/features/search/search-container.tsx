'use client';

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type RefObject,
} from 'react';
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

/**
 * If `popstate` never arrives — a browser that swallows a programmatic
 * traversal — navigate anyway rather than leave the tap doing nothing.
 */
export const HISTORY_POP_FALLBACK_MS = 200;

/** Marks the throwaway entry the mobile overlay pushes, for debugging only. */
const OVERLAY_HISTORY_KEY = 'knoSearchOverlay';

/**
 * The entry has to be pushed while the page still has its real scroll offset,
 * because the browser records that offset against the entry it is leaving and
 * replays it on the way back. `SearchOverlay` pins the body in a passive
 * effect, and every layout effect runs before every passive one — so this is
 * the ordering, not a preference. The component renders on the server, hence
 * the guard.
 */
const useHistoryEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
 *
 * Below 820px the same box and the same panel are rendered inside
 * `SearchOverlay` instead of the anchored dropdown, and this component owns the
 * one history entry that makes the Back gesture close the overlay: see
 * `closeThen` for why every close path has to go through the same place.
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

  /** True while the throwaway history entry below is the current one. */
  const entry = useRef(false);

  /**
   * Back must close the overlay, not leave the page — so opening it pushes an
   * entry at the same URL. That entry is rubbish the moment the overlay closes,
   * so it is popped again on every close path; Back from the dashboard then
   * does what it did before the user ever tapped search.
   */
  useHistoryEffect(() => {
    if (!isMobile || !open) return;

    // No URL argument: the entry is the page the user is already on, and
    // Next only re-dispatches its router state when a URL is handed over.
    window.history.pushState({ ...window.history.state, [OVERLAY_HISTORY_KEY]: true }, '');
    entry.current = true;

    const onPop = () => {
      entry.current = false;
      onOpenChange(false);
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by a path that did not consume the entry itself — the shell's
      // global Esc, the box's own Esc, an unmount. Drop it now.
      if (entry.current) {
        entry.current = false;
        window.history.back();
      }
    };
  }, [isMobile, onOpenChange, open]);

  /**
   * Close, then navigate — in that order, and only once the overlay's history
   * entry has actually been popped. Pushing a route on top of that entry
   * instead would strand the user on a dashboard they have to Back through
   * twice, and `history.back()` is asynchronous, so the navigation waits for
   * `popstate` rather than racing it.
   */
  const closeThen = useCallback(
    (after?: () => void) => {
      onOpenChange(false);
      inputRef.current?.blur();

      if (!entry.current) {
        after?.();
        return;
      }
      entry.current = false;

      if (!after) {
        window.history.back();
        return;
      }

      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', run);
        after();
      };
      window.addEventListener('popstate', run);
      window.setTimeout(run, HISTORY_POP_FALLBACK_MS);
      window.history.back();
    },
    [inputRef, onOpenChange],
  );

  const submit = useCallback(
    (raw?: string) => {
      const term = (raw ?? value).trim();
      if (term) pushRecentSearch(term);
      closeThen(() => setQuery(term));
    },
    [closeThen, pushRecentSearch, setQuery, value],
  );

  const onTagSelect = useCallback(
    (name: string) => {
      pushRecentSearch(`#${name}`);
      setValue('');
      closeThen(() => setFilters({ tag: name, q: '', priority: null, fav: false }));
    },
    [closeThen, pushRecentSearch, setFilters],
  );

  const onNoteSelect = useCallback(
    (id: string) => {
      if (q) pushRecentSearch(q);
      setValue('');
      closeThen(() => router.push(notePath(id)));
    },
    [closeThen, pushRecentSearch, q, router],
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
      variant={isMobile ? 'overlay' : 'anchored'}
      inputRef={inputRef}
      suggestions={
        <SearchSuggestions
          query={value}
          density={isMobile ? 'comfortable' : 'compact'}
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
