import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatus } from '@/lib/trial'
import PaymentsClient from './PaymentsClient'
import Paywall from '@/components/Paywall'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Cast to any — PostgREST schema cache may lag after migration
  const db = supabase as any

  const [
    { data: customers },
    { data: mealPlans },
    { data: payments },
    { data: provider },
    { data: monthlyPayments },
    trial,
  ] = await Promise.all([
    db
      .from('customers')
      .select('id, name, whatsapp_number, area, plan_type, price_per_month, balance_days, billing_type, meal_rate, credit_limit, meals_delivered, status, subscriptions(*)')
      .eq('provider_id', user.id)
      .order('name'),
    db.from('meal_plans').select('*').eq('provider_id', user.id),
    supabase
      .from('payments')
      .select('*, customers(id, name, whatsapp_number, area)')
      .eq('provider_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(60),
    supabase.from('providers').select('*').eq('id', user.id).single(),
    db
      .from('monthly_payments')
      .select('id, customer_id, amount, note, created_at')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false }),
    getTrialStatus(supabase, user.id),
  ])

  // Merge meal_plans into subscriptions manually (PostgREST embedded join workaround)
  const mpMap: Record<string, any> = {}
  for (const mp of (mealPlans ?? [])) mpMap[mp.id] = mp
  const enrichedCustomers = (customers ?? []).map((c: any) => ({
    ...c,
    subscriptions: (c.subscriptions ?? []).map((s: any) => ({
      ...s,
      meal_plans: mpMap[s.meal_plan_id] ?? null,
    })),
  }))

  if (trial.isExpired) return <Paywall />

  return (
    <PaymentsClient
      providerId={user.id}
      provider={provider}
      initialCustomers={enrichedCustomers}
      initialPayments={payments ?? []}
      initialMonthlyPayments={monthlyPayments ?? []}
    />
  )
}
