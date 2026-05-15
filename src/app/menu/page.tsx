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
    today: now.toISOString().split('T')[0],
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function MenuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { today, start, end } = weekBounds()
  const historyStart = addDays(start, -90)
  const [{ data: menus }, { data: historyMenus }, { data: quickTags }, trial] = await Promise.all([
    supabase
      .from('daily_menus')
      .select('*')
      .eq('provider_id', user.id)
      .gte('menu_date', start)
      .lte('menu_date', end)
      .order('menu_date')
      .order('meal_slot'),
    supabase
      .from('daily_menus')
      .select('*')
      .eq('provider_id', user.id)
      .gte('menu_date', historyStart)
      .lte('menu_date', end)
      .order('menu_date')
      .order('meal_slot'),
    supabase
      .from('menu_quick_tags')
      .select('*')
      .eq('provider_id', user.id)
      .order('meal_slot')
      .order('plan_type')
      .order('sort_order'),
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return <MenuPlannerClient providerId={user.id} initialMenus={menus ?? []} initialHistoryMenus={historyMenus ?? []} initialQuickTags={quickTags ?? []} initialWeekStart={start} initialToday={today} />
}
