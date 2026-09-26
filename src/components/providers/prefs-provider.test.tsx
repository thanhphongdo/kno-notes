import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, PREFS_COOKIE } from '@/lib/prefs';
import { PrefsProvider, usePrefs } from './prefs-provider';

function Probe() {
  const { prefs, setPrefs, pushRecentSearch, clearRecentSearches } = usePrefs();
  return (
    <div>
      <span data-testid="view">{prefs.view}</span>
      <span data-testid="recent">{prefs.recentSearches.join('|')}</span>
      <button onClick={() => setPrefs({ view: 'list' })}>list</button>
      <button onClick={() => setPrefs({ fontSize: 21 })}>fs</button>
      <button onClick={() => pushRecentSearch('sốc')}>recent</button>
      <button onClick={clearRecentSearches}>clear</button>
    </div>
  );
}

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe('PrefsProvider', () => {
  beforeEach(() => {
    document.cookie = `${PREFS_COOKIE}=; path=/; max-age=0`;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('applies a change optimistically and PATCHes once after the debounce window', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PrefsProvider initial={DEFAULT_PREFS} sync><Probe /></PrefsProvider>);

    await user.click(screen.getByText('list'));
    expect(screen.getByTestId('view')).toHaveTextContent('list');
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByText('fs'));
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/prefs');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ view: 'list', fontSize: 21 });
  });

  it('never talks to the server when sync is off (logged out)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PrefsProvider initial={DEFAULT_PREFS} sync={false}><Probe /></PrefsProvider>);

    await user.click(screen.getByText('list'));
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('view')).toHaveTextContent('list');
  });

  it('mirrors prefs into the kn_prefs cookie synchronously', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PrefsProvider initial={DEFAULT_PREFS} sync><Probe /></PrefsProvider>);

    await user.click(screen.getByText('list'));
    expect(document.cookie).toContain(`${PREFS_COOKIE}=`);
    expect(decodeURIComponent(document.cookie)).toContain('"view":"list"');
  });

  it('keeps recent searches unique, newest first, capped at 5', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <PrefsProvider initial={{ ...DEFAULT_PREFS, recentSearches: ['a', 'sốc', 'b', 'c', 'd'] }} sync>
        <Probe />
      </PrefsProvider>,
    );

    await user.click(screen.getByText('recent'));
    expect(screen.getByTestId('recent')).toHaveTextContent('sốc|a|b|c|d');

    await user.click(screen.getByText('clear'));
    expect(screen.getByTestId('recent')).toHaveTextContent('');
  });

  it('survives a rejected PATCH without losing the optimistic value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PrefsProvider initial={DEFAULT_PREFS} sync><Probe /></PrefsProvider>);

    await user.click(screen.getByText('list'));
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(screen.getByTestId('view')).toHaveTextContent('list');
  });

  it('throws when used outside the provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/PrefsProvider/);
    quiet.mockRestore();
  });
});
