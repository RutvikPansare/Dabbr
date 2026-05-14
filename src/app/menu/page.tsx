import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import Paywall from '@/components/Paywall'
import MenuPlannerClient from './MenuPlannerClient'

function weekBounds() {
  const now = new Date()
  const dow = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export default async function MenuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { start, end } = weekBounds()
  const [{ data: menus }, trial] = await Promise.all([
    supabase
      .from('daily_menus')
      .select('*')
      .eq('provider_id', user.id)
      .gte('menu_date', start)
      .lte('menu_date', end)
      .order('menu_date')
      .order('meal_slot'),
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return <MenuPlannerClient providerId={user.id} initialMenus={menus ?? []} initialWeekStart={start} />
}
