import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!code) return NextResponse.json({ error: 'Referral code is required' }, { status: 400 })

    const admin = createAdminClient() as any

    // 1. Look up the referrer by code
    const { data: referrer } = await admin
      .from('providers')
      .select('id, name')
      .eq('referral_code', code)
      .maybeSingle()

    if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })

    // 2. Prevent self-referral
    if (referrer.id === user.id)
      return NextResponse.json({ error: 'You cannot use your own referral code' }, { status: 400 })

    // 3. Check if this user already has a referral applied (idempotent)
    const { data: existing } = await admin
      .from('referrals')
      .select('id, status')
      .eq('referred_id', user.id)
      .maybeSingle()

    if (existing) {
      // Already applied — return silently (idempotent)
      return NextResponse.json({ ok: true, alreadyApplied: true, referrerName: referrer.name })
    }

    // 4. Create pending referral relationship
    const { error } = await admin
      .from('referrals')
      .insert({
        referrer_id: referrer.id,
        referred_id: user.id,
        code_used:   code,
        status:      'pending',
      })

    if (error) {
      console.error('apply-referral insert error:', error)
      return NextResponse.json({ error: 'Failed to apply referral code' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, referrerName: referrer.name })
  } catch (e) {
    console.error('apply-referral error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    )
  }
}
