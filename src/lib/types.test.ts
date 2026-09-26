// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  PRIORITY_ORDER,
  PRIORITY_LABEL,
  PRIORITIES,
  DEFAULT_PAGE_SIZE,
  type Note,
} from './types';

describe('domain constants', () => {
  it('orders priorities high → medium → low', () => {
    expect([...PRIORITIES].sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])).toEqual([
      'high',
      'medium',
      'low',
    ]);
  });

  it('uses the prototype Vietnamese labels', () => {
    expect(PRIORITY_LABEL).toEqual({ high: 'Cao', medium: 'Trung bình', low: 'Thấp' });
  });

  it('defaults to 6 notes per page', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });

  it('accepts a fully-populated Note', () => {
    const n: Note = {
      id: 'n1',
      title: 'T',
      desc: 'D',
      tags: ['Tim mạch'],
      priority: 'high',
      fav: true,
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-02T00:00:00.000Z',
      content: '<p>x</p>',
      images: [{ id: 'i1', label: 'a', src: '/api/images/u1/i1' }],
      comments: [
        {
          id: 'c1',
          text: 'hi',
          date: '2024-01-02T00:00:00.000Z',
          author: { id: 'u1', displayName: 'Bác sĩ' },
        },
      ],
      versions: [
        { v: 1, date: '2024-01-01T00:00:00.000Z', note: 'Tạo ghi chú', title: 'T', content: '<p>x</p>' },
      ],
      quizzes: [],
    };
    expect(n.versions[n.versions.length - 1].v).toBe(1);
  });
});
