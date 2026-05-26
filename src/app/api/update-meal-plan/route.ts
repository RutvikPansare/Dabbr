import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  // Auth — verify caller is a logged-in provider
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planId, payload, applyToCustomers, oldPrice, newPrice } = await req.json()

  if (!planId || !payload) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = createAdminClient() as any

  // Verify this plan belongs to the calling provider
  const { data: existingPlan, error: planErr } = await db
    .from('meal_plans')
    .select('id, monthly_price')
    .eq('id', planId)
    .eq('provider_id', user.id)
    .single()

  if (planErr || !existingPlan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  const priceChanged =
    oldPrice !== undefined &&
    newPrice !== undefined &&
    Number(oldPrice) !== Number(newPrice)

  // Log price history if price actually changed
  if (priceChanged) {
    const { error: histErr } = await db
      .from('meal_plan_price_history')
      .insert({
        meal_plan_id: planId,
        old_price: Number(oldPrice),
        new_price: Number(newPrice),
      })

    if (histErr) {
      console.error('[update-meal-plan] price history insert failed:', histErr)
      // Non-fatal — continue with the plan update
    }
  }

  // Update the meal plan itself
  const { data: updated, error: updateErr } = await db
    .from('meal_plans')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', planId)
    .select('*')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  let updatedCustomerCount = 0

  // If price changed and provider chose to apply to existing customers
  if (priceChanged && applyToCustomers) {
    // Find active subscriptions for this plan
    const { data: subs, error: subsErr } = await db
      .from('subscriptions')
      .select('customer_id')
      .eq('meal_plan_id', planId)
      .eq('status', 'active')

    if (!subsErr && subs && subs.length > 0) {
      const customerIds = subs.map((s: { customer_id: string }) => s.customer_id)

      const { error: custErr } = await db
        .from('customers')
        .update({ price_per_month: Number(newPrice) })
        .in('id', customerIds)
        .eq('provider_id', user.id)

      if (custErr) {
        console.error('[update-meal-plan] customer price update failed:', custErr)
      } else {
        updatedCustomerCount = customerIds.length
      }
    }
  }

  return NextResponse.json({ plan: updated, updatedCustomerCount })
}
