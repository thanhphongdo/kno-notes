'use client';

import { useMemo } from 'react';
import { useGlobalKeys, type ShortcutHandlers } from '@/hooks/use-global-keys';

export interface KeyboardLayerProps {
  onFocusSearch: () => void;
  onCloseOverlays: () => void;
}

/**
 * The shell's slice of the global keyboard map: `/` focuses the search box and
 * `Esc` closes the drawer, the settings popover and the suggestion panel.
 *
 * The quiz keys (`1`-`4`, `Enter`) and the lightbox arrows belong to the
 * components that own those modals — they call `useGlobalKeys` themselves with
 * `quizOpen` / `lightboxOpen` set, and `resolveShortcut` gives a modal
 * precedence over the shell so the two layers never fight.
 */
export function KeyboardLayer({ onFocusSearch, onCloseOverlays }: KeyboardLayerProps): null {
  const handlers = useMemo<ShortcutHandlers>(
    () => ({ 'focus-search': onFocusSearch, 'close-overlays': onCloseOverlays }),
    [onFocusSearch, onCloseOverlays],
  );

  useGlobalKeys(handlers, { inEditableField: false, quizOpen: false, lightboxOpen: false });
  return null;
}
