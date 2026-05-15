import { getCustomerSession } from '@/lib/customer-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AppClient from './AppClient'

export interface LinkedSubscription {
  customerId: string
  customerName: string
  customerStatus: string
  balanceDays: number
  token: string | null
  subscriptionStatus: string | null
  provider: {
    id: string
    name: string
    slug: string | null
    logoUrl: string | null
    accentColor: string
  } | null
}

export default async function AppPage() {
  const session = await getCustomerSession()

  if (!session) {
    return <AppClient session={null} subscriptions={[]} />
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Fetch all customer records linked to this account
  const { data: customers } = await db
    .from('customers')
    .select('id, name, status, balance_days, provider_id')
    .eq('account_id', session.accountId)
    .order('created_at')

  if (!customers?.length) {
    return <AppClient session={session} subscriptions={[]} />
  }

  const customerIds = customers.map((c: { id: string }) => c.id)
  const providerIds = [...new Set(customers.map((c: { provider_id: string }) => c.provider_id))]

  const [{ data: providers }, { data: tokens }, { data: subs }] = await Promise.all([
    db
      .from('providers')
      .select('id, name, slug, logo_url, accent_color')
      .in('id', providerIds),
    db
      .from('customer_access_tokens')
      .select('customer_id, token')
      .in('customer_id', customerIds)
      .eq('is_active', true),
    db
      .from('subscriptions')
      .select('customer_id, status')
      .in('customer_id', customerIds)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false }),
  ])

  const providerMap: Record<string, any> = {}
  for (const p of (providers ?? [])) providerMap[p.id] = p

  const tokenMap: Record<string, string> = {}
  for (const t of (tokens ?? [])) tokenMap[t.customer_id] = t.token

  const subMap: Record<string, string> = {}
  for (const s of (subs ?? [])) {
    if (!subMap[s.customer_id]) subMap[s.customer_id] = s.status
  }

  const subscriptions: LinkedSubscription[] = customers.map((c: any) => {
    const p = providerMap[c.provider_id]
    return {
      customerId: c.id,
      customerName: c.name,
      customerStatus: c.status,
      balanceDays: c.balance_days,
      token: tokenMap[c.id] ?? null,
      subscriptionStatus: subMap[c.id] ?? null,
      provider: p
        ? {
            id: p.id,
            name: p.name,
            slug: p.slug ?? null,
            logoUrl: p.logo_url ?? null,
            accentColor: p.accent_color ?? '#F4622A',
          }
        : null,
    }
  })

  return <AppClient session={session} subscriptions={subscriptions} />
}

export const dynamic = 'force-dynamic'
