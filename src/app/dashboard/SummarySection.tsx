'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp, Users, AlertTriangle, CheckCircle2,
  IndianRupee, ChevronRight, TrendingDown, Minus,
} from 'lucide-react'

interface SummaryStats {
  activeCustomers: number
  overdueCount: number
  overdueAmount: number
  thisMonthRevenue: number
  lastMonthRevenue: number
  thisMonthDelivered: number
  thisMonthSkipped: number
  deliveryTrackingEnabled: boolean
}

function fmt(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`
  return `₹${amount}`
}

function growthPct(current: number, previous: number) {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export default function SummarySection({ userId, deliveryTrackingEnabled }: {
  userId: string
  deliveryTrackingEnabled: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const sectionRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<SummaryStats | null>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loaded) {
          fetchStats()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  async function fetchStats() {
    setLoading(true)
    setLoaded(true)

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1)

    const [customersRes, paymentsRes, deliveryRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id, status, balance, credit_limit, price_per_month')
        .eq('provider_id', userId),
      supabase
        .from('payments')
        .select('amount, recorded_at')
        .eq('provider_id', userId)
        .gte('recorded_at', lastMonthStart.toISOString()),
      db
        .from('delivery_logs')
        .select('date, status')
        .eq('provider_id', userId)
        .gte('date', lastMonthStart.toISOString().split('T')[0]),
    ])

    const customers = (customersRes.data ?? []) as { status: string; balance: number; credit_limit: number; price_per_month: number }[]
    const payments  = (paymentsRes.data ?? [])  as { amount: number; recorded_at: string }[]
    const logs      = (deliveryRes.data ?? [])   as { date: string; status: string }[]

    const activeCustomers  = customers.filter(c => c.status === 'active').length
    const overdueCustomers = customers.filter(c => c.status === 'active' && c.balance <= (c.credit_limit ?? 0))

    function sumRevenue(from: Date, to: Date) {
      return payments
        .filter(p => { const d = new Date(p.recorded_at); return d >= from && d <= to })
        .reduce((s, p) => s + Number(p.amount), 0)
    }

    function countLogs(from: Date, to: Date, status: string) {
      return logs.filter(l => {
        const d = new Date(l.date + 'T00:00:00')
        return d >= from && d <= to && l.status === status
      }).length
    }

    setStats({
      activeCustomers,
      overdueCount: overdueCustomers.length,
      overdueAmount: overdueCustomers.length * 0, // just count for now
      thisMonthRevenue: sumRevenue(thisMonthStart, now),
      lastMonthRevenue: sumRevenue(lastMonthStart, lastMonthEnd),
      thisMonthDelivered: countLogs(thisMonthStart, now, 'delivered'),
      thisMonthSkipped:   countLogs(thisMonthStart, now, 'skipped'),
      deliveryTrackingEnabled,
    })
    setLoading(false)
  }

  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const pct = stats ? growthPct(stats.thisMonthRevenue, stats.lastMonthRevenue) : null

  return (
    <section ref={sectionRef} className="mb-8">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-100 rounded-xl">
              <TrendingUp className="w-4 h-4 text-orange-600" />
            </span>
            This Month
          </h2>
          <p className="text-xs font-medium text-gray-500 mt-0.5">{monthName}</p>
        </div>
        <button
          onClick={() => router.push('/summary')}
          className="flex items-center gap-1 text-xs font-bold text-orange-500 active:scale-95 transition-all"
        >
          Full summary <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading || !stats ? (
        /* Skeleton */
        <div className="space-y-3">
          <div className="h-28 rounded-3xl bg-gray-100 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
            <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Revenue hero */}
          <div className="rounded-3xl bg-gradient-to-br from-[#FF7B3F] to-[#C93F0A] px-5 py-5 shadow-[0_8px_30px_rgba(244,98,42,0.2)] text-white relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/5" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-1">Revenue Collected</p>
            <p className="text-3xl font-black leading-none">
              {stats.thisMonthRevenue === 0 ? '₹0' : fmt(stats.thisMonthRevenue)}
            </p>
            {pct !== null && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`flex items-center gap-1 text-[11px] font-bold rounded-lg px-2 py-1 ${
                  pct > 0 ? 'bg-white/20 text-white' : pct < 0 ? 'bg-white/10 text-white/60' : 'bg-white/10 text-white/60'
                }`}>
                  {pct > 0 ? <TrendingUp className="w-3 h-3" /> : pct < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {pct === 0 ? 'Same as last month' : `${Math.abs(pct)}% vs last month`}
                </span>
              </div>
            )}
            <IndianRupee className="absolute right-5 top-5 w-5 h-5 text-white/20" />
          </div>

          {/* Snapshot row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card rounded-2xl px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3.5 h-3.5 text-orange-500" />
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Active</p>
              </div>
              <p className="text-2xl font-black text-gray-900 leading-none">{stats.activeCustomers}</p>
              <p className="text-[11px] text-gray-400 mt-1">customers</p>
            </div>

            {stats.overdueCount > 0 ? (
              <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-[11px] font-bold text-red-500 uppercase tracking-wide">Overdue</p>
                </div>
                <p className="text-2xl font-black text-red-600 leading-none">{stats.overdueCount}</p>
                <p className="text-[11px] text-red-400 mt-1">balance expired</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-green-50 border border-green-100 px-4 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <p className="text-[11px] font-bold text-green-600 uppercase tracking-wide">Payments</p>
                </div>
                <p className="text-base font-black text-green-700 leading-none mt-1">All clear</p>
                <p className="text-[11px] text-green-500 mt-1">no one overdue</p>
              </div>
            )}
          </div>

          {/* Delivery rate — only if tracking on and there's data */}
          {deliveryTrackingEnabled && (stats.thisMonthDelivered > 0 || stats.thisMonthSkipped > 0) && (() => {
            const total = stats.thisMonthDelivered + stats.thisMonthSkipped
            const rate = Math.round((stats.thisMonthDelivered / total) * 100)
            return (
              <div className="glass-card rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Delivery Rate</p>
                  <p className="text-lg font-black text-gray-900">{rate}%</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <div className="flex gap-4 mt-2">
                  <span className="text-[11px] text-gray-400">✓ {stats.thisMonthDelivered} delivered</span>
                  <span className="text-[11px] text-gray-400">— {stats.thisMonthSkipped} skipped</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </section>
  )
}
