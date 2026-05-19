'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ── Step definitions ──────────────────────────────────────────────────────────

type StepKey = '1' | '2' | '3'

interface StepDef {
  page: string
  emoji: string
  title: string
  instruction: string
  checkLabel: string
  nextStep: string
  nextPage: string
}

const STEPS: Record<StepKey, StepDef> = {
  '1': {
    page: '/settings',
    emoji: '🏪',
    title: 'Set up your brand',
    instruction: 'Fill in your Business Name and UPI ID in the Branding section below, then tap Save Branding.',
    checkLabel: "I've saved my business name",
    nextStep: '2',
    nextPage: '/meal-plans',
  },
  '2': {
    page: '/meal-plans',
    emoji: '🍱',
    title: 'Create your first meal plan',
    instruction: 'Fill in the meal plan form — add a name, set the monthly price, then tap Save meal plan.',
    checkLabel: "I've created my first plan",
    nextStep: '3',
    nextPage: '/customers?openAdd=true',
  },
  '3': {
    page: '/customers',
    emoji: '🧑',
    title: 'Add your first customer',
    instruction: 'Fill in the customer details in the form that opened, then tap Add Customer.',
    checkLabel: "I've added my first customer",
    nextStep: 'done',
    nextPage: '/dashboard',
  },
}

const ACTIVE_STEPS: StepKey[] = ['1', '2', '3']

function isActiveStep(s: string | null): s is StepKey {
  return s === '1' || s === '2' || s === '3'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingGuide() {
  const router = useRouter()
  const pathname = usePathname()

  const [step, setStep] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [celebrating, setCelebrating] = useState(false)

  // Read step from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('dabbr_onboarding_step')
    setStep(stored)
  }, [])

  // Navigate to the correct page for this step if not already there
  useEffect(() => {
    if (!isActiveStep(step)) return
    const def = STEPS[step]
    // Compare pathnames (strip query for step '2' redirect check)
    const targetPath = def.page.split('?')[0]
    if (pathname !== targetPath) {
      router.push(step === '3' ? '/customers?openAdd=true' : def.page)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Don't render on /onboarding page or when not active
  if (pathname === '/onboarding') return null
  if (!isActiveStep(step)) return null

  const def = STEPS[step]
  const stepIndex = ACTIVE_STEPS.indexOf(step) // 0-based

  async function handleDone() {
    if (checking) return
    setChecking(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Could not verify session. Please refresh and try again.')
        setChecking(false)
        return
      }

      const db = supabase as any

      if (step === '1') {
        const { data } = await db
          .from('providers')
          .select('name')
          .eq('id', user.id)
          .single()
        if (!data?.name?.trim()) {
          setError("Looks like the name wasn't saved yet — please tap Save Branding on the page first.")
          setChecking(false)
          return
        }
      } else if (step === '2') {
        const { count } = await db
          .from('meal_plans')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', user.id)
        if (!count || count === 0) {
          setError("We couldn't find any meal plans yet — please save the form first.")
          setChecking(false)
          return
        }
      } else if (step === '3') {
        const { count } = await db
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', user.id)
        if (!count || count === 0) {
          setError('No customers found yet — please tap Add Customer to save.')
          setChecking(false)
          return
        }
      }

      // Success — celebrate then advance
      setChecking(false)
      setCelebrating(true)

      setTimeout(() => {
        setCelebrating(false)
        const nextStep = def.nextStep
        if (typeof window !== 'undefined') {
          localStorage.setItem('dabbr_onboarding_step', nextStep)
        }
        setStep(nextStep)
        router.push(def.nextPage)
      }, 800)
    } catch {
      setError('Something went wrong. Please try again.')
      setChecking(false)
    }
  }

  function handleSkip() {
    const nextStep = def.nextStep
    if (typeof window !== 'undefined') {
      localStorage.setItem('dabbr_onboarding_step', nextStep)
    }
    setStep(nextStep)
    router.push(def.nextPage)
  }

  function handleExit() {
    if (window.confirm("Exit the setup guide? You can always come back to it.")) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('dabbr_onboarding_step', 'done')
      }
      setStep('done')
    }
  }

  return (
    <div
      className="fixed left-4 right-4 z-60 bottom-[4.5rem] mb-2 rounded-3xl bg-white shadow-2xl border border-orange-100 p-4"
      style={{ zIndex: 60 }}
    >
      {/* Header row: progress dots + X */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {ACTIVE_STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i < stepIndex
                  ? 'w-4 h-2 bg-orange-400'
                  : i === stepIndex
                  ? 'w-5 h-2 bg-orange-500'
                  : 'w-2 h-2 bg-gray-200'
              }`}
            />
          ))}
        </div>
        <button
          onClick={handleExit}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 active:bg-gray-200 transition-colors"
          aria-label="Exit setup guide"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Celebration flash */}
      {celebrating ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-500 py-3 px-4">
          <span className="text-base font-black text-white">Great job! 🎉</span>
        </div>
      ) : (
        <>
          {/* Title */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{def.emoji}</span>
            <p className="text-sm font-black text-gray-900">{def.title}</p>
          </div>

          {/* Instruction */}
          <p className="text-xs font-medium text-gray-500 leading-relaxed mb-3">
            {def.instruction}
          </p>

          {/* Error */}
          {error && (
            <p className="text-xs font-semibold text-red-500 mb-2">{error}</p>
          )}

          {/* Bottom row: skip + done button */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleSkip}
              className="text-xs font-semibold text-gray-400 active:text-gray-600 transition-colors shrink-0"
            >
              Skip this step →
            </button>
            <button
              onClick={handleDone}
              disabled={checking}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white shadow-sm active:scale-[0.97] transition-all disabled:opacity-70"
            >
              {checking ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking…
                </>
              ) : (
                "I've done it →"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
