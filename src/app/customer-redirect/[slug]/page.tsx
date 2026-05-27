/**
 * /customer-redirect/[slug]
 *
 * Landing page after Google OAuth on the public /[slug] provider page.
 * Looks up the customer record for the authenticated user + this provider,
 * then redirects to their /c/[token] portal. Shows a helpful error if no
 * matching customer is found.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/rider'

export default async function CustomerRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/${slug}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Resolve provider by slug
  const { data: provider } = await db
    .from('providers')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()

  if (!provider) redirect(`/${slug}`)

  // Check if this user is also a provider — if so, send to dashboard
  const [{ count: planCount }, { data: provRow }] = await Promise.all([
    db.from('meal_plans').select('id', { count: 'exact', head: true }).eq('provider_id', user.id),
    db.from('providers').select('name').eq('id', user.id).maybeSingle(),
  ])
  const isProvider =
    (planCount ?? 0) > 0 ||
    (typeof provRow?.name === 'string' && provRow.name.trim().length > 0)
  if (isProvider) redirect('/dashboard')

  // Find customer record by user_id, phone, or email
  const phone = user.phone ?? null
  const email = user.email ?? null
  let customerId: string | null = null

  // 1. Already linked
  const { data: byUserId } = await db
    .from('customers')
    .select('id')
    .eq('provider_id', provider.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (byUserId) customerId = byUserId.id

  // 2. Match by phone
  if (!customerId && phone) {
    const normAuth = normalizePhone(phone)
    const { data: all } = await db.from('customers').select('id, whatsapp_number').eq('provider_id', provider.id)
    const match = (all ?? []).find((c: any) => normalizePhone(c.whatsapp_number ?? '') === normAuth)
    if (match) {
      customerId = match.id
      void db.from('customers').update({ user_id: user.id }).eq('id', customerId)
    }
  }

  // 3. Match by email
  if (!customerId && email) {
    const { data: byEmail } = await db
      .from('customers').select('id').eq('provider_id', provider.id)
      .eq('email', email.toLowerCase()).maybeSingle()
    if (byEmail) {
      customerId = byEmail.id
      void db.from('customers').update({ user_id: user.id }).eq('id', customerId)
    }
  }

  if (!customerId) {
    // No matching customer — show friendly error
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#FDF8F3] p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">😕</div>
          <h1 className="text-lg font-black text-gray-900">No subscription found</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            We couldn&apos;t find a subscription linked to your Google account with <strong>{provider.name}</strong>.
            Make sure you signed in with the email your provider has on record, or ask them to share your portal link directly.
          </p>
          <a
            href={`/${slug}`}
            className="inline-flex items-center justify-center w-full rounded-2xl bg-orange-500 py-3 text-sm font-black text-white hover:bg-orange-600 transition-colors"
          >
            ← Back
          </a>
        </div>
      </main>
    )
  }

  // Find active portal token
  const { data: tokenRow } = await db
    .from('customer_access_tokens')
    .select('token')
    .eq('customer_id', customerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRow) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#FDF8F3] p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">🔗</div>
          <h1 className="text-lg font-black text-gray-900">Portal link not set up yet</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your provider hasn&apos;t generated a portal link for your account yet. Ask them to share it with you.
          </p>
          <a href={`/${slug}`} className="inline-flex items-center justify-center w-full rounded-2xl bg-orange-500 py-3 text-sm font-black text-white hover:bg-orange-600 transition-colors">
            ← Back
          </a>
        </div>
      </main>
    )
  }

  redirect(`/c/${tokenRow.token}`)
}
