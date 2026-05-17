// ── Monthly Settlement billing helpers ────────────────────────────────────────
//
// Amount Due = (meals_delivered × effective_meal_rate) − total_paid
//
// This is always computed — never stored — so it's always accurate.

export type BillingType = 'prepaid' | 'monthly_settlement'

export interface MonthlyDueSummary {
  outstanding:       number   // ₹ currently owed
  effectiveLimit:    number   // ₹ soft limit (customer override ?? provider default)
  effectiveMealRate: number   // ₹ per delivery
  state:             'healthy' | 'due_soon' | 'critical'
  percentUsed:       number   // 0–150+
}

export function computeMonthlyDue(params: {
  mealsDelivered:    number
  totalPaid:         number
  mealRate:          number | null   // customer-level override
  creditLimit:       number | null   // customer-level override
  defaultMealRate:   number          // provider default
  defaultCreditLimit: number         // provider default
}): MonthlyDueSummary {
  const effectiveMealRate = params.mealRate     ?? params.defaultMealRate
  const effectiveLimit    = params.creditLimit  ?? params.defaultCreditLimit

  const gross       = params.mealsDelivered * effectiveMealRate
  const outstanding = Math.max(0, gross - params.totalPaid)
  const percentUsed = effectiveLimit > 0
    ? Math.min(150, Math.round((outstanding / effectiveLimit) * 100))
    : 0

  const state: MonthlyDueSummary['state'] =
    outstanding >= effectiveLimit        ? 'critical'  :
    outstanding >= effectiveLimit * 0.7  ? 'due_soon'  :
    'healthy'

  return { outstanding, effectiveLimit, effectiveMealRate, state, percentUsed }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const DUE_COLORS = {
  healthy:  { text: 'text-green-600', bg: 'bg-green-50 border-green-100',  pill: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
  due_soon: { text: 'text-amber-600', bg: 'bg-amber-50 border-amber-100',  pill: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
  critical: { text: 'text-red-600',   bg: 'bg-red-50   border-red-100',    pill: 'bg-red-100   text-red-700',    dot: 'bg-red-500'    },
} as const

export function dueStateLabel(state: MonthlyDueSummary['state']): string {
  return state === 'critical' ? '🚨 Limit exceeded'
       : state === 'due_soon' ? '⚠️ Due soon'
       : '✓ Healthy'
}

export function fmtRupees(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
