// src/lib/services/tags.ts
import { eq } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';

/**
 * Tag của user kèm số ghi chú, sắp xếp như prototype (`allTags`):
 * nhiều note trước, rồi `localeCompare(…, 'vi')`.
 * Nguồn là `note_index.tag_names` nên số đếm luôn khớp dashboard.
 */
export async function listTags(
  userId: string,
): Promise<{ name: string; slug: string; count: number }[]> {
  const rows = await db
    .select({ tagNames: noteIndex.tagNames, tagSlugs: noteIndex.tagSlugs })
    .from(noteIndex)
    .where(eq(noteIndex.userId, userId))
    .limit(5000);

  const counts = new Map<string, { name: string; slug: string; count: number }>();
  for (const row of rows) {
    row.tagNames.forEach((name, i) => {
      const slug = row.tagSlugs[i] ?? name;
      const hit = counts.get(slug);
      if (hit) hit.count += 1;
      else counts.set(slug, { name, slug, count: 1 });
    });
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}
