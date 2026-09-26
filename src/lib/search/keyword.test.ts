import { describe, it, expect } from 'vitest';
import {
  keywordScore, isTagQuery, tagNeedle, matchesTag, matchedHighlight,
  SCORE_ALL_TOKENS, SCORE_DESC_SUBSTRING, SCORE_HIGHLIGHT_SUBSTRING,
  SCORE_TAG_SUBSTRING, SCORE_TITLE_EXACT,
} from './keyword';
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

describe('keywordScore over highlighted passages', () => {
  const marked: RankableNote = {
    noteId: 'n4',
    title: 'Chuỗi xung cơ bản trên MRI',
    desc: 'Tổng quan các chuỗi xung thường dùng',
    tags: ['Chẩn đoán hình ảnh'],
    highlights: [
      'sáng hơn bên đối diện',
      'toàn bộ chiều sâu là các đường kẻ ngang song song',
    ],
  };

  it('finds a note by a word that only exists in a highlight', () => {
    expect(keywordScore('diện', marked)).toBe(SCORE_HIGHLIGHT_SUBSTRING);
  });

  it('ignores diacritics and case in highlights too', () => {
    expect(keywordScore('DIEN', marked)).toBe(SCORE_HIGHLIGHT_SUBSTRING);
  });

  it('scores a whole highlighted phrase at the all-tokens rung or better', () => {
    expect(keywordScore('sáng hơn bên đối diện', marked)).toBeGreaterThanOrEqual(SCORE_ALL_TOKENS);
  });

  it('ranks a highlight hit above a description-only hit, below a tag hit', () => {
    expect(SCORE_HIGHLIGHT_SUBSTRING).toBeGreaterThan(SCORE_DESC_SUBSTRING);
    expect(SCORE_HIGHLIGHT_SUBSTRING).toBeLessThan(SCORE_TAG_SUBSTRING);
  });

  it('never lowers a score that title, tags or description already earned', () => {
    expect(keywordScore('Chuỗi xung cơ bản trên MRI', marked)).toBe(SCORE_TITLE_EXACT);
  });

  it('lets highlights satisfy the all-tokens rung', () => {
    expect(keywordScore('sâu song song', marked)).toBe(SCORE_ALL_TOKENS);
  });

  it('is unchanged for a note with no highlights at all', () => {
    expect(keywordScore('sáng hơn', notes[0]!)).toBe(0);
    expect(keywordScore('sáng hơn', { ...marked, highlights: [] })).toBe(0);
    expect(keywordScore('sáng hơn', { ...marked, highlights: undefined })).toBe(0);
  });
});

describe('matchedHighlight', () => {
  const marked: RankableNote = {
    noteId: 'n4',
    title: 'Chuỗi xung cơ bản trên MRI',
    desc: '',
    tags: [],
    highlights: ['sáng hơn bên đối diện', 'các đường kẻ ngang song song'],
  };

  it('returns the first highlight containing the query, verbatim', () => {
    expect(matchedHighlight('kẻ ngang', marked)).toBe('các đường kẻ ngang song song');
  });

  it('matches without diacritics but returns the original text', () => {
    expect(matchedHighlight('SANG HON', marked)).toBe('sáng hơn bên đối diện');
  });

  it('falls back to a highlight holding every query token', () => {
    expect(matchedHighlight('song song đường', marked)).toBe('các đường kẻ ngang song song');
  });

  it('returns null when nothing matches, when the query is blank, or when there are none', () => {
    expect(matchedHighlight('CT scan', marked)).toBeNull();
    expect(matchedHighlight('  ', marked)).toBeNull();
    expect(matchedHighlight('sáng', { ...marked, highlights: undefined })).toBeNull();
  });
});
