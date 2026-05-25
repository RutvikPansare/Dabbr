'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOtp, verifyOtp } from '@/lib/otp'
import { normalizePhone } from '@/lib/customer-auth'

// ── Request OTP for provider login ───────────────────────────────────────────

export async function requestProviderOtp(
  rawPhone: string,
): Promise<{ ok: boolean; error?: string; phone?: string }> {
  const phone = normalizePhone(rawPhone)
  if (!phone) {
    return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' }
  }

  // Check that a provider exists with this phone before sending OTP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const digits = phone.replace(/\D/g, '').slice(-10)
  const { data: provider } = await db
    .from('providers')
    .select('id')
    .or(`phone.eq.${digits},phone.eq.+91${digits},phone.eq.91${digits}`)
    .maybeSingle()

  if (!provider) {
    return {
      ok: false,
      error: 'No provider account found for this number. Please sign in with Google, or update your phone number in Settings first.',
    }
  }

  const result = await sendOtp(phone)
  if (!result.ok) return result
  return { ok: true, phone }
}

// ── Verify OTP + generate Supabase magic link ────────────────────────────────

export async function verifyProviderOtp(
  phone: string,
  otp: string,
): Promise<{ ok: boolean; error?: string; email?: string; tokenHash?: string; magicLink?: string }> {
  const result = await verifyOtp(phone, otp)
  if (!result.ok) return result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const digits = phone.replace(/\D/g, '').slice(-10)

  // Find the provider row (id = supabase auth user id)
  const { data: provider } = await db
    .from('providers')
    .select('id')
    .or(`phone.eq.${digits},phone.eq.+91${digits},phone.eq.91${digits}`)
    .maybeSingle()

  if (!provider) {
    return { ok: false, error: 'Provider account not found.' }
  }

  // Get the provider's email from Supabase Auth
  const { data: authUser, error: authErr } = await db.auth.admin.getUserById(provider.id)
  if (authErr || !authUser?.user?.email) {
    return { ok: false, error: 'Could not retrieve account details. Please sign in with Google.' }
  }

  const email = authUser.user.email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Generate a one-time magic link for this provider — opens a real Supabase session
  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl}/auth/callback` },
  })

  if (linkErr || !linkData?.properties?.action_link || !linkData.properties.hashed_token) {
    return { ok: false, error: 'Failed to generate sign-in link. Please try again.' }
  }

  return {
    ok: true,
    email,
    tokenHash: linkData.properties.hashed_token,
    magicLink: linkData.properties.action_link,
  }
}

// ── Google OAuth redirect (keep existing flow available) ─────────────────────

export async function redirectToGoogle(): Promise<never> {
  redirect('/api/auth/google') // handled by GoogleSignInButton client-side
}
