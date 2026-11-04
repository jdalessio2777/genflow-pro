// The Edge Function can't import from src/, so it keeps exact copies of the pure
// rule files. Run this after changing one; src/test/connector.test.js fails if they drift.
import fs from 'node:fs'; import path from 'node:path';
export const SHARED = ['arrivalWindow.js', 'generatorInfo.js', 'jobTechs.js', 'jobTypes.js', 'jobDuration.js'];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/%20/g, ' ').replace(/%28/g, '(').replace(/%29/g, ')')), '../..');
if (process.argv[1] && process.argv[1].endsWith('sync-shared.mjs')) {
  for (const f of SHARED) fs.copyFileSync(path.join(root, 'src/lib', f), path.join(root, 'supabase/functions/genflow-mcp/shared', f));
  console.log('copied', SHARED.join(', '));
}
