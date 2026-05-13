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

  // ── Queries (parallel) ───────────────────────────────────────────────────

  const [
    { data: customers },
    { data: payments },
    { data: deliveryLogs },
    { data: providerRow },
    trial,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id, status, balance_days, price_per_month, created_at')
      .eq('provider_id', user.id),
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
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  // ── Aggregation helpers ──────────────────────────────────────────────────

  type Payment = { amount: number; recorded_at: string }
  type Customer = { status: string; balance_days: number; price_per_month: number; created_at: string }
  type Log = { date: string; status: string }

  function sumRevenue(list: Payment[] | null, from: Date, to: Date): number {
    return (list ?? [])
      .filter(p => { const d = new Date(p.recorded_at); return d >= from && d <= to })
      .reduce((s, p) => s + Number(p.amount), 0)
  }

  function countNew(list: Customer[] | null, from: Date, to: Date): number {
    return (list ?? []).filter(c => {
      const d = new Date(c.created_at)
      return d >= from && d <= to
    }).length
  }

  function countLogs(list: Log[] | null, from: Date, to: Date, status: string): number {
    return (list ?? []).filter(l => {
      const d = new Date(l.date + 'T00:00:00')
      return d >= from && d <= to && l.status === status
    }).length
  }

  function buildPeriodStats(from: Date, to: Date): PeriodStats {
    return {
      revenueCollected: sumRevenue(payments, from, to),
      newCustomers: countNew(customers, from, to),
      mealsDelivered: countLogs(deliveryLogs, from, to, 'delivered'),
      mealsSkipped: countLogs(deliveryLogs, from, to, 'skipped'),
    }
  }

  // ── Snapshot stats (current state, not period-dependent) ─────────────────

  const activeCustomers = (customers ?? []).filter(c => c.status === 'active')
  const overdueCustomers = activeCustomers.filter(c => c.balance_days <= 0)

  const data: SummaryData = {
    activeCustomers: activeCustomers.length,
    overdueCount: overdueCustomers.length,
    overdueAmount: overdueCustomers.reduce((s, c) => s + Number(c.price_per_month), 0),
    deliveryTrackingEnabled: providerRow?.enable_delivery_tracking ?? false,
    providerName: providerRow?.name ?? '',

    thisWeek: buildPeriodStats(thisWeekStart, now),
    lastWeek: buildPeriodStats(lastWeekStart, lastWeekEnd),
    thisMonth: buildPeriodStats(thisMonthStart, now),
    lastMonth: buildPeriodStats(lastMonthStart, lastMonthEnd),
  }

  return <SummaryClient data={data} />
}
