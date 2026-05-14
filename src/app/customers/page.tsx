import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import CustomersClient from './CustomersClient'
import Paywall from '@/components/Paywall'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ openAdd?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: customers }, { data: mealPlans }, trial] = await Promise.all([
    supabase
      .from('customers')
      .select('*, pauses(*), subscriptions(*, meal_plans(*))')
      .eq('provider_id', user.id)
      .order('name'),
    supabase
      .from('meal_plans')
      .select('*')
      .eq('provider_id', user.id)
      .order('status')
      .order('name'),
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return (
    <CustomersClient
      initialCustomers={customers ?? []}
      initialMealPlans={mealPlans ?? []}
      providerId={user.id}
      initialShowAdd={params.openAdd === 'true'}
    />
  )
}
