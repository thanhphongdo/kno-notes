// src/lib/storage/github.ts
import { Octokit } from '@octokit/rest';
import type { Note } from '@/lib/types';
import { Lru } from './lru';
import {
  CONTENT_TYPE_FOR_EXT,
  extForContentType,
  imagePath,
  imagesDir,
  notePath,
  notesDir,
  safeSegment,
} from './paths';
import { StorageConflictError, type NoteStorage, type StoredImage } from './types';

export interface GetContentParams {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}
export interface PutParams extends GetContentParams {
  message: string;
  content: string;
  sha?: string;
  branch?: string;
}
export interface DeleteParams extends GetContentParams {
  message: string;
  sha: string;
  branch?: string;
}

export interface GetBlobParams {
  owner: string;
  repo: string;
  file_sha: string;
}
export interface BlobData {
  sha: string;
  content?: string;
  encoding?: string;
  size?: number;
}

/** The slice of Octokit this adapter uses. Tests supply a fake with this shape. */
export interface OctokitLike {
  git: {
    getBlob(p: GetBlobParams): Promise<{ data: BlobData }>;
  };
  repos: {
    getContent(p: GetContentParams): Promise<{ data: unknown }>;
    createOrUpdateFileContents(
      p: PutParams,
    ): Promise<{ data: { content?: { sha?: string } | null } }>;
    deleteFile(p: DeleteParams): Promise<{ data: unknown }>;
  };
}

interface HttpErrorLike extends Error {
  status?: number;
  response?: { headers?: Record<string, string> };
}

const CACHE_MAX = 200;
/**
 * Trần của Contents API. Trên mức này nó vẫn trả 200, nhưng với `content: ''`
 * và `encoding: 'none'` — tức là metadata không kèm nội dung.
 */
export const CONTENTS_API_MAX_BYTES = 1024 * 1024;
const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 5000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Adapter production. Mỗi lần ghi là 1 commit; message theo SPEC §2.2:
 * `feat(note): <action> <noteId> by <userId>`.
 */
export class GitHubStorage implements NoteStorage {
  readonly kind = 'github' as const;

  private readonly octokit: OctokitLike;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;

  /** `${path}@${sha}` -> decoded bytes. */
  private readonly blobs = new Lru<Buffer>(CACHE_MAX);
  /** `path` -> latest known sha, so a write does not re-fetch to learn it. */
  private readonly shas = new Lru<string>(CACHE_MAX);

  constructor(
    opts: { octokit?: OctokitLike; owner?: string; repo?: string; branch?: string } = {},
  ) {
    this.owner = opts.owner ?? process.env.GITHUB_OWNER ?? '';
    this.repo = opts.repo ?? process.env.GITHUB_REPO ?? '';
    this.branch = opts.branch ?? process.env.GITHUB_BRANCH ?? 'main';
    this.octokit =
      opts.octokit ?? (new Octokit({ auth: process.env.GITHUB_TOKEN }) as unknown as OctokitLike);
    if (!this.owner || !this.repo) {
      throw new Error('GitHubStorage requires GITHUB_OWNER and GITHUB_REPO');
    }
  }

  // ---- low-level -------------------------------------------------------

