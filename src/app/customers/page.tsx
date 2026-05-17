import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedCustomersData, getCachedProvider, getCachedTrialStatus } from '@/lib/queries'
import CustomersClient from './CustomersClient'
import Paywall from '@/components/Paywall'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ openAdd?: string; open?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ customers, mealPlans }, provider, trial] = await Promise.all([
    getCachedCustomersData(user.id),
    getCachedProvider(user.id),
    getCachedTrialStatus(user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return (
    <CustomersClient
      initialCustomers={customers}
      initialMealPlans={mealPlans}
      providerId={user.id}
      providerDefaultMealRate={provider?.default_meal_rate ?? 120}
      providerDefaultCreditLimit={provider?.default_credit_limit ?? 3000}
      initialShowAdd={params.openAdd === 'true'}
      initialOpenId={params.open ?? null}
    />
  )
}
