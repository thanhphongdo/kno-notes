// scripts/check-env.ts
// CLI: in ra driver DB, storage adapter và nguồn quiz; exit 1 nếu thiếu biến bắt buộc.
//   npx tsx scripts/check-env.ts
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { checkEnv } from '../src/lib/db/check-env';

const r = checkEnv();
console.log(`db driver:       ${r.dbDriver}`);
console.log(`note storage:    ${r.storage}`);
console.log(`quiz generation: ${r.quiz}`);
for (const w of r.warnings) console.warn(`warning: ${w}`);
if (!r.ok) {
  console.error(`missing or invalid: ${r.missing.join(', ')}`);
  process.exit(1);
}
console.log('environment ok');
