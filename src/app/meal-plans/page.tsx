import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import Paywall from '@/components/Paywall'
import MealPlansClient from './MealPlansClient'

export default async function MealPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: mealPlans }, trial] = await Promise.all([
    supabase
      .from('meal_plans')
      .select('*')
      .eq('provider_id', user.id)
      .order('status')
      .order('name'),
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return <MealPlansClient providerId={user.id} initialMealPlans={mealPlans ?? []} />
}
