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

  // Provider override: if the user has ANY meal plans they are a provider,
  // regardless of whether they are also a rider for someone else.
  const { count: planCount } = await db
    .from('meal_plans')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', user.id)

  if ((planCount ?? 0) > 0) {
    return NextResponse.json({ role: 'provider' })
  }

  // No meal plans — attempt rider linking and check
  const riderInfo = await findAndLinkRider(user.id, user.phone ?? null, user.email ?? null)
  if (riderInfo) {
    return NextResponse.json({ role: 'rider' })
  }

  // New user, no plans, no rider match → provider onboarding
  return NextResponse.json({ role: 'provider' })
}
