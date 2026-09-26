// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FilesystemStorage, blobSha } from './filesystem';
import { runStorageContract, makeNote, PNG_1PX } from './contract';

let dir = '';

runStorageContract(
  'filesystem',
  async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-fs-'));
    return new FilesystemStorage(dir);
  },
  async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  },
);

describe('FilesystemStorage specifics', () => {
  it('computes the same blob sha git does', () => {
    // printf '' | git hash-object --stdin
    expect(blobSha(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    // printf 'hello' | git hash-object --stdin
    expect(blobSha(Buffer.from('hello'))).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
  });

  it('writes under <root>/data/users/<userId>/ and nowhere else', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-fs2-'));
    const s = new FilesystemStorage(root);
    await s.writeNote('u1', makeNote('n1'));
    await s.putImage('u1', 'i1', PNG_1PX, 'image/png');
    expect(await fs.readdir(path.join(root, 'data', 'users'))).toEqual(['u1']);
    expect(await fs.readdir(path.join(root, 'data', 'users', 'u1', 'notes'))).toEqual(['n1.json']);
    expect(await fs.readdir(path.join(root, 'data', 'users', 'u1', 'images'))).toEqual(['i1.png']);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores pretty-printed JSON so the repo stays diffable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kno-fs3-'));
    const s = new FilesystemStorage(root);
    await s.writeNote('u1', makeNote('n1'));
    const raw = await fs.readFile(path.join(root, 'data/users/u1/notes/n1.json'), 'utf8');
    expect(raw).toContain('"id": "n1"');
    expect(raw.endsWith('\n')).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  });
});
