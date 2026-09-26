/**
 * Every route in the app, built in one place.
 *
 * The dashboard's whole filter state lives in the query string, so
 * `buildDashboardHref` is also the definition of what "default" means: a
 * default value is omitted, which keeps `/` canonical and makes the browser's
 * back button behave.
 */
export type SortKey = 'updated' | 'priority' | 'title';
export type ViewKey = 'grid' | 'list';
export type PriorityKey = 'high' | 'medium' | 'low';

export interface DashboardHrefInput {
  q?: string;
  tag?: string | null;
  priority?: PriorityKey | null;
  fav?: boolean;
  sort?: SortKey;
  page?: number;
  view?: ViewKey;
}

export const loginPath = () => '/login';
export const dashboardPath = () => '/';
export const newNotePath = () => '/notes/new';
export const notePath = (id: string) => `/notes/${encodeURIComponent(id)}`;
export const noteEditPath = (id: string) => `${notePath(id)}/edit`;
export const noteVersionPath = (id: string, v: number) => `${notePath(id)}?v=${v}`;
export const apiKeysPath = () => '/settings/api-keys';
export const offlinePath = () => '/offline';

export function buildDashboardHref(input: DashboardHrefInput): string {
  const sp = new URLSearchParams();
  if (input.q && input.q.trim()) sp.set('q', input.q.trim());
  if (input.tag) sp.set('tag', input.tag);
  if (input.priority) sp.set('priority', input.priority);
  if (input.fav) sp.set('fav', '1');
  if (input.sort && input.sort !== 'updated') sp.set('sort', input.sort);
  if (input.page && input.page > 1) sp.set('page', String(input.page));
  if (input.view && input.view !== 'grid') sp.set('view', input.view);
  const qs = sp.toString();
  return qs ? `/?${qs}` : '/';
}
