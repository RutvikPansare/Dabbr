import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  // Explicitly delete tables that have no FK CASCADE to providers
  await Promise.all([
    admin.from('delivery_extras').delete().eq('provider_id', user.id),
    admin.from('extra_presets').delete().eq('provider_id', user.id),
  ])

  // Delete provider row — cascades to customers, subscriptions, pauses,
  // meal_plans, payments, monthly_payments, delivery_logs, daily_menus,
  // provider_holidays, menu_quick_tags, delivery_riders, provider_notifications, etc.
  await admin.from('providers').delete().eq('id', user.id)

  // Delete the auth user — removes the Google SSO identity and all other
  // auth identities, and cascades rider_assignments (which FK to auth.users).
  const { error } = await admin.auth.admin.deleteUser(user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
