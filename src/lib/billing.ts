export type BillingPlanId = 'starter' | 'pro'

export type CustomerLimitPlanId = 'free' | BillingPlanId

export const CUSTOMER_LIMITS: Record<CustomerLimitPlanId, number | null> = {
  free: 15,
  starter: 50,
  pro: null,
}

export const BILLING_PLANS: Record<BillingPlanId, {
  id: BillingPlanId
  name: string
  amount: number
  amountPaise: number
  intervalLabel: string
  description: string
  highlight: string
  features: string[]
}> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    amount: 200,
    amountPaise: 20_000,
    intervalLabel: 'month',
    description: 'Dabbr Starter monthly subscription',
    highlight: 'Best for early tiffin businesses.',
    features: [
      'Everything in the Free plan',
      'Up to 50 customers',
      'Daily delivery tracking',
      'Payments and reminders',
      'Menu planner',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    amount: 500,
    amountPaise: 50_000,
    intervalLabel: 'month',
    description: 'Dabbr Pro monthly subscription',
    highlight: 'Best for growing kitchens.',
    features: [
      'Everything in the Starter plan',
      'Unlimited customers',
      'Meal plans and subscriptions',
      'Priority support',
    ],
  },
}

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === 'starter' || value === 'pro'
}

export function getCustomerLimit(plan: CustomerLimitPlanId): number | null {
  return CUSTOMER_LIMITS[plan]
}

export function getNextBillingPlan(plan: CustomerLimitPlanId): BillingPlanId | null {
  if (plan === 'free') return 'starter'
  if (plan === 'starter') return 'pro'
  return null
}

export function nextBillingPeriodEnd(from = new Date()) {
  const next = new Date(from)
  next.setDate(next.getDate() + 30)
  return next.toISOString()
}
