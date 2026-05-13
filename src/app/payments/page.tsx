import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import PaymentsClient from './PaymentsClient'
import Paywall from '@/components/Paywall'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: customers },
    { data: payments },
    { data: provider },
    trial,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, whatsapp_number, area, plan_type, price_per_month, balance_days, status')
      .eq('provider_id', user.id)
      .order('name'),
    supabase
      .from('payments')
      .select('*, customers(id, name, whatsapp_number, area)')
      .eq('provider_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(60),
    supabase.from('providers').select('*').eq('id', user.id).single(),
    getTrialStatus(supabase, user.id),
  ])

  if (trial.isExpired) return <Paywall />

  return (
    <PaymentsClient
      providerId={user.id}
      provider={provider}
      initialCustomers={customers ?? []}
      initialPayments={payments ?? []}
    />
  )
}
