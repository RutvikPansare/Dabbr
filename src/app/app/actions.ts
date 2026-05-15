'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOtp, verifyOtp } from '@/lib/otp'
import {
  createCustomerSession,
  destroyCustomerSession,
  normalizePhone,
  sessionCookieOptions,
} from '@/lib/customer-auth'

// ── Request OTP ──────────────────────────────────────────────────────────────

export async function requestOtp(
  rawPhone: string,
): Promise<{ ok: boolean; error?: string; phone?: string }> {
  const phone = normalizePhone(rawPhone)
  if (!phone) {
    return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' }
  }
  const result = await sendOtp(phone)
  if (!result.ok) return result
  return { ok: true, phone }
}

// ── Verify OTP + create session ───────────────────────────────────────────────

export async function verifyAndLogin(
  phone: string,
  otp: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await verifyOtp(phone, otp)
  if (!result.ok) return result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Get or create customer account
  let { data: account } = await db
    .from('customer_accounts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  if (!account) {
    const { data: created } = await db
      .from('customer_accounts')
      .insert({ phone })
      .select('id')
      .single()
    account = created
  } else {
    void db
      .from('customer_accounts')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', account.id)
  }

  if (!account) return { ok: false, error: 'Failed to create account. Please try again.' }

  // Auto-link any customers whose whatsapp_number matches this phone
  // Safe: OTP proved they own the number; linking gives them access to their own data
  const digits = phone.replace(/\D/g, '').slice(-10) // last 10 digits
  const { data: matchingCustomers } = await db
    .from('customers')
    .select('id')
    .is('account_id', null)
    .or(`whatsapp_number.eq.${digits},whatsapp_number.eq.+91${digits},whatsapp_number.eq.91${digits}`)

  if (matchingCustomers?.length) {
    await db
      .from('customers')
      .update({ account_id: account.id })
      .in('id', matchingCustomers.map((c: { id: string }) => c.id))
  }

  // Create session and set cookie
  const sessionToken = await createCustomerSession(account.id)
  const cookieStore = await cookies()
  const opts = sessionCookieOptions(sessionToken)
  cookieStore.set(opts.name, opts.value, opts)

  return { ok: true }
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logoutCustomer(): Promise<void> {
  await destroyCustomerSession()
  const cookieStore = await cookies()
  cookieStore.delete('dabbr_cs')
  redirect('/app')
}

// ── Link a magic-link subscription to the logged-in account ──────────────────
// Called from the customer portal when a logged-in user opens their magic link.

export async function linkSubscriptionToAccount(
  token: string,
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: tokenRow } = await db
    .from('customer_access_tokens')
    .select('customer_id, is_active')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow?.is_active) return { ok: false, error: 'Invalid token.' }

  const { data: customer } = await db
    .from('customers')
    .select('id, account_id')
    .eq('id', tokenRow.customer_id)
    .single()

  if (!customer) return { ok: false, error: 'Customer not found.' }

  // Already linked to this account — no-op
  if (customer.account_id === accountId) return { ok: true }

  // Linked to a DIFFERENT account — reject (prevent takeover)
  if (customer.account_id && customer.account_id !== accountId) {
    return { ok: false, error: 'already_linked_elsewhere' }
  }

  await db.from('customers').update({ account_id: accountId }).eq('id', customer.id)
  return { ok: true }
}
