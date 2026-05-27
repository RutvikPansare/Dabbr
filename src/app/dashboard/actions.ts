'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { dashboardTag } from '@/lib/queries'

/**
 * Mark a provider notification as seen so it no longer appears after dismissal.
 * Uses the provider's authenticated session to ensure they can only dismiss
 * their own notifications.
 */
export async function dismissProviderNotification(
  type: 'pause' | 'cancel',
  id: string,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const db = createAdminClient() as any

  if (type === 'pause') {
    await db
      .from('subscription_pauses')
      .update({ provider_seen: true })
      .eq('id', id)
      .eq('provider_id', user.id)
  } else {
    await db
      .from('cancellation_requests')
      .update({ provider_seen: true })
      .eq('id', id)
      .eq('provider_id', user.id)
  }

  // Bust the dashboard cache so a manual refresh picks up the updated counts
  revalidateTag(dashboardTag(user.id), {})
}
