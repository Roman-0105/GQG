import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'

// Аудит экранов (только чтение, ничего не создаёт и не меняет).
// Для каждой роли обходит экраны, сохраняет скриншот в test-results/audit/
// и пишет в audit-report.json: ошибки консоли, горизонтальное
// переполнение (типичный мобильный баг), элементы шире экрана.
// Запуск: npx playwright test audit --project=chromium  (админ, ПК)
//         npx playwright test audit --project=mobile    (мастер, телефон)

const ADMIN = { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD }
const MASTER = { email: process.env.TEST_MASTER_EMAIL, password: process.env.TEST_MASTER_PASSWORD }

const OUT = 'test-results/audit'
const findings: Record<string, unknown>[] = []

async function login(page: Page, who: { email?: string; password?: string }) {
  await page.goto('/')
  await page.locator('input[type="email"]').fill(who.email!)
  await page.locator('input[type="password"]').fill(who.password!)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/#\/$/, { timeout: 20_000 })
}

async function visit(page: Page, tag: string, hash: string) {
  const errors: string[] = []
  const onErr = (e: Error) => errors.push(e.message)
  const onMsg = (m: import('@playwright/test').ConsoleMessage) => {
    if (m.type() === 'error') errors.push(m.text())
  }
  page.on('pageerror', onErr)
  page.on('console', onMsg)
  await page.goto(`/#${hash}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200) // анимации framer-motion
  const layout = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const wide: string[] = []
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > vw + 2 && wide.length < 8) {
        wide.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} right=${Math.round(r.right)}`)
      }
    })
    return {
      vw,
      scrollW: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > vw + 2,
      wide,
    }
  })
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true })
  page.off('pageerror', onErr)
  page.off('console', onMsg)
  findings.push({ tag, hash, url: page.url(), errors, ...layout })
}

test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true })
  const file = `${OUT}/audit-report-${Date.now()}.json`
  fs.writeFileSync(file, JSON.stringify(findings, null, 2))
})

test.describe('Аудит: админ', () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'нет TEST_USER_*')
  test('обход экранов', async ({ page }, info) => {
    test.setTimeout(240_000)
    const p = info.project.name
    await login(page, ADMIN)
    for (const [n, h] of [
      ['dashboard', '/'],
      ['sites', '/sites'],
      ['pending', '/reports/pending'],
      ['summary', '/reports/summary'],
      ['settings', '/settings'],
      ['users', '/users'],
      ['workers', '/settings/workers'],
      ['orgs', '/settings/organizations'],
      ['costs', '/settings/costs'],
      ['orgchart', '/org-chart'],
    ]) {
      await visit(page, `admin-${p}-${n}`, h)
    }
    // Первый участок и первое задание на нём
    await page.goto('/#/sites')
    const site = page.locator('a[href*="#/sites/"]').first()
    if (await site.count()) {
      await site.click()
      await visit(page, `admin-${p}-site`, new URL(page.url()).hash.slice(1))
      const dash = page.locator('a[href*="/dashboard"]').first()
      if (await dash.count()) {
        await dash.click()
        await visit(page, `admin-${p}-task-dashboard`, new URL(page.url()).hash.slice(1))
      }
    }
  })
})

test.describe('Аудит: мастер', () => {
  test.skip(!MASTER.email || !MASTER.password, 'нет TEST_MASTER_*')
  test('обход экранов', async ({ page }, info) => {
    test.setTimeout(240_000)
    const p = info.project.name
    await login(page, MASTER)
    for (const [n, h] of [
      ['dashboard', '/'],
      ['sites', '/sites'],
      ['mine', '/reports/mine'],
    ]) {
      await visit(page, `master-${p}-${n}`, h)
    }
    await page.goto('/#/sites')
    const site = page.locator('a[href*="#/sites/"]').first()
    if (await site.count()) {
      await site.click()
      await visit(page, `master-${p}-site`, new URL(page.url()).hash.slice(1))
      const dash = page.locator('a[href*="/dashboard"]').first()
      if (await dash.count()) {
        await dash.click()
        await visit(page, `master-${p}-task-dashboard`, new URL(page.url()).hash.slice(1))
        const rep = page.locator('a[href*="/reports/new"]').first()
        if (await rep.count()) {
          await rep.click()
          await visit(page, `master-${p}-report-form`, new URL(page.url()).hash.slice(1))
        }
      }
    }
  })
})