  private async withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const err = e as HttpErrorLike;
        const rateLimited =
          (err.status === 403 || err.status === 429) &&
          Boolean(
            err.response?.headers?.['x-ratelimit-remaining'] === '0' ||
              err.response?.headers?.['retry-after'],
          );
        if (!rateLimited || attempt >= MAX_ATTEMPTS) throw e;
        const retryAfter = Number(err.response?.headers?.['retry-after'] ?? 0) * 1000;
        const reset = Number(err.response?.headers?.['x-ratelimit-reset'] ?? 0) * 1000;
        const untilReset = reset ? reset - Date.now() : 0;
        await sleep(Math.min(MAX_BACKOFF_MS, Math.max(250, retryAfter || untilReset || 250)));
      }
    }
  }

  /** Returns decoded bytes + sha, or null on 404. Uses the LRU when the sha matches. */
  private async getFile(filePath: string): Promise<{ data: Buffer; sha: string } | null> {
    let file: { sha?: string; content?: string; encoding?: string; type?: string };
    try {
      const res = await this.withRateLimitRetry(() =>
        this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: this.branch,
        }),
      );
      file = res.data as typeof file;
    } catch (e) {
      if ((e as HttpErrorLike).status === 404) {
        this.shas.delete(filePath);
        return null;
      }
      throw e;
    }
    if (!file || Array.isArray(file) || !file.sha) return null;

    const sha = file.sha;
    this.shas.set(filePath, sha);

    const cached = this.blobs.get(`${filePath}@${sha}`);
    if (cached) return { data: cached, sha };

    const data = await this.decodeOrFetchBlob(filePath, file);
    this.blobs.set(`${filePath}@${sha}`, data);
    return { data, sha };
  }

  /**
   * Lấy bytes thật của một file.
   *
   * Quá 1 MB, Contents API trả 200 kèm `content: ''` và `encoding: 'none'`.
   * Đó KHÔNG phải lỗi, nên nếu cứ thế đưa vào `Buffer.from(content, encoding)`
   * thì nhận `ERR_UNKNOWN_ENCODING` — và người đọc chỉ thấy ghi chú của mình
   * không mở được, dù nó còn nguyên trên repo. Những file đó lấy qua Blobs API,
   * nơi không có trần 1 MB.
   */
  private async decodeOrFetchBlob(
    filePath: string,
    file: { sha?: string; content?: string; encoding?: string },
  ): Promise<Buffer> {
    if (file.encoding === 'base64' || (file.encoding === 'utf-8' && file.content)) {
      return Buffer.from(file.content ?? '', file.encoding as BufferEncoding);
    }

    const blob = await this.withRateLimitRetry(() =>
      this.octokit.git.getBlob({ owner: this.owner, repo: this.repo, file_sha: file.sha ?? '' }),
    );
    const encoding = blob.data.encoding;
    if (encoding !== 'base64' && encoding !== 'utf-8') {
      // Trên 100 MB thì Blobs API cũng chịu. Thà hỏng ồn ào còn hơn trả về một
      // ghi chú bị cắt cụt rồi ghi đè bản đầy đủ ở lần lưu sau.
      throw new Error(
        `GitHub returned no content for ${filePath} (encoding "${encoding ?? 'missing'}")`,
      );
    }
    return Buffer.from(blob.data.content ?? '', encoding as BufferEncoding);
  }

  /** Writes bytes, retrying a 409 by re-reading the current sha. */
  private async putFile(filePath: string, data: Buffer, message: string): Promise<string> {
    let sha = this.shas.get(filePath);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.withRateLimitRetry(() =>
          this.octokit.repos.createOrUpdateFileContents({
            owner: this.owner,
            repo: this.repo,
            path: filePath,
            message,
            content: data.toString('base64'),
            sha,
            branch: this.branch,
          }),
        );
        const newSha = res.data?.content?.sha;
        if (newSha) {
          this.shas.set(filePath, newSha);
          this.blobs.set(`${filePath}@${newSha}`, data);
          return newSha;
        }
        // No sha returned: drop our cached sha so the next read re-resolves it.
        this.shas.delete(filePath);
        return '';
      } catch (e) {
        const status = (e as HttpErrorLike).status;
        // 409 = stale sha, 422 = "sha wasn't supplied" for an existing file.
        if ((status === 409 || status === 422) && attempt < MAX_ATTEMPTS) {
          this.shas.delete(filePath);
          const current = await this.getFile(filePath);
          sha = current?.sha;
          await sleep(10 * attempt);
          continue;
        }
        if (status === 409 || status === 422) {
          throw new StorageConflictError(
            `Conflict writing ${filePath} after ${MAX_ATTEMPTS} attempts`,
          );
        }
        throw e;
      }
    }
    throw new StorageConflictError(`Conflict writing ${filePath}`);
  }

  private async listDir(dirPath: string): Promise<{ name: string }[]> {
    try {
      const res = await this.withRateLimitRetry(() =>
        this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: dirPath,
          ref: this.branch,
        }),
      );
      const data = res.data;
      return Array.isArray(data) ? (data as { name: string }[]) : [];
    } catch (e) {
      if ((e as HttpErrorLike).status === 404) return [];
      throw e;
    }
  }

  // ---- NoteStorage -----------------------------------------------------

  async readNote(userId: string, noteId: string): Promise<Note | null> {
    const file = await this.getFile(notePath(userId, noteId));
    if (!file) return null;
    return JSON.parse(file.data.toString('utf8')) as Note;
  }

  async writeNote(userId: string, note: Note): Promise<{ sha: string }> {
    const filePath = notePath(userId, note.id);
    const data = Buffer.from(JSON.stringify(note, null, 2) + '\n', 'utf8');
    const sha = await this.putFile(filePath, data, `feat(note): save ${note.id} by ${userId}`);
    return { sha };
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const filePath = notePath(userId, noteId);
    const current = await this.getFile(filePath);
    if (!current) return;
    await this.withRateLimitRetry(() =>
      this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: `feat(note): delete ${noteId} by ${userId}`,
        sha: current.sha,
        branch: this.branch,
      }),
    );
    this.shas.delete(filePath);
    this.blobs.delete(`${filePath}@${current.sha}`);
  }

  async listNoteIds(userId: string): Promise<string[]> {
    const entries = await this.listDir(notesDir(userId));
    return entries
      .map((e) => e.name)
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.slice(0, -5))
      .sort();
  }

  async putImage(
    userId: string,
    imageId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ sha: string; path: string }> {
    safeSegment(userId, 'userId');
    safeSegment(imageId, 'imageId');
    const ext = extForContentType(contentType);
    const filePath = imagePath(userId, imageId, ext);
    const sha = await this.putFile(filePath, buffer, `feat(note): image ${imageId} by ${userId}`);
    return { sha, path: filePath };
  }

  async getImage(userId: string, imageId: string): Promise<StoredImage | null> {
    const id = safeSegment(imageId, 'imageId');
    const entries = await this.listDir(imagesDir(userId));
    const match = entries.map((e) => e.name).find((n) => n.slice(0, n.lastIndexOf('.')) === id);
    if (!match) return null;
    const ext = match.slice(match.lastIndexOf('.') + 1);
    const file = await this.getFile(`${imagesDir(userId)}/${match}`);
    if (!file) return null;
    return {
      data: file.data,
      contentType: CONTENT_TYPE_FOR_EXT[ext] ?? 'application/octet-stream',
      sha: file.sha,
    };
  }

  /** Test seam. */
  __clearCaches(): void {
    this.blobs.clear();
    this.shas.clear();
  }
}
