// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkEnv } from './check-env';

// Next's typings make NODE_ENV required on ProcessEnv; checkEnv only ever
// reads named keys, so a partial record is the honest shape here.
const full: Partial<NodeJS.ProcessEnv> = {
  DATABASE_URL: 'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/kno_notes?sslmode=require',
  AUTH_SECRET: 'a'.repeat(32),
  GITHUB_TOKEN: 'ghp_x',
  GITHUB_OWNER: 'me',
  GITHUB_REPO: 'kno-notes-data',
  GITHUB_BRANCH: 'main',
  GOOGLE_GENERATIVE_AI_API_KEY: 'AIza-x',
  NEXT_PUBLIC_APP_NAME: 'Kno-Notes',
};

describe('checkEnv', () => {
  it('passes a complete production environment', () => {
    const r = checkEnv(full);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.storage).toBe('github');
    expect(r.quiz).toBe('gemini');
    expect(r.dbDriver).toBe('neon-http');
  });

  it('fails without DATABASE_URL or AUTH_SECRET', () => {
    const r = checkEnv({ ...full, DATABASE_URL: undefined, AUTH_SECRET: undefined });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['DATABASE_URL', 'AUTH_SECRET']);
  });

  it('fails an AUTH_SECRET shorter than 32 characters', () => {
    const r = checkEnv({ ...full, AUTH_SECRET: 'short' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('AUTH_SECRET');
  });

  it('reports the filesystem adapter and warns when GitHub is unconfigured', () => {
    const r = checkEnv({
      ...full,
      GITHUB_TOKEN: undefined,
      GITHUB_OWNER: undefined,
      GITHUB_REPO: undefined,
    });
    expect(r.ok).toBe(true);
    expect(r.storage).toBe('filesystem');
    expect(r.warnings.join(' ')).toMatch(/GITHUB_TOKEN/);
  });

  it('warns about a partially configured GitHub setup', () => {
    const r = checkEnv({ ...full, GITHUB_REPO: undefined });
    expect(r.storage).toBe('filesystem');
    expect(r.warnings.join(' ')).toMatch(/GITHUB_REPO/);
  });

  it('reports offline quiz generation with no Gemini key, and does not fail', () => {
    const r = checkEnv({ ...full, GOOGLE_GENERATIVE_AI_API_KEY: undefined });
    expect(r.ok).toBe(true);
    expect(r.quiz).toBe('offline');
  });

  it('detects the local Postgres driver', () => {
    const r = checkEnv({ ...full, DATABASE_URL: 'postgresql://spt@localhost:5432/kno_notes_dev' });
    expect(r.dbDriver).toBe('node-postgres');
  });

  it('fails an unparseable DATABASE_URL instead of guessing a driver', () => {
    const r = checkEnv({ ...full, DATABASE_URL: 'localhost:5432' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('DATABASE_URL');
  });

  it('warns when NEXT_PUBLIC_APP_NAME is absent but does not fail', () => {
    const r = checkEnv({ ...full, NEXT_PUBLIC_APP_NAME: undefined });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/NEXT_PUBLIC_APP_NAME/);
  });
});
