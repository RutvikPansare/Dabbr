import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBillingPlanId, nextBillingPeriodEnd } from '@/lib/billing'

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const orderId = body?.razorpay_order_id
    const paymentId = body?.razorpay_payment_id
    const signature = body?.razorpay_signature

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Missing Razorpay payment verification fields.' }, { status: 400 })
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return NextResponse.json({ error: 'Missing RAZORPAY_KEY_SECRET' }, { status: 500 })
    }

    const expected = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')

    if (!signaturesMatch(expected, signature)) {
      return NextResponse.json({ error: 'Invalid Razorpay payment signature.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: transaction, error: fetchError } = await admin
      .from('billing_transactions')
      .select('*')
      .eq('razorpay_order_id', orderId)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!transaction) {
      return NextResponse.json({ error: 'No billing transaction found for this order.' }, { status: 400 })
    }

    const paidAt = new Date().toISOString()
    const { error: updateError } = await admin
      .from('billing_transactions')
      .update({
        status: 'paid',
        razorpay_payment_id: paymentId,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .eq('id', transaction.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (transaction.provider_id && isBillingPlanId(transaction.plan)) {
      const { error: providerError } = await admin
        .from('providers')
        .update({
          is_subscribed: true,
          subscription_plan: transaction.plan,
          subscription_status: 'active',
          subscription_current_period_end: nextBillingPeriodEnd(new Date(paidAt)),
        })
        .eq('id', transaction.provider_id)

      if (providerError) {
        return NextResponse.json({ error: providerError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment verification failed' },
      { status: 500 },
    )
  }
}
