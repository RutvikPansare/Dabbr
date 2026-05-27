'use server'

/**
 * Server actions for the customer portal.
 * Each action re-validates the token before mutating — the token IS the auth.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveChangeDate } from '@/lib/cutoff'

interface ActionResult {
  ok: boolean
  error?: string
}

// ── Token validation helper ──────────────────────────────────────────────────

async function validateToken(token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('customer_access_tokens')
    .select('customer_id, provider_id, is_active')
    .eq('token', token)
    .single()

  if (!data?.is_active) return null
  return data as { customer_id: string; provider_id: string }
}

async function getProvider(providerId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('providers')
    .select('cutoff_hour, cutoff_tz')
    .eq('id', providerId)
    .single()
  return data as { cutoff_hour: number; cutoff_tz: string } | null
}

// ── Pause subscription ───────────────────────────────────────────────────────

export async function pauseSubscription(
  token: string,
  startDate: string,
  endDate: string,
  reason: string,
): Promise<ActionResult> {
  const ctx = await validateToken(token)
  if (!ctx) return { ok: false, error: 'Invalid or expired link.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const provider = await getProvider(ctx.provider_id)
  const earliestStart = getEffectiveChangeDate(
    provider?.cutoff_hour ?? 21,
    provider?.cutoff_tz ?? 'Asia/Kolkata',
  )

  // Clamp: start date can't be before the earliest allowed date
  const effectiveStart = startDate >= earliestStart ? startDate : earliestStart

  if (endDate < effectiveStart) {
    return { ok: false, error: 'End date must be on or after the start date.' }
  }

  // Get active subscription
  const { data: sub } = await db
    .from('subscriptions')
    .select('id')
    .eq('customer_id', ctx.customer_id)
    .in('status', ['active', 'paused'])
    .single()

  if (!sub) return { ok: false, error: 'No active subscription found.' }

  // Check for overlapping pause
  const { data: existing } = await db
    .from('subscription_pauses')
    .select('id')
    .eq('subscription_id', sub.id)
    .gte('end_date', effectiveStart)
    .maybeSingle()

  if (existing) return { ok: false, error: 'You already have a pause scheduled for that period.' }

  // Insert pause
  const { error: insertErr } = await db.from('subscription_pauses').insert({
    subscription_id: sub.id,
    provider_id: ctx.provider_id,
    start_date: effectiveStart,
    end_date: endDate,
    reason: reason.trim() || null,
  })

  if (insertErr) return { ok: false, error: 'Failed to pause. Please try again.' }

  // Mark subscription as paused
  await db
    .from('subscriptions')
    .update({ status: 'paused', paused_at: new Date().toISOString() })
    .eq('id', sub.id)

  // Notify the provider
  const { data: customer } = await db
    .from('customers')
    .select('name')
    .eq('id', ctx.customer_id)
    .single()
  const customerName: string = customer?.name ?? 'A customer'
  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const trimmedReason = reason.trim() || null
  await db.from('provider_notifications').insert({
    provider_id: ctx.provider_id,
    type: 'pause',
    title: customerName,
    message: `Paused ${fmtDate(effectiveStart)} – ${fmtDate(endDate)}${trimmedReason ? ` · ${trimmedReason}` : ''}`,
    payload: {
      customer_id: ctx.customer_id,
      customer_name: customerName,
      start_date: effectiveStart,
      end_date: endDate,
      reason: trimmedReason,
    },
  })

  return { ok: true }
}

// ── Resume subscription ──────────────────────────────────────────────────────

export async function resumeSubscription(token: string): Promise<ActionResult> {
  const ctx = await validateToken(token)
  if (!ctx) return { ok: false, error: 'Invalid or expired link.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const provider = await getProvider(ctx.provider_id)
  const effectiveResume = getEffectiveChangeDate(
    provider?.cutoff_hour ?? 21,
    provider?.cutoff_tz ?? 'Asia/Kolkata',
  )

  // Get active subscription
  const { data: sub } = await db
    .from('subscriptions')
    .select('id')
    .eq('customer_id', ctx.customer_id)
    .in('status', ['active', 'paused'])
    .single()

  if (!sub) return { ok: false, error: 'No subscription found.' }

  const today = new Date().toISOString().split('T')[0]

  // End any current or upcoming pauses that haven't started yet (or are active)
  // Pauses ending before effectiveResume: shorten their end_date to yesterday
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
  await db
    .from('subscription_pauses')
    .update({ end_date: yesterday })
    .eq('subscription_id', sub.id)
    .gte('end_date', today)

  // Mark subscription as active
  await db
    .from('subscriptions')
    .update({ status: 'active', paused_at: null })
    .eq('id', sub.id)

  return { ok: true }
}

// ── Request cancellation ─────────────────────────────────────────────────────

export async function requestCancellation(
  token: string,
  reason: string,
): Promise<ActionResult> {
  const ctx = await validateToken(token)
  if (!ctx) return { ok: false, error: 'Invalid or expired link.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Get active subscription
  const { data: sub } = await db
    .from('subscriptions')
    .select('id')
    .eq('customer_id', ctx.customer_id)
    .in('status', ['active', 'paused'])
    .single()

  if (!sub) return { ok: false, error: 'No active subscription found.' }

  // Check for existing pending request
  const { data: existing } = await db
    .from('cancellation_requests')
    .select('id')
    .eq('subscription_id', sub.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return { ok: false, error: 'A cancellation request is already pending. Your provider will be in touch.' }
  }

  const { error: insertErr } = await db.from('cancellation_requests').insert({
    subscription_id: sub.id,
    customer_id: ctx.customer_id,
    provider_id: ctx.provider_id,
    reason: reason.trim() || null,
  })

  if (insertErr) return { ok: false, error: 'Failed to submit request. Please try again.' }

  // Notify the provider

  const { data: customer } = await db
    .from('customers')
    .select('name')
    .eq('id', ctx.customer_id)
    .single()
  const customerName: string = customer?.name ?? 'A customer'
  const trimmedReason = reason.trim() || null
  await db.from('provider_notifications').insert({
    provider_id: ctx.provider_id,
    type: 'cancellation_request',
    title: customerName,
    message: `Requested cancellation${trimmedReason ? ` · ${trimmedReason}` : ''}`,
    payload: {
      customer_id: ctx.customer_id,
      customer_name: customerName,
      reason: trimmedReason,
    },
  })

  return { ok: true }
}

// ── Withdraw cancellation request ────────────────────────────────────────────

export async function withdrawCancellation(token: string): Promise<ActionResult> {
  const ctx = await validateToken(token)
  if (!ctx) return { ok: false, error: 'Invalid or expired link.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Find the subscription (any status — pending-cancel keeps subscription active)
  const { data: sub } = await db
    .from('subscriptions')
    .select('id')
    .eq('customer_id', ctx.customer_id)
    .single()

  if (!sub) return { ok: false, error: 'No subscription found.' }

  // Mark the pending request as withdrawn
  const { error } = await db
    .from('cancellation_requests')
    .update({ status: 'withdrawn' })
    .eq('subscription_id', sub.id)
    .eq('status', 'pending')

  if (error) return { ok: false, error: 'Could not withdraw the request. Please try again.' }

  // Dismiss the matching provider notification so it clears from the bell
  const now = new Date().toISOString()
  await db
    .from('provider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('provider_id', ctx.provider_id)
    .eq('type', 'cancellation_request')
    .contains('payload', { customer_id: ctx.customer_id })
    .is('dismissed_at', null)

  return { ok: true }
}
