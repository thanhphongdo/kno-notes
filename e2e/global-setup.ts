import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { STORAGE_STATE, login } from './fixtures/auth';
import { E2E_DB, E2E_ENV } from '../playwright.config';

/**
 * Playwright global setup.
 *
 * Every run starts from a known state: the `kno_notes_test` database is dropped
 * and recreated, the filesystem storage adapter's `DATA_DIR` is wiped, the
 * backend's own migrate + seed scripts are run against them, and one browser
 * signs in to mint the shared session cookie.
 *
 * Migration and seeding deliberately go through `npm run db:migrate` /
 * `npm run db:seed:test` rather than being reimplemented here — the schema and
 * the fixtures have exactly one owner, and the e2e harness must not drift from
 * it. Those scripts belong to the backend workstream, so this file checks for
 * them up front and explains what is missing instead of failing somewhere deep
 * inside npm.
 */

/** Slot-aware: set E2E_SLOT to give a parallel run its own database. */
const DB_NAME = E2E_DB;
const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, E2E_ENV.DATA_DIR ?? '.data-test');

const REQUIRED_SCRIPTS = ['db:migrate', 'db:seed:test'] as const;

function fail(what: string, fix: string): never {
  throw new Error(`\n[e2e global-setup] ${what}\n  → ${fix}\n`);
}

/** Fails loudly, and early, if the backend's scripts are not in place yet. */
function assertBackendScripts(): void {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};

  for (const name of REQUIRED_SCRIPTS) {
    const command = scripts[name];
    if (!command) {
      fail(
        `package.json has no "${name}" script.`,
        `The backend workstream owns it. Add "${name}" to package.json before running the e2e suite.`,
      );
    }
    // `tsx scripts/seed.ts --test` → check `scripts/seed.ts` actually exists.
    const entry = command.match(/(?:^|\s)((?:\.\/)?scripts\/[\w.-]+\.(?:ts|mts|mjs|js))/)?.[1];
    if (entry && !existsSync(path.resolve(ROOT, entry))) {
      fail(
        `"${name}" points at ${entry}, which does not exist yet.`,
        'The backend workstream owns that script. Wait for it to land, or run the e2e suite once it does.',
      );
    }
  }
}

function assertPostgres(): void {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
  } catch {
    fail('`psql` is not on PATH.', 'Install PostgreSQL 16 (`brew install postgresql@16`) and make sure it is running.');
  }
  try {
    execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', 'SELECT 1'], { stdio: 'ignore' });
  } catch {
    fail(
      'Cannot connect to the local `postgres` database.',
      'Start PostgreSQL (`brew services start postgresql@16`) and confirm your role exists: `psql -d postgres -c "select current_user"`.',
    );
  }
}

function psql(sql: string): void {
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', sql], { stdio: 'inherit' });
}

function run(script: string, env: NodeJS.ProcessEnv): void {
  try {
    execSync(`npm run ${script}`, { stdio: 'inherit', env, cwd: ROOT });
  } catch {
    fail(
      `\`npm run ${script}\` failed.`,
      'Run it by hand with the same env to see the error: ' +
        `DATABASE_URL=${env.DATABASE_URL} DATA_DIR=${env.DATA_DIR} npm run ${script}`,
    );
  }
}

async function globalSetup(config: FullConfig): Promise<void> {
  assertBackendScripts();
  assertPostgres();

  // 1. A real local Postgres, dropped and recreated so every run starts clean.
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB_NAME}`);

  // 2. Note bodies live on the filesystem adapter in e2e; wipe them too.
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });

  // 3. Migrate + seed through the backend's own scripts.
  const env: NodeJS.ProcessEnv = { ...process.env, ...E2E_ENV, DATA_DIR };
  run('db:migrate', env);
  run('db:seed:test', env);

  // 4. Sign in once; every spec reuses the cookie via `use.storageState`.
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:3100';
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await login(page);
    mkdirSync(path.dirname(path.resolve(ROOT, STORAGE_STATE)), { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
