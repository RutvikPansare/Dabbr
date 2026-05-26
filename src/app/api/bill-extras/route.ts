import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { customer_id, delivery_date } = await req.json()

  if (!customer_id || !delivery_date) {
    return NextResponse.json({ error: 'customer_id and delivery_date are required' }, { status: 400 })
  }

  const db = createAdminClient() as any

  // Fetch all pending extras for this customer+date
  const { data: extras, error: extErr } = await db
    .from('delivery_extras')
    .select('id, amount')
    .eq('customer_id', customer_id)
    .eq('provider_id', user.id)
    .eq('delivery_date', delivery_date)
    .eq('status', 'pending')

  if (extErr) {
    return NextResponse.json({ error: extErr.message }, { status: 500 })
  }

  if (!extras || extras.length === 0) {
    return NextResponse.json({ billed: 0, newBalance: null })
  }

  const total = extras.reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0)

  if (total === 0) {
    // Nothing to deduct but mark as billed so they don't re-trigger
    await db
      .from('delivery_extras')
      .update({ status: 'billed', billed_at: new Date().toISOString() })
      .in('id', extras.map((e: { id: string }) => e.id))
    return NextResponse.json({ billed: 0, newBalance: null })
  }

  // Fetch current balance
  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('balance')
    .eq('id', customer_id)
    .eq('provider_id', user.id)
    .single()

  if (custErr || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const newBalance = Number(customer.balance) - total

  // Deduct from balance + mark extras billed atomically-ish (two writes, both admin client)
  const [balErr, billedErr] = await Promise.all([
    db.from('customers')
      .update({ balance: newBalance })
      .eq('id', customer_id)
      .then(({ error }: { error: unknown }) => error),
    db.from('delivery_extras')
      .update({ status: 'billed', billed_at: new Date().toISOString() })
      .in('id', extras.map((e: { id: string }) => e.id))
      .then(({ error }: { error: unknown }) => error),
  ])

  if (balErr) {
    console.error('[bill-extras] balance update failed:', balErr)
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }
  if (billedErr) {
    console.error('[bill-extras] marking billed failed:', billedErr)
    // Balance was already deducted — non-fatal, extras just show pending still
  }

  return NextResponse.json({ billed: total, newBalance, extraCount: extras.length })
}
