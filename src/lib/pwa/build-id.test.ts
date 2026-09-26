import { describe, expect, it } from 'vitest';
import { DEV_BUILD_ID, buildIdFrom, serviceWorkerUrl } from './build-id';

describe('buildIdFrom', () => {
  it('shortens a commit sha', () => {
    expect(buildIdFrom('0123456789abcdef0123456789abcdef01234567')).toBe('0123456789ab');
  });

  it('falls back to a dev id when the variable is missing or blank', () => {
    expect(buildIdFrom(undefined)).toBe(DEV_BUILD_ID);
    expect(buildIdFrom('')).toBe(DEV_BUILD_ID);
    expect(buildIdFrom('   ')).toBe(DEV_BUILD_ID);
  });

  it('drops characters that have no business in a URL', () => {
    expect(buildIdFrom('abc/../def?x=1')).toBe('abc..defx1');
    expect(buildIdFrom('!!!')).toBe(DEV_BUILD_ID);
  });
});

describe('serviceWorkerUrl', () => {
  it('keeps the script path so the scope stays the site root', () => {
    expect(serviceWorkerUrl('abc123')).toBe('/sw.js?v=abc123');
  });

  it('gives two deploys two different script URLs', () => {
    expect(serviceWorkerUrl('aaaaaaaaaaaa')).not.toBe(serviceWorkerUrl('bbbbbbbbbbbb'));
  });

  it('is stable for the same build', () => {
    expect(serviceWorkerUrl('abc123')).toBe(serviceWorkerUrl('abc123'));
  });
});
