import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── CSV helpers ────────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  const s = v == null ? '' : String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function csv(rows: unknown[][]): string {
  return rows.map(r => r.map(esc).join(',')).join('\r\n')
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function monthLabel(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient() as any
  const uid = user.id

  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? ''
  const from = searchParams.get('from') ?? ''
  const to   = searchParams.get('to')   ?? ''

  // ── 1. Delivery Log ──────────────────────────────────────────────────────────
  if (type === 'delivery-log') {
    const [{ data: logs }, { data: customers }] = await Promise.all([
      db.from('delivery_logs')
        .select('date, customer_id, meal_slot, status')
        .eq('provider_id', uid)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true }),
      db.from('customers')
        .select('id, name, area, whatsapp_number')
        .eq('provider_id', uid),
    ])

    const custMap: Record<string, any> = {}
    for (const c of (customers ?? [])) custMap[c.id] = c

    const header = ['Date', 'Customer Name', 'Phone', 'Area', 'Meal Slot', 'Status']
    const rows = (logs ?? []).map((l: any) => {
      const c = custMap[l.customer_id] ?? {}
      return [
        fmtDate(l.date),
        c.name ?? '',
        c.whatsapp_number ?? '',
        c.area ?? '',
        l.meal_slot ?? '',
        l.status ?? '',
      ]
    })

    return csvResponse([header, ...rows], `delivery-log-${from}-to-${to}`)
  }

  // ── 2. Daily Summary ─────────────────────────────────────────────────────────
  if (type === 'daily-summary') {
    const { data: logs } = await db
      .from('delivery_logs')
      .select('date, meal_slot, status')
      .eq('provider_id', uid)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })

    const byDate: Record<string, { delivered: number; skipped: number }> = {}
    for (const l of (logs ?? [])) {
      if (!byDate[l.date]) byDate[l.date] = { delivered: 0, skipped: 0 }
      if (l.status === 'delivered') byDate[l.date].delivered++
      else if (l.status === 'skipped') byDate[l.date].skipped++
    }

    const header = ['Date', 'Day', 'Delivered', 'Skipped', 'Total Meals']
    const rows = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => {
        const dow = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long' })
        return [fmtDate(date), dow, v.delivered, v.skipped, v.delivered + v.skipped]
      })

    return csvResponse([header, ...rows], `daily-summary-${from}-to-${to}`)
  }

  // ── 3. Revenue Report ────────────────────────────────────────────────────────
  if (type === 'revenue') {
    const [{ data: prepaid }, { data: monthly }, { data: customers }] = await Promise.all([
      db.from('payments')
        .select('recorded_at, customer_id, amount, notes')
        .eq('provider_id', uid)
        .gte('recorded_at', from)
        .lte('recorded_at', to + 'T23:59:59')
        .order('recorded_at', { ascending: true }),
      db.from('monthly_payments')
        .select('created_at, customer_id, amount, note')
        .eq('provider_id', uid)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .order('created_at', { ascending: true }),
      db.from('customers')
        .select('id, name, area, whatsapp_number, billing_type')
        .eq('provider_id', uid),
    ])

    const custMap: Record<string, any> = {}
    for (const c of (customers ?? [])) custMap[c.id] = c

    const allPayments = [
      ...(prepaid ?? []).map((p: any) => ({
        date: p.recorded_at,
        custId: p.customer_id,
        amount: p.amount,
        type: 'Prepaid',
        notes: p.notes ?? '',
      })),
      ...(monthly ?? []).map((p: any) => ({
        date: p.created_at,
        custId: p.customer_id,
        amount: p.amount,
        type: 'Monthly Settlement',
        notes: p.note ?? '',
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    const header = ['Date', 'Customer Name', 'Phone', 'Area', 'Billing Type', 'Amount (₹)', 'Notes']
    const rows = allPayments.map(p => {
      const c = custMap[p.custId] ?? {}
      return [fmtDate(p.date), c.name ?? '', c.whatsapp_number ?? '', c.area ?? '', p.type, p.amount, p.notes]
    })

    return csvResponse([header, ...rows], `revenue-${from}-to-${to}`)
  }

  // ── 4. Customer Snapshot ─────────────────────────────────────────────────────
  if (type === 'customer-snapshot') {
    const [{ data: customers }, { data: mealPlans }, { data: subscriptions }] = await Promise.all([
      db.from('customers')
        .select('id, name, whatsapp_number, area, billing_type, balance_days, meals_delivered, price_per_month, status, created_at')
        .eq('provider_id', uid)
        .order('name'),
      db.from('meal_plans').select('id, name, meal_slots, monthly_price').eq('provider_id', uid),
      db.from('subscriptions').select('customer_id, meal_plan_id, status').eq('provider_id', uid),
    ])

    const mpMap: Record<string, any> = {}
    for (const mp of (mealPlans ?? [])) mpMap[mp.id] = mp

    const activeSub: Record<string, string> = {}
    for (const s of (subscriptions ?? [])) {
      if (s.status === 'active') activeSub[s.customer_id] = s.meal_plan_id
    }

    const header = ['Customer Name', 'Phone', 'Area', 'Billing Type', 'Active Meal Plan', 'Price/Month (₹)', 'Balance Days', 'Meals Delivered', 'Status', 'Joined']
    const rows = (customers ?? []).map((c: any) => {
      const mp = mpMap[activeSub[c.id]] ?? null
      return [
        c.name,
        c.whatsapp_number,
        c.area ?? '',
        c.billing_type === 'monthly_settlement' ? 'Monthly Settlement' : 'Prepaid',
        mp?.name ?? '',
        c.price_per_month ?? 0,
        c.billing_type === 'prepaid' ? (c.balance_days ?? 0) : '',
        c.billing_type === 'monthly_settlement' ? (c.meals_delivered ?? 0) : '',
        c.status ?? 'active',
        fmtDate(c.created_at),
      ]
    })

    return csvResponse([header, ...rows], `customer-snapshot-${new Date().toISOString().slice(0, 10)}`)
  }

  // ── 5. GST Revenue Summary ───────────────────────────────────────────────────
  if (type === 'gst-summary') {
    const [{ data: prepaid }, { data: monthly }] = await Promise.all([
      db.from('payments')
        .select('recorded_at, amount')
        .eq('provider_id', uid)
        .gte('recorded_at', from)
        .lte('recorded_at', to + 'T23:59:59'),
      db.from('monthly_payments')
        .select('created_at, amount')
        .eq('provider_id', uid)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59'),
    ])

    // Group by YYYY-MM
    const byMonth: Record<string, { prepaid: number; monthly: number }> = {}
    for (const p of (prepaid ?? [])) {
      const mo = p.recorded_at.slice(0, 7)
      if (!byMonth[mo]) byMonth[mo] = { prepaid: 0, monthly: 0 }
      byMonth[mo].prepaid += p.amount
    }
    for (const p of (monthly ?? [])) {
      const mo = p.created_at.slice(0, 7)
      if (!byMonth[mo]) byMonth[mo] = { prepaid: 0, monthly: 0 }
      byMonth[mo].monthly += p.amount
    }

    const header = [
      'Month',
      'Prepaid Collections (₹)',
      'Monthly Settlement Collections (₹)',
      'Total Revenue (₹)',
      'GST @ 5% Composition (₹)',
      'Net Revenue after GST (₹)',
    ]
    const rows = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mo, v]) => {
        const total = v.prepaid + v.monthly
        const gst   = Math.round(total * 0.05 * 100) / 100
        return [monthLabel(mo + '-01'), v.prepaid, v.monthly, total, gst, Math.round((total - gst) * 100) / 100]
      })

    // Totals row
    if (rows.length > 0) {
      const totals = rows.reduce((acc, r) => {
        acc[1] = (acc[1] as number) + (r[1] as number)
        acc[2] = (acc[2] as number) + (r[2] as number)
        acc[3] = (acc[3] as number) + (r[3] as number)
        acc[4] = (acc[4] as number) + (r[4] as number)
        acc[5] = (acc[5] as number) + (r[5] as number)
        return acc
      }, ['TOTAL', 0, 0, 0, 0, 0])
      rows.push(totals)
    }

    return csvResponse([header, ...rows], `gst-summary-${from}-to-${to}`)
  }

  return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
}

function csvResponse(rows: unknown[][], filename: string) {
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}
