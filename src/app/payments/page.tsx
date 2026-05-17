import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedCustomersData, getCachedProvider, getCachedPaymentsData, getCachedTrialStatus } from '@/lib/queries'
import PaymentsClient from './PaymentsClient'
import Paywall from '@/components/Paywall'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ customers, mealPlans }, provider, { payments, monthlyPayments }, trial] = await Promise.all([
    getCachedCustomersData(user.id),
    getCachedProvider(user.id),
    getCachedPaymentsData(user.id),
    getCachedTrialStatus(user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return (
    <PaymentsClient
      providerId={user.id}
      provider={provider}
      initialCustomers={customers}
      initialPayments={payments}
      initialMonthlyPayments={monthlyPayments}
    />
  )
}
