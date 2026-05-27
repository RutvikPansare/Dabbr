'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { dashboardTag } from '@/lib/queries'

/**
 * Mark a notification as dismissed (hidden from the panel forever).
 * Sets dismissed_at — never deletes the row, so history / analytics are preserved.
 * Provider session is verified so providers can only dismiss their own notifications.
 */
export async function dismissNotification(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const db = createAdminClient() as any
  const now = new Date().toISOString()

  await db
    .from('provider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('id', id)
    .eq('provider_id', user.id)

  revalidateTag(dashboardTag(user.id), {})
}

/**
 * Dismiss all currently-visible notifications for this provider at once.
 */
export async function dismissAllNotifications(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const db = createAdminClient() as any
  const now = new Date().toISOString()

  await db
    .from('provider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('provider_id', user.id)
    .is('dismissed_at', null)

  revalidateTag(dashboardTag(user.id), {})
}

/**
 * Provider resolves a cancellation_request notification.
 *  - 'approve': marks the cancellation approved + deactivates the subscription
 *  - 'reject':  marks the cancellation rejected (subscription stays active)
 * In both cases the notification is dismissed from the bell.
 */
export async function resolveCancellation(
  notificationId: string,
  action: 'approve' | 'reject',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const db = createAdminClient() as any

  // Fetch the notification to get the customer_id from payload
  const { data: notif } = await db
    .from('provider_notifications')
    .select('id, payload, provider_id')
    .eq('id', notificationId)
    .eq('provider_id', user.id)   // ensures ownership
    .single()

  if (!notif) return { ok: false, error: 'Notification not found' }

  const customerId: string | undefined = notif.payload?.customer_id
  if (!customerId) return { ok: false, error: 'Missing customer reference' }

  // Find the pending cancellation request for this customer
  const { data: cancelReq } = await db
    .from('cancellation_requests')
    .select('id, subscription_id')
    .eq('customer_id', customerId)
    .eq('provider_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (cancelReq) {
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    await db
      .from('cancellation_requests')
      .update({ status: newStatus })
      .eq('id', cancelReq.id)

    if (action === 'approve') {
      // Deactivate the subscription
      await db
        .from('subscriptions')
        .update({ status: 'inactive' })
        .eq('id', cancelReq.subscription_id)

      // Also mark the customer as inactive
      await db
        .from('customers')
        .update({ status: 'inactive' })
        .eq('id', customerId)
        .eq('provider_id', user.id)
    }
  }

  // Dismiss the notification regardless (it's resolved either way)
  const now = new Date().toISOString()
  await db
    .from('provider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('id', notificationId)
    .eq('provider_id', user.id)

  revalidateTag(dashboardTag(user.id), {})
  return { ok: true }
}
