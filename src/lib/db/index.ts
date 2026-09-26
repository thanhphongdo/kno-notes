// src/lib/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadTestEnv } from './env';
import * as schema from './schema';

export type Driver = 'neon-http' | 'node-postgres';

/**
 * Neon's HTTP driver speaks to a Neon endpoint over HTTPS and cannot reach a
 * local Postgres server, so the driver must follow the host.
 */
export function pickDriver(url: string): Driver {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection URL: ${JSON.stringify(url)}`);
  }
  if (!host) throw new Error('DATABASE_URL has no host');
  return host.endsWith('.neon.tech') ? 'neon-http' : 'node-postgres';
}

export type Database = ReturnType<typeof drizzleNeon<typeof schema>> | NodePgDatabase<typeof schema>;

let _db: Database | null = null;
let _pool: Pool | null = null;

export function getDb(): Database {
  if (_db) return _db;
  loadTestEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const driver = pickDriver(url);
  if (driver === 'neon-http') {
    _db = drizzleNeon(neon(url), { schema });
  } else {
    _pool = new Pool({ connectionString: url, max: 5 });
    _db = drizzleNode(_pool, { schema });
  }
  return _db;
}

/** Closes the node-postgres pool. No-op on neon-http. Used by tests and scripts. */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  _db = null;
}

/**
 * Proxy so callers write `db.select()...` without calling getDb() first,
 * while the real connection is still created lazily on first use.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as Database;

export * from './schema';
