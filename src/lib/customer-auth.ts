/**
 * Customer session management.
 *
 * Completely separate from Supabase provider auth.
 * Sessions are stored in customer_sessions table.
 * The session token lives in an HttpOnly cookie: dabbr_cs
 */

import { cookies } from 'next/headers'
import { createAdminClient } from './supabase/admin'

export const SESSION_COOKIE = 'dabbr_cs'
const SESSION_DAYS = 30

export interface CustomerSession {
  accountId: string
  phone: string
  displayName: string | null
}

// ── Token generation ─────────────────────────────────────────────────────────

function generateSessionToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Cookie options ────────────────────────────────────────────────────────────

export function sessionCookieOptions(token: string) {
  const expires = new Date()
  expires.setDate(expires.getDate() + SESSION_DAYS)
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  }
}

// ── Create session ────────────────────────────────────────────────────────────

export async function createCustomerSession(accountId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const token = generateSessionToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS)

  await db.from('customer_sessions').insert({
    account_id: accountId,
    session_token: token,
    expires_at: expiresAt.toISOString(),
  })

  return token
}

// ── Read session (server-side) ────────────────────────────────────────────────

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('customer_sessions')
    .select('account_id, expires_at, customer_accounts ( phone, display_name )')
    .eq('session_token', token)
    .maybeSingle()

  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null

  // Fire-and-forget: update last_used_at
  void db
    .from('customer_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('session_token', token)

  return {
    accountId: data.account_id,
    phone: data.customer_accounts.phone,
    displayName: data.customer_accounts.display_name ?? null,
  }
}

// ── Destroy session ───────────────────────────────────────────────────────────

export async function destroyCustomerSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    await db.from('customer_sessions').delete().eq('session_token', token)
  }
}

// ── Normalize phone ───────────────────────────────────────────────────────────

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return '+91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits
  if (digits.length === 13 && digits.startsWith('091')) return '+91' + digits.slice(3)
  return null
}
