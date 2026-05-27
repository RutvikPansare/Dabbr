/**
 * GET /api/check-role
 *
 * Returns the effective role for the currently logged-in user.
 * Performs rider linking (phone/email match) as a side-effect so that
 * client components that need to know role don't also need admin access.
 *
 * Role logic:
 *   - Not logged in          → { role: 'anonymous' }
 *   - Has meal plans          → { role: 'provider' }   (provider overrides rider)
 *   - Is a rider, no plans    → { role: 'rider' }
 *   - Neither                 → { role: 'provider' }   (new user, show onboarding)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAndLinkRider } from '@/lib/rider'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ role: 'anonymous' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Provider check: meal plans OR a providers row with a name set.
  // Both signals mean the user has intentionally set up as a provider.
  // Querying providers directly is important — a provider who deleted all their
  // meal plans still has their name set and should see provider UI.
  const [{ count: planCount }, { data: providerRow }] = await Promise.all([
    db
      .from('meal_plans')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', user.id),
    db
      .from('providers')
      .select('name')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  const isProvider =
    (planCount ?? 0) > 0 ||
    (typeof providerRow?.name === 'string' && providerRow.name.trim().length > 0)

  if (isProvider) {
    return NextResponse.json({ role: 'provider' })
  }

  // No provider setup — attempt rider linking and check
  const riderInfo = await findAndLinkRider(user.id, user.phone ?? null, user.email ?? null)
  if (riderInfo) {
    return NextResponse.json({ role: 'rider' })
  }

  // Brand new user, no provider setup, no rider match → provider onboarding
  return NextResponse.json({ role: 'provider' })
}
