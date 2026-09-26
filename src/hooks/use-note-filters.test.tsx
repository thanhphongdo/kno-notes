import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PrefsProvider } from '@/components/providers/prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs';
import { useNoteFilters } from './use-note-filters';

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => search,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <PrefsProvider initial={DEFAULT_PREFS}>{children}</PrefsProvider>
);

const render = () => renderHook(() => useNoteFilters(), { wrapper }).result;

describe('useNoteFilters', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    search = new URLSearchParams('');
  });

  it('pushes without scrolling and drops default values from the URL', () => {
    const result = render();
    act(() => result.current.setFilters({ sort: 'title' }));
    expect(push).toHaveBeenCalledWith('/?sort=title', { scroll: false });
  });

  it('replaces (not pushes) when only the query text changes', () => {
    const result = render();
    act(() => result.current.setQuery('sốc'));
    expect(replace).toHaveBeenCalledWith('/?q=s%E1%BB%91c', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('resets the page when a filter narrows', () => {
    search = new URLSearchParams('page=5');
    const result = render();
    act(() => result.current.setFilters({ tag: 'Cấp cứu' }));
    expect(push).toHaveBeenCalledWith('/?tag=C%E1%BA%A5p+c%E1%BB%A9u', { scroll: false });
  });

  it('keeps the page when the view changes and mirrors the choice into prefs', () => {
    search = new URLSearchParams('page=3');
    const result = render();
    act(() => result.current.setView('list'));
    expect(push).toHaveBeenCalledWith('/?page=3&view=list', { scroll: false });
  });

  it('lets the URL win over the prefs view', () => {
    search = new URLSearchParams('view=list');
    const { result } = renderHook(() => useNoteFilters(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PrefsProvider initial={{ ...DEFAULT_PREFS, view: 'grid' }}>{children}</PrefsProvider>
      ),
    });
    expect(result.current.filters.view).toBe('list');
  });

  it('scrolls to top when the page changes', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    const result = render();
    act(() => result.current.setPage(3));
    expect(push).toHaveBeenCalledWith('/?page=3', { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    vi.unstubAllGlobals();
  });

  it('computes the dynamic H1 the way the prototype does', () => {
    search = new URLSearchParams('tag=ECG');
    expect(render().current.title).toBe('#ECG');
    search = new URLSearchParams('q=hen');
    expect(render().current.title).toBe('Kết quả tìm kiếm');
    search = new URLSearchParams('priority=medium');
    expect(render().current.title).toBe('Ưu tiên trung bình');
    search = new URLSearchParams('fav=1');
    expect(render().current.title).toBe('Yêu thích');
    search = new URLSearchParams('');
    expect(render().current.title).toBe('Tất cả ghi chú');
  });

  it('keeps the current view and sort when clearing filters', () => {
    search = new URLSearchParams('view=list&sort=title&tag=ECG&q=x&priority=high&fav=1');
    const result = render();
    act(() => result.current.clearAll());
    expect(push).toHaveBeenCalledWith('/?sort=title&view=list', { scroll: false });
  });

  it('exposes one removable chip per active filter, in prototype order', () => {
    search = new URLSearchParams('q=sốc&tag=ECG&priority=high');
    const result = render();
    expect(result.current.chips.map((c) => c.label)).toEqual(['“sốc”', 'Ưu tiên cao', '#ECG']);
    act(() => result.current.chips[1]!.onRemove());
    expect(push).toHaveBeenCalledWith('/?q=s%E1%BB%91c&tag=ECG', { scroll: false });
  });
});
