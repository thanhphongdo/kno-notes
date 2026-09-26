import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@/lib/types';
import { toNoteCardSummary } from './view-model';

const base: NoteSummary = {
  id: 'n1',
  title: 'Phác đồ',
  desc: 'Mô tả',
  priority: 'high',
  tags: ['Tim mạch', 'Phác đồ', 'ESC', 'Thừa'],
  fav: true,
  created: '2026-09-01T00:00:00.000Z',
  updated: '2026-09-26T00:00:00.000Z',
  latestVersion: 3,
  imageCount: 2,
  commentCount: 1,
  quizCount: 1,
};

describe('toNoteCardSummary', () => {
  it('maps the domain summary onto the shared NoteCard shape', () => {
    const vm = toNoteCardSummary(base, Date.parse('2026-09-26T00:30:00.000Z'));
    expect(vm).toEqual({
      id: 'n1',
      title: 'Phác đồ',
      desc: 'Mô tả',
      priority: 'high',
      tags: ['Tim mạch', 'Phác đồ', 'ESC', 'Thừa'],
      favorite: true,
      updatedLabel: '30 phút trước',
      version: 3,
      imageCount: 2,
      commentCount: 1,
    });
  });

  it('renames `fav` to `favorite` rather than dropping it', () => {
    expect(toNoteCardSummary({ ...base, fav: false }, Date.now()).favorite).toBe(false);
  });

  it('is deterministic when `now` is supplied', () => {
    const now = Date.parse('2026-09-27T00:00:00.000Z');
    expect(toNoteCardSummary(base, now).updatedLabel).toBe(toNoteCardSummary(base, now).updatedLabel);
  });
});
