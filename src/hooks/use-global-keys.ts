'use client';

import { useEffect, useRef } from 'react';

export interface ShortcutContext {
  /** Set by the caller when it knows; also derived from the event target. */
  inEditableField: boolean;
  quizOpen: boolean;
  lightboxOpen: boolean;
}

export type ShortcutAction =
  | 'focus-search'
  | 'close-overlays'
  | 'lightbox-prev'
  | 'lightbox-next'
  | 'quiz-pick-1'
  | 'quiz-pick-2'
  | 'quiz-pick-3'
  | 'quiz-pick-4'
  | 'quiz-advance'
  | 'none';

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * The global keyboard map (Design Spec §08), as one pure function.
 *
 * Reading order is the precedence order:
 *  1. `Esc` closes the innermost overlay — always, including inside a field,
 *     because that is how a user escapes a dialog they typed into.
 *  2. Anything with ⌘/Ctrl belongs to the browser or the editor (undo, bold,
 *     italic, send-comment). Never intercepted.
 *  3. A modal owns the keyboard while it is open: the quiz first, then the
 *     lightbox. Neither responds while the focus is in a field.
 *  4. `/` focuses search, unless the user is typing.
 *
 * Everything else — `Enter` in a form, `Enter`/`,`/`Backspace` in `TagInput` —
 * is left to the component that owns it.
 */
export function resolveShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>,
  ctx: ShortcutContext,
): ShortcutAction {
  if (event.key === 'Escape') return 'close-overlays';
  if (event.metaKey || event.ctrlKey) return 'none';

  if (ctx.quizOpen) {
    if (ctx.inEditableField) return 'none';
    if (/^[1-4]$/.test(event.key)) return `quiz-pick-${event.key}` as ShortcutAction;
    if (event.key === 'Enter') return 'quiz-advance';
    return 'none';
  }

  if (ctx.lightboxOpen) {
    if (ctx.inEditableField) return 'none';
    if (event.key === 'ArrowLeft') return 'lightbox-prev';
    if (event.key === 'ArrowRight') return 'lightbox-next';
    return 'none';
  }

  if (event.key === '/' && !ctx.inEditableField) return 'focus-search';
  return 'none';
}

/** An input, a textarea or anything `contentEditable` — including the note editor. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/**
 * Binds the map above to `window`. Handlers and context are read through refs
 * so the listener is attached exactly once and never misses a key because a
 * re-render happened between keydowns.
 */
export function useGlobalKeys(handlers: ShortcutHandlers, ctx: ShortcutContext): void {
  const handlersRef = useRef(handlers);
  const ctxRef = useRef(ctx);
  handlersRef.current = handlers;
  ctxRef.current = ctx;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = ctxRef.current;
      const action = resolveShortcut(event, {
        ...current,
        inEditableField: current.inEditableField || isEditableTarget(event.target),
      });
      const handler = handlersRef.current[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
