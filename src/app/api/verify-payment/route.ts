import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBillingPlanId, nextBillingPeriodEnd } from '@/lib/billing'
import { REFERRAL_BONUS_DAYS, extendPeriodEnd } from '@/lib/referral'

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

      // Bust Next.js cache so dashboard + settings reflect the new plan immediately
      const uid = transaction.provider_id
      const P = {} as any
      revalidateTag(`provider-data-${uid}`, P)
      revalidateTag(`settings-${uid}`, P)
      revalidateTag(`dashboard-${uid}`, P)

      // ── Referral reward ───────────────────────────────────────────────────
      // Only fires once per referred provider (status guard prevents re-triggering)
      try {
        const { data: referral } = await (admin as any)
          .from('referrals')
          .select('id, referrer_id, referred_id')
          .eq('referred_id', transaction.provider_id)
          .eq('status', 'pending')
          .maybeSingle()

        if (referral) {
          // Fetch current period ends for both providers
          const { data: both } = await (admin as any)
            .from('providers')
            .select('id, subscription_current_period_end')
            .in('id', [referral.referrer_id, referral.referred_id])

          const now = new Date().toISOString()

          // Extend each provider's subscription by REFERRAL_BONUS_DAYS
          for (const p of (both ?? [])) {
            const newEnd = extendPeriodEnd(p.subscription_current_period_end, REFERRAL_BONUS_DAYS)
            await (admin as any)
              .from('providers')
              .update({
                subscription_current_period_end: newEnd,
                referral_bonus_days: (admin as any).rpc
                  ? undefined  // use SQL increment below
                  : undefined,
              })
              .eq('id', p.id)

            // Increment bonus day counter (ignore error — non-critical)
            await (admin as any)
              .from('providers')
              .update({ referral_bonus_days: (p.referral_bonus_days ?? 0) + REFERRAL_BONUS_DAYS })
              .eq('id', p.id)
              .select('referral_bonus_days')
          }

          // Mark referral rewarded
          await (admin as any)
            .from('referrals')
            .update({ status: 'rewarded', rewarded_at: now })
            .eq('id', referral.id)

          // Audit log
          await (admin as any)
            .from('referral_rewards')
            .insert([
              { referral_id: referral.id, provider_id: referral.referrer_id, role: 'referrer', bonus_days: REFERRAL_BONUS_DAYS },
              { referral_id: referral.id, provider_id: referral.referred_id, role: 'referred',  bonus_days: REFERRAL_BONUS_DAYS },
            ])

          // Bust cache for referrer too
          const P2 = {} as any
          revalidateTag(`provider-data-${referral.referrer_id}`, P2)
          revalidateTag(`settings-${referral.referrer_id}`, P2)
        }
      } catch (refErr) {
        // Referral reward failure must NEVER block the payment response
        console.error('referral reward error (non-fatal):', refErr)
      }
    }

    return NextResponse.json({ success: true, plan: transaction.plan })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment verification failed' },
      { status: 500 },
    )
  }
}
