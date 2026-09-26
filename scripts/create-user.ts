// scripts/create-user.ts
//
// Kno-Notes has no public signup by design, so accounts are created here.
//
//   npx tsx scripts/create-user.ts <username> <password> ["Tên hiển thị"]
//
// Safe to re-run: an existing username has its password and display name
// updated rather than erroring, so this doubles as a password reset. It never
// touches the user's notes.
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { userPrefs, users } from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/auth';

function usage(message: string): never {
  console.error(`${message}

usage: npx tsx scripts/create-user.ts <username> <password> ["Tên hiển thị"]`);
  process.exit(1);
}

async function main() {
  const [username, password, displayNameArg] = process.argv.slice(2);
  if (!username) usage('Thiếu username.');
  if (!password) usage('Thiếu password.');
  if (password.length < 6) usage('Mật khẩu phải có ít nhất 6 ký tự.');
  const displayName = displayNameArg?.trim() || username;

  if (!process.env.DATABASE_URL) usage('DATABASE_URL is not set.');

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (existing) {
    await db.update(users).set({ passwordHash, displayName }).where(eq(users.id, existing.id));
    await db.insert(userPrefs).values({ userId: existing.id }).onConflictDoNothing();
    console.log(`updated: ${username} (${displayName}) — password reset, notes untouched`);
    return;
  }

  const [user] = await db.insert(users).values({ username, passwordHash, displayName }).returning();
  await db.insert(userPrefs).values({ userId: user.id }).onConflictDoNothing();
  console.log(`created: ${username} (${displayName})`);
}

main().catch((error: unknown) => {
  console.error('failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
