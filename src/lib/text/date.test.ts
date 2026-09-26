// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fmt, rel } from './date';

// Built from LOCAL-time components on purpose: `fmt` reads getDate()/getMonth(),
// so a UTC literal would make these assertions timezone-dependent.
const NOW = new Date(2024, 2, 7, 12, 0, 0).getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('fmt', () => {
  it('formats as dd/mm/yyyy with zero padding', () => {
    expect(fmt(new Date(2024, 2, 7, 12))).toBe('07/03/2024');
    expect(fmt(new Date(2024, 11, 25, 12))).toBe('25/12/2024');
    expect(fmt(new Date(2024, 0, 1, 12))).toBe('01/01/2024');
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(fmt(new Date(2025, 8, 26, 12).toISOString())).toBe('26/09/2025');
  });
});

describe('rel', () => {
  it('returns "vừa xong" strictly under one minute', () => {
    expect(rel(ago(0), NOW)).toBe('vừa xong');
    expect(rel(ago(0.9), NOW)).toBe('vừa xong');
  });

  it('switches to minutes at exactly one minute', () => {
    expect(rel(ago(1), NOW)).toBe('1 phút trước');
    expect(rel(ago(59), NOW)).toBe('59 phút trước');
    expect(rel(ago(59.9), NOW)).toBe('59 phút trước');
  });

  it('switches to hours at exactly 60 minutes', () => {
    expect(rel(ago(60), NOW)).toBe('1 giờ trước');
    expect(rel(ago(1439), NOW)).toBe('23 giờ trước');
  });

  it('switches to days at exactly 1440 minutes', () => {
    expect(rel(ago(1440), NOW)).toBe('1 ngày trước');
    expect(rel(ago(10079), NOW)).toBe('6 ngày trước');
  });

  it('falls back to dd/mm/yyyy at exactly 7 days', () => {
    expect(rel(ago(10080), NOW)).toBe('29/02/2024');
    expect(rel(ago(60 * 24 * 60), NOW)).toBe('07/01/2024');
  });

  it('floors rather than rounds', () => {
    expect(rel(ago(119), NOW)).toBe('1 giờ trước');
    expect(rel(ago(2879), NOW)).toBe('1 ngày trước');
  });

  it('defaults `now` to the current time', () => {
    expect(rel(new Date())).toBe('vừa xong');
  });
});
