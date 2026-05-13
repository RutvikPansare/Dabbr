// ── Trial status helper (server-side only) ─────────────────────────────────
//
// Trial = 30 days from trial_started_at.
// If is_subscribed = true → no gate ever.
// If trial_started_at is null (pre-migration rows) → treat as 30 days left.
//

export interface TrialStatus {
  isSubscribed: boolean
  /** null when subscribed. Otherwise days remaining (can be ≤ 0 = expired). */
  trialDaysLeft: number | null
  isExpired: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTrialStatus(supabase: any, providerId: string): Promise<TrialStatus> {
  const { data } = await supabase
    .from('providers')
    .select('is_subscribed, trial_started_at')
    .eq('id', providerId)
    .single()

  // Fallback: if columns don't exist yet (pre-migration), never gate
  if (!data || data.is_subscribed === undefined) {
    return { isSubscribed: true, trialDaysLeft: null, isExpired: false }
  }

  if (data.is_subscribed) {
    return { isSubscribed: true, trialDaysLeft: null, isExpired: false }
  }

  // trial_started_at not set yet → give full 30 days
  if (!data.trial_started_at) {
    return { isSubscribed: false, trialDaysLeft: 30, isExpired: false }
  }

  const daysPassed =
    (Date.now() - new Date(data.trial_started_at as string).getTime()) / 86_400_000
  const trialDaysLeft = Math.ceil(30 - daysPassed)

  return {
    isSubscribed: false,
    trialDaysLeft,
    isExpired: trialDaysLeft <= 0,
  }
}
