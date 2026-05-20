import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedDashboardData, getCachedMealPlans, getTodayMenus } from '@/lib/queries'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If the user has no meal plans they haven't completed setup yet — send to onboarding.
  const mealPlans = await getCachedMealPlans(user.id)
  if (!mealPlans || mealPlans.length === 0) redirect('/onboarding')

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
