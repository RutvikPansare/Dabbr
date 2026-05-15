import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import CustomersClient from './CustomersClient'
import Paywall from '@/components/Paywall'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ openAdd?: string; open?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Cast to any for meal_plans queries — PostgREST schema cache may lag after migration
  const db = supabase as any

  const [{ data: customers }, { data: mealPlans }, trial] = await Promise.all([
    supabase
      .from('customers')
      .select('*, pauses(*), subscriptions(*)')
      .eq('provider_id', user.id)
      .order('name'),
    db
      .from('meal_plans')
      .select('*')
      .eq('provider_id', user.id)
      .order('status')
      .order('name'),
    getTrialStatus(supabase, user.id),
  ])

  // Merge meal_plans data into each customer's subscriptions manually (PostgREST embedded join workaround)
  const mealPlansMap: Record<string, any> = {}
  for (const mp of (mealPlans ?? [])) {
    mealPlansMap[mp.id] = mp
  }
  const enrichedCustomers = (customers ?? []).map((c: any) => ({
    ...c,
    subscriptions: (c.subscriptions ?? []).map((sub: any) => ({
      ...sub,
      meal_plans: mealPlansMap[sub.meal_plan_id] ?? null,
    })),
  }))

  if (trial.isExpired) return <Paywall />

  return (
    <CustomersClient
      initialCustomers={enrichedCustomers}
      initialMealPlans={mealPlans ?? []}
      providerId={user.id}
      initialShowAdd={params.openAdd === 'true'}
      initialOpenId={params.open ?? null}
    />
  )
}
