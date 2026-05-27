/**
 * POST /api/customer-portal-token
 * Body: { provider_slug: string }
 *
 * Requires a logged-in Supabase session. Looks up the customer associated
 * with the authenticated user (by phone or email) for the given provider,
 * and returns their portal token. Used after OTP/magic-link login on the
 * public /[slug] page to redirect the customer to their personal portal.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/rider'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider_slug } = await req.json()
  if (!provider_slug) return NextResponse.json({ error: 'Missing provider_slug' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Resolve provider
  const { data: provider } = await db
    .from('providers')
    .select('id')
    .eq('slug', provider_slug)
    .maybeSingle()

  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  // Try to find the customer for this provider matching the logged-in user's phone or email.
  // A customer may already have user_id set (from a previous link), or we match by phone/email.
  const phone = user.phone ?? null
  const email = user.email ?? null

  let customerId: string | null = null

  // 1. Already linked by user_id
  const { data: byUserId } = await db
    .from('customers')
    .select('id')
    .eq('provider_id', provider.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (byUserId) customerId = byUserId.id

  // 2. Match by phone (normalized)
  if (!customerId && phone) {
    const normalizedAuth = normalizePhone(phone)
    const { data: allCustomers } = await db
      .from('customers')
      .select('id, whatsapp_number')
      .eq('provider_id', provider.id)
    const match = (allCustomers ?? []).find(
      (c: { whatsapp_number: string }) => normalizePhone(c.whatsapp_number ?? '') === normalizedAuth
    )
    if (match) {
      customerId = match.id
      // Link for future lookups
      void db.from('customers').update({ user_id: user.id }).eq('id', customerId)
    }
  }

  // 3. Match by email
  if (!customerId && email) {
    const { data: byEmail } = await db
      .from('customers')
      .select('id')
      .eq('provider_id', provider.id)
      .eq('email', email.toLowerCase())
      .maybeSingle()
    if (byEmail) {
      customerId = byEmail.id
      void db.from('customers').update({ user_id: user.id }).eq('id', customerId)
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: 'No subscription found for your account with this provider.' }, { status: 404 })
  }

  // Get the portal token for this customer
  const { data: tokenRow } = await db
    .from('customer_access_tokens')
    .select('token')
    .eq('customer_id', customerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRow) {
    return NextResponse.json({ error: 'No portal link found. Ask your provider to share your portal link.' }, { status: 404 })
  }

  return NextResponse.json({ token: tokenRow.token })
}
