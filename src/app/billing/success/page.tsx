'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BILLING_PLANS, isBillingPlanId, type BillingPlanId } from '@/lib/billing'

export default function BillingSuccessPage() {
  const router = useRouter()
  const [planName, setPlanName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Force a fresh fetch of the server components so the new plan shows immediately
    router.refresh()

    // Pull the active plan name from DB to show in this page
    async function fetchPlan() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Poll until subscription_status is active (max 10s)
      for (let i = 0; i < 10; i++) {
        const { data } = await (supabase as any)
          .from('providers')
          .select('subscription_plan, subscription_status')
          .eq('id', user.id)
          .single()

        if (data?.subscription_status === 'active' && isBillingPlanId(data.subscription_plan as string)) {
          setPlanName(BILLING_PLANS[data.subscription_plan as BillingPlanId].name)
          setLoading(false)
          return
        }
        await new Promise(r => setTimeout(r, 1000))
      }
      setLoading(false)
    }

    fetchPlan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#FDF8F3] flex items-center justify-center px-5">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        {loading ? (
          <>
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <h1 className="text-2xl font-black text-gray-900">Activating your plan…</h1>
            <p className="mt-2 text-sm font-semibold text-gray-500">
              Please wait while we confirm your payment.
            </p>
          </>
        ) : (
          <>
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500 shadow-xl shadow-emerald-500/30">
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">
              {planName ? `Dabbr ${planName} activated!` : 'Payment received!'}
            </h1>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500">
              {planName
                ? `Your Dabbr ${planName} plan is now active. Enjoy all the features!`
                : 'Your payment was received. Your plan will reflect shortly.'}
            </p>

            <div className="mt-8 grid w-full gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-2xl bg-[#F4622A] px-5 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => router.push('/settings#billing')}
                className="rounded-2xl border border-orange-100 bg-white px-5 py-4 text-sm font-black text-orange-600 active:scale-[0.98] transition-all"
              >
                View Billing Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
