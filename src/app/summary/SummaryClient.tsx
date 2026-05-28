'use client'

import { useState } from 'react'
import BottomNav from '@/components/BottomNav'
import {
  Users, TrendingUp, TrendingDown, IndianRupee,
  CheckCircle2, XCircle, UserPlus, AlertTriangle,
  Minus, Clock,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PeriodStats {
  revenueCollected: number
  newCustomers: number
  mealsDelivered: number
  mealsSkipped: number
}

export interface SummaryData {
  activeCustomers: number
  overdueCount: number
  overdueAmount: number
  pendingAmount: number
  pendingCount: number
  deliveryTrackingEnabled: boolean
  providerName: string
  thisWeek: PeriodStats
  lastWeek: PeriodStats
  thisMonth: PeriodStats
  lastMonth: PeriodStats
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`
  return `₹${Math.round(amount)}`
}

function growth(current: number, previous: number): { pct: number; dir: 'up' | 'down' | 'same' } | null {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { pct: 0, dir: 'same' }
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' }
}

function completionRate(delivered: number, skipped: number): number | null {
  const total = delivered + skipped
  if (total === 0) return null
  return Math.round((delivered / total) * 100)
}

// ── Stat card components ───────────────────────────────────────────────────

function GrowthBadge({ current, previous }: { current: number; previous: number }) {
  const g = growth(current, previous)
  if (!g) return null
  if (g.dir === 'same') return (
    <span className="flex items-center gap-0.5 text-[11px] font-bold text-gray-400">
      <Minus className="w-3 h-3" /> Same as last
    </span>
  )
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-bold ${g.dir === 'up' ? 'text-green-600' : 'text-gray-400'}`}>
      {g.dir === 'up'
        ? <TrendingUp className="w-3 h-3" />
        : <TrendingDown className="w-3 h-3" />}
      {g.pct}% vs last
    </span>
  )
}

interface MetricCardProps {
  label: string
  value: string | number
  sub?: React.ReactNode
  icon: React.ReactNode
  iconBg: string
}

