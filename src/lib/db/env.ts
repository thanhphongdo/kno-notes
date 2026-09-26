// src/lib/db/env.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Next tự nạp `.env.local`, `tsx` script nạp qua `dotenv/config`, nhưng Vitest
 * KHÔNG nạp file .env nào. Để không phải sửa `vitest.setup.ts` (do coordinator
 * sở hữu), module này nạp `.env.test` một cách đồng bộ khi chạy dưới Vitest.
 *
 * Chỉ nạp các biến CHƯA có trong `process.env`, nên shell vẫn ghi đè được.
 */
function parseEnvFile(file: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let loaded = false;

/** Idempotent. No-op ngoài môi trường test. */
export function loadTestEnv(): void {
  if (loaded || !process.env.VITEST) return;
  loaded = true;
  const parsed = parseEnvFile(path.resolve(process.cwd(), '.env.test'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}
