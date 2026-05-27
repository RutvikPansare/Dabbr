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

  // Check if this rider is also a real provider (has actual meal plans).
  // We do NOT auto-redirect — instead we show a "Switch to Provider View"
  // button so they can choose. Auto-redirecting caused an infinite loop because
  // Google SSO auto-populates providers.name for riders too, which would make
  // isAlsoProvider true and bounce them straight back to /dashboard.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = createAdminClient() as any
  const { count: planCount } = await db2
    .from('meal_plans')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', user.id)
  const isAlsoProvider = (planCount ?? 0) > 0

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Fetch assignments + customers + delivery logs + notifications + extras in parallel
  const [assignments, { data: allCustomers }, { data: mealPlans }, { data: logsData }, { data: rawNotifications }, { data: extrasData }] =
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
      db
        .from('rider_notifications')
        .select('id, type, title, message, payload, created_at, read_at')
        .eq('rider_id', riderInfo.id)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      db
        .from('delivery_extras')
        .select('customer_id, item, amount')
        .eq('provider_id', riderInfo.provider_id)
        .eq('delivery_date', today)
        .eq('status', 'pending'),
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

  const extrasMap: Record<string, { item: string; amount: number }[]> = {}
  for (const row of (extrasData ?? [])) {
    if (!extrasMap[row.customer_id]) extrasMap[row.customer_id] = []
    extrasMap[row.customer_id].push({ item: row.item, amount: row.amount })
  }

  const notifications = (rawNotifications ?? []).map((n: any) => ({
    id: n.id as string,
    type: n.type as string,
    title: n.title as string,
    message: n.message as string,
    payload: n.payload as Record<string, any> | null,
    created_at: n.created_at as string,
    read_at: n.read_at as string | null,
  }))

  return (
    <RiderClient
      riderName={riderInfo.name}
      today={today}
      customers={enrichedCustomers}
      initialStatuses={deliveryStatuses}
      hasAssignment={assignments.length > 0}
      notifications={notifications}
      isAlsoProvider={isAlsoProvider}
      isAreaBased={!hasFull}
      extras={extrasMap}
    />
  )
}
