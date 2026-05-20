import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import Paywall from '@/components/Paywall'
import MenuPlannerClient from './MenuPlannerClient'

function weekBounds() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const now = new Date(`${todayStr}T12:00:00`)
  const dow = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    today: todayStr,
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
  const [{ data: menus }, { data: historyMenus }, { data: quickTags }, { data: provider }, { data: holidays }, trial] = await Promise.all([
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
    supabase
      .from('providers')
      .select('off_days')
      .eq('id', user.id)
      .single(),
    supabase
      .from('provider_holidays')
      .select('date, label')
      .eq('provider_id', user.id)
      .gte('date', start)
      .lte('date', end),
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  const offDays: number[] = (provider as any)?.off_days ?? []
  const holidayMap: Record<string, string | null> = {}
  for (const h of (holidays ?? [])) holidayMap[(h as any).date] = (h as any).label ?? null

  return (
    <MenuPlannerClient
      providerId={user.id}
      initialMenus={menus ?? []}
      initialHistoryMenus={historyMenus ?? []}
      initialQuickTags={quickTags ?? []}
      initialWeekStart={start}
      initialToday={today}
      initialOffDays={offDays}
      initialHolidayMap={holidayMap}
    />
  )
}
