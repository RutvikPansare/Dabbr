// ── Unified balance model ─────────────────────────────────────────────────────
//
// Every customer has:
//   balance      — rupees in their account (positive = credit, negative = owes)
//   credit_limit — the minimum balance allowed (default 0 = must stay positive)
//   price_per_month — from their meal plan / customer record
//
// Days left   = balance / (price_per_month / 30)      (can be fractional / negative)
// Amount due  = max(0, credit_limit - balance)         (how much to reach the limit)
// State       = based on days left and whether below credit_limit

// ── Balance state ─────────────────────────────────────────────────────────────

export type BalanceState = 'good' | 'low' | 'critical'

export interface BalanceSummary {
  balance:       number   // rupees
  creditLimit:   number   // rupees (min threshold)
  daysLeft:      number   // computed, can be negative
  perDayCost:    number   // rupees / day
  amountDue:     number   // how much customer needs to pay to reach credit_limit
  state:         BalanceState
}

export function computeBalance(params: {
  balance:      number | null | undefined
  creditLimit:  number | null | undefined
  monthlyPrice: number | null | undefined
}): BalanceSummary {
  const balance      = params.balance      ?? 0
  const creditLimit  = params.creditLimit  ?? 0
  const monthlyPrice = params.monthlyPrice ?? 0
  const perDayCost   = monthlyPrice > 0 ? monthlyPrice / 30 : 0
  const daysLeft     = perDayCost > 0 ? balance / perDayCost : 0
  const amountDue    = Math.max(0, creditLimit - balance)

  const state: BalanceState =
    balance <= creditLimit ? 'critical' :
    daysLeft <= 5          ? 'low'      :
    'good'

  return {
    balance,
    creditLimit,
    daysLeft,
    perDayCost,
    amountDue,
    state,
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const DUE_COLORS = {
  good:     { text: 'text-green-600', bg: 'bg-green-50 border-green-100',  pill: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
  low:      { text: 'text-amber-600', bg: 'bg-amber-50 border-amber-100',  pill: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
  critical: { text: 'text-red-600',   bg: 'bg-red-50   border-red-100',    pill: 'bg-red-100   text-red-700',    dot: 'bg-red-500'    },
} as const

export function balanceStateLabel(state: BalanceState): string {
  return state === 'critical' ? '🚨 Low balance'
       : state === 'low'      ? '⚠️ Running low'
       : '✓ Healthy'
}

export function fmtRupees(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '₹0'
  return '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN')
}

export function fmtDays(days: number | null | undefined): string {
  if (days == null || isNaN(days)) return '0d'
  const d = Math.floor(days)
  if (d <= 0) return '0d'
  return `${d}d`
}

// ── Legacy re-exports (kept so old import sites don't break during migration) ─

/** @deprecated Use computeBalance instead */
export type BillingType = 'prepaid' | 'monthly_settlement'

/** @deprecated Use BalanceSummary instead */
export type MonthlyDueSummary = {
  outstanding: number
  effectiveLimit: number
  effectiveMealRate: number
  state: 'healthy' | 'due_soon' | 'critical'
  percentUsed: number
}

/** @deprecated Use computeBalance instead */
export function computeMonthlyDue(params: {
  mealsDelivered: number
  totalPaid: number
  mealRate: number | null
  creditLimit: number | null
  defaultMealRate: number
  defaultCreditLimit: number
}): MonthlyDueSummary {
  const effectiveMealRate = params.mealRate    ?? params.defaultMealRate
  const effectiveLimit    = params.creditLimit ?? params.defaultCreditLimit
  const gross             = params.mealsDelivered * effectiveMealRate
  const outstanding       = Math.max(0, gross - params.totalPaid)
  const percentUsed       = effectiveLimit > 0
    ? Math.min(150, Math.round((outstanding / effectiveLimit) * 100))
    : 0
  const state = outstanding >= effectiveLimit       ? 'critical'
              : outstanding >= effectiveLimit * 0.7 ? 'due_soon'
              : 'healthy'
  return { outstanding, effectiveLimit, effectiveMealRate, state, percentUsed }
}

/** @deprecated Use DUE_COLORS with BalanceState keys instead */
export function dueStateLabel(state: MonthlyDueSummary['state']): string {
  return state === 'critical' ? '🚨 Limit exceeded'
       : state === 'due_soon' ? '⚠️ Due soon'
       : '✓ Healthy'
}
