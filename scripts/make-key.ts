// scripts/make-key.ts
// Dev helper: tạo API key cho một user để thử `/api/v1` và `/api/mcp`.
//   npx tsx scripts/make-key.ts [username] [key name]
// Khoá đầy đủ chỉ in ra MỘT lần — sao lại ngay.
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { eq } from 'drizzle-orm';
import { createApiKey } from '../src/lib/auth/api-keys';
import { db, users, closeDb } from '../src/lib/db/index';

async function main() {
  const username = process.argv[2] || 'bacsi';
  const name = process.argv[3] || 'CLI key';
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`No user named ${username}. Run: npm run db:seed`);
  const { key, apiKey } = await createApiKey(u.id, name);
  console.log(key);
  console.error(`created "${apiKey.name}" (${apiKey.prefix}…) for ${username}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
