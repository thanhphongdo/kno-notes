// src/lib/storage/types.ts
import type { Note } from '@/lib/types';

export interface StoredImage {
  data: Buffer;
  contentType: string;
  sha: string;
}

/**
 * Mọi phương thức nhận `userId` là tham số đầu tiên, BẮT BUỘC, và tự dựng
 * đường dẫn `data/users/<userId>/…`. Không phương thức nào nhận path từ caller.
 */
export interface NoteStorage {
  readonly kind: 'github' | 'filesystem';
  readNote(userId: string, noteId: string): Promise<Note | null>;
  writeNote(userId: string, note: Note): Promise<{ sha: string }>;
  deleteNote(userId: string, noteId: string): Promise<void>;
  listNoteIds(userId: string): Promise<string[]>;
  putImage(
    userId: string,
    imageId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ sha: string; path: string }>;
  getImage(userId: string, imageId: string): Promise<StoredImage | null>;
}

export class StorageConflictError extends Error {
  readonly code = 'STORAGE_CONFLICT';
  constructor(message = 'Storage write conflict') {
    super(message);
    this.name = 'StorageConflictError';
  }
}
