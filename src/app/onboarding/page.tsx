import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedProvider, getCachedMealPlans } from '@/lib/queries'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [provider, mealPlans] = await Promise.all([
    getCachedProvider(user.id),
    getCachedMealPlans(user.id),
  ])

  if (!provider) redirect('/login')

  const { preview } = await searchParams
  // ?preview=1 forces the flow to start from step 0 regardless of existing data
  const hasMealPlans = preview === '1' ? false : (mealPlans ?? []).length > 0

  return (
    <OnboardingClient
      provider={{ id: user.id, name: provider.name, upi_id: provider.upi_id }}
      hasMealPlans={hasMealPlans}
    />
  )
}
