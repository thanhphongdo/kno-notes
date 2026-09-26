import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState, type ReactNode } from 'react';
import { PrefsProvider } from '@/components/providers/prefs-provider';
import { DEFAULT_PREFS } from '@/lib/prefs';
import type { SearchDoc } from '@/lib/search';
import type { SemanticSearch } from '@/hooks/use-semantic-search';
import { SearchContainer } from './search-container';

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => search,
}));

const items: SearchDoc[] = [
  { noteId: 'n1', title: 'Xử trí sốc phản vệ', desc: 'Adrenalin', tags: ['Cấp cứu'], priority: 'high', updated: '2026-01-05T12:00:00.000Z', contentSha: 's1', plain: '' },
  { noteId: 'n2', title: 'Đọc ECG trong 10 bước', desc: 'Trình tự', tags: ['ECG'], priority: 'low', updated: '2026-02-14T12:00:00.000Z', contentSha: 's2', plain: '' },
  { noteId: 'n3', title: 'Kháng sinh dự phòng', desc: 'Liều nạp', tags: ['Nhiễm khuẩn'], priority: 'medium', updated: '2026-03-02T12:00:00.000Z', contentSha: 's3', plain: '' },
  { noteId: 'n4', title: 'Bù dịch sốt xuất huyết', desc: 'Dịch truyền', tags: ['Nhi'], priority: 'high', updated: '2026-04-09T12:00:00.000Z', contentSha: 's4', plain: '' },
  { noteId: 'n5', title: 'Hồi sức ngừng tuần hoàn', desc: 'Ép tim', tags: ['Hồi sức'], priority: 'low', updated: '2026-05-21T12:00:00.000Z', contentSha: 's5', plain: '' },
];

let semantic: SemanticSearch;

vi.mock('@/hooks/use-semantic-search', () => ({
  useSemanticSearch: () => semantic,
}));

const tags = [
  { name: 'Cấp cứu', count: 4 },
  { name: 'ECG', count: 2 },
];

/** Mounts the container the way the shell header does. */
function Harness() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <SearchContainer
      tags={tags}
      isMobile={false}
      inputRef={inputRef}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

const show = (recent: string[] = []) =>
  render(<Harness />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <PrefsProvider initial={{ ...DEFAULT_PREFS, recentSearches: recent }}>{children}</PrefsProvider>
    ),
  });

describe('SearchContainer', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    search = new URLSearchParams('');
    semantic = {
      ready: false,
      docs: items,
      vectors: null,
      embedQuery: vi.fn().mockResolvedValue(null),
      warmUp: vi.fn(),
    };
  });

  it('warms the embedder up on first focus, never before', async () => {
    const user = userEvent.setup();
    show();
    expect(semantic.warmUp).not.toHaveBeenCalled();
    await user.click(screen.getByRole('searchbox'));
    expect(semantic.warmUp).toHaveBeenCalled();
  });

  it('opens the panel on focus with recent searches, tags and recent notes', async () => {
    const user = userEvent.setup();
    show(['sốc phản vệ']);
    await user.click(screen.getByRole('searchbox'));
    expect(await screen.findByText('Tìm gần đây')).toBeInTheDocument();
    expect(screen.getByText('sốc phản vệ')).toBeInTheDocument();
    expect(screen.getByText('Thẻ')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /#Cấp cứu/ })[0]).toBeInTheDocument();
    expect(screen.getByText('Mở gần đây')).toBeInTheDocument();
  });

  it('clears the recent list when "Xoá" is pressed', async () => {
    const user = userEvent.setup();
    show(['sốc phản vệ']);
    await user.click(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(screen.queryByText('Tìm gần đây')).toBeNull());
  });

  it('ranks matching notes keyword-only while the embedder is cold', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'ECG');
    expect(await screen.findByText('Đọc ECG trong 10 bước')).toBeInTheDocument();
    expect(screen.queryByText('Xử trí sốc phản vệ')).toBeNull();
    expect(screen.getByText('Ghi chú khớp')).toBeInTheDocument();
    expect(semantic.embedQuery).not.toHaveBeenCalled();
  });

  it('draws the real priority dot and the "#tag · rel(updated)" sub-line', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'ECG');
    const row = (await screen.findByText('Đọc ECG trong 10 bước')).closest('button')!;
    expect(row.querySelector('[aria-hidden="true"]')!.className).toContain('bg-low');
    expect(row.querySelector('[aria-hidden="true"]')!.className).not.toContain('bg-med');
    expect(screen.getByText('#ECG · 14/02/2026')).toBeInTheDocument();
  });

  it('lists the four most recently updated notes while idle, newest first', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await screen.findByText('Mở gần đây');
    const titles = [
      'Hồi sức ngừng tuần hoàn',
      'Bù dịch sốt xuất huyết',
      'Kháng sinh dự phòng',
      'Đọc ECG trong 10 bước',
    ];
    for (const title of titles) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText('Xử trí sốc phản vệ')).toBeNull();
    const rendered = titles.map((t) => screen.getByText(t));
    for (let i = 1; i < rendered.length; i += 1) {
      expect(
        rendered[i - 1]!.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('shows the prototype empty line when nothing matches', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(await screen.findByText('Không có gợi ý cho “zzzz”')).toBeInTheDocument();
  });

  it('never asks the embedder for a #tag query', async () => {
    semantic = { ...semantic, ready: true };
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '#ECG');
    await waitFor(() => expect(screen.getByText('Đọc ECG trong 10 bước')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 300));
    expect(semantic.embedQuery).not.toHaveBeenCalled();
  });

  it('embeds a plain query once the embedder is ready', async () => {
    semantic = { ...semantic, ready: true };
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'ECG');
    await waitFor(() => expect(semantic.embedQuery).toHaveBeenCalledWith('ECG'));
  });

  it('commits the query with replace, not push, and remembers the term', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'sốc{Enter}');
    expect(replace).toHaveBeenCalledWith('/?q=s%E1%BB%91c', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes a tag filter and drops the typed query', async () => {
    search = new URLSearchParams('priority=high');
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    const [chip] = await screen.findAllByRole('button', { name: /#ECG/ });
    await user.click(chip!);
    expect(push).toHaveBeenCalledWith('/?tag=ECG', { scroll: false });
  });

  it('opens a suggested note by deep link', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'ECG');
    await user.click(await screen.findByText('Đọc ECG trong 10 bước'));
    expect(push).toHaveBeenCalledWith('/notes/n2');
  });

  it('re-runs a recent search when it is picked', async () => {
    const user = userEvent.setup();
    show(['hen']);
    await user.click(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'hen' }));
    expect(replace).toHaveBeenCalledWith('/?q=hen', { scroll: false });
  });

  it('closes on Escape and blurs the input', async () => {
    const user = userEvent.setup();
    show(['hen']);
    await user.click(screen.getByRole('searchbox'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Tìm gần đây')).toBeNull());
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });
});
