import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types/database'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  profileError: string | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!session) {
        setProfile(null)
        setProfileError(null)
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('id', session.user.id)
        .single()

      if (cancelled) return

      if (error) {
        // Пользователь аутентифицирован, но для него ещё нет записи
        // в profiles (например, только что создан через Supabase Auth,
        // но администратор ещё не завёл профиль с ролью — см. supabase/README.md),
        // либо запись есть, но её не отдаёт RLS (см. код ошибки/сообщение —
        // выводим в интерфейс специально для диагностики bootstrap-сценария).
        // eslint-disable-next-line no-console
        console.error('Не удалось загрузить профиль:', error.message)
        setProfile(null)
        setProfileError(error.message)
        return
      }
      setProfile(data as Profile)
      setProfileError(null)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [session])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, profileError, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  return ctx
}
