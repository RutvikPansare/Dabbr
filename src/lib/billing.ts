export type BillingPlanId = 'starter' | 'pro'

export const BILLING_PLANS: Record<BillingPlanId, {
  id: BillingPlanId
  name: string
  amount: number
  amountPaise: number
  intervalLabel: string
  description: string
}> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    amount: 200,
    amountPaise: 20_000,
    intervalLabel: 'month',
    description: 'Dabbr Starter monthly subscription',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    amount: 500,
    amountPaise: 50_000,
    intervalLabel: 'month',
    description: 'Dabbr Pro monthly subscription',
  },
}

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === 'starter' || value === 'pro'
}

export function nextBillingPeriodEnd(from = new Date()) {
  const next = new Date(from)
  next.setDate(next.getDate() + 30)
  return next.toISOString()
}
