import { describe, it, expect } from 'vitest';
import { keywordScore, isTagQuery, tagNeedle, matchesTag } from './keyword';
import type { RankableNote } from './types';

const notes: RankableNote[] = [
  { noteId: 'n1', title: 'Xử trí cấp cứu sốc phản vệ', desc: 'Adrenalin tiêm bắp là ưu tiên số một', tags: ['Cấp cứu', 'Dị ứng'] },
  { noteId: 'n2', title: 'Đọc ECG trong 10 bước', desc: 'Trình tự hệ thống', tags: ['Tim mạch', 'ECG'] },
  { noteId: 'n3', title: 'Liều hạ sốt ở trẻ em', desc: 'Paracetamol 10–15 mg/kg', tags: ['Nhi khoa', 'Dược'] },
];

describe('keywordScore', () => {
  it('is 0 for an empty or blank query', () => {
    expect(keywordScore('', notes[0]!)).toBe(0);
    expect(keywordScore('   ', notes[0]!)).toBe(0);
  });

  it('ignores Vietnamese diacritics and case', () => {
    expect(keywordScore('SOC PHAN VE', notes[0]!)).toBeGreaterThan(0);
    expect(keywordScore('sốc phản vệ', notes[0]!)).toBe(keywordScore('soc phan ve', notes[0]!));
  });

  it('scores an exact title above a prefix, and a prefix above a substring', () => {
    const exact = keywordScore('Đọc ECG trong 10 bước', notes[1]!);
    const prefix = keywordScore('Đọc ECG', notes[1]!);
    const inside = keywordScore('trong 10', notes[1]!);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(0);
  });

  it('scores a tag hit above a description-only hit', () => {
    expect(keywordScore('Dị ứng', notes[0]!)).toBeGreaterThan(keywordScore('Adrenalin', notes[0]!));
  });

  it('never exceeds 1 and never drops below 0', () => {
    for (const n of notes) {
      expect(keywordScore(n.title, n)).toBeLessThanOrEqual(1);
      expect(keywordScore(n.title, n)).toBeGreaterThanOrEqual(0);
    }
  });

  it('requires every token to be present for the multi-token bonus', () => {
    // "phản ứng dị nguyên": phản/ứng/dị are present, "nguyên" is not -> no keyword signal at all.
    expect(keywordScore('phản ứng dị nguyên', notes[0]!)).toBe(0);
    // every token present, in any order
    expect(keywordScore('adrenalin cấp cứu', notes[0]!)).toBeGreaterThan(0);
  });

  it('scores an unrelated query at 0', () => {
    expect(keywordScore('đái tháo đường', notes[1]!)).toBe(0);
  });
});

describe('isTagQuery / tagNeedle / matchesTag', () => {
  it('detects a leading hash after trimming', () => {
    expect(isTagQuery('#Cấp cứu')).toBe(true);
    expect(isTagQuery('  #x')).toBe(true);
    expect(isTagQuery('cấp cứu')).toBe(false);
    expect(isTagQuery('')).toBe(false);
  });

  it('extracts the normalised needle after the hash', () => {
    expect(tagNeedle('#Cấp cứu')).toBe('cap cuu');
    expect(tagNeedle('#')).toBe('');
  });

  it('matches a note tag case- and diacritic-insensitively', () => {
    expect(matchesTag(notes[0]!, 'cap cuu')).toBe(true);
    expect(matchesTag(notes[0]!, 'tim')).toBe(false);
    expect(matchesTag(notes[1]!, 'tim')).toBe(true);
  });

  it('treats a bare "#" as matching every note', () => {
    expect(matchesTag(notes[2]!, '')).toBe(true);
  });
});
