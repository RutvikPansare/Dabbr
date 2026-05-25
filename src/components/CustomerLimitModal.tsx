'use client'

import { AlertTriangle, X as XIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { BILLING_PLANS, getCustomerLimit, getNextBillingPlan, type CustomerLimitPlanId } from '@/lib/billing'
import { useBillingCheckout } from '@/lib/use-billing-checkout'

interface Props {
  currentPlan: CustomerLimitPlanId
  currentCustomerCount: number
  attemptedAddCount?: number
  onClose?: () => void
  manageCustomersButton?: boolean
  blocking?: boolean
}

export default function CustomerLimitModal({
  currentPlan,
  currentCustomerCount,
  attemptedAddCount = 1,
  onClose,
  manageCustomersButton = false,
  blocking = false,
}: Props) {
  const router = useRouter()
  const { startCheckout, loadingPlan, error } = useBillingCheckout()
  const customerLimit = getCustomerLimit(currentPlan)
  const nextBillingPlan = getNextBillingPlan(currentPlan)
  const nextPlan = nextBillingPlan ? BILLING_PLANS[nextBillingPlan] : null
  const attemptedTotal = currentCustomerCount + attemptedAddCount
  const planLabel =
    currentPlan === 'free' ? 'Free plan' :
    currentPlan === 'starter' ? 'Starter plan' :
    'Pro plan'

  if (customerLimit == null) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={blocking ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] bg-white shadow-2xl border border-orange-100 overflow-hidden">
        <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-orange-50 to-white border-b border-orange-100">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wider text-orange-500">Customer limit reached</p>
              <h2 className="mt-1 text-xl font-black text-gray-900 leading-tight">Upgrade or reduce customers</h2>
            </div>
            {!blocking && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600 active:scale-95 transition-all"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm font-medium text-gray-500 leading-relaxed">
            Your {planLabel} allows <span className="font-black text-gray-900">{customerLimit} total customers</span>, including active, paused, and inactive customers.
            {currentCustomerCount > customerLimit ? (
              <> You currently have <span className="font-black text-gray-900">{currentCustomerCount}</span>, so daily dashboard actions are paused until you upgrade or delete customers.</>
            ) : (
              <> Adding {attemptedAddCount} more would take you to <span className="font-black text-gray-900">{attemptedTotal}</span>.</>
            )}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Current</p>
              <p className="text-2xl font-black text-gray-900">{currentCustomerCount}</p>
            </div>
            <div className="rounded-2xl bg-orange-50 border border-orange-100 px-3 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">Limit</p>
              <p className="text-2xl font-black text-orange-600">{customerLimit}</p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-100 px-3 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-red-400">
                {currentCustomerCount > customerLimit ? 'Over' : 'Trying'}
              </p>
              <p className="text-2xl font-black text-red-600">
                {currentCustomerCount > customerLimit ? `+${currentCustomerCount - customerLimit}` : `+${attemptedAddCount}`}
              </p>
            </div>
          </div>

          {nextPlan ? (
            <div className="rounded-2xl bg-[#160800] px-4 py-4 text-white">
              <p className="text-xs font-bold text-orange-200/70">Next tier</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div>
                  <p className="text-lg font-black">Dabbr {nextPlan.name}</p>
                  <p className="text-xs text-orange-100/60">
                    {nextBillingPlan === 'starter' ? 'Up to 50 customers' : 'Unlimited customers'}
                  </p>
                </div>
                <p className="text-xl font-black text-orange-300">₹{nextPlan.amount}<span className="text-xs text-orange-100/50">/mo</span></p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">
              <p className="text-sm font-bold text-gray-700">You are already on the highest plan.</p>
            </div>
          )}

          {error && (
            <p className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 pt-1 space-y-2">
          {nextBillingPlan && (
            <button
              type="button"
              onClick={() => startCheckout(nextBillingPlan, 'app')}
              disabled={loadingPlan === nextBillingPlan}
              className="w-full rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loadingPlan === nextBillingPlan ? 'Opening checkout...' : `Upgrade to ${BILLING_PLANS[nextBillingPlan].name}`}
            </button>
          )}
          {manageCustomersButton && (
            <button
              type="button"
              onClick={() => router.push('/customers')}
              className="w-full rounded-2xl border border-orange-200 bg-orange-50 py-3 text-sm font-black text-orange-600 hover:bg-orange-100 active:scale-[0.98] transition-all"
            >
              Manage customers
            </button>
          )}
          {!blocking && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
