// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { PNG_1PX } from '@/lib/storage/contract';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { uploadImage, imageUrl, sniffImageType } from './images';

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);
const GIF_HEAD = Buffer.from('GIF89a-fake-body');
const WEBP_HEAD = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x20, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

let cleanup: () => Promise<void>;
let uid = '';

const file = (bytes: Buffer, type: string, name = 'x') =>
  new File([new Uint8Array(bytes)], name, { type });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  uid = await makeUser('img_user');
});
afterAll(async () => {
  await dropUser(uid);
  await cleanup();
  await closeDb();
});

describe('imageUrl', () => {
  it('builds the proxy URL the editor embeds', () => {
    expect(imageUrl('u1', 'i1')).toBe('/api/images/u1/i1');
  });
});

describe('sniffImageType', () => {
  it('recognises the allowed formats by magic bytes', () => {
    expect(sniffImageType(PNG_1PX)).toBe('image/png');
    expect(sniffImageType(JPEG_HEAD)).toBe('image/jpeg');
    expect(sniffImageType(GIF_HEAD)).toBe('image/gif');
    expect(sniffImageType(WEBP_HEAD)).toBe('image/webp');
  });

  it('returns null for text, SVG and empty buffers', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="..."/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('hello world'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('uploadImage', () => {
  it('stores the bytes unchanged and returns a NoteImage', async () => {
    const out = await uploadImage(uid, file(PNG_1PX, 'image/png', 'so-do.png'));
    expect(out.id).toBeTruthy();
    expect(out.label).toBe('so-do.png');
    expect(out.src).toBe(`/api/images/${uid}/${out.id}`);

    const stored = await getStorage().getImage(uid, out.id);
    expect(stored!.contentType).toBe('image/png');
    expect(Buffer.compare(stored!.data, PNG_1PX)).toBe(0);
  });

  it('gives each upload a distinct id', async () => {
    const a = await uploadImage(uid, file(PNG_1PX, 'image/png'));
    const b = await uploadImage(uid, file(PNG_1PX, 'image/png'));
    expect(a.id).not.toBe(b.id);
  });

  it('rejects a non-image MIME type with 400', async () => {
    await expect(uploadImage(uid, file(PNG_1PX, 'application/pdf', 'a.pdf'))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_IMAGE',
    });
  });

  it('rejects SVG even though it is an image/* type', async () => {
    await expect(
      uploadImage(uid, file(Buffer.from('<svg/>'), 'image/svg+xml', 'a.svg')),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    await expect(
      uploadImage(uid, file(Buffer.from('not an image at all'), 'image/png', 'fake.png')),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_IMAGE' });
  });

  it('rejects an empty file', async () => {
    await expect(uploadImage(uid, file(Buffer.alloc(0), 'image/png'))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects a file over 4 MB', async () => {
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(4 * 1024 * 1024)]);
    await expect(uploadImage(uid, file(big, 'image/png'))).rejects.toMatchObject({
      status: 413,
      code: 'IMAGE_TOO_LARGE',
    });
  });

  it('accepts a file exactly at the 4 MB limit', async () => {
    const exact = Buffer.concat([PNG_1PX, Buffer.alloc(4 * 1024 * 1024 - PNG_1PX.length)]);
    await expect(uploadImage(uid, file(exact, 'image/png'))).resolves.toHaveProperty('id');
  });

  it('falls back to a generic label when the file has no name', async () => {
    const out = await uploadImage(uid, file(PNG_1PX, 'image/png', ''));
    expect(out.label).toBe('Hình ảnh');
  });
});
