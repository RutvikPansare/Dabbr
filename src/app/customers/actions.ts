'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { customersTag, dashboardTag } from '@/lib/queries'

/**
 * Provider resolves a pending cancellation request by customer ID.
 * Used from the customer detail panel (no notification ID needed).
 *  - 'approve': cancel confirmed → subscription + customer → inactive
 *  - 'reject':  cancel rejected → subscription stays active
 * Also dismisses any open provider_notification for this customer.
 */
export async function resolveCancellationByCustomer(
  customerId: string,
  action: 'approve' | 'reject',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const db = createAdminClient() as any

  // Verify customer belongs to this provider
  const { data: customer } = await db
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('provider_id', user.id)
    .maybeSingle()
  if (!customer) return { ok: false, error: 'Customer not found' }

  // Find pending cancellation request
  const { data: cancelReq } = await db
    .from('cancellation_requests')
    .select('id, subscription_id')
    .eq('customer_id', customerId)
    .eq('provider_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!cancelReq) return { ok: false, error: 'No pending cancellation request found' }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  await db.from('cancellation_requests').update({ status: newStatus }).eq('id', cancelReq.id)

  if (action === 'approve') {
    await db.from('subscriptions').update({ status: 'inactive' }).eq('id', cancelReq.subscription_id)
    await db.from('customers').update({ status: 'inactive' }).eq('id', customerId)
  }

  // Dismiss the matching provider notification if one exists
  const now = new Date().toISOString()
  await db
    .from('provider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('provider_id', user.id)
    .eq('type', 'cancellation_request')
    .contains('payload', { customer_id: customerId })
    .is('dismissed_at', null)

  revalidateTag(customersTag(user.id), {})
  revalidateTag(dashboardTag(user.id), {})
  return { ok: true }
}
