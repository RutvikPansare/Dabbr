'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface Stats {
  revenue: number
  lastRevenue: number
  active: number
  overdue: number
}

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}k`
  return `₹${n}`
}

export default function SideNavStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const now       = new Date()
      const thisStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

      const [custRes, payRes] = await Promise.all([
        supabase
          .from('customers')
          .select('status, balance, credit_limit')
          .eq('provider_id', user.id),
        supabase
          .from('payments')
          .select('amount, recorded_at')
          .eq('provider_id', user.id)
          .gte('recorded_at', lastStart.toISOString()),
      ])

      const customers = (custRes.data ?? []) as { status: string; balance: number; credit_limit: number }[]
      const payments  = (payRes.data ?? [])  as { amount: number; recorded_at: string }[]

      const sum = (from: Date, to: Date) =>
        payments
          .filter(p => { const d = new Date(p.recorded_at); return d >= from && d <= to })
          .reduce((s, p) => s + Number(p.amount), 0)

      setStats({
        revenue:      sum(thisStart, now),
        lastRevenue:  sum(lastStart, thisStart),
        active:       customers.filter(c => c.status === 'active').length,
        overdue:      customers.filter(c => c.status === 'active' && c.balance <= (c.credit_limit ?? 0)).length,
      })
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!stats) return null

  const pct = stats.lastRevenue > 0
    ? Math.round(((stats.revenue - stats.lastRevenue) / stats.lastRevenue) * 100)
    : null

  const monthName = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

  return (
    <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
      {/* Label */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 mb-2">
        {monthName}
      </p>

      {/* Revenue tile */}
      <div className="rounded-xl bg-orange-50 px-3 py-2.5 mb-2">
        <p className="text-[10px] font-semibold text-orange-400 mb-0.5 leading-none">Revenue</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-black text-orange-600 leading-none">
            {fmt(stats.revenue)}
          </span>
          {pct !== null && (
            <span className={`flex items-center gap-0.5 text-[10px] font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {pct >= 0
                ? <TrendingUp className="w-2.5 h-2.5" />
                : <TrendingDown className="w-2.5 h-2.5" />}
              {Math.abs(pct)}%
            </span>
          )}
        </div>
      </div>

      {/* Active + Overdue row */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl bg-gray-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold text-gray-400 leading-none mb-0.5">Active</p>
          <p className="text-[15px] font-black text-gray-900 leading-none">{stats.active}</p>
        </div>

        {stats.overdue > 0 ? (
          <div className="flex-1 rounded-xl bg-red-50 px-2.5 py-2">
            <p className="text-[10px] font-semibold text-red-400 leading-none mb-0.5">Overdue</p>
            <p className="text-[15px] font-black text-red-600 leading-none">{stats.overdue}</p>
          </div>
        ) : (
          <div className="flex-1 rounded-xl bg-emerald-50 px-2.5 py-2">
            <p className="text-[10px] font-semibold text-emerald-500 leading-none mb-0.5">All clear</p>
            <p className="text-[13px] font-black text-emerald-600 leading-none">✓</p>
          </div>
        )}
      </div>
    </div>
  )
}
