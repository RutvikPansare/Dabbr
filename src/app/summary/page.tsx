import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import SummaryClient from './SummaryClient'
import Paywall from '@/components/Paywall'
import type { SummaryData, PeriodStats } from './SummaryClient'

export default async function SummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Date boundaries ──────────────────────────────────────────────────────

  const now = new Date()

  // This week — Monday to today
  const dow = now.getDay()
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - daysFromMon)
  thisWeekStart.setHours(0, 0, 0, 0)

  // This month — 1st to today
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Last week — the full week before this one
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  const lastWeekEnd = new Date(thisWeekStart)

  // Last month — full previous calendar month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)

  // Fetch from the start of last month — covers all comparison periods
  const fetchFrom = lastMonthStart.toISOString()
  const fetchFromDate = lastMonthStart.toISOString().split('T')[0]

  // ── Trial check first (separating it fixes TS tuple inference with 5+ items) ─

  const trial = await getTrialStatus(supabase, user.id)
  if (trial.isExpired) return <Paywall />

  // ── Queries (parallel) ───────────────────────────────────────────────────

  const [customersRes, subscriptionsRes, paymentsRes, deliveryRes, providerRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, status, balance, credit_limit, price_per_month, created_at')
      .eq('provider_id', user.id),
    supabase
      .from('subscriptions')
      .select('status, customers(id, status, balance, credit_limit, price_per_month, created_at), meal_plans(status, monthly_price)')
      .eq('provider_id', user.id)
      .in('status', ['active', 'paused']),
    supabase
      .from('payments')
      .select('amount, recorded_at')
      .eq('provider_id', user.id)
      .gte('recorded_at', fetchFrom),
    supabase
      .from('delivery_logs')
      .select('date, status')
      .eq('provider_id', user.id)
      .gte('date', fetchFromDate),
    supabase
      .from('providers')
      .select('name, enable_delivery_tracking')
      .eq('id', user.id)
      .single(),
  ])

  const customers = customersRes.data
  const subscriptions = subscriptionsRes.data
  const payments = paymentsRes.data
  const deliveryLogs = deliveryRes.data
  const providerRow = providerRes.data

  // ── Typed views (Supabase column-select narrows to never; cast via unknown) ──

  type CRow = { status: string; balance: number; credit_limit: number; price_per_month: number; created_at: string }
  type SRow = {
    status: string
    customers: CRow | null
    meal_plans: { status: string; monthly_price: number } | null
  }
  type PRow = { amount: number; recorded_at: string }
  type LRow = { date: string; status: string }
  type PrRow = { name: string; enable_delivery_tracking: boolean }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cList = (customers ?? []) as unknown as CRow[]
  const sList = (subscriptions ?? []) as unknown as SRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pList = (payments ?? []) as unknown as PRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lList = (deliveryLogs ?? []) as unknown as LRow[]
  const prov = providerRow as unknown as PrRow | null

  // ── Aggregation helpers ──────────────────────────────────────────────────

  function sumRevenue(list: PRow[], from: Date, to: Date): number {
    return list
      .filter(p => { const d = new Date(p.recorded_at); return d >= from && d <= to })
      .reduce((s, p) => s + Number(p.amount), 0)
  }

  function countNew(list: CRow[], from: Date, to: Date): number {
    return list.filter(c => {
      const d = new Date(c.created_at)
      return d >= from && d <= to
    }).length
  }

  function countLogs(list: LRow[], from: Date, to: Date, status: string): number {
    return list.filter(l => {
      const d = new Date(l.date + 'T00:00:00')
      return d >= from && d <= to && l.status === status
    }).length
  }

  function buildPeriodStats(from: Date, to: Date): PeriodStats {
    return {
      revenueCollected: sumRevenue(pList, from, to),
      newCustomers: countNew(cList, from, to),
      mealsDelivered: countLogs(lList, from, to, 'delivered'),
      mealsSkipped: countLogs(lList, from, to, 'skipped'),
    }
  }

  // ── Snapshot stats (current state, not period-dependent) ─────────────────

  const activeSubscriptions = sList.filter(s =>
    s.status === 'active' &&
    s.customers?.status === 'active' &&
    s.meal_plans?.status === 'active'
  )
  const activeCustomers = activeSubscriptions.map(s => ({
    ...s.customers!,
    price_per_month: Number(s.meal_plans?.monthly_price ?? s.customers?.price_per_month ?? 0),
  }))
  const overdueCustomers = activeCustomers.filter(c => c.balance <= (c.credit_limit ?? 0))
  const pendingCustomers = activeCustomers.filter(c => {
    const perDay = c.price_per_month > 0 ? c.price_per_month / 30 : 0
    const daysLeft = perDay > 0 ? c.balance / perDay : 0
    return daysLeft <= 5
  })

  const data: SummaryData = {
    activeCustomers: activeCustomers.length,
    overdueCount: overdueCustomers.length,
    overdueAmount: overdueCustomers.reduce((s, c) => s + Number(c.price_per_month), 0),
    pendingAmount: pendingCustomers.reduce((s, c) => s + Number(c.price_per_month), 0),
    pendingCount: pendingCustomers.length,
    deliveryTrackingEnabled: prov?.enable_delivery_tracking ?? true,
    providerName: prov?.name ?? '',

    thisWeek: buildPeriodStats(thisWeekStart, now),
    lastWeek: buildPeriodStats(lastWeekStart, lastWeekEnd),
    thisMonth: buildPeriodStats(thisMonthStart, now),
    lastMonth: buildPeriodStats(lastMonthStart, lastMonthEnd),
  }

  return <SummaryClient data={data} />
}
