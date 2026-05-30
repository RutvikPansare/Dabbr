export const REFERRAL_BONUS_DAYS = 15

/**
 * Generates a human-readable referral code from a provider name.
 * e.g.  "Rutvik Pansare" → "RUTVIK26"
 *       "Reya"           → "REYA26"
 *       ""               → "DAB26ABC"  (random fallback)
 *
 * Collision-handling is done at the call site by appending digits.
 */
export function generateReferralCode(name: string): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const letters = (name ?? '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 6)

  if (letters.length >= 3) return `${letters}${year}`

  // Fallback: DAB + year + 2 random digits
  const rand = Math.floor(Math.random() * 90 + 10)
  return `DAB${year}${rand}`
}

/**
 * Extends a subscription period by N days.
 * If current period is in the past (e.g. free user), extends from today.
 */
export function extendPeriodEnd(
  currentPeriodEnd: string | null | undefined,
  days: number,
): string {
  const base = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date()
  // If somehow in the past, start from today
  const from = base < new Date() ? new Date() : base
  from.setDate(from.getDate() + days)
  return from.toISOString()
}
