import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedMealPlans, getCachedTrialStatus } from '@/lib/queries'
import Paywall from '@/components/Paywall'
import MealPlansClient from './MealPlansClient'

export default async function MealPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [mealPlans, trial] = await Promise.all([
    getCachedMealPlans(user.id),
    getCachedTrialStatus(user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return <MealPlansClient providerId={user.id} initialMealPlans={mealPlans} />
}
