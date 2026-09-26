import { test, expect } from '@playwright/test'

// Публичный экран — не требует учётных данных, можно гонять всегда,
// в т.ч. в CI без секретов. Проверяет, что страница входа реально
// рендерится (а не падает с белым экраном/ошибкой конфигурации Supabase,
// см. fix/supabase-config-crash-guard в истории коммитов — это уже
// один раз ломалось).
test.describe('Страница входа', () => {
  test('рендерится с формой email/пароль', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()

    expect(errors, `Console/page errors on login screen: ${errors.join('; ')}`).toEqual([])
  })

  test('неавторизованный доступ к защищённому роуту уводит на /login', async ({ page }) => {
    await page.goto('/#/users')
    await expect(page).toHaveURL(/#\/login/)
  })
})
