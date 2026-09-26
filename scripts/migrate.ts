// scripts/migrate.ts
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { migrate as migrateNode } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { pickDriver } from '../src/lib/db/index';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const migrationsFolder = './drizzle';

  if (pickDriver(url) === 'neon-http') {
    await migrateNeon(drizzleNeon(neon(url)), { migrationsFolder });
  } else {
    const pool = new Pool({ connectionString: url, max: 1 });
    await migrateNode(drizzleNode(pool), { migrationsFolder });
    await pool.end();
  }
  console.log(`migrations applied to ${new URL(url).pathname.slice(1)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
