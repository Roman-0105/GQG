import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined

// Зачем отдельный клиент: создание нового пользователя Supabase Auth без
// backend'а с secret-ключом делается через обычный supabase.auth.signUp()
// (доступен с publishable key). Но если вызвать его на ОСНОВНОМ клиенте,
// он молча заменит текущую сессию сессией нового пользователя — гендир,
// создающий сотрудника, окажется разлогинен и залогинен как этот
// сотрудник. persistSession: false здесь означает, что этот клиент
// вообще не трогает localStorage и не пересекается с основной сессией.
//
// Ограничение подхода: signUp() — публичный метод, доступный с любым
// publishable key, а не только из этого экрана. Реальная защита от
// стороннего использования — RLS на profiles (создать профиль с ролью
// может только management), так что "голая" учётная запись без профиля
// никакого доступа не даёт. Если нужно полностью закрытое приглашение
// (без публичного signUp вообще) — это делается через Supabase Edge
// Function с secret-ключом на стороне Supabase, можно добавить позже.
export function createAuxSupabaseClient() {
  return createClient(supabaseUrl ?? '', supabasePublishableKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
