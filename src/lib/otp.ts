/**
 * OTP generation, hashing, and dispatch for customer phone auth.
 *
 * SMS provider is configured via SMS_PROVIDER env var:
 *   console    (default) — logs OTP to server console
 *   twofactor  — 2Factor.in  (recommended for India, cheapest)
 *   msg91      — MSG91
 *   twilio     — Twilio
 */

import { createAdminClient } from './supabase/admin'

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateOtp(): string {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function hashOtp(otp: string): Promise<string> {
  const secret = process.env.OTP_SECRET ?? 'dabbr-otp-secret-change-in-prod'
  const data = new TextEncoder().encode(otp + secret)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Send OTP ─────────────────────────────────────────────────────────────────

export async function sendOtp(
  phone: string,
): Promise<{ ok: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Rate limit: max 3 OTPs per phone per 10 minutes
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await db
    .from('customer_otps')
    .select('*', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', since)

  if ((count ?? 0) >= 3) {
    return { ok: false, error: 'Too many requests. Please wait a few minutes.' }
  }

  // Invalidate previous unused OTPs for this phone
  await db
    .from('customer_otps')
    .update({ used: true })
    .eq('phone', phone)
    .eq('used', false)

  const otp = generateOtp()
  const hash = await hashOtp(otp)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { data: insertedOtp, error: insertError } = await db.from('customer_otps').insert({
    phone,
    otp_hash: hash,
    expires_at: expiresAt,
  }).select('id').single()

  if (insertError) {
    return { ok: false, error: 'Could not create verification code. Please try again.' }
  }

  const smsResult = await dispatchSms(phone, otp)
  if (!smsResult.ok) {
    if (insertedOtp?.id) {
      await db.from('customer_otps').update({ used: true }).eq('id', insertedOtp.id)
    }
    return {
      ok: false,
      error: smsResult.error ?? 'Could not send verification code. Please try again.',
    }
  }

  return { ok: true }
}

// ── Verify OTP ───────────────────────────────────────────────────────────────

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<{ ok: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Get the latest unused OTP for this phone
  const { data: row } = await db
    .from('customer_otps')
    .select('id, otp_hash, expires_at, attempts, used')
    .eq('phone', phone)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return { ok: false, error: 'No code found. Please request a new one.' }
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, error: 'Code expired. Please request a new one.' }
  }
  if (row.attempts >= 3) {
    return { ok: false, error: 'Too many incorrect attempts. Please request a new code.' }
  }

  const hash = await hashOtp(otp)
  if (hash !== row.otp_hash) {
    await db
      .from('customer_otps')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
    const left = 2 - row.attempts
    return {
      ok: false,
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many attempts.',
    }
  }

  // Mark as used
  await db.from('customer_otps').update({ used: true }).eq('id', row.id)
  return { ok: true }
}

// ── SMS dispatch ──────────────────────────────────────────────────────────────

async function dispatchSms(phone: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const provider = process.env.SMS_PROVIDER ?? 'console'

  if (provider === 'console') {
    console.log(`\n🔐 [OTP] ${phone} → ${otp}\n`)
    return { ok: true }
  }

  if (provider === 'twofactor') {
    // 2Factor.in — simple GET API, no DLT template required for transactional OTPs
    // Phone: 10-digit Indian number (strip country code)
    const apiKey = process.env.TWOFACTOR_API_KEY
    if (!apiKey || apiKey === 'your_2factor_api_key_here') {
      return { ok: false, error: '2Factor API key is not configured.' }
    }

    const digits = phone.replace(/\D/g, '').slice(-10)
    const templateName = process.env.TWOFACTOR_TEMPLATE_NAME ?? 'AUTOGEN' // AUTOGEN = 2Factor default OTP template
    const response = await fetch(
      `https://2factor.in/API/V1/${apiKey}/SMS/${digits}/${otp}/${templateName}`,
      { method: 'GET' },
    )
    const body = await response.text()

    if (!response.ok || !body.toLowerCase().includes('success')) {
      console.error('[OTP] 2Factor send failed:', body)
      return { ok: false, error: 'SMS provider could not send the OTP.' }
    }

    return { ok: true }
  }

  if (provider === 'msg91') {
    const authKey = process.env.MSG91_AUTH_KEY
    const templateId = process.env.MSG91_TEMPLATE_ID
    if (!authKey || !templateId) {
      return { ok: false, error: 'MSG91 credentials are not configured.' }
    }

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        mobile: phone.replace('+', ''),
        otp,
      }),
    })
    if (!response.ok) {
      console.error('[OTP] MSG91 send failed:', await response.text())
      return { ok: false, error: 'SMS provider could not send the OTP.' }
    }

    return { ok: true }
  }

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    if (!sid || !token || !from) {
      return { ok: false, error: 'Twilio credentials are not configured.' }
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${sid}:${token}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: from,
          Body: `Your Dabbr code is ${otp}. Valid for 10 minutes. Do not share it.`,
        }),
      },
    )
    if (!response.ok) {
      console.error('[OTP] Twilio send failed:', await response.text())
      return { ok: false, error: 'SMS provider could not send the OTP.' }
    }

    return { ok: true }
  }

  return { ok: false, error: `Unsupported SMS provider: ${provider}` }
}
