import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Ownership guard + fetch billing type
  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id, billing_type, balance_days, meals_delivered')
    .eq('id', customer_id)
    .eq('provider_id', user.id)
    .single()

  if (custErr || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
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
        { customer_id, provider_id: user.id, date, meal_slot, status },
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

  // Balance rule: deduct on first delivery of the day; refund when last is removed
  let balance_delta = 0
  if ((prevCount ?? 0) === 0 && (newCount ?? 0) > 0) balance_delta = -1
  else if ((prevCount ?? 0) > 0 && (newCount ?? 0) === 0) balance_delta = 1

  if (balance_delta !== 0) {
    if (customer.billing_type === 'monthly_settlement') {
      await db
        .from('customers')
        .update({ meals_delivered: Math.max(0, (customer.meals_delivered ?? 0) - balance_delta) })
        .eq('id', customer_id)
    } else {
      await db
        .from('customers')
        .update({ balance_days: Math.max(0, (customer.balance_days ?? 0) + balance_delta) })
        .eq('id', customer_id)
    }
  }

  return NextResponse.json({ balance_delta })
}
