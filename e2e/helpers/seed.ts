/**
 * The demo fixture, restated as test data.
 *
 * Every value here is derived from `src/lib/services/seed-data.ts` (itself a
 * verbatim port of the prototype's `SEED0()`), so a spec can assert "the seed
 * is intact" without re-deriving it — and without pinning a *global* count that
 * a sibling spec is free to change by creating a note of its own.
 */
export interface SeedNote {
  id: string;
  title: string;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  fav: boolean;
  /** `v` in `mk({ … })`; defaults to 1. */
  versions: number;
}

export const SEED_NOTES: readonly SeedNote[] = [
  { id: 'n1', title: 'Phác đồ điều trị tăng huyết áp ở người lớn', tags: ['Tim mạch', 'Phác đồ'], priority: 'high', fav: true, versions: 3 },
  { id: 'n2', title: 'Xử trí cấp cứu sốc phản vệ', tags: ['Cấp cứu', 'Dị ứng'], priority: 'high', fav: true, versions: 2 },
  { id: 'n3', title: 'Đái tháo đường type 2: chọn thuốc hạ đường huyết', tags: ['Nội tiết', 'Phác đồ'], priority: 'medium', fav: false, versions: 2 },
  { id: 'n4', title: 'Đọc ECG trong 10 bước', tags: ['Tim mạch', 'ECG'], priority: 'medium', fav: true, versions: 1 },
  { id: 'n5', title: 'Kháng sinh kinh nghiệm cho viêm phổi cộng đồng', tags: ['Hô hấp', 'Kháng sinh'], priority: 'high', fav: false, versions: 2 },
  { id: 'n6', title: 'Liều hạ sốt ở trẻ em', tags: ['Nhi khoa', 'Dược'], priority: 'medium', fav: false, versions: 1 },
  { id: 'n7', title: 'Thang điểm Glasgow (GCS)', tags: ['Thần kinh', 'Cấp cứu'], priority: 'low', fav: false, versions: 1 },
  { id: 'n8', title: 'Tiếp cận đau ngực cấp tại cấp cứu', tags: ['Tim mạch', 'Cấp cứu'], priority: 'high', fav: false, versions: 2 },
  { id: 'n9', title: 'Hạ natri máu: tiếp cận và điều chỉnh', tags: ['Nội khoa', 'Điện giải'], priority: 'medium', fav: false, versions: 1 },
  { id: 'n10', title: 'Hen phế quản: các bậc điều trị GINA', tags: ['Hô hấp'], priority: 'medium', fav: false, versions: 1 },
  { id: 'n11', title: 'Đọc X-quang ngực có hệ thống', tags: ['Chẩn đoán hình ảnh'], priority: 'low', fav: false, versions: 1 },
  { id: 'n12', title: 'Bệnh thận mạn: phân giai đoạn KDIGO', tags: ['Thận học'], priority: 'low', fav: false, versions: 1 },
  { id: 'n13', title: 'Suy tim EF giảm: 4 trụ cột điều trị', tags: ['Tim mạch', 'Phác đồ'], priority: 'high', fav: true, versions: 2 },
  { id: 'n14', title: 'Đọc công thức máu cơ bản', tags: ['Xét nghiệm'], priority: 'low', fav: false, versions: 1 },
];

export const SEED_TOTAL = SEED_NOTES.length; // 14
export const SEED_FAVOURITES = SEED_NOTES.filter((n) => n.fav).length; // 4
export const SEED_PRIORITY = {
  high: SEED_NOTES.filter((n) => n.priority === 'high').length, // 5
  medium: SEED_NOTES.filter((n) => n.priority === 'medium').length, // 5
  low: SEED_NOTES.filter((n) => n.priority === 'low').length, // 4
} as const;

/** The most-used tag: four notes, and the first row of the sidebar's tag list. */
export const SEED_TOP_TAG = { name: 'Tim mạch', count: 4 } as const;

/** `n1` — the most recently updated seeded note, so it leads the default sort. */
export const SEED_NEWEST = SEED_NOTES[0];
