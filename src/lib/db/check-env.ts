// src/lib/db/check-env.ts
// Kiểm tra biến môi trường trước khi deploy. Thuần tuý, không I/O, nên test được.
import { pickDriver } from './index';

export interface EnvReport {
  ok: boolean;
  missing: string[];
  warnings: string[];
  storage: 'github' | 'filesystem';
  quiz: 'gemini' | 'offline';
  dbDriver: 'neon-http' | 'node-postgres' | 'unknown';
}

const GITHUB_VARS = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'] as const;

export function checkEnv(env: Partial<NodeJS.ProcessEnv> = process.env): EnvReport {
  const missing: string[] = [];
  const warnings: string[] = [];

  let dbDriver: EnvReport['dbDriver'] = 'unknown';
  if (!env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  } else {
    try {
      dbDriver = pickDriver(env.DATABASE_URL);
    } catch {
      missing.push('DATABASE_URL');
    }
  }

  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) missing.push('AUTH_SECRET');

  const githubSet = GITHUB_VARS.filter((v) => Boolean(env[v]));
  const storage: EnvReport['storage'] = githubSet.length === 3 ? 'github' : 'filesystem';
  if (storage === 'filesystem') {
    const absent = GITHUB_VARS.filter((v) => !env[v]);
    warnings.push(
      `Storage adapter = filesystem (writes to ${env.DATA_DIR || './.data'}). Set ${absent.join(', ')} to use the private GitHub repo. ` +
        'This is fine locally; on Vercel it means data lives on an ephemeral filesystem and WILL be lost.',
    );
  }

  const quiz: EnvReport['quiz'] = env.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini' : 'offline';
  if (quiz === 'offline') {
    warnings.push(
      'GOOGLE_GENERATIVE_AI_API_KEY is not set. Quiz generation falls back to the offline generator. This is supported, not an error.',
    );
  }

  if (!env.NEXT_PUBLIC_APP_NAME) {
    warnings.push('NEXT_PUBLIC_APP_NAME is not set; defaulting to "Kno-Notes".');
  }

  return { ok: missing.length === 0, missing, warnings, storage, quiz, dbDriver };
}
