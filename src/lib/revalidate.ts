'use server'

/**
 * Cache invalidation server actions.
 * Call these from client components after mutations so the next navigation
 * gets fresh data instead of a stale cached page.
 *
 * Tags are inlined here (not imported from queries.ts) to avoid bundling
 * the admin Supabase client into the server-action boundary.
 */

import { revalidateTag } from 'next/cache'

const t = {
  provider: (uid: string) => `provider-data-${uid}`,
  customers: (uid: string) => `customers-${uid}`,
  mealPlans: (uid: string) => `meal-plans-${uid}`,
  payments: (uid: string) => `payments-${uid}`,
  dashboard: (uid: string) => `dashboard-${uid}`,
  settings: (uid: string) => `settings-${uid}`,
}

// Next.js 16 requires a second `profile` argument for revalidateTag.
// Passing {} (empty CacheLifeConfig) matches both old and new cache tags.
const P = {}

/** Blow out ALL cached data for this provider. Use after broad changes. */
export async function invalidateProviderCache(userId: string) {
  revalidateTag(t.provider(userId), P)
}

/** Invalidate only customer list (add / edit / delete customer). */
export async function invalidateCustomers(userId: string) {
  revalidateTag(t.customers(userId), P)
  revalidateTag(t.dashboard(userId), P)
}

/** Invalidate meal plans. */
export async function invalidateMealPlans(userId: string) {
  revalidateTag(t.mealPlans(userId), P)
}

/** Invalidate payments. */
export async function invalidatePayments(userId: string) {
  revalidateTag(t.payments(userId), P)
}

/** Invalidate dashboard delivery logs (call after marking a delivery). */
export async function invalidateDashboard(userId: string) {
  revalidateTag(t.dashboard(userId), P)
}

/** Invalidate settings (riders, holidays, quick tags, provider info). */
export async function invalidateSettings(userId: string) {
  revalidateTag(t.settings(userId), P)
  revalidateTag(t.provider(userId), P)
}
