import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '@/lib/prefs';
import { PREFS_KEY } from '@/lib/theme';
import { PrefsProvider } from './prefs-provider';
import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const { theme, fontSize, setTheme, setFontSize } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="fs">{fontSize}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setFontSize(30)}>big</button>
      <button onClick={() => setFontSize(2)}>small</button>
    </div>
  );
}

const mount = (initial = DEFAULT_PREFS) =>
  render(
    <PrefsProvider initial={initial}>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </PrefsProvider>,
  );

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-sidebar');
    document.documentElement.style.removeProperty('--fs');
  });
  afterEach(() => vi.restoreAllMocks());

  it('writes data-theme, data-accent, data-sidebar and --fs onto <html> from the initial prefs', () => {
    mount({ ...DEFAULT_PREFS, theme: 'dark', fontSize: 21, sidebarCollapsed: true });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.accent).toBe('teal');
    expect(root.dataset.sidebar).toBe('collapsed');
    expect(root.style.getPropertyValue('--fs')).toBe('21px');
  });

  it('updates <html> when the theme changes and clamps the font size to 14..22', () => {
    mount();
    act(() => { screen.getByText('dark').click(); });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');

    act(() => { screen.getByText('big').click(); });
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('22px');
    expect(screen.getByTestId('fs')).toHaveTextContent('22');

    act(() => { screen.getByText('small').click(); });
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('14px');
  });

  it('mirrors theme and font size into the key ThemeScript reads, so the next load has no flash', () => {
    mount();
    act(() => { screen.getByText('dark').click(); });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')).toMatchObject({
      theme: 'dark',
      fontSize: 17,
    });
  });

  it('keeps an accent already stored by the settings page', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ accent: 'plum' }));
    mount();
    act(() => { screen.getByText('dark').click(); });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').accent).toBe('plum');
  });

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => mount()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('throws when used outside the provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    quiet.mockRestore();
  });
});
