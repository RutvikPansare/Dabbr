import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRiderInfo } from '@/lib/rider'

const VALID_STATUSES  = new Set(['pending', 'delivered', 'skipped'])
const VALID_MEAL_SLOTS = new Set(['breakfast', 'lunch', 'dinner'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { customer_id, date, meal_slot, status } = body as Record<string, unknown>

  // ── Input validation ──────────────────────────────────────────────────────
  if (!customer_id || typeof customer_id !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid customer_id' }, { status: 400 })
  }
  if (!date || typeof date !== 'string' || !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Missing or invalid date (expected YYYY-MM-DD)' }, { status: 400 })
  }
  if (!meal_slot || typeof meal_slot !== 'string' || !VALID_MEAL_SLOTS.has(meal_slot)) {
    return NextResponse.json({ error: 'Invalid meal_slot (expected breakfast|lunch|dinner)' }, { status: 400 })
  }
  if (!status || typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status (expected pending|delivered|skipped)' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Resolve provider_id — either the logged-in provider, or the provider a rider belongs to
  const riderInfo = await getRiderInfo(user.id)
  const providerId = riderInfo ? riderInfo.provider_id : user.id

  // Ownership guard + fetch balance info
  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id, balance, price_per_month')
    .eq('id', customer_id)
    .eq('provider_id', providerId)
    .single()

  if (custErr || !customer) {
    console.error('[mark-delivery] customer lookup failed:', custErr?.message)
    return NextResponse.json({ error: custErr?.message ?? 'Customer not found' }, { status: 404 })
  }

  // Snapshot: delivered count before change
  const { count: prevCount } = await db
    .from('delivery_logs')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customer_id)
    .eq('date', date)
    .eq('status', 'delivered')

  // Apply the delivery change
  if (status === 'pending') {
    const { error } = await db
      .from('delivery_logs')
      .delete()
      .eq('customer_id', customer_id)
      .eq('date', date)
      .eq('meal_slot', meal_slot)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db
      .from('delivery_logs')
      .upsert(
        { customer_id, provider_id: providerId, date, meal_slot, status, marked_at: new Date().toISOString() },
        { onConflict: 'customer_id,date,meal_slot' }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Snapshot: delivered count after change
  const { count: newCount } = await db
    .from('delivery_logs')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customer_id)
    .eq('date', date)
    .eq('status', 'delivered')

  // Balance rule: deduct one day's cost on first delivery of the day; refund when last is removed
  // balance_delta: +1 = refund, -1 = deduct (in day units; actual rupees = delta × price/30)
  let balance_delta = 0
  if ((prevCount ?? 0) === 0 && (newCount ?? 0) > 0) balance_delta = -1
  else if ((prevCount ?? 0) > 0 && (newCount ?? 0) === 0) balance_delta = 1

  let new_balance: number | null = null

  if (balance_delta !== 0 && (customer.price_per_month ?? 0) > 0) {
    const perDayCost = customer.price_per_month / 30
    const balanceChange = balance_delta * perDayCost

    // Atomic update via Postgres function — prevents race condition when two
    // concurrent deliveries both read the same stale balance and each write it.
    // Falls back to a plain UPDATE if the function doesn't exist yet.
    const { data: rpcData, error: rpcErr } = await db.rpc('increment_customer_balance', {
      p_customer_id: customer_id,
      p_delta: balanceChange,
    })

    if (rpcErr) {
      // RPC not available yet (migration pending) — fall back to fresh-read write
      console.warn('[mark-delivery] rpc fallback:', rpcErr.message)
      const { data: fresh, error: freshErr } = await db
        .from('customers')
        .select('balance')
        .eq('id', customer_id)
        .single()
      if (freshErr) {
        console.error('[mark-delivery] fresh balance read failed:', freshErr.message)
        return NextResponse.json({ error: 'Balance update failed' }, { status: 500 })
      }
      const updated = (fresh.balance ?? 0) + balanceChange
      const { error: updErr } = await db
        .from('customers')
        .update({ balance: updated })
        .eq('id', customer_id)
      if (updErr) {
        console.error('[mark-delivery] balance fallback update failed:', updErr.message)
        return NextResponse.json({ error: 'Balance update failed' }, { status: 500 })
      }
      new_balance = updated
    } else {
      new_balance = typeof rpcData === 'number' ? rpcData : null
    }
  }

  // Return new_balance so the client can display accurate value without stale local math.
  // Also include balance_delta for any callers that still rely on it.
  return NextResponse.json({ balance_delta, new_balance })
}
