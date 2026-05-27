import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRiderInfo } from '@/lib/rider'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { customer_id, date, meal_slot, status } = await req.json()

  if (!customer_id || !date || !meal_slot || !status) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
    console.error('[mark-delivery] customer lookup failed:', custErr?.message, custErr)
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
  let balance_delta = 0
  if ((prevCount ?? 0) === 0 && (newCount ?? 0) > 0) balance_delta = -1
  else if ((prevCount ?? 0) > 0 && (newCount ?? 0) === 0) balance_delta = 1

  if (balance_delta !== 0 && (customer.price_per_month ?? 0) > 0) {
    const perDayCost = customer.price_per_month / 30
    const balanceChange = balance_delta * perDayCost
    const newBalance = (customer.balance ?? 0) + balanceChange
    const { error: balErr } = await db
      .from('customers')
      .update({ balance: newBalance })
      .eq('id', customer_id)
    if (balErr) {
      console.error('[mark-delivery] balance update failed:', balErr.message)
    }
  }

  return NextResponse.json({ balance_delta })
}
