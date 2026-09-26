// src/lib/storage/index.ts
import { FilesystemStorage } from './filesystem';
import { GitHubStorage } from './github';
import type { NoteStorage } from './types';

let _storage: NoteStorage | null = null;

/** True only when every GitHub variable a write needs is present. */
export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO);
}

/**
 * GitHub khi có đủ `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO`,
 * ngược lại dùng filesystem (dev, unit test, Playwright).
 */
export function getStorage(): NoteStorage {
  if (_storage) return _storage;
  _storage = githubConfigured() ? new GitHubStorage() : new FilesystemStorage();
  return _storage;
}

/** Test seam only. */
export function __resetStorage(): void {
  _storage = null;
}

export type { NoteStorage, StoredImage } from './types';
export { StorageConflictError } from './types';
export { FilesystemStorage, blobSha } from './filesystem';
export { GitHubStorage } from './github';
export * from './paths';
