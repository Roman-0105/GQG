import { test, expect } from '@playwright/test'

// Авторизованные smoke-тесты (25.09.2026, добавлено как защитная сетка
// перед редизайном) — намеренно НЕ хранят никаких паролей в репозитории.
// Локально: создайте .env.test.local (в .gitignore) с
//   TEST_USER_EMAIL=...
//   TEST_USER_PASSWORD=...
// — учётку лучше завести отдельную, техдир/гендир, не боевую. Без этих
// переменных весь файл аккуратно скипается (не падает, не блокирует
// npm run build/CI), см. test.skip ниже.
const EMAIL = process.env.TEST_USER_EMAIL
const PASSWORD = process.env.TEST_USER_PASSWORD

test.describe('Авторизованные экраны (management)', () => {
  test.skip(
    !EMAIL || !PASSWORD,
    'TEST_USER_EMAIL/TEST_USER_PASSWORD не заданы — см. комментарий в начале файла',
  )

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/#\/$|#\/$/, { timeout: 15_000 })
  })

  function collectErrors(page: import('@playwright/test').Page) {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    return errors
  }

  test('дашборд открывается без ошибок в консоли', async ({ page }) => {
    const errors = collectErrors(page)
    await expect(page.getByText('Участки').first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('участки открываются без ошибок в консоли', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/sites')
    await expect(page.getByRole('heading', { name: 'Участки работ' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('оргструктура открывается, дерево рендерится в pan/zoom-контейнере', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/org-chart')
    await expect(page.getByRole('heading', { name: 'Оргструктура' })).toBeVisible()
    // PanZoomViewport (25.09.2026, заменил overflow-x:auto после отзыва
    // "линии заходят на карточки, вся схема не видна") — проверяем, что
    // контейнер и кнопки масштаба реально на странице, а клик по узлу
    // всё ещё открывает модалку (главный риск pan/zoom-обёртки — что
    // перехват pointer-событий сломает клик).
    await expect(page.locator('.pan-zoom-viewport')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Показать всю схему' })).toBeVisible()
    await page.locator('.org-node-btn').first().click()
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('пользователи открываются без ошибок в консоли', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/users')
    await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible()
    expect(errors).toEqual([])
  })
})
