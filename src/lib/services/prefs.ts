// src/lib/services/prefs.ts
import { eq } from 'drizzle-orm';
import { db, userPrefs } from '@/lib/db';
import type { UserPrefs } from '@/lib/types';

const toPrefs = (r: typeof userPrefs.$inferSelect): UserPrefs => ({
  userId: r.userId,
  theme: r.theme,
  fontSize: r.fontSize,
  view: r.view,
  sidebarCollapsed: r.sidebarCollapsed,
  recentSearches: r.recentSearches,
});

/** Đọc prefs, tạo bản mặc định nếu chưa có. Một round-trip khi đã tồn tại. */
export async function getPrefs(userId: string): Promise<UserPrefs> {
  const [row] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  if (row) return toPrefs(row);
  const [created] = await db.insert(userPrefs).values({ userId }).onConflictDoNothing().returning();
  if (created) return toPrefs(created);
  const [again] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  return toPrefs(again);
}

export async function updatePrefs(
  userId: string,
  patch: Partial<Omit<UserPrefs, 'userId'>>,
): Promise<UserPrefs> {
  await getPrefs(userId);
  if (!Object.keys(patch).length) return getPrefs(userId);
  const [row] = await db.update(userPrefs).set(patch).where(eq(userPrefs.userId, userId)).returning();
  return toPrefs(row);
}
