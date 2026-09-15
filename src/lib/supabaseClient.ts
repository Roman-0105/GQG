import { createClient } from '@supabase/supabase-js'

// URL и publishable key берутся из переменных окружения (см. .env.example).
// Publishable key — актуальный (2026) безопасный для фронтенда ключ,
// пришедший на смену устаревающему anon key (см. документацию Supabase:
// https://supabase.com/docs/guides/api/api-keys). Безопасно хранить его
// в публичном фронтенде ТОЛЬКО при правильно настроенных Row Level
// Security (RLS) политиках — доступ к данным регулируется на уровне
// базы, а не сокрытием ключа. Secret/service_role ключи сюда НЕ кладём —
// они дают полный доступ в обход RLS и предназначены только для backend.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined

// Значение может не только отсутствовать, но и быть НЕВАЛИДНЫМ (например,
// в секрет случайно попал не URL, а ключ, или ссылка без "https://").
// createClient() в обоих случаях синхронно бросает исключение при импорте
// модуля — до первого рендера React, из-за чего человек видит просто
// пустой экран без единой подсказки. Проверяем оба случая сами.
function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const hasValidUrl = isValidHttpUrl(supabaseUrl)
const hasKey = Boolean(supabasePublishableKey)

export const isSupabaseConfigured = hasValidUrl && hasKey

if (!isSupabaseConfigured) {
  const reasons: string[] = []
  if (!supabaseUrl) reasons.push('VITE_SUPABASE_URL не задан')
  else if (!hasValidUrl)
    reasons.push(
      `VITE_SUPABASE_URL задан, но не похож на корректный URL: "${supabaseUrl}"`,
    )
  if (!hasKey) reasons.push('VITE_SUPABASE_PUBLISHABLE_KEY не задан')

  // eslint-disable-next-line no-console
  console.error(
    'Supabase не настроен: ' +
      reasons.join('; ') +
      '. Локально: скопируйте .env.example в .env и заполните значениями из Settings > API Keys вашего проекта Supabase (URL выглядит как https://xxxxx.supabase.co). ' +
      'На проде (GitHub Pages): проверьте секреты репозитория в Settings > Secrets and variables > Actions.',
  )
}

export const supabase = createClient(
  hasValidUrl ? supabaseUrl : 'https://placeholder.supabase.co',
  hasKey ? (supabasePublishableKey as string) : 'placeholder-key',
)
