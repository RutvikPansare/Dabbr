'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ── Step definitions ──────────────────────────────────────────────────────────

type StepKey = '1' | '2' | '3'

interface StepDef {
  page: string          // pathname to be on for this step
  navTo: string         // full URL to navigate to (may include query string)
  emoji: string
  title: string
  instruction: string
  nextStep: string
  nextPage: string
}

const STEPS: Record<StepKey, StepDef> = {
  '1': {
    page: '/settings',
    navTo: '/settings',
    emoji: '🏪',
    title: 'Set up your brand',
    instruction: 'Fill in your Business Name and UPI ID in the Branding section, then tap Save Branding.',
    nextStep: '2',
    nextPage: '/meal-plans',
  },
  '2': {
    page: '/meal-plans',
    navTo: '/meal-plans',
    emoji: '🍱',
    title: 'Create your first meal plan',
    instruction: 'Fill in the form — add a name, set the monthly price, then tap Save meal plan.',
    nextStep: '3',
    nextPage: '/customers?openAdd=true',
  },
  '3': {
    page: '/customers',
    navTo: '/customers?openAdd=true',
    emoji: '🧑',
    title: 'Add your first customer',
    instruction: 'Fill in the customer details in the form that opened, then tap Add Customer.',
    nextStep: 'done',
    nextPage: '/dashboard',
  },
}

function isActiveStep(s: string | null): s is StepKey {
  return s === '1' || s === '2' || s === '3'
}

const ACTIVE_STEPS: StepKey[] = ['1', '2', '3']

// ── Persist completion to DB ──────────────────────────────────────────────────

async function markOnboardingDoneInDB() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('providers')
      .update({ onboarding_done: true })
      .eq('id', user.id)
  } catch {
    // Best-effort — localStorage is the fallback
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingGuide() {
  const router = useRouter()
  const pathname = usePathname()

  const [step, setStep] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [celebrating, setCelebrating] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  // null = not resolved yet; false = not a rider; true = is a rider
  const [isRider, setIsRider] = useState<boolean | null>(null)
  const initDone = useRef(false)

  // ── Init: resolve role via server route (handles linking + DB check) ────────
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    async function init() {
      try {
        // /api/check-role does findAndLinkRider + provider-override + DB onboarding check
        const res = await fetch('/api/check-role')
        if (!res.ok) { setIsRider(false); setStep(localStorage.getItem('dabbr_onboarding_step')); return }
        const { role } = await res.json()

        if (role === 'rider') {
          setIsRider(true)
          return
        }

        setIsRider(false)

        // For providers: check DB onboarding_done (cross-device)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setStep(null); return }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: provider } = await (supabase as any)
          .from('providers')
          .select('onboarding_done')
          .eq('id', user.id)
          .maybeSingle()

        if (provider?.onboarding_done) {
          localStorage.setItem('dabbr_onboarding_step', 'done')
          setStep('done')
          return
        }

        // Fall back to localStorage
        setStep(localStorage.getItem('dabbr_onboarding_step'))
      } catch {
        setIsRider(false)
        setStep(localStorage.getItem('dabbr_onboarding_step'))
      }
    }

    init()
  }, [])

  // After celebration, hide the flash
  useEffect(() => {
    if (!celebrating) return
    const timer = setTimeout(() => setCelebrating(false), 900)
    return () => clearTimeout(timer)
  }, [celebrating])

  // Don't render on /onboarding page, for riders, or when not in an active step
  if (pathname === '/onboarding') return null
  if (isRider === null || isRider === true) return null
  if (!isActiveStep(step)) return null

  const def = STEPS[step]
  const stepIndex = ACTIVE_STEPS.indexOf(step)

  // ── Verification ────────────────────────────────────────────────────────────

  async function handleDone() {
    if (checking || celebrating) return
    setChecking(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Could not verify session — please refresh.')
        setChecking(false)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      if (step === '1') {
        const { data } = await db
          .from('providers')
          .select('name')
          .eq('id', user.id)
          .single()
        if (!data?.name?.trim()) {
          setError("Looks like the name wasn't saved yet — please tap Save Branding first.")
          setChecking(false)
          return
        }
      } else if (step === '2') {
        const { count } = await db
          .from('meal_plans')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', user.id)
        if (!count || count === 0) {
          setError("No meal plan found yet — please save the form first.")
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

      const nextStep = def.nextStep
      localStorage.setItem('dabbr_onboarding_step', nextStep)
      setStep(nextStep)

      // Persist completion to DB when all 3 steps are done
      if (nextStep === 'done') {
        markOnboardingDoneInDB()
      }

      setChecking(false)
      setCelebrating(true)
    } catch {
      setError('Something went wrong — please try again.')
      setChecking(false)
    }
  }

  function handleSkip() {
    const nextStep = def.nextStep
    localStorage.setItem('dabbr_onboarding_step', nextStep)
    setStep(nextStep)
    if (nextStep === 'done') markOnboardingDoneInDB()
  }

  function confirmExitGuide() {
    localStorage.setItem('dabbr_onboarding_step', 'done')
    setStep('done')
    setConfirmExit(false)
    markOnboardingDoneInDB()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed left-3 right-3 lg:left-auto lg:right-6 lg:w-[360px] rounded-3xl bg-white shadow-2xl border border-orange-100 overflow-hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6"
      style={{ zIndex: 60 }}
    >
      {/* Celebration flash */}
      {celebrating ? (
        <div className="flex items-center justify-center gap-2 bg-green-500 py-5 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/30">
            <Check className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-black text-white">Great job! 🎉</span>
        </div>
      ) : confirmExit ? (
        /* Confirm exit inline */
        <div className="p-4 space-y-3">
          <p className="text-sm font-bold text-gray-800">Exit the setup guide?</p>
          <p className="text-xs font-medium text-gray-500">You can restart it anytime by visiting the onboarding page.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmExit(false)}
              className="flex-1 rounded-2xl border-2 border-gray-200 py-2.5 text-sm font-bold text-gray-600 active:scale-[0.98] transition-all"
            >
              Keep going
            </button>
            <button
              onClick={confirmExitGuide}
              className="flex-1 rounded-2xl bg-gray-800 py-2.5 text-sm font-bold text-white active:scale-[0.98] transition-all"
            >
              Yes, exit
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          {/* Header: progress dots + X */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {ACTIVE_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i < stepIndex  ? 'w-4 h-2 bg-orange-400'
                    : i === stepIndex ? 'w-6 h-2 bg-orange-500'
                    : 'w-2 h-2 bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => { setConfirmExit(true); setError('') }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 active:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Title + instruction */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{def.emoji}</span>
            <p className="text-sm font-black text-gray-900">{def.title}</p>
          </div>
          <p className="text-xs font-medium text-gray-500 leading-relaxed mb-1">
            {def.instruction}
          </p>
          {pathname !== def.page && (
            <button
              onClick={() => router.push(def.navTo)}
              className="text-xs font-black text-orange-500 active:opacity-70 mb-2"
            >
              Go there →
            </button>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs font-semibold text-red-500 mb-2">{error}</p>
          )}

          {/* Footer: skip + done */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleSkip}
              className="text-xs font-semibold text-gray-400 active:text-gray-600 transition-colors shrink-0"
            >
              Skip this step
            </button>
            <button
              onClick={handleDone}
              disabled={checking}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-orange-500 px-5 py-2.5 text-sm font-black text-white shadow-sm active:scale-[0.97] transition-all disabled:opacity-70"
            >
              {checking
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
                : "I've done it →"
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
