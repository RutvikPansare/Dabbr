/**
 * Cached server-side data fetching.
 *
 * All functions use unstable_cache (Next.js Data Cache) with the admin
 * client so they work correctly in the cache revalidation context (no
 * request cookies required — auth is enforced via explicit userId filters).
 *
 * Cache tags follow the pattern:
 *   provider-data-<userId>   ← broad tag; invalidating this clears everything
 *   customers-<userId>       ← fine-grained tag for customer mutations
 *   payments-<userId>        ← fine-grained tag for payment mutations
 *   dashboard-<userId>       ← fine-grained tag for delivery-log mutations
 *   settings-<userId>        ← fine-grained tag for settings mutations
 *   trial-<userId>           ← long-lived trial status
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import { getTrialStatus } from './trial'

// ── Tag helpers ───────────────────────────────────────────────────────────────

export const providerTag    = (uid: string) => `provider-data-${uid}`
export const customersTag   = (uid: string) => `customers-${uid}`
export const mealPlansTag   = (uid: string) => `meal-plans-${uid}`
export const paymentsTag    = (uid: string) => `payments-${uid}`
export const dashboardTag   = (uid: string) => `dashboard-${uid}`
export const settingsTag    = (uid: string) => `settings-${uid}`
export const trialTag       = (uid: string) => `trial-${uid}`

// ── Provider ──────────────────────────────────────────────────────────────────

export function getCachedProvider(userId: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient()
      const { data } = await db.from('providers').select('*').eq('id', userId).single()
      return data ?? null
    },
    [`provider-${userId}`],
    { tags: [providerTag(userId)], revalidate: 60 },
  )()
}

// ── Trial status ──────────────────────────────────────────────────────────────

export function getCachedTrialStatus(userId: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient()
      return getTrialStatus(db, userId)
    },
    [`trial-${userId}`],
    { tags: [providerTag(userId), trialTag(userId)], revalidate: 300 }, // 5 min — trial changes slowly
  )()
}

// ── Meal plans ────────────────────────────────────────────────────────────────

export function getCachedMealPlans(userId: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient() as any
      const { data } = await db
        .from('meal_plans')
        .select('*')
        .eq('provider_id', userId)
        .order('status')
        .order('name')
      return data ?? []
    },
    [`meal-plans-${userId}`],
    { tags: [providerTag(userId), mealPlansTag(userId)], revalidate: 60 },
  )()
}

// ── Customers (enriched with meal plan data) ──────────────────────────────────

export function getCachedCustomersData(userId: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient() as any
      const [{ data: customers }, { data: mealPlans }] = await Promise.all([
        db
          .from('customers')
          .select('*, pauses(*), subscriptions(*)')
          .eq('provider_id', userId)
          .order('name'),
        db.from('meal_plans').select('*').eq('provider_id', userId),
      ])
      const mpMap: Record<string, any> = {}
      for (const mp of (mealPlans ?? [])) mpMap[mp.id] = mp
      const enriched = (customers ?? []).map((c: any) => ({
        ...c,
        subscriptions: (c.subscriptions ?? []).map((s: any) => ({
          ...s,
          meal_plans: mpMap[s.meal_plan_id] ?? null,
        })),
      }))
      return { customers: enriched, mealPlans: mealPlans ?? [] }
    },
    [`customers-data-${userId}`],
    { tags: [providerTag(userId), customersTag(userId), mealPlansTag(userId)], revalidate: 60 },
  )()
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function getCachedPaymentsData(userId: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient() as any
      const [{ data: payments }, { data: monthlyPayments }] = await Promise.all([
        db
          .from('payments')
          .select('*, customers(id, name, whatsapp_number, area)')
          .eq('provider_id', userId)
          .order('recorded_at', { ascending: false })
          .limit(60),
        db
          .from('monthly_payments')
          .select('id, customer_id, amount, note, created_at')
          .eq('provider_id', userId)
          .order('created_at', { ascending: false }),
      ])
      return { payments: payments ?? [], monthlyPayments: monthlyPayments ?? [] }
    },
    [`payments-data-${userId}`],
    { tags: [providerTag(userId), paymentsTag(userId)], revalidate: 60 },
  )()
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getCachedSettingsData(userId: string, today: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient()
      const [{ data: quickTags }, { data: holidays }, { data: riders }] = await Promise.all([
        db
          .from('menu_quick_tags')
          .select('*')
          .eq('provider_id', userId)
          .order('meal_slot')
          .order('plan_type')
          .order('sort_order'),
        db
          .from('provider_holidays')
          .select('id, date, label')
          .eq('provider_id', userId)
          .gte('date', today)
          .order('date'),
        db
          .from('delivery_riders')
          .select('id, name, whatsapp_number')
          .eq('provider_id', userId)
          .order('created_at'),
      ])
      return {
        quickTags: quickTags ?? [],
        holidays: holidays ?? [],
        riders: riders ?? [],
      }
    },
    [`settings-data-${userId}-${today}`],
    { tags: [providerTag(userId), settingsTag(userId)], revalidate: 60 },
  )()
}

// ── Dashboard (heavy composite — cached separately so delivery invalidations
//    don't blow out customer/payment caches) ───────────────────────────────────

export function getCachedDashboardData(userId: string, today: string) {
  return unstable_cache(
    async () => {
      const db = createAdminClient() as any
      const [
        { data: customers },
        { data: mealPlans },
        { data: provider },
        { data: logsData },
        { data: holidayData },
        { data: riders },
        trial,
      ] = await Promise.all([
        db.from('customers').select('*, pauses(*), subscriptions(*)').eq('provider_id', userId).order('name'),
        db.from('meal_plans').select('*').eq('provider_id', userId),
        db.from('providers').select('*').eq('id', userId).single(),
        db.from('delivery_logs').select('customer_id, status').eq('provider_id', userId).eq('date', today),
        db.from('provider_holidays').select('label').eq('provider_id', userId).eq('date', today).maybeSingle(),
        db.from('delivery_riders').select('id, name, whatsapp_number').eq('provider_id', userId).order('created_at'),
        getTrialStatus(db, userId),
      ])

      const mpMap: Record<string, any> = {}
      for (const mp of (mealPlans ?? [])) mpMap[mp.id] = mp
      const enrichedCustomers = (customers ?? []).map((c: any) => ({
        ...c,
        subscriptions: (c.subscriptions ?? []).map((s: any) => ({
          ...s,
          meal_plans: mpMap[s.meal_plan_id] ?? null,
        })),
      }))

      const deliveryStatuses: Record<string, string> = {}
      for (const log of (logsData ?? [])) {
        deliveryStatuses[log.customer_id] = log.status
      }

      return {
        customers: enrichedCustomers,
        provider: provider ?? null,
        riders: riders ?? [],
        trial,
        deliveryStatuses,
        todayHoliday: holidayData ? { label: holidayData.label ?? null } : null,
      }
    },
    [`dashboard-data-${userId}-${today}`],
    // Short 30s TTL for delivery logs (they change throughout the day).
    // Fine-grained invalidation via dashboardTag happens on every delivery mark.
    { tags: [providerTag(userId), dashboardTag(userId)], revalidate: 30 },
  )()
}

// ── Today's menus (NOT cached — must always reflect what was just saved) ─────

export async function getTodayMenus(userId: string, today: string) {
  const db = createAdminClient() as any
  const { data } = await db
    .from('daily_menus')
    .select('meal_slot, plan_type, dish_name, quantities')
    .eq('provider_id', userId)
    .eq('menu_date', today)
  return (data ?? []) as Array<{ meal_slot: string; plan_type: string | null; dish_name: string; quantities: Record<string, number> | null }>
}
