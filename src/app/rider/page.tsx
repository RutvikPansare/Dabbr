import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAndLinkRider, getRiderAssignments } from '@/lib/rider'
import RiderClient from './RiderClient'

export default async function RiderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Identify rider — link on first login if phone/email matches
  const phone = user.phone ?? null
  const email = user.email ?? null
  const riderInfo = await findAndLinkRider(user.id, phone, email)
  if (!riderInfo) redirect('/dashboard') // not a rider → provider dashboard

  // Provider override: if the rider also has meal plans they are a provider —
  // send them to the provider dashboard instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: planCount } = await (createAdminClient() as any)
    .from('meal_plans')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', user.id)
  if ((planCount ?? 0) > 0) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Fetch assignments + customers + delivery logs in parallel
  const [assignments, { data: allCustomers }, { data: mealPlans }, { data: logsData }] =
    await Promise.all([
      getRiderAssignments(riderInfo.id, today),
      db
        .from('customers')
        .select('*, pauses(*), subscriptions(*)')
        .eq('provider_id', riderInfo.provider_id)
        .order('name'),
      db.from('meal_plans').select('*').eq('provider_id', riderInfo.provider_id),
      db
        .from('delivery_logs')
        .select('customer_id, meal_slot, status')
        .eq('provider_id', riderInfo.provider_id)
        .eq('date', today),
    ])

  // Determine which customers this rider handles today
  const hasFull = assignments.some(a => a.scope === 'full')
  const assignedAreas = new Set(
    assignments.filter(a => a.scope === 'area' && a.area_name).map(a => a.area_name)
  )

  const mpMap: Record<string, any> = {}
  for (const mp of (mealPlans ?? [])) mpMap[mp.id] = mp

  const enrichedCustomers = (allCustomers ?? [])
    .filter((c: any) => hasFull || assignedAreas.has(c.area))
    .map((c: any) => ({
      ...c,
      subscriptions: (c.subscriptions ?? []).map((s: any) => ({
        ...s,
        meal_plans: mpMap[s.meal_plan_id] ?? null,
      })),
    }))

  const deliveryStatuses: Record<string, string> = {}
  for (const log of (logsData ?? [])) {
    deliveryStatuses[`${log.customer_id}:${log.meal_slot}`] = log.status
  }

  return (
    <RiderClient
      riderName={riderInfo.name}
      today={today}
      customers={enrichedCustomers}
      initialStatuses={deliveryStatuses}
      hasAssignment={assignments.length > 0}
    />
  )
}
