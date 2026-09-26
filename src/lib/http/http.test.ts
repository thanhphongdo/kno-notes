// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HttpError, jsonError, handle } from './index';

describe('jsonError', () => {
  it('uses the shared envelope and status', async () => {
    const res = jsonError(404, 'NOT_FOUND', 'Không tìm thấy ghi chú.');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy ghi chú.' },
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('handle', () => {
  it('serialises the resolved value as JSON 200', async () => {
    const res = await handle(async () => ({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('passes a Response through untouched', async () => {
    const res = await handle(async () => new Response(null, { status: 204 }));
    expect(res.status).toBe(204);
  });

  it('maps an HttpError to its status and code', async () => {
    const res = await handle(async () => {
      throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập.' },
    });
  });

  it('maps a Zod error to 400 INVALID_INPUT', async () => {
    const { z } = await import('zod');
    const res = await handle(async () => z.object({ a: z.string() }).parse({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  it('maps a storage conflict to 409', async () => {
    const { StorageConflictError } = await import('@/lib/storage/types');
    const res = await handle(async () => {
      throw new StorageConflictError();
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CONFLICT');
  });

  it('maps an unexpected error to a 500 without leaking its message', async () => {
    const res = await handle(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:5432 user=admin password=hunter2');
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('hunter2');
  });
});
