import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { isManagement } from '../types/roles'

const POLL_INTERVAL_MS = 60_000

// "Уведомления" в этой версии — не push, а счётчики, которые сами
// обновляются при возврате на вкладку и раз в минуту (см. ТЗ, обсуждение
// от 17.09.2026: сначала отладить механику, push — отдельная задача
// поверх уже настроенного PWA-манифеста).
export function useReportCounts() {
  const { session, profile } = useAuth()
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [needsRevision, setNeedsRevision] = useState(0)

  useEffect(() => {
    if (!session || !profile) return

    let cancelled = false

    async function load() {
      if (!profile) return
      if (isManagement(profile.role)) {
        const { count } = await supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('approval_status', 'submitted')
        if (!cancelled) setPendingApprovals(count ?? 0)
      } else if (profile.role === 'party_chief') {
        const { count } = await supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', profile.id)
          .eq('approval_status', 'rejected')
          .eq('edit_unlocked', true)
        if (!cancelled) setNeedsRevision(count ?? 0)
      }
    }

    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    window.addEventListener('focus', load)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', load)
    }
  }, [session, profile])

  return { pendingApprovals, needsRevision }
}
