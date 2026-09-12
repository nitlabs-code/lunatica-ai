import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { redeemLunaMax } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { UserPlan } from '../types/database'

export function usePlan(session: Session) {
  const [plan, setPlan] = useState<UserPlan | null>(null)
  const [expiredPlan, setExpiredPlan] = useState<UserPlan | null>(null)
  const [loading, setLoading] = useState(true)

  const applyPlan = useCallback((data: UserPlan | null) => {
    const isActive = data?.status === 'active' && new Date(data.expires_at).getTime() > Date.now()
    setPlan(isActive ? data : null)
    setExpiredPlan(data && !isActive ? data : null)
    return isActive ? data : null
  }, [])

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('user_plans').select('*').maybeSingle()
    if (error) throw error
    return applyPlan(data)
  }, [applyPlan])

  useEffect(() => {
    let active = true
    void supabase.from('user_plans').select('*').maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error) {
        if (import.meta.env.DEV) console.error('Falha ao carregar plano', error)
      } else {
        applyPlan(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [applyPlan])

  useEffect(() => {
    if (!plan) return
    let timer: number | undefined
    const checkExpiration = () => {
      const remaining = new Date(plan.expires_at).getTime() - Date.now()
      if (remaining <= 0) {
        applyPlan(plan)
        return
      }
      // Reconfere diariamente para não depender do limite de ~24 dias dos
      // timers do navegador em assinaturas de 30 dias.
      timer = window.setTimeout(checkExpiration, Math.min(remaining + 500, 24 * 60 * 60 * 1000))
    }
    checkExpiration()
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [applyPlan, plan])

  const redeem = useCallback(async (code: string, acceptedDisclaimer: boolean) => {
    await redeemLunaMax(session, code, acceptedDisclaimer)
    return refresh()
  }, [refresh, session])

  return { plan, expiredPlan, loading, isLunaMax: Boolean(plan), refresh, redeem }
}
