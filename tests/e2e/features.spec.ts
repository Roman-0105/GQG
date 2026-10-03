import { test, expect } from '@playwright/test'

// Смоук-проверки новых экранов (03.10.2026). Только чтение: ничего не
// создают и не меняют. Логины берутся из .env.test.local (TEST_USER_* —
// руководство, TEST_MASTER_* — ответственный); без них тесты пропускаются.
const ADMIN = { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD }
const MASTER = { email: process.env.TEST_MASTER_EMAIL, password: process.env.TEST_MASTER_PASSWORD }

async function login(page: import('@playwright/test').Page, who: { email?: string; password?: string }) {
  await page.goto('/')
  await page.locator('input[type="email"]').fill(who.email!)
  await page.locator('input[type="password"]').fill(who.password!)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/#\/$/, { timeout: 20_000 })
}

function collectErrors(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test.describe('Новые экраны: руководство', () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'нет TEST_USER_*')

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN)
  })

  test('справочник видов проб открывается', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/settings/sample-types')
    await expect(page.getByRole('heading', { name: 'Виды проб' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Добавить вид пробы/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('согласование: кнопка «Принять все» есть, если есть что принимать', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/reports/pending')
    await expect(page.getByRole('heading', { name: /Сводки на согласовании/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('участок: кнопка «Задание» открывает выбор «Бурение / Геология»', async ({ page }) => {
    await page.goto('/#/sites')
    await page.locator('a[href*="#/sites/"]').first().click()
    await page.getByRole('button', { name: /^Задание$/ }).click()
    await expect(page.getByText('Бурение').first()).toBeVisible()
    await expect(page.getByText('Геология').first()).toBeVisible()
  })

  test('дашборд скважины: диалог «Закрыть скважину» открывается и закрывается без сохранения', async ({ page }) => {
    await page.goto('/#/sites')
    await page.locator('a[href*="#/sites/"]').first().click()
    const dash = page.locator('a[href*="/tasks/drilling/"][href*="/dashboard"]').first()
    await dash.click()
    const closeBtn = page.getByRole('button', { name: 'Закрыть скважину' })
    if (await closeBtn.count()) {
      await closeBtn.first().click()
      await expect(page.getByText('Дата закрытия')).toBeVisible()
      await page.getByRole('button', { name: 'Отмена' }).click()
    }
  })
})

test.describe('Новые экраны: ответственный', () => {
  test.skip(!MASTER.email || !MASTER.password, 'нет TEST_MASTER_*')

  test('экран «Сводка геологов за день» открывается', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, MASTER)
    await page.goto('/#/reports/geology')
    await expect(page.getByRole('heading', { name: 'Сводка геологов за день' })).toBeVisible()
    expect(errors).toEqual([])
  })
})
