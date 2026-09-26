import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { PrefsProvider } from '@/components/providers/prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs';
import { DashboardToolbar } from './dashboard-toolbar';

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

const show = (total: number) => render(<DashboardToolbar total={total} />, { wrapper });

describe('DashboardToolbar', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    search = new URLSearchParams('');
  });

  it('shows the prototype heading and count', () => {
    show(14);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tất cả ghi chú');
    expect(screen.getByText('14 ghi chú')).toBeInTheDocument();
  });

  it('derives the heading from the active filter', () => {
    search = new URLSearchParams('tag=ECG');
    show(3);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('#ECG');
  });

  it('pushes a sort change and resets the page', async () => {
    search = new URLSearchParams('page=4');
    const user = userEvent.setup();
    show(14);
    await user.click(screen.getByRole('combobox', { name: 'Sắp xếp' }));
    await user.click(screen.getByRole('option', { name: 'Tên A–Z' }));
    expect(push).toHaveBeenCalledWith('/?sort=title', { scroll: false });
  });

  it('keeps the page when the view changes', async () => {
    search = new URLSearchParams('page=4');
    const user = userEvent.setup();
    show(14);
    await user.click(screen.getByRole('radio', { name: 'Dạng danh sách' }));
    expect(push).toHaveBeenCalledWith('/?page=4&view=list', { scroll: false });
  });

  it('renders no chip row when nothing is filtered', () => {
    show(14);
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('renders one chip per active filter and clears them all', async () => {
    search = new URLSearchParams('q=sốc&priority=high&tag=ECG');
    const user = userEvent.setup();
    show(2);
    expect(screen.getByText('“sốc”')).toBeInTheDocument();
    expect(screen.getByText('Ưu tiên cao')).toBeInTheDocument();
    expect(screen.getByText('#ECG')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(push).toHaveBeenCalledWith('/', { scroll: false });
  });
});
