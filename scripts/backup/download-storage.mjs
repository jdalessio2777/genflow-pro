// Downloads every storage file listed in a manifest. GET requests only.
// Usage: GF_SUPABASE_URL=... GF_SERVICE_KEY=... node download-storage.mjs <manifest.json> <output dir>
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [manifestPath, outputDir] = process.argv.slice(2);
const baseUrl = process.env.GF_SUPABASE_URL;
const key = process.env.GF_SERVICE_KEY;
if (!manifestPath || !outputDir || !baseUrl || !key) {
  console.error('download-storage: missing arguments or environment');
  process.exit(2);
}

// Legacy service_role JWTs go in Authorization too; sb_secret_ keys go only in apikey.
const headers = { apikey: key };
if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

const CONCURRENCY = 4;
const ATTEMPTS = 3;
const root = path.resolve(outputDir);
const files = JSON.parse(await readFile(manifestPath, 'utf8'));

function targetFor(file) {
  const target = path.resolve(root, file.bucket, file.name);
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`refused path outside the backup: ${file.bucket}/${file.name}`);
  }
  return target;
}

async function downloadOnce(file, target) {
  const encoded = file.name.split('/').map(encodeURIComponent).join('/');
  const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(file.bucket)}/${encoded}`;
  const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (typeof file.size === 'number' && body.length !== file.size) {
    throw new Error(`size ${body.length}, expected ${file.size}`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  return body.length;
}

const failures = [];
let totalBytes = 0;
let done = 0;
let next = 0;

async function worker() {
  while (next < files.length) {
    const file = files[next++];
    const label = `${file.bucket}/${file.name}`;
    let lastError;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        totalBytes += await downloadOnce(file, targetFor(file));
        done++;
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    if (lastError) failures.push(`${label}: ${lastError.message}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

for (const file of files) {
  if (failures.some((f) => f.startsWith(`${file.bucket}/${file.name}:`))) continue;
  await stat(targetFor(file));
}

console.log(`Storage: ${done} of ${files.length} files, ${totalBytes} bytes.`);
if (failures.length) {
  for (const f of failures) console.error(`Storage download failed: ${f}`);
  process.exit(1);
}
