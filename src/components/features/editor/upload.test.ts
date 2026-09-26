import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadImages } from './upload';

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

describe('uploadImages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts one multipart request per image under the "file" field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image: { id: 'i1', label: 'a.png', src: '/api/images/u/i1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await uploadImages([png('a.png'), png('b.png')]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/images');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(out.images).toHaveLength(2);
    expect(out.failed).toBe(0);
  });

  it('drops non-image files before making any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await uploadImages([new File(['x'], 'note.txt', { type: 'text/plain' })]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toEqual({ images: [], failed: 0 });
  });

  it('counts rejected uploads and keeps the successful ones', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image: { id: 'i2', label: 'b.png', src: '/api/images/u/i2' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const out = await uploadImages([png('a.png'), png('b.png')]);
    expect(out.failed).toBe(1);
    expect(out.images.map((i) => i.id)).toEqual(['i2']);
  });
});
