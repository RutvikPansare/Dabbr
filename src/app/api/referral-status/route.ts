import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferralCode, REFERRAL_BONUS_DAYS } from '@/lib/referral'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient() as any

    // ── 1. Ensure provider has a referral code ──────────────────────────────
    let { data: provider } = await admin
      .from('providers')
      .select('referral_code, name, referral_bonus_days, subscription_current_period_end')
      .eq('id', user.id)
      .single()

    if (!provider?.referral_code) {
      // Generate one and persist
      let code = generateReferralCode(provider?.name ?? '')
      // Collision guard — append random digits until unique
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data: existing } = await admin
          .from('providers')
          .select('id')
          .eq('referral_code', code)
          .maybeSingle()
        if (!existing) break
        const rand = Math.floor(Math.random() * 90 + 10)
        code = `${code.replace(/\d+$/, '')}${rand}`
      }
      await admin
        .from('providers')
        .update({ referral_code: code })
        .eq('id', user.id)
      provider = { ...provider, referral_code: code }
    }

    // ── 2. Fetch referrals made by this provider ────────────────────────────
    const { data: referrals } = await admin
      .from('referrals')
      .select(`
        id,
        status,
        rewarded_at,
        created_at,
        referred:referred_id ( name )
      `)
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false })

    const referralList = (referrals ?? []).map((r: any) => ({
      id: r.id,
      name: r.referred?.name ?? 'Unknown',
      status: r.status,           // 'pending' | 'rewarded'
      joinedAt: r.created_at,
      rewardedAt: r.rewarded_at,
    }))

    const rewarded = referralList.filter((r: any) => r.status === 'rewarded')

    return NextResponse.json({
      referralCode:      provider.referral_code,
      bonusDays:         provider.referral_bonus_days ?? 0,
      totalReferrals:    referralList.length,
      rewardedReferrals: rewarded.length,
      totalBonusDays:    rewarded.length * REFERRAL_BONUS_DAYS,
      referrals:         referralList,
    })
  } catch (e) {
    console.error('referral-status error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    )
  }
}
