// scripts/seed.ts
// Seed demo user `bacsi` + 14 ghi chú mẫu.
//
//   npm run db:seed         -> .env.local  (kno_notes_dev, DATA_DIR=.data)
//   npm run db:seed:test    -> .env.test   (kno_notes_test, DATA_DIR=.data-test)
//
// Biến môi trường có sẵn trong shell LUÔN thắng file .env, nên Playwright
// global-setup chỉ cần export DATA_DIR/DATABASE_URL riêng của nó.
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const isTest = process.argv.includes('--test');

if (isTest) {
  // Chỉ nạp .env.test — không bao giờ nạp .env.local, tránh trỏ nhầm vào dev DB.
  config({ path: '.env.test', quiet: true });
  process.env.DATA_DIR = process.env.DATA_DIR || '.data-test';
  // Storage GitHub không bao giờ được dùng cho seed test, dù shell có đặt gì.
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;
} else {
  config({ path: '.env.local', quiet: true });
  config({ quiet: true });
}

const { db, users, userPrefs, noteIndex, tags, closeDb } = await import('../src/lib/db/index');
const { hashPassword } = await import('../src/lib/auth/password');
const { getStorage } = await import('../src/lib/storage/index');
const { upsertIndex, syncTags } = await import('../src/lib/services/index-sync');
const { SEED } = await import('../src/lib/services/seed-data');

export async function seed(
  opts: { username?: string; password?: string; displayName?: string } = {},
): Promise<{ userId: string; count: number }> {
  const username = opts.username ?? 'bacsi';
  const password = opts.password ?? '123456';
  const displayName = opts.displayName ?? 'Bác sĩ';

  // Re-seeding is idempotent: drop the user (cascades to index/tags/prefs)
  // and its stored notes, then rebuild from scratch.
  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    const storage = getStorage();
    for (const id of await storage.listNoteIds(existing.id)) {
      await storage.deleteNote(existing.id, id);
    }
    await db.delete(users).where(eq(users.id, existing.id));
  }

  const [user] = await db
    .insert(users)
    .values({ username, passwordHash: await hashPassword(password), displayName })
    .returning();

  await db.insert(userPrefs).values({ userId: user.id }).onConflictDoNothing();

  // Seeded comments predate the user row, so stamp the author here rather than
  // letting the detail page fall back to its unknown-author placeholder ("?").
  const author = { id: user.id, displayName };
  const notes = SEED().map((note) => ({
    ...note,
    comments: note.comments.map((c) => ({ ...c, author })),
  }));
  const storage = getStorage();
  for (const note of notes) {
    await storage.writeNote(user.id, note);
    await upsertIndex(user.id, note);
    await syncTags(user.id, note.tags);
  }

  return { userId: user.id, count: notes.length };
}

async function main() {
  const { userId, count } = await seed();
  const tagRows = await db.select().from(tags).where(eq(tags.userId, userId));
  const indexRows = await db.select().from(noteIndex).where(eq(noteIndex.userId, userId));
  const dbName = new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname.slice(1);
  console.log(`seeded user bacsi (${userId})`);
  console.log(`  database:   ${dbName}`);
  console.log(`  notes:      ${count} written, ${indexRows.length} indexed`);
  console.log(`  tags:       ${tagRows.length}`);
  console.log(`  storage:    ${getStorage().kind} at ${process.env.DATA_DIR || '.data'}`);
  console.log('  login with: bacsi / 123456');
  await closeDb();
}

// Only run when invoked directly, so tests can import `seed()`.
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
