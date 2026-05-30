import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const [txnResult, refundResult, rewardResult] = await Promise.all([
      admin
        .from('billing_transactions')
        .select('id, status, plan, amount, paid_at, created_at, razorpay_payment_id')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false }),
      admin
        .from('billing_refunds')
        .select('id, amount, reason, razorpay_refund_id, created_at')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false }),
      admin
        .from('referral_rewards')
        .select('id, bonus_days, role, created_at')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    const txns    = txnResult.data    ?? []
    const refunds = refundResult.data ?? []
    // referral_rewards table may not exist yet — ignore error gracefully
    const rewards = rewardResult.data ?? []

    return NextResponse.json({
      txns,
      refunds,
      rewards,
      latestTransaction: txns[0] ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
