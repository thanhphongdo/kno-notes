import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '@/components/ui';
import { DEFAULT_PREFS } from '@/lib/prefs';
import { AppProviders } from './app-providers';
import { usePrefs } from './prefs-provider';
import { useTheme } from './theme-provider';

function Probe() {
  const { flash } = useToast();
  const { theme } = useTheme();
  const { prefs } = usePrefs();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="view">{prefs.view}</span>
      <button onClick={() => flash('Đã lưu')}>toast</button>
    </div>
  );
}

describe('AppProviders', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('exposes prefs, theme and toast to everything it wraps', () => {
    render(
      <AppProviders initialPrefs={{ ...DEFAULT_PREFS, theme: 'dark', view: 'list' }} signedIn>
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('view')).toHaveTextContent('list');

    act(() => { screen.getByText('toast').click(); });
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu');

    act(() => { vi.advanceTimersByTime(2200); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
