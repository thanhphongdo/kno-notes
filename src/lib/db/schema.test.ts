// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db, closeDb, users, noteIndex, tags, userPrefs, apiKeys } from './index';

let userA = '';
let userB = '';

beforeAll(async () => {
  await db.delete(users).where(eq(users.username, 'schema_a'));
  await db.delete(users).where(eq(users.username, 'schema_b'));
  await db.delete(users).where(eq(users.username, 'schema_tmp'));
  const [a] = await db
    .insert(users)
    .values({ username: 'schema_a', passwordHash: 'x', displayName: 'A' })
    .returning();
  const [b] = await db
    .insert(users)
    .values({ username: 'schema_b', passwordHash: 'x', displayName: 'B' })
    .returning();
  userA = a.id;
  userB = b.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userA));
  await db.delete(users).where(eq(users.id, userB));
  await closeDb();
});

describe('note_index', () => {
  it('lets two users own the same note_id', async () => {
    await db.insert(noteIndex).values({
      userId: userA,
      noteId: 'n1',
      title: 'A',
      titleNorm: 'a',
      description: '',
      descriptionNorm: '',
      priority: 'high',
      tagSlugs: ['tim-mach'],
      tagNames: ['Tim mạch'],
    });
    await db.insert(noteIndex).values({
      userId: userB,
      noteId: 'n1',
      title: 'B',
      titleNorm: 'b',
      description: '',
      descriptionNorm: '',
      priority: 'low',
      tagSlugs: [],
      tagNames: [],
    });
    const rows = await db.select().from(noteIndex).where(eq(noteIndex.noteId, 'n1'));
    expect(rows).toHaveLength(2);
  });

  it('rejects a duplicate (user_id, note_id)', async () => {
    await expect(
      db.insert(noteIndex).values({
        userId: userA,
        noteId: 'n1',
        title: 'dup',
        titleNorm: 'dup',
        description: '',
        descriptionNorm: '',
        priority: 'low',
        tagSlugs: [],
        tagNames: [],
      }),
    ).rejects.toThrow();
  });

  it('scopes a lookup by user_id so user B never sees user A row', async () => {
    const rows = await db
      .select()
      .from(noteIndex)
      .where(and(eq(noteIndex.userId, userB), eq(noteIndex.noteId, 'n1')));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('B');
  });

  it('round-trips tag_slugs and tag_names as text[]', async () => {
    const [row] = await db
      .select()
      .from(noteIndex)
      .where(and(eq(noteIndex.userId, userA), eq(noteIndex.noteId, 'n1')));
    expect(row.tagSlugs).toEqual(['tim-mach']);
    expect(row.tagNames).toEqual(['Tim mạch']);
  });
});

describe('tags', () => {
  it('enforces UNIQUE(user_id, slug) but allows the slug under another user', async () => {
    await db.insert(tags).values({ userId: userA, name: 'Tim mạch', slug: 'tim-mach' });
    await db.insert(tags).values({ userId: userB, name: 'Tim mạch', slug: 'tim-mach' });
    await expect(
      db.insert(tags).values({ userId: userA, name: 'Tim Mach', slug: 'tim-mach' }),
    ).rejects.toThrow();
  });
});

describe('user_prefs', () => {
  it('applies the prototype defaults', async () => {
    await db.insert(userPrefs).values({ userId: userA });
    const [p] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userA));
    expect(p).toMatchObject({
      theme: 'light',
      fontSize: 17,
      view: 'grid',
      sidebarCollapsed: false,
      recentSearches: [],
    });
  });
});

describe('cascade', () => {
  it('deletes dependent rows when the user is deleted', async () => {
    const [tmp] = await db
      .insert(users)
      .values({ username: 'schema_tmp', passwordHash: 'x', displayName: 'T' })
      .returning();
    await db.insert(apiKeys).values({
      userId: tmp.id,
      name: 'k',
      tokenHash: 'hash-schema-tmp',
      prefix: 'kn_aaaaaaa',
    });
    await db.delete(users).where(eq(users.id, tmp.id));
    const left = await db.select().from(apiKeys).where(eq(apiKeys.userId, tmp.id));
    expect(left).toHaveLength(0);
  });
});
