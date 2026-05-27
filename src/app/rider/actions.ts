'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getRiderId(userId: string): Promise<string | null> {
  const db = createAdminClient() as any
  const { data } = await db
    .from('delivery_riders')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.id ?? null
}

/** Mark a single notification dismissed (soft-delete, row preserved). */
export async function dismissRiderNotification(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const riderId = await getRiderId(user.id)
  if (!riderId) return

  const db = createAdminClient() as any
  const now = new Date().toISOString()
  await db
    .from('rider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('id', id)
    .eq('rider_id', riderId)
}

/** Dismiss all visible notifications for this rider at once. */
export async function dismissAllRiderNotifications(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const riderId = await getRiderId(user.id)
  if (!riderId) return

  const db = createAdminClient() as any
  const now = new Date().toISOString()
  await db
    .from('rider_notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('rider_id', riderId)
    .is('dismissed_at', null)
}
