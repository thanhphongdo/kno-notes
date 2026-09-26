// src/lib/services/helpers.ts
// Fixture helper dùng chung cho test — KHÔNG phải file `.test.ts` nên Vitest
// không thu thập riêng.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { FilesystemStorage } from '@/lib/storage/filesystem';
import type { NoteSummary, Priority } from '@/lib/types';

/** Points getStorage() at a throwaway directory for the duration of a suite. */
export async function useTempStorage(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-svc-'));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const { __resetStorage } = await import('@/lib/storage');
  __resetStorage();
  return {
    dir,
    cleanup: async () => {
      if (prev === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prev;
      __resetStorage();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export async function makeUser(username: string): Promise<string> {
  await db.delete(users).where(eq(users.username, username));
  const [u] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', displayName: username })
    .returning();
  return u.id;
}

export async function dropUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export function summary(over: Partial<NoteSummary> & { id: string }): NoteSummary {
  return {
    title: 'T',
    desc: '',
    tags: [],
    priority: 'medium' as Priority,
    fav: false,
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    latestVersion: 1,
    imageCount: 0,
    commentCount: 0,
    quizCount: 0,
    ...over,
  };
}

export { FilesystemStorage };
