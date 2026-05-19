import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedDashboardData, getCachedMealPlans } from '@/lib/queries'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If the user has no meal plans they haven't completed setup yet — send to onboarding.
  const mealPlans = await getCachedMealPlans(user.id)
  if (!mealPlans || mealPlans.length === 0) redirect('/onboarding')

  const today = new Date().toISOString().split('T')[0]
  const initialData = await getCachedDashboardData(user.id, today)

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialData={initialData}
    />
  )
}
