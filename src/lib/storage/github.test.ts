// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { runStorageContract, makeNote, PNG_1PX } from './contract';
import { blobSha } from './filesystem';
import { CONTENTS_API_MAX_BYTES, GitHubStorage, type OctokitLike } from './github';
import { StorageConflictError } from './types';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public response?: { headers?: Record<string, string> },
  ) {
    super(message);
  }
}

/** In-memory stand-in for the GitHub Contents API. */
function fakeOctokit() {
  const files = new Map<string, { content: Buffer; sha: string }>();
  const calls = { getContent: 0, put: 0, del: 0, getBlob: 0 };

  const api: OctokitLike = {
    repos: {
      async getContent({ path }) {
        calls.getContent++;
        const f = files.get(path);
        if (f) {
          // Quá 1 MB thì Contents API trả về metadata với `content: ''` và
          // `encoding: 'none'` — KHÔNG phải lỗi, nên nơi gọi phải tự nhận ra.
          const tooBig = f.content.byteLength > CONTENTS_API_MAX_BYTES;
          return {
            data: {
              type: 'file',
              sha: f.sha,
              encoding: tooBig ? 'none' : 'base64',
              content: tooBig ? '' : f.content.toString('base64'),
              size: f.content.byteLength,
              name: path.slice(path.lastIndexOf('/') + 1),
              path,
            },
          };
        }
        const prefix = path.endsWith('/') ? path : path + '/';
        const children = [...files.keys()].filter((k) => k.startsWith(prefix));
        if (children.length) {
          return {
            data: children.map((k) => ({ type: 'file', name: k.slice(prefix.length), path: k })),
          };
        }
        throw new HttpError(404, 'Not Found');
      },
      async createOrUpdateFileContents({ path, content, sha }) {
        calls.put++;
        const existing = files.get(path);
        if (existing && sha !== existing.sha) throw new HttpError(409, 'Conflict');
        if (!existing && sha) throw new HttpError(422, 'Invalid sha');
        const buf = Buffer.from(content, 'base64');
        const newSha = blobSha(buf);
        files.set(path, { content: buf, sha: newSha });
        return { data: { content: { sha: newSha } } };
      },
      async deleteFile({ path, sha }) {
        calls.del++;
        const existing = files.get(path);
        if (!existing) throw new HttpError(404, 'Not Found');
        if (existing.sha !== sha) throw new HttpError(409, 'Conflict');
        files.delete(path);
        return { data: {} };
      },
    },
    git: {
      async getBlob({ file_sha }) {
        calls.getBlob++;
        const found = [...files.values()].find((f) => f.sha === file_sha);
        if (!found) throw new HttpError(404, 'Not Found');
        return {
          data: {
            sha: file_sha,
            content: found.content.toString('base64'),
            encoding: 'base64',
            size: found.content.byteLength,
          },
        };
      },
    },
  };

  return { api, files, calls };
}

runStorageContract('github (fake Contents API)', async () => {
  const { api } = fakeOctokit();
  return new GitHubStorage({ octokit: api, owner: 'o', repo: 'r', branch: 'main' });
});

