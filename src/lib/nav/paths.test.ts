import { describe, expect, it } from 'vitest';
import {
  apiKeysPath, buildDashboardHref, dashboardPath, loginPath, newNotePath,
  noteEditPath, notePath, noteVersionPath, offlinePath,
} from './paths';

describe('paths', () => {
  it('builds the plain routes', () => {
    expect(loginPath()).toBe('/login');
    expect(dashboardPath()).toBe('/');
    expect(newNotePath()).toBe('/notes/new');
    expect(notePath('n1')).toBe('/notes/n1');
    expect(noteEditPath('n1')).toBe('/notes/n1/edit');
    expect(noteVersionPath('n1', 2)).toBe('/notes/n1?v=2');
    expect(apiKeysPath()).toBe('/settings/api-keys');
    expect(offlinePath()).toBe('/offline');
  });

  it('omits default filter values from the dashboard href', () => {
    expect(buildDashboardHref({})).toBe('/');
    expect(buildDashboardHref({ sort: 'updated', page: 1, view: 'grid' })).toBe('/');
    expect(buildDashboardHref({ q: '   ', tag: null, priority: null, fav: false })).toBe('/');
  });

  it('serialises only the non-default filters, in a stable order', () => {
    expect(
      buildDashboardHref({
        q: 'sốc', tag: 'Cấp cứu', priority: 'high', fav: true, sort: 'title', page: 3, view: 'list',
      }),
    ).toBe('/?q=s%E1%BB%91c&tag=C%E1%BA%A5p+c%E1%BB%A9u&priority=high&fav=1&sort=title&page=3&view=list');
  });

  it('encodes Vietnamese tags with the URLSearchParams form (space becomes +)', () => {
    // Pinned deliberately: `+` for a space, percent-escapes for everything else.
    // Both forms decode identically, but the string must be stable so that two
    // links to the same filter compare equal.
    expect(buildDashboardHref({ tag: 'Tim mạch' })).toBe('/?tag=Tim+m%E1%BA%A1ch');
    expect(new URLSearchParams('tag=Tim+m%E1%BA%A1ch').get('tag')).toBe('Tim mạch');
  });

  it('never emits a bare key for an empty or undefined value', () => {
    const href = buildDashboardHref({ q: '', tag: '', priority: null, fav: false, page: 0 });
    expect(href).toBe('/');
    expect(href).not.toContain('&');
  });

  it('escapes note ids', () => {
    expect(notePath('a b')).toBe('/notes/a%20b');
  });
});
