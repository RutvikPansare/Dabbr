import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BILLING_PLANS, isBillingPlanId } from '@/lib/billing'
import type { BillingTransactionSource } from '@/types/database'

const ALLOWED_SOURCES: BillingTransactionSource[] = ['landing', 'app', 'paywall']

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    throw new Error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET')
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const source = ALLOWED_SOURCES.includes(body?.source) ? body.source as BillingTransactionSource : 'app'

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const providerId = user?.id ?? null

    if (source !== 'landing' && !providerId) {
      return NextResponse.json({ error: 'Please sign in before subscribing.' }, { status: 401 })
    }

    const planId = body?.plan
    const hasPlan = isBillingPlanId(planId)
    const amount = hasPlan ? BILLING_PLANS[planId].amountPaise : Number(body?.amount)
    const currency = typeof body?.currency === 'string' ? body.currency : 'INR'

    if (!Number.isFinite(amount) || amount < 100) {
      return NextResponse.json({ error: 'Amount must be at least 100 paise.' }, { status: 400 })
    }

    const plan = hasPlan ? BILLING_PLANS[planId] : null
    const admin = createAdminClient()
    const referenceId = typeof body?.receipt === 'string' && body.receipt.trim()
      ? body.receipt.trim().slice(0, 40)
      : `dabbr_${plan?.id ?? 'custom'}_${Date.now()}_${randomUUID().slice(0, 8)}`

    const { data: transaction, error: insertError } = await admin
      .from('billing_transactions')
      .insert({
        provider_id: providerId,
        plan: plan?.id ?? 'starter',
        source,
        amount,
        currency,
        status: 'created',
        reference_id: referenceId,
        customer_email: user?.email ?? null,
      })
      .select('*')
      .single()

    if (insertError || !transaction) {
      return NextResponse.json({ error: insertError?.message ?? 'Could not create billing transaction' }, { status: 500 })
    }

    const razorpay = getRazorpay()
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: referenceId,
      notes: {
        app: 'dabbr',
        plan: plan?.id ?? '',
        source,
        provider_id: providerId ?? '',
        billing_transaction_id: transaction.id,
      },
    })

    const { error: updateError } = await admin
      .from('billing_transactions')
      .update({
        razorpay_order_id: order.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      transaction_id: transaction.id,
      plan: plan?.id ?? null,
    })
  } catch (error: any) {
    const message = error?.error?.description || error?.message || 'Razorpay order creation failed'
    const status = /auth|key|credential/i.test(message) ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
