import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Only downgrade if actually on a trial that has expired
    const { data: provider } = await admin
      .from('providers')
      .select('subscription_status, plan_trial_ends_at')
      .eq('id', user.id)
      .single()

    if (provider?.subscription_status !== 'trial') {
      return NextResponse.json({ skipped: true })
    }
    if (!provider?.plan_trial_ends_at || new Date(provider.plan_trial_ends_at) > new Date()) {
      return NextResponse.json({ skipped: true })
    }

    const { error } = await admin
      .from('providers')
      .update({
        subscription_plan: null,
        subscription_status: 'trial', // NOT NULL column — 'trial' is the DB default for free users
        is_subscribed: false,
      })
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const P = {} as any
    revalidateTag(`provider-data-${user.id}`, P)
    revalidateTag(`settings-${user.id}`, P)
    revalidateTag(`dashboard-${user.id}`, P)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
