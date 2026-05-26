import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  // Auth — verify the caller is a logged-in provider
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { customer_id, amount, notes } = await req.json()

  if (!customer_id || !amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = createAdminClient() as any

  // Verify this customer belongs to the calling provider
  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id, balance')
    .eq('id', customer_id)
    .eq('provider_id', user.id)
    .single()

  if (custErr || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const newBalance = (customer.balance ?? 0) + amount

  // Insert payment
  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      customer_id,
      provider_id: user.id,
      amount,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (payErr) {
    return NextResponse.json({ error: payErr.message }, { status: 500 })
  }

  // Update customer balance
  const { error: balErr } = await db
    .from('customers')
    .update({ balance: newBalance })
    .eq('id', customer_id)

  if (balErr) {
    console.error('[record-payment] balance update failed:', balErr)
    return NextResponse.json({ error: `Payment recorded but balance update failed: ${balErr.message}` }, { status: 500 })
  }

  // Re-fetch to confirm the write actually persisted
  const { data: confirmed } = await db
    .from('customers')
    .select('balance')
    .eq('id', customer_id)
    .single()

  const confirmedBalance = confirmed?.balance ?? newBalance

  if (confirmedBalance !== newBalance) {
    console.error('[record-payment] balance mismatch — expected', newBalance, 'got', confirmedBalance)
    return NextResponse.json({
      error: `Balance update did not persist (DB shows ${confirmedBalance}, expected ${newBalance}). Have you run the migration_unified_balance.sql in Supabase?`,
    }, { status: 500 })
  }

  return NextResponse.json({ payment, newBalance: confirmedBalance })
}
