// @vitest-environment node
// B7: the .vercelignore allow-list keeps secrets, QA scratch and Claude files
// out of any `vercel deploy` upload, while keeping everything the build needs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ignore from 'ignore'

const ig = ignore().add(readFileSync(resolve(__dirname, '../../.vercelignore'), 'utf8'))
const uploaded = (p) => !ig.ignores(p)

describe('.vercelignore', () => {
  it('never uploads QA scratch, Claude files, env files, keys or sessions', () => {
    for (const p of [
      '.qa-scratch/decoy.txt', '.qa-scratch/.qa-password', '.qa-scratch/.bypass-secret',
      '.claude/settings.local.json', '.claude/skills/genflow-qa/SKILL.md', '.claude/worktrees/x/a.js',
      '.env', '.env.local', '.env.decoy', 'api/.env', 'src/.env.production',
      'key.pem', 'api/server.key', 'src/lib/cert.pem',
      'qa-session-x.json', 'api/qa-session.json', 'src/token.json', 'storageState.json',
      'scripts/qa/safe-actions.mjs', 'playwright/tests/app.spec.js', 'test-results/.last-run.json',
      'archive/seed_document_templates.js', 'base44/entities/Job.jsonc', 'priced_parts_update.csv',
      'qb-verify-step2.mjs', 'seed_supabase.js', 'node_modules/x/index.js', 'dist/index.html',
      'src/test/auth.test.jsx', 'npm-debug.log',
    ]) expect(uploaded(p), p).toBe(false)
  })

  it('uploads everything the build and the functions need', () => {
    for (const p of [
      'api/send-email.js', 'api/_lib/staffAuth.js', 'src/main.jsx', 'src/lib/AuthContext.jsx',
      'src/lib/utils/surcharge.js', 'public/manifest.json', 'public/sw.js', 'index.html',
      'package.json', 'package-lock.json', 'vite.config.js', 'tailwind.config.js',
      'postcss.config.js', 'jsconfig.json', 'components.json', 'vercel.json',
    ]) expect(uploaded(p), p).toBe(true)
  })
})
