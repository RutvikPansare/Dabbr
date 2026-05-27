import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedDashboardData, getCachedMealPlans, getTodayMenus } from '@/lib/queries'
import { findAndLinkRider } from '@/lib/rider'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Role resolution ────────────────────────────────────────────────────────
  // Always use findAndLinkRider so a rider's first login gets their row linked
  // by phone/email before we check. Provider status (meal plans) overrides rider.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Resolve provider status: has meal plans OR has set a business name.
  // Both signals are checked so a provider who deleted all plans still gets
  // provider UI, and a new rider who never touched provider setup gets rider UI.
  const [mealPlans, { data: providerRow }] = await Promise.all([
    getCachedMealPlans(user.id),
    db.from('providers').select('name, onboarding_done').eq('id', user.id).maybeSingle(),
  ])

  const hasProviderSetup =
    (mealPlans && mealPlans.length > 0) ||
    (typeof providerRow?.name === 'string' && providerRow.name.trim().length > 0)

  if (!hasProviderSetup) {
    // No provider setup — check if this is a rider (links on first login)
    const riderInfo = await findAndLinkRider(user.id, user.phone ?? null, user.email ?? null)
    if (riderInfo) redirect('/rider')

    // Check if this user is a customer (linked to a customer record via user_id)
    // If so, redirect them to their portal instead of the provider dashboard
    const { data: customerRow } = await db
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (customerRow) {
      const { data: tokenRow } = await db
        .from('customer_access_tokens')
        .select('token')
        .eq('customer_id', customerRow.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (tokenRow) redirect(`/c/${tokenRow.token}`)
    }

    // New provider — send to onboarding unless already completed
    if (!providerRow?.onboarding_done) redirect('/onboarding')
  }

  // Use IST (UTC+5:30) so Indian providers always get the correct local date
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  // Fetch cached heavy data + today's menus (uncached — must be fresh) in parallel
  const [initialData, todayMenus] = await Promise.all([
    getCachedDashboardData(user.id, today),
    getTodayMenus(user.id, today),
  ])

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialData={{ ...initialData, todayMenus }}
    />
  )
}
