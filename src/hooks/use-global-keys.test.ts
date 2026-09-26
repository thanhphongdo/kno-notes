import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  isEditableTarget, resolveShortcut, useGlobalKeys,
  type ShortcutAction, type ShortcutContext,
} from './use-global-keys';

const ctx: ShortcutContext = { inEditableField: false, quizOpen: false, lightboxOpen: false };
const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  ...mods,
});

describe('resolveShortcut', () => {
  it('focuses the search box on "/" outside an editable field', () => {
    expect(resolveShortcut(key('/'), ctx)).toBe('focus-search');
  });

  it('does nothing on "/" inside an editable field', () => {
    expect(resolveShortcut(key('/'), { ...ctx, inEditableField: true })).toBe('none');
  });

  it('always closes overlays on Escape, even inside a field', () => {
    expect(resolveShortcut(key('Escape'), ctx)).toBe('close-overlays');
    expect(resolveShortcut(key('Escape'), { ...ctx, inEditableField: true })).toBe('close-overlays');
    expect(resolveShortcut(key('Escape'), { ...ctx, quizOpen: true })).toBe('close-overlays');
  });

  it('maps the arrows to the lightbox only while it is open', () => {
    expect(resolveShortcut(key('ArrowLeft'), ctx)).toBe('none');
    expect(resolveShortcut(key('ArrowLeft'), { ...ctx, lightboxOpen: true })).toBe('lightbox-prev');
    expect(resolveShortcut(key('ArrowRight'), { ...ctx, lightboxOpen: true })).toBe('lightbox-next');
  });

  it('maps 1-4 and Enter only while the quiz is open', () => {
    expect(resolveShortcut(key('2'), ctx)).toBe('none');
    expect(resolveShortcut(key('2'), { ...ctx, quizOpen: true })).toBe('quiz-pick-2');
    expect(resolveShortcut(key('Enter'), { ...ctx, quizOpen: true })).toBe('quiz-advance');
    expect(resolveShortcut(key('5'), { ...ctx, quizOpen: true })).toBe('none');
    expect(resolveShortcut(key('0'), { ...ctx, quizOpen: true })).toBe('none');
  });

  it('gives the quiz priority over the lightbox when both are open', () => {
    const both = { ...ctx, quizOpen: true, lightboxOpen: true };
    expect(resolveShortcut(key('ArrowLeft'), both)).toBe('none');
    expect(resolveShortcut(key('1'), both)).toBe('quiz-pick-1');
  });

  it('ignores the quiz keys while the answer is typed into a field', () => {
    expect(resolveShortcut(key('2'), { ...ctx, quizOpen: true, inEditableField: true })).toBe('none');
  });

  it('never steals the editor or browser shortcuts', () => {
    expect(resolveShortcut(key('b', { metaKey: true }), { ...ctx, inEditableField: true })).toBe('none');
    expect(resolveShortcut(key('z', { ctrlKey: true }), { ...ctx, inEditableField: true })).toBe('none');
    expect(resolveShortcut(key('Enter', { metaKey: true }), { ...ctx, inEditableField: true })).toBe('none');
    expect(resolveShortcut(key('Enter', { ctrlKey: true }), { ...ctx, quizOpen: true })).toBe('none');
  });

  it('leaves plain Enter alone outside the quiz — forms own it', () => {
    expect(resolveShortcut(key('Enter'), ctx)).toBe('none');
  });
});

describe('isEditableTarget', () => {
  it('recognises inputs, textareas and contentEditable hosts', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isEditableTarget(editable)).toBe(true);

    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('useGlobalKeys', () => {
  const press = (k: string, target?: Element) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    (target ?? window).dispatchEvent(event);
    return event;
  };

  it('runs the handler for a resolved action and prevents the default', () => {
    const focusSearch = vi.fn();
    renderHook(() => useGlobalKeys({ 'focus-search': focusSearch }, ctx));

    const event = press('/');
    expect(focusSearch).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the event alone when no handler is registered', () => {
    renderHook(() => useGlobalKeys({ 'close-overlays': vi.fn() }, ctx));
    expect(press('/').defaultPrevented).toBe(false);
  });

  it('derives inEditableField from the event target', () => {
    const focusSearch = vi.fn();
    renderHook(() => useGlobalKeys({ 'focus-search': focusSearch }, ctx));

    const input = document.createElement('input');
    document.body.appendChild(input);
    press('/', input);
    input.remove();

    expect(focusSearch).not.toHaveBeenCalled();
  });

  it('detaches its listener on unmount', () => {
    const closeOverlays = vi.fn();
    const { unmount } = renderHook(() => useGlobalKeys({ 'close-overlays': closeOverlays }, ctx));
    unmount();
    press('Escape');
    expect(closeOverlays).not.toHaveBeenCalled();
  });

  it('calls the handler registered at the time of the keypress', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handlers }: { handlers: Partial<Record<ShortcutAction, () => void>> }) =>
        useGlobalKeys(handlers, ctx),
      { initialProps: { handlers: { 'close-overlays': first } } },
    );

    rerender({ handlers: { 'close-overlays': second } });
    press('Escape');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
