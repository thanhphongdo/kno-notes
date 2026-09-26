/** Canonical in-app URLs for a note. Kept in one place so no page builds them by hand. */

export const dashboardPath = (): string => '/';

export const notePath = (id: string): string => `/notes/${encodeURIComponent(id)}`;

export const noteVersionPath = (id: string, v: number): string =>
  `${notePath(id)}?v=${encodeURIComponent(String(v))}`;

export const noteEditPath = (id: string): string => `${notePath(id)}/edit`;

export const newNotePath = (): string => '/notes/new';

/** Dashboard filtered by a single tag — `?tag=C%E1%BA%A5p+c%E1%BB%A9u`. */
export const tagPath = (tag: string): string => `/?${new URLSearchParams({ tag }).toString()}`;
