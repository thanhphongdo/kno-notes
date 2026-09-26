// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { pickDriver } from './index';

describe('pickDriver', () => {
  it('uses neon-http for Neon hosts', () => {
    expect(
      pickDriver('postgresql://u:p@ep-cool-123.eu-central-1.aws.neon.tech/db?sslmode=require'),
    ).toBe('neon-http');
    expect(pickDriver('postgres://u:p@ep-x.us-east-2.aws.neon.tech/db')).toBe('neon-http');
  });

  it('uses node-postgres for localhost', () => {
    expect(pickDriver('postgresql://spt@localhost:5432/kno_notes_dev')).toBe('node-postgres');
    expect(pickDriver('postgresql://spt@127.0.0.1:5432/kno_notes_test')).toBe('node-postgres');
  });

  it('uses node-postgres for any non-Neon host', () => {
    expect(pickDriver('postgresql://u:p@db.internal:5432/x')).toBe('node-postgres');
  });

  it('throws on an unparseable URL rather than guessing', () => {
    expect(() => pickDriver('not-a-url')).toThrow(/DATABASE_URL/);
  });
});
