import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedProvider, getCachedMealPlans } from '@/lib/queries'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { preview } = await searchParams
  if (preview !== '1') {
    const mealPlans = await getCachedMealPlans(user.id)
    if (mealPlans && mealPlans.length > 0) redirect('/dashboard')
  }
  const provider = await getCachedProvider(user.id)
  return <OnboardingClient providerName={provider?.name ?? ''} />
}
