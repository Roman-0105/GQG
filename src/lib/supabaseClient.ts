import { createClient } from '@supabase/supabase-js'

// URL и anon key берутся из переменных окружения (см. .env.example).
// anon key безопасно хранить в публичном фронтенде ТОЛЬКО при правильно
// настроенных Row Level Security (RLS) политиках в Supabase — доступ
// к данным регулируется на уровне базы, а не сокрытием ключа.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Явная ошибка в консоли лучше, чем молчаливый сбой запросов к БД.
  // eslint-disable-next-line no-console
  console.error(
    'Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Скопируйте .env.example в .env и заполните значениями из настроек проекта Supabase.',
  )
}

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? '',
)
