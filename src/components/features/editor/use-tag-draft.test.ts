import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTagDraft } from './use-tag-draft';

function setup(tags: string[] = []) {
  const onChange = vi.fn();
  const { result } = renderHook(() => useTagDraft({ tags, onChange }));
  return { result, onChange };
}

describe('useTagDraft', () => {
  it('adds a tag and clears the input', () => {
    const { result, onChange } = setup();
    act(() => result.current.setValue('Cấp cứu'));
    act(() => result.current.add('Cấp cứu'));
    expect(onChange).toHaveBeenCalledWith(['Cấp cứu']);
    expect(result.current.value).toBe('');
  });

  it('adds a tag when the input ends with a comma', () => {
    const { result, onChange } = setup();
    act(() => result.current.setValue('Tim mạch,'));
    expect(onChange).toHaveBeenCalledWith(['Tim mạch']);
    expect(result.current.value).toBe('');
  });

  it('strips a leading # and surrounding whitespace', () => {
    const { result, onChange } = setup();
    act(() => result.current.add('  #ECG '));
    expect(onChange).toHaveBeenCalledWith(['ECG']);
  });

  it('rejects a duplicate ignoring Vietnamese diacritics and case', () => {
    const { result, onChange } = setup(['Cấp cứu']);
    act(() => result.current.add('cap cuu'));
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.value).toBe('');
  });

  it('ignores an empty or whitespace-only tag', () => {
    const { result, onChange } = setup();
    act(() => result.current.add('   '));
    act(() => result.current.add('#'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('appends to the existing tags rather than replacing them', () => {
    const { result, onChange } = setup(['a']);
    act(() => result.current.add('b'));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('removes a named tag and the last tag', () => {
    const { result, onChange } = setup(['a', 'b']);
    act(() => result.current.remove('a'));
    expect(onChange).toHaveBeenCalledWith(['b']);
    onChange.mockClear();
    act(() => result.current.removeLast());
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('does nothing on removeLast when there are no tags', () => {
    const { result, onChange } = setup();
    act(() => result.current.removeLast());
    expect(onChange).not.toHaveBeenCalled();
  });
});
