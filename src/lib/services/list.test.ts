// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { summary } from './helpers';
import { applyFilters, sortNotes, paginate } from './notes';
import { DEFAULT_PAGE_SIZE } from '@/lib/types';

const notes = [
  summary({
    id: 'a',
    title: 'Phác đồ điều trị tăng huyết áp',
    desc: 'Ngưỡng chẩn đoán',
    tags: ['Tim mạch', 'Phác đồ'],
    priority: 'high',
    fav: true,
    updated: '2024-03-07T10:00:00.000Z',
  }),
  summary({
    id: 'b',
    title: 'Xử trí cấp cứu sốc phản vệ',
    desc: 'Adrenalin tiêm bắp',
    tags: ['Cấp cứu', 'Dị ứng'],
    priority: 'high',
    fav: true,
    updated: '2024-03-04T10:00:00.000Z',
  }),
  summary({
    id: 'c',
    title: 'Đái tháo đường type 2',
    desc: 'Metformin nền tảng',
    tags: ['Nội tiết', 'Phác đồ'],
    priority: 'medium',
    updated: '2024-03-01T10:00:00.000Z',
  }),
  summary({
    id: 'd',
    title: 'Thang điểm Glasgow',
    desc: 'Mắt, lời nói, vận động',
    tags: ['Thần kinh'],
    priority: 'low',
    updated: '2024-02-18T10:00:00.000Z',
  }),
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('applyFilters', () => {
  it('returns everything for the default all-nav with no query', () => {
    expect(ids(applyFilters(notes, {}))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps only favourites for nav=fav', () => {
    expect(ids(applyFilters(notes, { nav: 'fav' }))).toEqual(['a', 'b']);
  });

  it('filters by priority', () => {
    expect(ids(applyFilters(notes, { priority: 'high' }))).toEqual(['a', 'b']);
    expect(ids(applyFilters(notes, { priority: 'low' }))).toEqual(['d']);
  });

  it('filters by exact tag name', () => {
    expect(ids(applyFilters(notes, { tag: 'Phác đồ' }))).toEqual(['a', 'c']);
  });

  it('combines nav, priority and tag', () => {
    expect(ids(applyFilters(notes, { nav: 'fav', priority: 'high', tag: 'Tim mạch' }))).toEqual([
      'a',
    ]);
  });

  it('matches a query against title, desc and tags, accent-insensitively', () => {
    expect(ids(applyFilters(notes, { query: 'huyet ap' }))).toEqual(['a']);
    expect(ids(applyFilters(notes, { query: 'HUYẾT ÁP' }))).toEqual(['a']);
    expect(ids(applyFilters(notes, { query: 'adrenalin' }))).toEqual(['b']);
    expect(ids(applyFilters(notes, { query: 'noi tiet' }))).toEqual(['c']);
  });

  it('normalises đ in the query', () => {
    expect(ids(applyFilters(notes, { query: 'dai thao duong' }))).toEqual(['c']);
    expect(ids(applyFilters(notes, { query: 'Đái tháo' }))).toEqual(['c']);
  });

  it('restricts a # query to tags only', () => {
    expect(ids(applyFilters(notes, { query: '#phac do' }))).toEqual(['a', 'c']);
    // "Phác đồ" appears in note a's TITLE too, but # must not match titles.
    expect(ids(applyFilters(notes, { query: '#glasgow' }))).toEqual([]);
    expect(ids(applyFilters(notes, { query: '#than kinh' }))).toEqual(['d']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(ids(applyFilters(notes, { query: '   ' }))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(applyFilters(notes, { query: '  adrenalin  ' }))).toEqual(['b']);
  });

  it('returns [] when nothing matches', () => {
    expect(applyFilters(notes, { query: 'khong co gi' })).toEqual([]);
  });
});

describe('sortNotes', () => {
  it('sorts by updated descending', () => {
    expect(ids(sortNotes(notes, 'updated'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by priority high to low, then updated descending', () => {
    const shuffled = [notes[3], notes[1], notes[2], notes[0]];
    expect(ids(sortNotes(shuffled, 'priority'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by title using Vietnamese collation', () => {
    const out = sortNotes(notes, 'title').map((n) => n.title);
    expect(out).toEqual([
      'Đái tháo đường type 2',
      'Phác đồ điều trị tăng huyết áp',
      'Thang điểm Glasgow',
      'Xử trí cấp cứu sốc phản vệ',
    ]);
  });

  it('places Ă/Â/Đ/Ê/Ô/Ơ/Ư in Vietnamese alphabet order, not ASCII order', () => {
    const rows = ['Ương', 'Ăn', 'Ân', 'Đông', 'Em', 'An'].map((t, i) =>
      summary({ id: String(i), title: t }),
    );
    expect(sortNotes(rows, 'title').map((r) => r.title)).toEqual([
      'An',
      'Ăn',
      'Ân',
      'Đông',
      'Em',
      'Ương',
    ]);
  });

  it('does not mutate the input array', () => {
    const before = ids(notes);
    sortNotes(notes, 'title');
    expect(ids(notes)).toEqual(before);
  });
});

describe('paginate', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => summary({ id: String(i) }));
  const fifteen = rows(15);

  it(`defaults to ${DEFAULT_PAGE_SIZE} per page`, () => {
    const r = paginate(fifteen, {});
    expect(r.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(r.notes).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(r.pages).toBe(2);
    expect(r.total).toBe(15);
    expect(r.page).toBe(1);
  });

  it('returns the tail on the last page', () => {
    expect(ids(paginate(fifteen, { page: 2 }).notes)).toEqual(['10', '11', '12', '13', '14']);
  });

  it('clamps a page beyond the end to the last page', () => {
    expect(paginate(fifteen, { page: 99 }).page).toBe(2);
  });

  it('clamps page 0 and negatives to 1', () => {
    expect(paginate(fifteen, { page: 0 }).page).toBe(1);
    expect(paginate(fifteen, { page: -3 }).page).toBe(1);
  });

  it('reports at least one page for an empty result', () => {
    const r = paginate([], {});
    expect(r).toMatchObject({ total: 0, pages: 1, page: 1, notes: [] });
  });

  it('honours an explicit pageSize and caps it at 100', () => {
    expect(paginate(fifteen, { pageSize: 3 }).notes).toHaveLength(3);
    expect(paginate(fifteen, { pageSize: 1000 }).pageSize).toBe(100);
    expect(paginate(fifteen, { pageSize: 0 }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('applyFilters over highlighted passages', () => {
  const marked = [
    { ...summary({ id: 'm1', title: 'Chuỗi xung MRI', desc: 'Tổng quan' }),
      highlights: ['sáng hơn bên đối diện'] },
    { ...summary({ id: 'm2', title: 'CT sọ não', desc: 'Chỉ định' }),
      highlights: ['toàn bộ chiều sâu là các đường kẻ ngang song song'] },
    { ...summary({ id: 'm3', title: 'Siêu âm bụng', desc: 'Quy trình' }) },
  ];

  it('matches a note whose query text only exists in a highlight', () => {
    expect(ids(applyFilters(marked, { query: 'bên đối diện' }))).toEqual(['m1']);
  });

  it('ignores diacritics in highlights, like every other field', () => {
    expect(ids(applyFilters(marked, { query: 'DUONG KE NGANG' }))).toEqual(['m2']);
  });

  it('leaves notes without highlights untouched', () => {
    expect(ids(applyFilters(marked, { query: 'Siêu âm' }))).toEqual(['m3']);
    expect(ids(applyFilters(marked, { query: 'không có ở đâu cả' }))).toEqual([]);
  });

  it('still honours nav, priority and tag alongside a highlight hit', () => {
    expect(ids(applyFilters(marked, { query: 'bên đối diện', nav: 'fav' }))).toEqual([]);
  });

  it('does not let a highlight satisfy a #tag query', () => {
    expect(ids(applyFilters(marked, { query: '#đối diện' }))).toEqual([]);
  });
});

describe('applyFilters over image alt text', () => {
  const illustrated = [
    { ...summary({ id: 'i1', title: 'Phác đồ tăng huyết áp', desc: 'Ngưỡng' }),
      imageAlts: ['Sơ đồ bậc điều trị'] },
    { ...summary({ id: 'i2', title: 'Đọc ECG', desc: 'Trình tự' }) },
  ];

  it('matches a note whose query text only exists in an image alt', () => {
    expect(ids(applyFilters(illustrated, { query: 'bậc điều trị' }))).toEqual(['i1']);
  });

  it('ignores diacritics in alts, like every other field', () => {
    expect(ids(applyFilters(illustrated, { query: 'SO DO BAC' }))).toEqual(['i1']);
  });

  it('does not let an alt satisfy a #tag query', () => {
    expect(ids(applyFilters(illustrated, { query: '#sơ đồ' }))).toEqual([]);
  });
});
