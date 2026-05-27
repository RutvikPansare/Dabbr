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
