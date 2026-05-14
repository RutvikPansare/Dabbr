/**
 * Customer portal token system.
 *
 * Tokens are 32-byte cryptographically random values encoded as base64url.
 * Result is 43 characters — effectively impossible to brute-force.
 *
 * All data fetching uses the service-role client (server-side only).
 * Tokens are never stored in cookies or sessions — the URL IS the credential.
 */
import type { MealSlot, PlanType, SubscriptionStatus } from '@/types/database'
import { createAdminClient } from './supabase/admin'
import { getWeekDates } from './cutoff'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PortalCustomer {
  id: string
  name: string
  status: 'active' | 'paused' | 'inactive'
  balance_days: number
  created_at: string
  address: string | null
  notes: string | null
}

export interface PortalProvider {
  id: string
  name: string
  cutoff_hour: number
  cutoff_tz: string
  upi_id: string | null
  phone: string | null
}

export interface PortalMealPlan {
  id: string
  name: string
  meal_slots: MealSlot[]
  plan_type: PlanType
  frequency: 'daily' | 'alternate'
  monthly_price: number
  description: string | null
}

export interface PortalActivePause {
  id: string
  start_date: string
  end_date: string
  reason: string | null
}

export interface PortalSubscription {
  id: string
  status: SubscriptionStatus
  start_date: string
  meal_plan: PortalMealPlan
  active_pause: PortalActivePause | null
  pending_cancel: boolean
}

export interface MenuDish {
  dish_name: string
  plan_type: PlanType | null
  notes: string | null
}

export interface MenuSlot {
  slot: MealSlot
  dishes: MenuDish[]
}

export interface DayMenu {
  date: string // YYYY-MM-DD
  slots: MenuSlot[]
}

export interface CustomerPortalData {
  customer: PortalCustomer
  provider: PortalProvider
  subscription: PortalSubscription | null
  todayMenu: MenuSlot[]
  weekMenu: DayMenu[]  // today + next 6 days
  token: string
}

// ── Token generation ────────────────────────────────────────────────────────

/**
 * Generates a 43-char base64url token using Web Crypto API.
 * Safe to call in browser (provider admin) or server (Node crypto).
 */
export function generateCustomerToken(): string {
  const bytes = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Node.js fallback (server actions)
    const { randomFillSync } = require('crypto') as typeof import('crypto')
    randomFillSync(bytes)
  }
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ── Portal data fetching ────────────────────────────────────────────────────

/**
 * Validates a token and returns the full portal data.
 * Returns null if token is invalid or revoked.
 * Uses service-role client — ONLY call server-side.
 */
export async function getPortalData(token: string): Promise<CustomerPortalData | null> {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  // 1. Validate token
  const { data: tokenRow } = await db
    .from('customer_access_tokens')
    .select('customer_id, provider_id, is_active')
    .eq('token', token)
    .single()

  if (!tokenRow?.is_active) return null

  // 2. Update last_used_at (fire-and-forget)
  void db
    .from('customer_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token', token)

  // 3. Fetch customer + provider in parallel
  const [{ data: customer }, { data: provider }] = await Promise.all([
    db
      .from('customers')
      .select('id, name, status, balance_days, created_at, address, notes')
      .eq('id', tokenRow.customer_id)
      .single(),
    db
      .from('providers')
      .select('id, name, cutoff_hour, cutoff_tz, upi_id, phone')
      .eq('id', tokenRow.provider_id)
      .single(),
  ])

  if (!customer || !provider) return null

  // 4. Fetch active/paused subscription with meal plan
  const { data: subRaw } = await db
    .from('subscriptions')
    .select(`
      id, status, start_date,
      meal_plans ( id, name, meal_slots, plan_type, frequency, monthly_price, description )
    `)
    .eq('customer_id', tokenRow.customer_id)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let subscription: PortalSubscription | null = null
  if (subRaw?.meal_plans) {
    const today = new Date().toISOString().split('T')[0]

    // Active pause for this subscription
    const { data: pauseRaw } = await db
      .from('subscription_pauses')
      .select('id, start_date, end_date, reason')
      .eq('subscription_id', subRaw.id)
      .lte('start_date', today)
      .gte('end_date', today)
      .maybeSingle()

    // Pending cancellation request
    const { data: cancelRaw } = await db
      .from('cancellation_requests')
      .select('id')
      .eq('subscription_id', subRaw.id)
      .eq('status', 'pending')
      .maybeSingle()

    subscription = {
      id: subRaw.id,
      status: subRaw.status,
      start_date: subRaw.start_date,
      meal_plan: subRaw.meal_plans,
      active_pause: pauseRaw ?? null,
      pending_cancel: !!cancelRaw,
    }
  }

  // 5. Fetch menus (today + 6 days ahead)
  const dates = getWeekDates(7)
  const { data: menuRows } = await db
    .from('daily_menus')
    .select('menu_date, meal_slot, dish_name, plan_type, notes')
    .eq('provider_id', tokenRow.provider_id)
    .gte('menu_date', dates[0])
    .lte('menu_date', dates[dates.length - 1])
    .order('menu_date')
    .order('meal_slot')

  // Group menus by date → slot → dishes
  const menuMap: Record<string, Record<string, MenuDish[]>> = {}
  for (const row of (menuRows ?? [])) {
    if (!menuMap[row.menu_date]) menuMap[row.menu_date] = {}
    if (!menuMap[row.menu_date][row.meal_slot]) menuMap[row.menu_date][row.meal_slot] = []
    menuMap[row.menu_date][row.meal_slot].push({
      dish_name: row.dish_name,
      plan_type: row.plan_type,
      notes: row.notes,
    })
  }

  // Customer's meal slots (from subscription plan, fallback to ['lunch'])
  const customerSlots: MealSlot[] = subscription?.meal_plan.meal_slots ?? ['lunch']
  const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner']

  function buildDayMenu(date: string): MenuSlot[] {
    const dayMap = menuMap[date] ?? {}
    return SLOT_ORDER
      .filter(slot => customerSlots.includes(slot))
      .map(slot => ({
        slot,
        dishes: dayMap[slot] ?? [],
      }))
  }

  const todayMenu = buildDayMenu(dates[0])
  const weekMenu: DayMenu[] = dates.map(date => ({
    date,
    slots: buildDayMenu(date),
  }))

  return {
    customer,
    provider: {
      ...provider,
      cutoff_hour: provider.cutoff_hour ?? 21,
      cutoff_tz: provider.cutoff_tz ?? 'Asia/Kolkata',
    },
    subscription,
    todayMenu,
    weekMenu,
    token,
  }
}