describe('GitHubStorage specifics', () => {
  it('requires owner and repo', () => {
    const { api } = fakeOctokit();
    expect(() => new GitHubStorage({ octokit: api, owner: '', repo: 'r' })).toThrow(
      /GITHUB_OWNER/,
    );
  });

  it('commits with the SPEC message format', async () => {
    const { api } = fakeOctokit();
    const spy = vi.spyOn(api.repos, 'createOrUpdateFileContents');
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1'));
    expect(spy.mock.calls[0][0].message).toBe('feat(note): save n1 by u1');
    await s.deleteNote('u1', 'n1');
    vi.restoreAllMocks();
  });

  it('sends the branch as `ref` on read and `branch` on write', async () => {
    const { api } = fakeOctokit();
    const get = vi.spyOn(api.repos, 'getContent');
    const put = vi.spyOn(api.repos, 'createOrUpdateFileContents');
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r', branch: 'data' });
    await s.writeNote('u1', makeNote('n1'));
    await s.readNote('u1', 'n1');
    expect(put.mock.calls[0][0].branch).toBe('data');
    expect(get.mock.calls.at(-1)![0].ref).toBe('data');
    vi.restoreAllMocks();
  });

  it('serves a repeated read of an unchanged file from the LRU (no second decode)', async () => {
    const { api, calls } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { title: 'cached' }));
    const before = calls.getContent;
    const a = await s.readNote('u1', 'n1');
    const b = await s.readNote('u1', 'n1');
    expect(a!.title).toBe('cached');
    expect(b!.title).toBe('cached');
    // One getContent per read to resolve the sha; the body comes from the cache.
    expect(calls.getContent - before).toBe(2);
  });

  it('reuses the cached sha so a write does not need a preceding read', async () => {
    const { api, calls } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { title: 'one' }));
    const before = calls.getContent;
    await s.writeNote('u1', makeNote('n1', { title: 'two' }));
    expect(calls.getContent - before).toBe(0);
    expect((await s.readNote('u1', 'n1'))!.title).toBe('two');
  });

  it('retries a 409 by re-reading the current sha and replaying the write', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { title: 'first' }));
    s.__clearCaches();

    const real = api.repos.createOrUpdateFileContents.bind(api.repos);
    let thrown = 0;
    vi.spyOn(api.repos, 'createOrUpdateFileContents').mockImplementation(async (p) => {
      if (thrown === 0) {
        thrown++;
        throw new HttpError(409, 'Conflict');
      }
      return real(p);
    });

    await expect(s.writeNote('u1', makeNote('n1', { title: 'second' }))).resolves.toHaveProperty(
      'sha',
    );
    expect(thrown).toBe(1);
    vi.restoreAllMocks();
    expect((await s.readNote('u1', 'n1'))!.title).toBe('second');
  });

  it('throws StorageConflictError after 3 failed attempts rather than dropping the write', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1'));
    vi.spyOn(api.repos, 'createOrUpdateFileContents').mockRejectedValue(
      new HttpError(409, 'Conflict'),
    );
    await expect(s.writeNote('u1', makeNote('n1', { title: 'x' }))).rejects.toBeInstanceOf(
      StorageConflictError,
    );
    vi.restoreAllMocks();
  });

  it('backs off and retries when the rate limit is exhausted', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    const real = api.repos.createOrUpdateFileContents.bind(api.repos);
    let first = true;
    vi.spyOn(api.repos, 'createOrUpdateFileContents').mockImplementation(async (p) => {
      if (first) {
        first = false;
        throw new HttpError(403, 'rate limited', {
          headers: { 'x-ratelimit-remaining': '0', 'retry-after': '0' },
        });
      }
      return real(p);
    });
    await expect(s.writeNote('u1', makeNote('n-rl'))).resolves.toHaveProperty('sha');
    vi.restoreAllMocks();
  });

  it('propagates a non-rate-limit 500 instead of retrying forever', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    vi.spyOn(api.repos, 'getContent').mockRejectedValue(new HttpError(500, 'boom'));
    await expect(s.readNote('u1', 'n1')).rejects.toThrow('boom');
    vi.restoreAllMocks();
  });

  /**
   * Đây là lỗi đã xảy ra thật trên production: một ghi chú vượt 1 MB ghi lên
   * thành công, rồi không bao giờ mở lại được. Contents API trả
   * `content: ''` + `encoding: 'none'`, và `Buffer.from('', 'none')` ném
   * `ERR_UNKNOWN_ENCODING` — người dùng chỉ thấy bài của mình biến mất.
   */
  it('reads a note larger than the Contents API limit, through the Blobs API', async () => {
    const { api, calls } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    const huge = makeNote('n1', { content: 'x'.repeat(CONTENTS_API_MAX_BYTES + 1000) });

    await s.writeNote('u1', huge);
    s.__clearCaches();

    const before = calls.getBlob;
    const read = await s.readNote('u1', 'n1');
    expect(read).toEqual(huge);
    expect(calls.getBlob - before).toBe(1);
  });

  it('does not reach for a blob when the file fits inline', async () => {
    const { api, calls } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.writeNote('u1', makeNote('n1', { content: 'ngắn' }));
    s.__clearCaches();

    const before = calls.getBlob;
    expect((await s.readNote('u1', 'n1'))?.content).toBe('ngắn');
    expect(calls.getBlob - before).toBe(0);
  });

  it('throws rather than returning a truncated note when the blob is unusable too', async () => {
    const { api } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    vi.spyOn(api.repos, 'getContent').mockResolvedValue({
      data: { type: 'file', sha: 'abc', encoding: 'none', content: '', name: 'n1.json', path: 'x' },
    });
    vi.spyOn(api.git, 'getBlob').mockResolvedValue({
      data: { sha: 'abc', content: '', encoding: 'none', size: 0 },
    });
    await expect(s.readNote('u1', 'n1')).rejects.toThrow(/no content/);
    vi.restoreAllMocks();
  });

  it('stores image bytes unchanged through base64', async () => {
    const { api, files } = fakeOctokit();
    const s = new GitHubStorage({ octokit: api, owner: 'o', repo: 'r' });
    await s.putImage('u1', 'i1', PNG_1PX, 'image/png');
    const stored = files.get('data/users/u1/images/i1.png')!;
    expect(Buffer.compare(stored.content, PNG_1PX)).toBe(0);
  });
});

/**
 * Real-API smoke test. Skipped until a PAT and a private repo exist.
 *   GITHUB_TOKEN=... GITHUB_OWNER=... GITHUB_REPO=... npx vitest run src/lib/storage/github.test.ts
 */
const live = Boolean(
  process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO,
);
const describeLive = live ? describe : describe.skip;

describeLive('GitHubStorage against the real Contents API', () => {
  it(
    'round-trips a note in a scratch user directory',
    async () => {
      const s = new GitHubStorage();
      const uid = 'livetest-' + Date.now();
      await s.writeNote(uid, makeNote('n1', { title: 'live round trip' }));
      const got = await s.readNote(uid, 'n1');
      expect(got!.title).toBe('live round trip');
      expect(await s.listNoteIds(uid)).toEqual(['n1']);
      await s.deleteNote(uid, 'n1');
      expect(await s.readNote(uid, 'n1')).toBeNull();
    },
    60_000,
  );
});
