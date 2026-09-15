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

// createClient() из @supabase/supabase-js синхронно бросает исключение
// при пустом URL/ключе — если не отловить это здесь, всё React-приложение
// падает при загрузке модуля, ещё до первого рендера, и человек видит
// просто пустой экран без единой подсказки, что пошло не так.
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    'Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Локально: скопируйте .env.example в .env и заполните значениями из Settings > API Keys вашего проекта Supabase. ' +
      'На проде (GitHub Pages): проверьте секреты репозитория с точно такими именами в Settings > Secrets and variables > Actions.',
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabasePublishableKey || 'placeholder-key',
)
