'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Check, Loader2, Leaf, Drumstick,
  Store, CreditCard, UtensilsCrossed, User, Phone,
  Sparkles, ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { invalidateMealPlans, invalidateProviderCache, invalidateCustomers } from '@/lib/revalidate'
import type { MealSlot, PlanType } from '@/types/database'
import { MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL } from '@/lib/meals'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Provider {
  id: string
  name: string
  upi_id: string | null
}

interface Props {
  provider: Provider
  hasMealPlans: boolean
}

// ── Encouragement messages ────────────────────────────────────────────────────

const CHEER_MESSAGES = [
  { emoji: '🎉', text: 'Great job!' },
  { emoji: '✨', text: "You're on a roll!" },
  { emoji: '🚀', text: 'Crushing it!' },
  { emoji: '💪', text: 'That was easy!' },
]

// ── Step dot indicator ────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-500 ${
            i < current
              ? 'w-6 h-2 bg-white'
              : i === current
              ? 'w-8 h-2 bg-white'
              : 'w-2 h-2 bg-white/30'
          }`}
        />
      ))}
    </div>
  )
}

// ── Cheer overlay ─────────────────────────────────────────────────────────────

function CheerOverlay({ message, onDone }: { message: typeof CHEER_MESSAGES[0]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="animate-cheer flex flex-col items-center gap-2 bg-white rounded-3xl px-10 py-8 shadow-2xl">
        <span className="text-5xl">{message.emoji}</span>
        <p className="text-xl font-black text-gray-900">{message.text}</p>
      </div>
    </div>
  )
}

// ── Input component ───────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = 'text', prefix, autoFocus, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  prefix?: string
  autoFocus?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-4 text-sm font-bold text-gray-400 select-none">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          inputMode={type === 'tel' ? 'numeric' : type === 'number' ? 'decimal' : 'text'}
          className={`w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-3.5 text-sm font-semibold text-gray-900 outline-none transition-all focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 ${prefix ? 'pl-8 pr-4' : 'px-4'}`}
        />
      </div>
      {hint && <p className="text-xs font-medium text-gray-400">{hint}</p>}
    </div>
  )
}

// ── Toggle button group ───────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string
  options: { value: T; label: string; icon: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 py-3 text-sm font-bold transition-all active:scale-95 ${
              value === opt.value
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 bg-gray-50 text-gray-500'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Meal slot pills ───────────────────────────────────────────────────────────

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

function SlotPicker({ value, onChange }: { value: MealSlot[]; onChange: (v: MealSlot[]) => void }) {
  function toggle(slot: MealSlot) {
    onChange(value.includes(slot) ? value.filter(s => s !== slot) : [...value, slot])
  }
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Meal slots</label>
      <div className="flex gap-2">
        {ALL_SLOTS.map(slot => {
          const on = value.includes(slot)
          return (
            <button
              key={slot}
              type="button"
              onClick={() => toggle(slot)}
              className={`flex-1 flex flex-col items-center gap-1 rounded-2xl border-2 py-3 text-xs font-bold transition-all active:scale-95 ${
                on ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <span className="text-lg">{MEAL_SLOT_EMOJI[slot]}</span>
              {MEAL_SLOT_LABEL[slot]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingClient({ provider, hasMealPlans }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const db = supabase as any

  // Start at step 1 if meal plan already exists, else step 0
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cheer, setCheer] = useState<typeof CHEER_MESSAGES[0] | null>(null)
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in')
  const cheerIdx = useRef(0)

  // Step 1 — business
  const [bizName, setBizName] = useState(provider.name ?? '')
  const [upiId, setUpiId] = useState(provider.upi_id ?? '')

  // Step 2 — meal plan
  const [planName, setPlanName] = useState('Daily Tiffin')
  const [planPrice, setPlanPrice] = useState('')
  const [planType, setPlanType] = useState<PlanType>('veg')
  const [planSlots, setPlanSlots] = useState<MealSlot[]>(['lunch'])
  const [savedPlanName, setSavedPlanName] = useState('')

  // Step 3 — first customer
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [savedCustName, setSavedCustName] = useState('')
  const [savedPlanId, setSavedPlanId] = useState('')

  // Skip to step 3 if meal plan already exists (came back to onboarding)
  useEffect(() => {
    if (hasMealPlans) setStep(2)
  }, [hasMealPlans])

  function showCheer(then: () => void) {
    const msg = CHEER_MESSAGES[cheerIdx.current % CHEER_MESSAGES.length]
    cheerIdx.current++
    setCheer(msg)
    setTimeout(then, 1400)
  }

  function advance(nextStep: number) {
    setSlideDir('out')
    setTimeout(() => {
      setStep(nextStep)
      setSlideDir('in')
      setError('')
    }, 220)
  }

  // ── Savers ───────────────────────────────────────────────────────────────

  async function saveBusiness() {
    if (!bizName.trim()) { setError('Please enter your business name.'); return }
    setSaving(true); setError('')
    const { error: err } = await db
      .from('providers')
      .update({ name: bizName.trim(), upi_id: upiId.trim() || null })
      .eq('id', provider.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    await invalidateProviderCache(provider.id)
    showCheer(() => advance(2))
  }

  async function saveMealPlan() {
    if (!planName.trim()) { setError('Please give your plan a name.'); return }
    if (!planPrice || isNaN(Number(planPrice)) || Number(planPrice) <= 0) {
      setError('Please enter a valid monthly price.'); return
    }
    if (!planSlots.length) { setError('Pick at least one meal slot.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await db
      .from('meal_plans')
      .insert({
        provider_id: provider.id,
        name: planName.trim(),
        meal_slots: planSlots,
        plan_type: planType,
        frequency: 'daily',
        monthly_price: Number(planPrice),
        active_days: 30,
        status: 'active',
        description: null,
      })
      .select('id, name')
      .single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setSavedPlanName(data.name)
    setSavedPlanId(data.id)
    await invalidateMealPlans(provider.id)
    showCheer(() => advance(3))
  }

  async function saveCustomer() {
    if (!custName.trim()) { setError('Please enter the customer name.'); return }
    const digits = custPhone.replace(/\D/g, '').replace(/^(\+?91|0)(\d{10})$/, '$2')
    if (digits.length !== 10) { setError('Please enter a valid 10-digit mobile number.'); return }
    setSaving(true); setError('')

    const { data: cust, error: custErr } = await db
      .from('customers')
      .insert({
        provider_id: provider.id,
        name: custName.trim(),
        whatsapp_number: digits,
        status: 'active',
        balance_days: 30,
        meals_delivered: 0,
        tags: [],
      })
      .select('id')
      .single()

    if (custErr) { setSaving(false); setError(custErr.message); return }

    if (savedPlanId) {
      await db.from('subscriptions').insert({
        provider_id: provider.id,
        customer_id: cust.id,
        meal_plan_id: savedPlanId,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
      })
    }

    setSaving(false)
    setSavedCustName(custName.trim())
    await invalidateCustomers(provider.id)
    showCheer(() => advance(4))
  }

  async function skipCustomer() {
    advance(4)
  }

  function goToDashboard() {
    // Mark done in localStorage so we don't redirect back
    if (typeof window !== 'undefined') {
      localStorage.setItem('dabbr_onboarding_done', '1')
    }
    router.push('/dashboard')
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const slideClass = slideDir === 'in' ? 'animate-slide-in' : 'animate-slide-out'

  // ── Step 0: Welcome ───────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: 'linear-gradient(160deg, #FF6B1A 0%, #E8460A 100%)' }}>
        {cheer && <CheerOverlay message={cheer} onDone={() => setCheer(null)} />}

        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
          {/* Logo */}
          <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-xl">
            <span className="text-4xl font-black text-orange-500">D</span>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white leading-tight">
              Welcome to Dabbr! 👋
            </h1>
            <p className="text-base font-medium text-orange-100 leading-relaxed">
              Let's get your tiffin business ready to go.<br />
              Takes less than <span className="font-bold text-white">2 minutes.</span>
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-2 w-full max-w-xs">
            {[
              { icon: '🏪', label: 'Set up your brand' },
              { icon: '🍱', label: 'Create your first meal plan' },
              { icon: '🧑', label: 'Add your first customer' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-semibold text-white">{item.label}</span>
                <Check className="w-4 h-4 text-orange-200 ml-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => advance(1)}
            className="w-full flex items-center justify-center gap-3 rounded-2xl bg-white py-5 text-base font-black text-orange-500 shadow-xl active:scale-[0.98] transition-all"
          >
            Let's go <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  // ── Steps 1-4: Guided steps ───────────────────────────────────────────────

  const TOTAL_STEPS = 3

  const stepMeta = [
    null,
    { icon: <Store className="w-5 h-5 text-orange-500" />, title: "What's your tiffin service called?", sub: 'Your customers will see this name.' },
    { icon: <UtensilsCrossed className="w-5 h-5 text-orange-500" />, title: 'Create your first meal plan', sub: 'You can add more plans later.' },
    { icon: <User className="w-5 h-5 text-orange-500" />, title: 'Add your first customer', sub: 'You can import more from contacts later.' },
  ]

  return (
    <div className="fixed inset-0 flex flex-col bg-[#FDF8F3]">
      {cheer && <CheerOverlay message={cheer} onDone={() => setCheer(null)} />}

      {/* ── Header ── */}
      <div
        className="shrink-0 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-5 px-5"
        style={{ background: 'linear-gradient(135deg, #FF6B1A 0%, #E8460A 100%)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-orange-200">
            {step <= 3 ? `Step ${step} of ${TOTAL_STEPS}` : ''}
          </span>
          {step <= 3 && (
            <StepDots current={step - 1} total={TOTAL_STEPS} />
          )}
        </div>
        {step <= 3 && stepMeta[step] && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                {stepMeta[step]!.icon}
              </div>
            </div>
            <h1 className="text-xl font-black text-white mt-2 leading-tight">{stepMeta[step]!.title}</h1>
            <p className="text-sm font-medium text-orange-100 mt-1">{stepMeta[step]!.sub}</p>
          </>
        )}
      </div>

      {/* ── Body ── */}
      <div className={`flex-1 overflow-y-auto ${slideClass}`}>

        {/* ─── Step 1: Business ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="p-5 space-y-4">
            <Field
              label="Business name"
              value={bizName}
              onChange={setBizName}
              placeholder="e.g. Sharma Tiffin Service"
              autoFocus
            />
            <Field
              label="UPI ID (for payments)"
              value={upiId}
              onChange={setUpiId}
              placeholder="e.g. yourupi@upi"
              hint="Customers will use this to pay you. You can add this later too."
            />
            {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          </div>
        )}

        {/* ─── Step 2: Meal plan ────────────────────────────────────────── */}
        {step === 2 && (
          <div className="p-5 space-y-4">
            <Field
              label="Plan name"
              value={planName}
              onChange={setPlanName}
              placeholder="e.g. Daily Tiffin, Veg Combo…"
              autoFocus
              hint="Give it a name your customers will recognise."
            />
            <Field
              label="Monthly price"
              value={planPrice}
              onChange={setPlanPrice}
              placeholder="1500"
              prefix="₹"
              type="number"
            />
            <ToggleGroup
              label="Type"
              value={planType}
              onChange={setPlanType}
              options={[
                { value: 'veg', label: 'Veg', icon: <Leaf className="w-4 h-4 text-emerald-500" /> },
                { value: 'nonveg', label: 'Non-veg', icon: <Drumstick className="w-4 h-4 text-orange-500" /> },
              ]}
            />
            <SlotPicker value={planSlots} onChange={setPlanSlots} />
            {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          </div>
        )}

        {/* ─── Step 3: First customer ───────────────────────────────────── */}
        {step === 3 && (
          <div className="p-5 space-y-4">
            {savedPlanName && (
              <div className="flex items-center gap-3 rounded-2xl bg-green-50 border border-green-200 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-green-500 shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-green-700">Meal plan ready!</p>
                  <p className="text-xs font-medium text-green-600">{savedPlanName}</p>
                </div>
              </div>
            )}
            <Field
              label="Customer name"
              value={custName}
              onChange={setCustName}
              placeholder="e.g. Ramesh Patel"
              autoFocus
            />
            <Field
              label="WhatsApp number"
              value={custPhone}
              onChange={setCustPhone}
              placeholder="9876543210"
              type="tel"
              hint="10-digit mobile number, no country code needed."
            />
            {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          </div>
        )}

        {/* ─── Step 4: Done ─────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center gap-6 min-h-full">
            {/* Celebration */}
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] shadow-xl" style={{ background: 'linear-gradient(135deg, #FF6B1A 0%, #E8460A 100%)' }}>
              <Sparkles className="w-12 h-12 text-white" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-gray-900">You're all set! 🚀</h2>
              <p className="text-sm font-medium text-gray-500 leading-relaxed">
                Your tiffin business is up and running. Time to deliver some happiness!
              </p>
            </div>

            {/* Summary cards */}
            <div className="w-full space-y-3">
              {bizName && (
                <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5 text-left">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 shrink-0">
                    <Store className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400">Business</p>
                    <p className="text-sm font-black text-gray-900">{bizName}</p>
                  </div>
                  <div className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                </div>
              )}
              {savedPlanName && (
                <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5 text-left">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 shrink-0">
                    <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400">Meal plan</p>
                    <p className="text-sm font-black text-gray-900">{savedPlanName}</p>
                  </div>
                  <div className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                </div>
              )}
              {savedCustName && (
                <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5 text-left">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 shrink-0">
                    <User className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400">First customer</p>
                    <p className="text-sm font-black text-gray-900">{savedCustName}</p>
                  </div>
                  <div className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 border-t border-gray-100 bg-white space-y-3">
        {step === 1 && (
          <button
            onClick={saveBusiness}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Looks good, next →'}
          </button>
        )}

        {step === 2 && (
          <button
            onClick={saveMealPlan}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Creating plan…' : 'Create plan →'}
          </button>
        )}

        {step === 3 && (
          <>
            <button
              onClick={saveCustomer}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Adding…' : 'Add customer →'}
            </button>
            <button
              onClick={skipCustomer}
              disabled={saving}
              className="w-full py-3 text-sm font-bold text-gray-400 active:scale-[0.98] transition-all"
            >
              I'll add customers later
            </button>
          </>
        )}

        {step === 4 && (
          <button
            onClick={goToDashboard}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm active:scale-[0.98] transition-all"
          >
            Go to Dashboard <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
