'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type MouseEvent as ReactMouseEvent, type RefObject,
} from 'react';
import {
  collectHighlights, newHighlightId, unwrapHl, wrapRange,
  type CollectedHighlight,
} from '@/components/features/highlight/range';

export interface HighlightPopupState {
  mode: 'add' | 'remove';
  /** Only present in `remove` mode. */
  id?: string;
  /** Viewport px, pre-clamp — `HighlightPopup` does the clamping. */
  x: number;
  y: number;
}

export interface UseHighlightOptions {
  noteId: string;
  /** The HTML currently rendered in the prose surface. */
  content: string;
  /** True while an old version is displayed: highlighting is off entirely. */
  disabled: boolean;
}

export interface UseHighlightResult {
  proseRef: RefObject<HTMLDivElement | null>;
  items: CollectedHighlight[];
  popup: HighlightPopupState | null;
  /** Attach to the prose surface; opens the remove bubble on a `<mark>` click. */
  onProseClick: (e: ReactMouseEvent<HTMLElement>) => void;
  /** Attach to `onMouseUp` and `onTouchEnd`; opens the add bubble for a selection. */
  onProseSelect: () => void;
  /** Runs the popup's single action. */
  act: () => void;
  remove: (id: string) => void;
  close: () => void;
}

const ORIGIN = { x: 0, y: 0 };

/**
 * Centre-top of a range or element in viewport coordinates.
 * jsdom implements `getBoundingClientRect` on elements but not on `Range`, so
 * the missing method degrades to the viewport origin instead of throwing.
 */
function anchorOf(target: Range | Element): { x: number; y: number } {
  if (typeof target.getBoundingClientRect !== 'function') return ORIGIN;
  const rect = target.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

/**
 * Port of the prototype's `hlAdd` / `hlRemove` / `hlCommit` (lines 929-934).
 * Persisting goes through `PUT /api/notes/:id/highlights`, which writes both
 * `content` and the last version's content and **creates no new version**.
 */
export function useHighlight({ noteId, content, disabled }: UseHighlightOptions): UseHighlightResult {
  const router = useRouter();
  const proseRef = useRef<HTMLDivElement | null>(null);
  const pendingRange = useRef<Range | null>(null);
  const [popup, setPopup] = useState<HighlightPopupState | null>(null);
  const [html, setHtml] = useState(content);

  useEffect(() => {
    setHtml(content);
  }, [content]);

  const close = useCallback(() => setPopup(null), []);

  // The bubble dies on any click outside it and on any scroll, capture phase —
  // exactly like the prototype's document-level listeners.
  useEffect(() => {
    if (!popup) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-hlpop]')) return;
      setPopup(null);
    };
    const onScroll = () => setPopup(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [popup]);

  /** Writes the prose surface's HTML back. No version is created. */
  const commit = useCallback(async () => {
    const el = proseRef.current;
    if (!el) return;
    const next = el.innerHTML;
    setHtml(next);
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/highlights`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: next }),
    });
    if (res.ok) router.refresh();
  }, [noteId, router]);

  const add = useCallback(() => {
    const range = pendingRange.current;
    if (!range || !proseRef.current) return;
    wrapRange(range, newHighlightId());
    window.getSelection()?.removeAllRanges();
    pendingRange.current = null;
    setPopup(null);
    void commit();
  }, [commit]);

  const remove = useCallback(
    (id: string) => {
      const el = proseRef.current;
      if (!el) return;
      unwrapHl(el, id);
      setPopup(null);
      void commit();
    },
    [commit],
  );

  const act = useCallback(() => {
    if (!popup) return;
    if (popup.mode === 'remove' && popup.id) remove(popup.id);
    else add();
  }, [add, popup, remove]);

  const onProseClick = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (disabled) return;
      const mark = (e.target as HTMLElement).closest?.('mark[data-hl]') as HTMLElement | null;
      const selection = window.getSelection();
      if (!mark || !selection?.isCollapsed) return;
      const { x, y } = anchorOf(mark);
      setPopup({ mode: 'remove', id: mark.dataset.hl, x, y });
    },
    [disabled],
  );

  const onProseSelect = useCallback(() => {
    if (disabled) return;
    // The browser finalises the selection after mouseup/touchend, so defer a tick.
    setTimeout(() => {
      const selection = window.getSelection();
      const el = proseRef.current;
      if (!el || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer) || !range.toString().trim()) return;
      pendingRange.current = range.cloneRange();
      const { x, y } = anchorOf(range);
      setPopup({ mode: 'add', x, y });
    }, 0);
  }, [disabled]);

  const items = useMemo(() => collectHighlights(html), [html]);

  return { proseRef, items, popup, onProseClick, onProseSelect, act, remove, close };
}
