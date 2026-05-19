import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedProvider, getCachedMealPlans } from '@/lib/queries'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [provider, mealPlans] = await Promise.all([
    getCachedProvider(user.id),
    getCachedMealPlans(user.id),
  ])

  if (!provider) redirect('/login')

  return (
    <OnboardingClient
      provider={{ id: user.id, name: provider.name, upi_id: provider.upi_id }}
      hasMealPlans={(mealPlans ?? []).length > 0}
    />
  )
}
