import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/components/providers/app-providers';
import { DEFAULT_PREFS, PREFS_COOKIE, type ClientPrefs } from '@/lib/prefs';
import { ShellClient } from './shell-client';
import type { ShellNavData } from './shell-data';

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => search,
}));

const isMobile = vi.fn(() => false);
vi.mock('@/hooks/use-is-mobile', () => ({
  MOBILE_BREAKPOINT: 820,
  useIsMobile: () => isMobile(),
}));

const data: ShellNavData = {
  user: { displayName: 'Bác sĩ', username: 'bacsi' },
  counts: { all: 14, favorite: 3, high: 4, medium: 7, low: 3 },
  tags: [
    { name: 'Cấp cứu', slug: 'cap-cuu', count: 5 },
    { name: 'Tim mạch', slug: 'tim-mach', count: 2 },
  ],
};

function mount(prefs: Partial<ClientPrefs> = {}) {
  return render(
    <AppProviders initialPrefs={{ ...DEFAULT_PREFS, ...prefs }} signedIn>
      <ShellClient data={data}>
        <div>nội dung</div>
      </ShellClient>
    </AppProviders>,
  );
}

describe('ShellClient', () => {
  beforeEach(() => {
    document.cookie = `${PREFS_COOKIE}=; path=/; max-age=0`;
    push.mockClear();
    replace.mockClear();
    refresh.mockClear();
    isMobile.mockReturnValue(false);
    search = new URLSearchParams();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the sidebar counts and the tag list from server data', () => {
    mount();
    expect(screen.getByText('Tất cả ghi chú')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Cấp cứu')).toBeInTheDocument();
    expect(screen.getByText('Tim mạch')).toBeInTheDocument();
    expect(screen.getByText('nội dung')).toBeInTheDocument();
  });

  it('navigates through buildDashboardHref, and a second click on an active filter clears it', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByText('Yêu thích'));
    expect(push).toHaveBeenLastCalledWith('/?fav=1', { scroll: true });

    await user.click(screen.getByText('Cao'));
    expect(push).toHaveBeenLastCalledWith('/?priority=high', { scroll: true });

    await user.click(screen.getByText('Tim mạch'));
    expect(push).toHaveBeenLastCalledWith('/?tag=Tim+m%E1%BA%A1ch', { scroll: true });
  });

  it('clears a filter that is already active rather than re-applying it', async () => {
    search = new URLSearchParams('priority=high');
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByText('Cao'));
    expect(push).toHaveBeenLastCalledWith('/', { scroll: true });
  });

  it('marks "Tất cả ghi chú" current only on an unfiltered dashboard', () => {
    const { unmount } = mount();
    expect(screen.getByText('Tất cả ghi chú').closest('button')).toHaveAttribute('aria-current', 'page');
    unmount();

    search = new URLSearchParams('fav=1');
    mount();
    expect(screen.getByText('Tất cả ghi chú').closest('button')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Yêu thích').closest('button')).toHaveAttribute('aria-current', 'page');
  });

  it('collapsing on desktop writes a pref, and the menu button brings it back', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
    expect(decodeURIComponent(document.cookie)).toContain('"sidebarCollapsed":true');

    await user.click(screen.getByRole('button', { name: 'Mở thanh bên' }));
    expect(decodeURIComponent(document.cookie)).toContain('"sidebarCollapsed":false');
  });

  it('collapsing on mobile closes the drawer and leaves the desktop pref alone', async () => {
    isMobile.mockReturnValue(true);
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: 'Mở thanh bên' }));
    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
    expect(screen.queryByTestId('drawer-backdrop')).toBeNull();
    expect(decodeURIComponent(document.cookie)).not.toContain('"sidebarCollapsed":true');
  });

  it('closes the drawer after following a nav item', async () => {
    isMobile.mockReturnValue(true);
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: 'Mở thanh bên' }));
    await user.click(screen.getByText('Yêu thích'));
    expect(screen.queryByTestId('drawer-backdrop')).toBeNull();
  });

  it('Escape closes the drawer', async () => {
    isMobile.mockReturnValue(true);
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: 'Mở thanh bên' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('drawer-backdrop')).toBeNull();
  });

  it('"/" focuses the search box from anywhere on the page', async () => {
    const user = userEvent.setup();
    mount();

    await user.keyboard('/');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('signs out through the API and replaces the history entry', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(replace).toHaveBeenCalledWith('/login', { scroll: false });
    expect(refresh).toHaveBeenCalled();
  });

  it('commits a search to the URL with replace, not push', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('searchbox'));
    await user.keyboard('sốc{Enter}');

    // A6 commits the query with `{ scroll: false }` so typing never jumps the page.
    expect(replace).toHaveBeenLastCalledWith('/?q=s%E1%BB%91c', { scroll: false });
    expect(decodeURIComponent(document.cookie)).toContain('sốc');
  });
});
