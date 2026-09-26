// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getDb, pickDriver } from './index';

/**
 * Guard: Vitest nạp `.env.test` qua `loadTestEnv()`, nên mọi test chạm DB phải
 * trỏ vào `kno_notes_test` và `.data-test`. Nếu một ngày nào đó chúng trỏ vào
 * `kno_notes_dev`, các assertion đếm sẽ bấp bênh vì `npm run db:seed` ghi 14
 * ghi chú vào dev — và tệ hơn, test có thể xoá dữ liệu dev thật.
 */
describe('test environment', () => {
  it('connects unit tests to kno_notes_test, never kno_notes_dev', () => {
    getDb();
    expect(process.env.DATABASE_URL).toContain('kno_notes_test');
    expect(process.env.DATABASE_URL).not.toContain('kno_notes_dev');
    expect(pickDriver(process.env.DATABASE_URL!)).toBe('node-postgres');
  });

  it('points the filesystem storage adapter at .data-test', () => {
    // Suites that need isolation override this with useTempStorage().
    expect(process.env.DATA_DIR).toBe('.data-test');
  });

  it('leaves GitHub unconfigured so the filesystem adapter is used', async () => {
    const { githubConfigured } = await import('@/lib/storage');
    expect(githubConfigured()).toBe(false);
  });
});