function MetricCard({ label, value, sub, icon, iconBg }: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-4">
      <div className={`inline-flex w-9 h-9 items-center justify-center rounded-xl mb-3 ${iconBg}`}>
        {icon}
      </div>
      <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
      <p className="text-xs font-bold text-gray-500 mt-1">{label}</p>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SummaryClient({ data }: { data: SummaryData }) {
  const [period, setPeriod] = useState<'week' | 'month'>('month')

  const current = period === 'week' ? data.thisWeek : data.thisMonth
  const previous = period === 'week' ? data.lastWeek : data.lastMonth
  const periodLabel = period === 'week' ? 'week' : 'month'

  const now = new Date()
  const monthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const weekLabel = (() => {
    const start = new Date(now)
    const dow = now.getDay()
    start.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – Today`
  })()

  const rate = completionRate(current.mealsDelivered, current.mealsSkipped)
  const prevRate = completionRate(previous.mealsDelivered, previous.mealsSkipped)

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Summary</h1>
            <p className="text-xs font-semibold text-orange-600/80">
              {period === 'week' ? weekLabel : monthName}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl lg:max-w-4xl px-4 lg:px-8 pt-24 pb-6 space-y-5">

        {/* Period tabs */}
        <div className="flex rounded-2xl bg-white/50 p-1.5 shadow-inner border border-gray-200/50 gap-1">
          {(['month', 'week'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                period === p
                  ? 'bg-white text-orange-600 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-gray-100'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'
              }`}
            >
              {p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>

        {/* Snapshot strip — current state, not period-sensitive */}
        <div className="flex gap-2.5">
          <div className="flex-1 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Active</p>
            </div>
            <p className="text-3xl font-black text-gray-900 leading-none">{data.activeCustomers}</p>
            <p className="text-[11px] font-medium text-gray-400 mt-1">customers</p>
          </div>

          {data.overdueCount > 0 ? (
            <div className="flex-1 rounded-2xl bg-red-50 border border-red-100 shadow-sm px-4 py-3.5">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Overdue</p>
              </div>
              <p className="text-3xl font-black text-red-600 leading-none">{data.overdueCount}</p>
              <p className="text-[11px] font-medium text-red-400 mt-1">
                {fmt(data.overdueAmount)} pending
              </p>
            </div>
          ) : (
            <div className="flex-1 rounded-2xl bg-green-50 border border-green-100 shadow-sm px-4 py-3.5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Payments</p>
              </div>
              <p className="text-lg font-black text-green-700 leading-none mt-1">All clear</p>
              <p className="text-[11px] font-medium text-green-500 mt-1">no one overdue</p>
            </div>
          )}
        </div>

        {/* Hero — Revenue Collected */}
        <div className="rounded-[1.75rem] bg-gradient-to-br from-[#FF7B3F] to-[#C93F0A] px-6 py-6 shadow-[0_8px_30px_rgba(244,98,42,0.25)] text-white overflow-hidden relative">
          {/* Subtle decorative ring */}
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -right-2 -bottom-10 w-32 h-32 rounded-full bg-white/5" />

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                Revenue Collected
              </p>
              <IndianRupee className="w-5 h-5 text-white/50" />
            </div>
            <p className="text-4xl font-black leading-none mt-2">
              {current.revenueCollected === 0 ? '₹0' : fmt(current.revenueCollected)}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {current.revenueCollected === 0 ? (
                <p className="text-xs text-white/60">No payments recorded this {periodLabel}</p>
              ) : (
                <>
                  <GrowthBadgeDark current={current.revenueCollected} previous={previous.revenueCollected} />
                  {previous.revenueCollected > 0 && (
                    <span className="text-xs text-white/50">
                      vs {fmt(previous.revenueCollected)} last {periodLabel}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pending Payments card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex w-10 h-10 items-center justify-center rounded-xl bg-amber-100 shrink-0">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pending Payments</p>
              <p className="text-xs text-gray-400 mt-0.5">{data.pendingCount} customer{data.pendingCount !== 1 ? 's' : ''} due within 5 days</p>
            </div>
          </div>
          <p className={`text-xl font-black shrink-0 ${data.pendingAmount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
            {data.pendingAmount > 0 ? fmt(data.pendingAmount) : '₹0'}
          </p>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard
            label="New Customers"
            value={current.newCustomers}
            icon={<UserPlus className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-100"
            sub={<GrowthBadge current={current.newCustomers} previous={previous.newCustomers} />}
          />
          {data.deliveryTrackingEnabled ? (
            <MetricCard
              label="Meals Delivered"
              value={current.mealsDelivered}
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              iconBg="bg-emerald-100"
              sub={<GrowthBadge current={current.mealsDelivered} previous={previous.mealsDelivered} />}
            />
          ) : (
            <MetricCard
              label="Active Customers"
              value={data.activeCustomers}
              icon={<Users className="w-4 h-4 text-blue-600" />}
              iconBg="bg-blue-100"
            />
          )}
          {data.deliveryTrackingEnabled && (current.mealsDelivered + current.mealsSkipped) > 0 && (
            <div className="hidden lg:block">
              <MetricCard
                label="Meals Skipped"
                value={current.mealsSkipped}
                icon={<XCircle className="w-4 h-4 text-gray-400" />}
                iconBg="bg-gray-100"
                sub={<GrowthBadge current={previous.mealsSkipped} previous={current.mealsSkipped} />}
              />
            </div>
          )}
        </div>

        {/* Delivery breakdown — only if tracking is on and there's data */}
        {data.deliveryTrackingEnabled && (current.mealsDelivered > 0 || current.mealsSkipped > 0) && (
          <div className="rounded-[1.75rem] bg-white border border-gray-100 shadow-sm px-5 py-5">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-4">
              Delivery Breakdown
            </p>

            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-3xl font-black text-gray-900">
                  {rate !== null ? `${rate}%` : '—'}
                </p>
                <p className="text-xs font-bold text-gray-500 mt-0.5">completion rate</p>
              </div>
              {rate !== null && prevRate !== null && (
                <GrowthBadge current={rate} previous={prevRate} />
              )}
            </div>

            {/* Progress bar */}
            {rate !== null && (
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${rate}%` }}
                />
              </div>
            )}

            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm font-bold text-gray-700">{current.mealsDelivered}</span>
                <span className="text-xs text-gray-400">delivered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                <span className="text-sm font-bold text-gray-700">{current.mealsSkipped}</span>
                <span className="text-xs text-gray-400">skipped</span>
              </div>
            </div>
          </div>
        )}

        {/* Empty delivery state — tracking on but no logs yet */}
        {data.deliveryTrackingEnabled && current.mealsDelivered === 0 && current.mealsSkipped === 0 && (
          <div className="rounded-[1.75rem] bg-white border border-gray-100 shadow-sm px-5 py-6 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-gray-200 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-500">No deliveries tracked this {periodLabel}</p>
              <p className="text-xs text-gray-400 mt-0.5">Mark deliveries from the Home screen</p>
            </div>
          </div>
        )}

        {/* Motivational footer */}
        <p className="text-center text-xs text-gray-400 pb-2">
          {data.activeCustomers > 0
            ? `${data.activeCustomers} customers trust you with their daily meals.`
            : 'Add your first customer to get started.'}
        </p>

      </main>

      <BottomNav />
    </div>
  )
}

// Dark variant for the hero card
function GrowthBadgeDark({ current, previous }: { current: number; previous: number }) {
  const g = growth(current, previous)
  if (!g) return null
  if (g.dir === 'same') return (
    <span className="flex items-center gap-0.5 text-xs font-bold text-white/60">
      <Minus className="w-3 h-3" /> Same as last
    </span>
  )
  return (
    <span className={`flex items-center gap-1 text-xs font-bold rounded-lg px-2 py-1 ${
      g.dir === 'up' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'
    }`}>
      {g.dir === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {g.pct}%
    </span>
  )
}
