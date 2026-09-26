import { describe, it, expect } from 'vitest';
import { hybridRank, KEYWORD_WEIGHT, VECTOR_WEIGHT } from './hybrid';
import type { RankableNote, SearchDoc } from './types';

const notes: RankableNote[] = [
  { noteId: 'n1', title: 'Xử trí cấp cứu sốc phản vệ', desc: 'Adrenalin tiêm bắp là ưu tiên số một', tags: ['Cấp cứu', 'Dị ứng'] },
  { noteId: 'n2', title: 'Đọc ECG trong 10 bước', desc: 'Trình tự hệ thống', tags: ['Tim mạch', 'ECG'] },
  { noteId: 'n3', title: 'Liều hạ sốt ở trẻ em', desc: 'Paracetamol 10–15 mg/kg', tags: ['Nhi khoa', 'Dược'] },
];

const unit = (...v: number[]): Float32Array => {
  const len = Math.hypot(...v) || 1;
  return new Float32Array(v.map((x) => x / len));
};

/**
 * The fake embedder. Never downloads a model: it maps a handful of known strings
 * onto a 3-dimensional toy space where n1 (anaphylaxis) sits on axis 0.
 */
const fakeVectors = new Map<string, Float32Array>([
  ['n1', unit(1, 0, 0)],
  ['n2', unit(0, 1, 0)],
  ['n3', unit(0, 0, 1)],
]);
const fakeQueryVector = unit(0.9, 0.3, 0);

describe('hybridRank', () => {
  it('degrades to keyword-only while the embedder is not ready, and still ranks', () => {
    const ranked = hybridRank({ query: 'ECG', docs: notes, vectors: null, queryVector: null });
    expect(ranked[0]!.noteId).toBe('n2');
    expect(ranked[0]!.cosine).toBeNull();
    expect(ranked[0]!.score).toBeCloseTo(ranked[0]!.keyword, 6);
  });

  it('never throws when queryVector is null but vectors are present', () => {
    expect(() => hybridRank({ query: 'ECG', docs: notes, vectors: fakeVectors, queryVector: null })).not.toThrow();
    const ranked = hybridRank({ query: 'ECG', docs: notes, vectors: fakeVectors, queryVector: null });
    expect(ranked[0]!.cosine).toBeNull();
  });

  it('blends the two signals with the spec weights', () => {
    const ranked = hybridRank({ query: 'phản vệ', docs: notes, vectors: fakeVectors, queryVector: fakeQueryVector });
    const n1 = ranked.find((r) => r.noteId === 'n1')!;
    expect(n1.cosine).not.toBeNull();
    expect(n1.score).toBeCloseTo(KEYWORD_WEIGHT * n1.keyword + VECTOR_WEIGHT * Math.max(0, n1.cosine!), 6);
  });

  it('lets semantics surface a note the keyword scorer misses entirely', () => {
    const ranked = hybridRank({ query: 'phản ứng dị nguyên', docs: notes, vectors: fakeVectors, queryVector: fakeQueryVector });
    expect(ranked[0]!.noteId).toBe('n1');
    expect(ranked[0]!.keyword).toBe(0);
    expect(ranked[0]!.score).toBeGreaterThan(0);
  });

  it('clamps a negative cosine to 0 instead of subtracting from the keyword score', () => {
    const ranked = hybridRank({ query: 'ECG', docs: notes, vectors: new Map([['n2', unit(-1, 0, 0)]]), queryVector: unit(1, 0, 0) });
    const n2 = ranked.find((r) => r.noteId === 'n2')!;
    expect(n2.cosine).toBeLessThan(0);
    expect(n2.score).toBeCloseTo(KEYWORD_WEIGHT * n2.keyword, 6);
  });

  it('skips vectors entirely for a #tag query', () => {
    const ranked = hybridRank({ query: '#ECG', docs: notes, vectors: fakeVectors, queryVector: fakeQueryVector });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.noteId).toBe('n2');
    expect(ranked[0]!.cosine).toBeNull();
  });

  it('drops zero-scoring notes', () => {
    const ranked = hybridRank({ query: 'ECG', docs: notes, vectors: null, queryVector: null });
    expect(ranked.every((r) => r.score > 0)).toBe(true);
  });

  it('returns everything, in input order, for an empty query', () => {
    const ranked = hybridRank({ query: '  ', docs: notes, vectors: fakeVectors, queryVector: fakeQueryVector });
    expect(ranked.map((r) => r.noteId)).toEqual(['n1', 'n2', 'n3']);
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });

  it('is stable for ties (input order wins)', () => {
    const tied: RankableNote[] = [
      { noteId: 'a', title: 'ECG', desc: '', tags: [] },
      { noteId: 'b', title: 'ECG', desc: '', tags: [] },
      { noteId: 'c', title: 'ECG', desc: '', tags: [] },
    ];
    expect(hybridRank({ query: 'ECG', docs: tied, vectors: null, queryVector: null }).map((r) => r.noteId)).toEqual(['a', 'b', 'c']);
  });

  it('accepts SearchDoc and preserves the extra fields', () => {
    const docs: SearchDoc[] = [{ noteId: 'n2', title: 'Đọc ECG trong 10 bước', desc: '', tags: ['ECG'], priority: 'medium', updated: '2026-02-14T12:00:00.000Z', contentSha: 'sha2', plain: 'body', highlights: []  }];
    const ranked = hybridRank({ query: 'ECG', docs, vectors: null, queryVector: null });
    expect(ranked[0]!.contentSha).toBe('sha2');
  });

  it('also accepts the positional call shape', () => {
    const ranked = hybridRank('ECG', notes, null, null);
    expect(ranked[0]!.noteId).toBe('n2');
  });

  it('honours a maxResults limit', () => {
    const ranked = hybridRank({ query: '', docs: notes, vectors: null, queryVector: null, maxResults: 2 });
    expect(ranked).toHaveLength(2);
  });
});
