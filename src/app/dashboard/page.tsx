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
  const mealPlans = await getCachedMealPlans(user.id)
  const hasProviderSetup = mealPlans && mealPlans.length > 0

  if (!hasProviderSetup) {
    // No meal plans yet — check if this is a rider
    const riderInfo = await findAndLinkRider(user.id, user.phone ?? null, user.email ?? null)
    if (riderInfo) redirect('/rider')

    // New provider — check onboarding_done flag (cross-device safe)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    const { data: prov } = await db
      .from('providers')
      .select('onboarding_done')
      .eq('id', user.id)
      .maybeSingle()
    if (!prov?.onboarding_done) redirect('/onboarding')
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
