import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { PrefsProvider } from '@/components/providers/prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs';
import type { NoteSummary } from '@/components/shared';
import { NoteCollection } from './note-collection';

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  usePathname: () => '/',
  useSearchParams: () => search,
}));

const note = (id: string, over: Partial<NoteSummary> = {}): NoteSummary => ({
  id,
  title: `Ghi chú ${id}`,
  desc: 'Mô tả',
  priority: 'high',
  tags: ['ECG'],
  favorite: false,
  updatedLabel: 'hôm qua',
  version: 2,
  imageCount: 0,
  commentCount: 0,
  ...over,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <PrefsProvider initial={DEFAULT_PREFS}>{children}</PrefsProvider>
);

const show = (notes: NoteSummary[], total = notes.length, pages = 1, page = 1) =>
  render(<NoteCollection notes={notes} total={total} pages={pages} page={page} />, { wrapper });

describe('NoteCollection', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    search = new URLSearchParams('');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fav: true }) }));
  });

  it('renders cards as deep links in the grid view', () => {
    show([note('n1')]);
    const card = document.querySelector('[data-note-card]');
    expect(card?.tagName).toBe('A');
    expect(card).toHaveAttribute('href', '/notes/n1');
  });

  it('renders rows instead of cards when the URL asks for the list view', () => {
    search = new URLSearchParams('view=list');
    show([note('n1')]);
    expect(document.querySelector('[data-note-row]')).toHaveAttribute('href', '/notes/n1');
    expect(document.querySelector('[data-note-card]')).toBeNull();
  });

  it('shows the prototype empty state and clears the filters', async () => {
    search = new URLSearchParams('q=xyz&tag=ECG');
    const user = userEvent.setup();
    show([], 0, 0);
    expect(screen.getByText('Không tìm thấy ghi chú')).toBeInTheDocument();
    expect(screen.getByText('#thẻ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(push).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('renders the range sentence and paginates', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('scrollTo', vi.fn());
    show([note('n1')], 14, 3, 1);
    expect(screen.getByText('Hiển thị 1–10 trên 14')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trang 2' }));
    expect(push).toHaveBeenCalledWith('/?page=2', { scroll: false });
  });

  it('pages from the page the server served, not the one in the URL', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('scrollTo', vi.fn());
    search = new URLSearchParams('page=999');
    show([note('n1')], 14, 3, 1);
    expect(screen.getByText('Hiển thị 1–10 trên 14')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(push).toHaveBeenCalledWith('/?page=2', { scroll: false });
  });

  it('toggles favourite optimistically and refreshes the server data', async () => {
    const user = userEvent.setup();
    show([note('n1')]);
    const star = screen.getByRole('button', { name: 'Yêu thích' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(fetch).toHaveBeenCalledWith('/api/notes/n1/favorite', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('rolls the star back when the server rejects the toggle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const user = userEvent.setup();
    show([note('n1', { favorite: true })]);
    const star = screen.getByRole('button', { name: 'Yêu thích' });
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'true'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not navigate when the star inside a card link is clicked', async () => {
    const user = userEvent.setup();
    show([note('n1')]);
    await user.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(push).not.toHaveBeenCalled();
  });
});
