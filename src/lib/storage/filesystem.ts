// src/lib/storage/filesystem.ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Note } from '@/lib/types';
import {
  CONTENT_TYPE_FOR_EXT,
  extForContentType,
  imagePath,
  imagesDir,
  notePath,
  notesDir,
  safeSegment,
} from './paths';
import type { NoteStorage, StoredImage } from './types';

/** Git blob sha — identical to what the GitHub Contents API reports. */
export function blobSha(data: Buffer): string {
  const header = Buffer.from(`blob ${data.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, data])).digest('hex');
}

/**
 * Adapter cho dev/test. Ghi vào `<root>/data/users/<userId>/…`
 * (mặc định `.data/`, đã gitignore). Production dùng `github.ts`.
 */
export class FilesystemStorage implements NoteStorage {
  readonly kind = 'filesystem' as const;
  private readonly root: string;

  constructor(root: string = process.env.DATA_DIR || '.data') {
    this.root = path.resolve(root);
  }

  /**
   * Resolves a logical repo path to disk and asserts it stayed inside the root.
   * Belt and braces: `safeSegment` already rejected traversal; this catches any
   * future caller that assembles a path some other way.
   */
  private abs(logical: string): string {
    const full = path.resolve(this.root, logical);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes storage root: ${logical}`);
    }
    return full;
  }

  async readNote(userId: string, noteId: string): Promise<Note | null> {
    const file = this.abs(notePath(userId, noteId));
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Note;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async writeNote(userId: string, note: Note): Promise<{ sha: string }> {
    const file = this.abs(notePath(userId, note.id));
    const data = Buffer.from(JSON.stringify(note, null, 2) + '\n', 'utf8');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return { sha: blobSha(data) };
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const file = this.abs(notePath(userId, noteId));
    try {
      await fs.unlink(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  async listNoteIds(userId: string): Promise<string[]> {
    const dir = this.abs(notesDir(userId));
    try {
      const names = await fs.readdir(dir);
      return names
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.slice(0, -5))
        .sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async putImage(
    userId: string,
    imageId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ sha: string; path: string }> {
    // Validate userId first so a bad user id never reports a content-type error.
    safeSegment(userId, 'userId');
    safeSegment(imageId, 'imageId');
    const ext = extForContentType(contentType);
    const logical = imagePath(userId, imageId, ext);
    const file = this.abs(logical);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
    return { sha: blobSha(buffer), path: logical };
  }

  async getImage(userId: string, imageId: string): Promise<StoredImage | null> {
    const dir = this.abs(imagesDir(userId));
    const id = safeSegment(imageId, 'imageId');
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    const match = names.find((n) => n.slice(0, n.lastIndexOf('.')) === id);
    if (!match) return null;
    const ext = match.slice(match.lastIndexOf('.') + 1);
    const data = await fs.readFile(path.join(dir, match));
    return {
      data,
      contentType: CONTENT_TYPE_FOR_EXT[ext] ?? 'application/octet-stream',
      sha: blobSha(data),
    };
  }
}
