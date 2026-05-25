import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBillingPlanId } from '@/lib/billing'

const TRIAL_DAYS = 7

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { plan } = body
    if (!isBillingPlanId(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Check they haven't already used a trial for this plan
    const { data: provider } = await admin
      .from('providers')
      .select('subscription_status, plan_trial_ends_at, is_subscribed')
      .eq('id', user.id)
      .single()

    if (provider?.is_subscribed && provider?.subscription_status === 'active') {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 400 })
    }
    if (provider?.subscription_status === 'trial') {
      return NextResponse.json({ error: 'Already on a trial' }, { status: 400 })
    }

    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS)

    const { error } = await admin
      .from('providers')
      .update({
        subscription_plan: plan,
        subscription_status: 'trial',
        is_subscribed: true,
        plan_trial_ends_at: trialEndsAt.toISOString(),
      })
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const P = {} as any
    revalidateTag(`provider-data-${user.id}`, P)
    revalidateTag(`settings-${user.id}`, P)
    revalidateTag(`dashboard-${user.id}`, P)

    return NextResponse.json({ success: true, trialEndsAt: trialEndsAt.toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
