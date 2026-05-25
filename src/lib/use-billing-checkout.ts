'use client'

import { useState } from 'react'
import { BILLING_PLANS, BillingPlanId } from './billing'
import type { BillingTransactionSource } from '@/types/database'

type RazorpaySuccessResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayFailureResponse = {
  error?: {
    description?: string
    reason?: string
    code?: string
  }
}

type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  notes?: Record<string, string>
  theme?: { color: string }
  modal?: { ondismiss?: () => void }
  handler: (response: RazorpaySuccessResponse) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void
      on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void
    }
  }
}

let razorpayScriptPromise: Promise<void> | null = null

function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay checkout must run in the browser.'))
  if (window.Razorpay) return Promise.resolve()

  razorpayScriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Razorpay checkout. Please check your internet connection.'))
    document.body.appendChild(script)
  })

  return razorpayScriptPromise
}

export function useBillingCheckout() {
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function startCheckout(plan: BillingPlanId, source: BillingTransactionSource) {
    setLoadingPlan(plan)
    setError(null)
    setSuccess(null)

    try {
      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
      if (!key) throw new Error('Missing NEXT_PUBLIC_RAZORPAY_KEY_ID')

      await loadRazorpayScript()

      const orderResponse = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, source }),
      })
      const order = await orderResponse.json()
      if (!orderResponse.ok || !order.order_id) throw new Error(order.error || 'Could not create Razorpay order')

      const planConfig = BILLING_PLANS[plan]

      const razorpay = new window.Razorpay!({
        key,
        amount: order.amount,
        currency: order.currency,
        name: 'Dabbr',
        description: `${planConfig.name} subscription`,
        order_id: order.order_id,
        notes: {
          plan,
          source,
          transaction_id: order.transaction_id ?? '',
        },
        theme: { color: '#F4622A' },
        modal: {
          ondismiss: () => {
            setLoadingPlan(null)
            setError('Payment cancelled.')
          },
        },
        handler: async (paymentResponse) => {
          try {
            const verifyResponse = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(paymentResponse),
            })
            const verified = await verifyResponse.json()
            if (!verifyResponse.ok || !verified.success) {
              throw new Error(verified.error || 'Payment verification failed')
            }
            setSuccess('Payment verified successfully.')
            window.location.href = '/billing/success'
          } catch (verifyError) {
            setError(verifyError instanceof Error ? verifyError.message : 'Payment verification failed')
          } finally {
            setLoadingPlan(null)
          }
        },
      })

      razorpay.on('payment.failed', (response) => {
        setLoadingPlan(null)
        setError(response.error?.description || response.error?.reason || 'Payment failed. Please try again.')
      })

      razorpay.open()
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Could not start checkout')
      setLoadingPlan(null)
    }
  }

  return { startCheckout, loadingPlan, error, success }
}
