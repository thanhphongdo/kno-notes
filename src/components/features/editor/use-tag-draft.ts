'use client';

import { useCallback, useState } from 'react';
import { norm } from '@/lib/text';

export interface UseTagDraftOptions {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
}

export interface UseTagDraftResult {
  value: string;
  setValue: (value: string) => void;
  /** Enter, a trailing comma, or a suggestion chip. */
  add: (raw: string) => void;
  remove: (tag: string) => void;
  /** Backspace on an empty field. */
  removeLast: () => void;
}

/**
 * The tag field's editing rules (prototype `addTag` / `onTagKey`): strip a
 * leading `#` and a trailing comma, ignore blanks, and reject a duplicate by
 * `norm()` so "cap cuu" never joins "Cấp cứu".
 */
export function useTagDraft({ tags, onChange }: UseTagDraftOptions): UseTagDraftResult {
  const [value, setRawValue] = useState('');

  const add = useCallback(
    (raw: string) => {
      const tag = raw.trim().replace(/^#/, '').replace(/,$/, '').trim();
      setRawValue('');
      if (!tag) return;
      if (tags.some((t) => norm(t) === norm(tag))) return;
      onChange([...tags, tag]);
    },
    [onChange, tags],
  );

  const setValue = useCallback(
    (next: string) => {
      if (next.endsWith(',')) {
        add(next);
        return;
      }
      setRawValue(next);
    },
    [add],
  );

  const remove = useCallback(
    (tag: string) => onChange(tags.filter((t) => t !== tag)),
    [onChange, tags],
  );

  const removeLast = useCallback(() => {
    if (tags.length > 0) onChange(tags.slice(0, -1));
  }, [onChange, tags]);

  return { value, setValue, add, remove, removeLast };
}
