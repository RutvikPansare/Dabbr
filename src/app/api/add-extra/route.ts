import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { customer_id, delivery_date, item, amount, note } = await req.json()

  if (!customer_id || !item?.trim()) {
    return NextResponse.json({ error: 'customer_id and item are required' }, { status: 400 })
  }

  const db = createAdminClient() as any

  // Verify customer belongs to provider
  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('provider_id', user.id)
    .single()

  if (custErr || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const { data: extra, error } = await db
    .from('delivery_extras')
    .insert({
      customer_id,
      provider_id: user.id,
      delivery_date: delivery_date ?? new Date().toISOString().split('T')[0],
      item: item.trim(),
      amount: Number(amount ?? 0),
      note: note?.trim() || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ extra })
}
