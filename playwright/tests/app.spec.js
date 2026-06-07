import { test, expect } from '@playwright/test'

test.describe('App loads and routes correctly', () => {
  test('root route renders without crashing', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/')
    // Either redirects to /login or renders the app — both are valid
    await page.waitForLoadState('networkidle')

    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('login page renders Sign in with Google button', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const btn = page.getByRole('button', { name: /sign in with google/i })
    await expect(btn).toBeVisible()
  })

  test('login page shows GenShield team members only text', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('GenShield team members only')).toBeVisible()
  })

  test('login page shows GenFlow Pro heading', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /genflow pro/i })).toBeVisible()
  })

  test('root redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should end up on /login (since no session exists)
    await expect(page).toHaveURL(/\/login/)
  })

  test('auth callback page renders without crashing', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/auth/callback')
    await page.waitForLoadState('networkidle')

    // Page should render something (loading or redirect) — not a blank white crash
    const body = await page.locator('body').textContent()
    expect(body).not.toBeNull()
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('no JavaScript errors on login page', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('login page has Google SVG icon', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // The Google button contains a coloured SVG
    const svg = page.locator('button svg')
    await expect(svg).toBeVisible()
  })
})
