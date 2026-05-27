import { createAdminClient } from '@/lib/supabase/admin'

export interface RiderInfo {
  id: string
  name: string
  provider_id: string
  whatsapp_number: string
  email: string | null
  invite_status: string
}

export interface RiderAssignment {
  id: string
  scope: 'full' | 'area'
  area_name: string | null
  assignment_date: string
}

/** Strip all non-digits then take the last 10 digits (handles +91, 91, 0 prefixes). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/** Look up rider record by user_id (already linked). */
export async function getRiderInfo(userId: string): Promise<RiderInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('delivery_riders')
    .select('id, name, provider_id, whatsapp_number, email, invite_status')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? null
}

/**
 * Detect whether the logged-in user is a rider.
 * If their phone/email matches an unlinked delivery_rider row, links it on the spot.
 * Returns the rider record, or null if this user is a provider.
 */
export async function findAndLinkRider(
  userId: string,
  phone: string | null | undefined,
  email: string | null | undefined,
): Promise<RiderInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // 1. Already linked?
  const existing = await getRiderInfo(userId)
  if (existing) return existing

  // 2. Try phone match — normalize both sides to 10-digit
  if (phone) {
    const normalizedAuth = normalizePhone(phone)
    const { data: allRiders } = await db
      .from('delivery_riders')
      .select('id, name, provider_id, whatsapp_number, email, invite_status')
      .is('user_id', null)

    const match = (allRiders ?? []).find(
      (r: { whatsapp_number: string }) => normalizePhone(r.whatsapp_number) === normalizedAuth
    )
    if (match) {
      await db
        .from('delivery_riders')
        .update({ user_id: userId, invite_status: 'active' })
        .eq('id', match.id)
      return { ...match, user_id: userId, invite_status: 'active' }
    }
  }

  // 3. Try email match
  if (email) {
    const { data: byEmail } = await db
      .from('delivery_riders')
      .select('id, name, provider_id, whatsapp_number, email, invite_status')
      .eq('email', email.toLowerCase())
      .is('user_id', null)
      .maybeSingle()

    if (byEmail) {
      await db
        .from('delivery_riders')
        .update({ user_id: userId, invite_status: 'active' })
        .eq('id', byEmail.id)
      return { ...byEmail, user_id: userId, invite_status: 'active' }
    }
  }

  return null
}

/** Get today's assignments for a rider. */
export async function getRiderAssignments(
  riderId: string,
  date: string,
): Promise<RiderAssignment[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('rider_assignments')
    .select('id, scope, area_name, assignment_date')
    .eq('rider_id', riderId)
    .eq('assignment_date', date)
  return data ?? []
}
