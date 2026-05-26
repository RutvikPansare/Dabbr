'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, ClipboardList, Drumstick, History, Leaf, Plus, Save, Users, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { invalidateMealPlans } from '@/lib/revalidate'
import BottomNav from '@/components/BottomNav'
import type { Frequency, MealPlanStatus, MealSlot, PlanType } from '@/types/database'
import { FREQUENCY_LABEL, formatMealSlots, MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL, MEAL_SLOTS, PLAN_TYPE_LABEL } from '@/lib/meals'

interface MealPlan {
  id: string
  provider_id: string
  name: string
  meal_slots: MealSlot[]
  plan_type: PlanType
  frequency: Frequency
  monthly_price: number
  active_days: number
  description: string | null
  status: MealPlanStatus
}

interface PriceHistoryEntry {
  id: string
  old_price: number
  new_price: number
  changed_at: string
}

interface Props {
  providerId: string
  initialMealPlans: MealPlan[]
  backUrl?: string
}

interface PlanForm {
  id?: string
  name: string
  meal_slots: MealSlot[]
  plan_type: PlanType
  frequency: Frequency
  monthly_price: string
  active_days: string
  description: string
  status: MealPlanStatus
}

const EMPTY_FORM: PlanForm = {
  name: '',
  meal_slots: ['lunch'],
  plan_type: 'veg',
  frequency: 'daily',
  monthly_price: '',
  active_days: '30',
  description: '',
  status: 'active',
}

export default function MealPlansClient({ providerId, initialMealPlans, backUrl }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [mealPlans, setMealPlans] = useState<MealPlan[]>(initialMealPlans)
  const [showForm, setShowForm] = useState(initialMealPlans.length === 0)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  // Track the original price when editing so we can detect a change
  const [originalPrice, setOriginalPrice] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Price-change dialog state
  const [priceDialog, setPriceDialog] = useState<{
    planId: string
    planName: string
    payload: Record<string, unknown>
    oldPrice: number
    newPrice: number
    affectedCount: number
  } | null>(null)
  const [dialogSaving, setDialogSaving] = useState(false)
  const [dialogChoice, setDialogChoice] = useState<'apply' | 'keep' | null>(null)

  // Price history per plan
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistoryEntry[]>>({})
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())

  // Fetch price history for all plans on mount
  useEffect(() => {
    async function fetchHistory() {
      if (initialMealPlans.length === 0) return
      const planIds = initialMealPlans.map(p => p.id)
      const { data } = await db
        .from('meal_plan_price_history')
        .select('id, meal_plan_id, old_price, new_price, changed_at')
        .in('meal_plan_id', planIds)
        .order('changed_at', { ascending: false })

      if (data) {
        const grouped: Record<string, PriceHistoryEntry[]> = {}
        for (const row of data) {
          if (!grouped[row.meal_plan_id]) grouped[row.meal_plan_id] = []
          grouped[row.meal_plan_id].push(row)
        }
        setPriceHistory(grouped)
      }
    }
    fetchHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch affected customer count for a plan (for dialog info)
  async function fetchAffectedCount(planId: string): Promise<number> {
    const { data, error } = await db
      .from('subscriptions')
      .select('id', { count: 'exact' })
      .eq('meal_plan_id', planId)
      .eq('status', 'active')
    if (error) return 0
    return data?.length ?? 0
  }

  function startCreate() {
    setForm(EMPTY_FORM)
    setOriginalPrice(null)
    setError('')
    setShowForm(true)
  }

  function startEdit(plan: MealPlan) {
    setForm({
      id: plan.id,
      name: plan.name,
      meal_slots: plan.meal_slots,
      plan_type: plan.plan_type,
      frequency: plan.frequency,
      monthly_price: String(plan.monthly_price),
      active_days: String(plan.active_days),
      description: plan.description ?? '',
      status: plan.status,
    })
    setOriginalPrice(plan.monthly_price)
    setError('')
    setShowForm(true)
  }

  function toggleSlot(slot: MealSlot) {
    setForm((current) => {
      const next = current.meal_slots.includes(slot)
        ? current.meal_slots.filter(s => s !== slot)
        : [...current.meal_slots, slot]
      return { ...current, meal_slots: next.length ? next : current.meal_slots }
    })
  }

  function toggleHistory(planId: string) {
    setExpandedHistory(prev => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!form.name.trim()) {
      setError('Plan name is required.')
      setSaving(false)
      return
    }

    const newPrice = Number(form.monthly_price || 0)

    const payload = {
      provider_id: providerId,
      name: form.name.trim(),
      meal_slots: form.meal_slots,
      plan_type: form.plan_type,
      frequency: form.frequency,
      monthly_price: newPrice,
      active_days: Number(form.active_days || 30),
      description: form.description.trim() || null,
      status: form.status,
    }

    // --- CREATE ---
    if (!form.id) {
      const { data, error: saveError } = await db
        .from('meal_plans')
        .insert(payload)
        .select('*')
        .single()
      setSaving(false)
      if (saveError) {
        setError(saveError.message ?? 'Failed to save meal plan.')
        return
      }
      setMealPlans(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setShowForm(false)
      setForm(EMPTY_FORM)
      await invalidateMealPlans(providerId)
      router.refresh()
      return
    }

    // --- EDIT: detect price change ---
    const priceChanged = originalPrice !== null && newPrice !== originalPrice

    if (priceChanged) {
      // Show dialog before committing
      setSaving(false)
      const count = await fetchAffectedCount(form.id)
      setPriceDialog({
        planId: form.id,
        planName: form.name.trim(),
        payload,
        oldPrice: originalPrice!,
        newPrice,
        affectedCount: count,
      })
      setDialogChoice(null)
      return
    }

    // Edit with no price change — use API route (keeps consistent + admin client)
    await commitPlanUpdate(form.id, payload, false, originalPrice ?? newPrice, newPrice)
    setSaving(false)
  }

  async function commitPlanUpdate(
    planId: string,
    payload: Record<string, unknown>,
    applyToCustomers: boolean,
    oldPrice: number,
    newPrice: number,
  ) {
    const res = await fetch('/api/update-meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, payload, applyToCustomers, oldPrice, newPrice }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to save meal plan.')
      return false
    }
    const updatedPlan: MealPlan = json.plan
    setMealPlans(prev =>
      prev.map(p => p.id === updatedPlan.id ? updatedPlan : p)
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    setShowForm(false)
    setForm(EMPTY_FORM)
    setOriginalPrice(null)
    await invalidateMealPlans(providerId)
    router.refresh()
    return true
  }

  async function handlePriceDialogChoice(applyToCustomers: boolean) {
    if (!priceDialog) return
    setDialogSaving(true)
    const ok = await commitPlanUpdate(
      priceDialog.planId,
      priceDialog.payload,
      applyToCustomers,
      priceDialog.oldPrice,
      priceDialog.newPrice,
    )
    setDialogSaving(false)
    if (ok) {
      // Append to local price history
      const entry: PriceHistoryEntry = {
        id: Date.now().toString(),
        old_price: priceDialog.oldPrice,
        new_price: priceDialog.newPrice,
        changed_at: new Date().toISOString(),
      }
      setPriceHistory(prev => ({
        ...prev,
        [priceDialog.planId]: [entry, ...(prev[priceDialog.planId] ?? [])],
      }))
      setPriceDialog(null)
    }
  }

  async function toggleStatus(plan: MealPlan) {
    const status: MealPlanStatus = plan.status === 'active' ? 'inactive' : 'active'
    const { data, error: updateError } = await db
      .from('meal_plans')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
      .select('*')
      .single()

    if (!updateError && data) {
      setMealPlans(prev => prev.map(item => item.id === plan.id ? data : item))
      await invalidateMealPlans(providerId)
      router.refresh()
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="fixed inset-x-0 top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => backUrl ? router.push(backUrl) : router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Meal Plans</h1>
            <p className="text-xs font-semibold text-orange-600/80">Reusable subscription structures</p>
          </div>
          <button onClick={startCreate} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-24 space-y-4">
        {showForm && (
          <form onSubmit={handleSave} className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-gray-900">{form.id ? 'Edit plan' : 'New plan'}</h2>
              <button type="button" onClick={() => { setShowForm(false); setOriginalPrice(null) }} className="rounded-xl p-2 text-gray-400 hover:bg-gray-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <Field label="Plan name *">
              <input required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Breakfast + Dinner" className={inputClass} />
            </Field>

            <Field label="Meal slots">
              <div className="grid grid-cols-3 gap-2">
                {MEAL_SLOTS.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    className={`rounded-2xl border px-2 py-3 text-xs font-bold transition ${
                      form.meal_slots.includes(slot)
                        ? 'border-orange-500 bg-orange-50 text-orange-600'
                        : 'border-gray-200 bg-white text-gray-500'
                    }`}
                  >
                    <span className="block text-lg">{MEAL_SLOT_EMOJI[slot]}</span>
                    {MEAL_SLOT_LABEL[slot]}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <div className="flex overflow-hidden rounded-2xl border border-gray-200">
                  {(['veg', 'nonveg'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, plan_type: type }))}
                      className={`flex flex-1 items-center justify-center gap-1 py-3 text-xs font-bold ${form.plan_type === type ? 'bg-[#F4622A] text-white' : 'bg-white text-gray-500'}`}
                    >
                      {type === 'veg' ? <Leaf className="w-3.5 h-3.5" /> : <Drumstick className="w-3.5 h-3.5" />}
                      {PLAN_TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Frequency">
                <select value={form.frequency} onChange={(e) => setForm(f => ({ ...f, frequency: e.target.value as Frequency }))} className={inputClass}>
                  <option value="daily">Daily</option>
                  <option value="alternate">Alternate</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly price *">
                <input
                  required
                  type="number"
                  min="0"
                  value={form.monthly_price}
                  onChange={(e) => setForm(f => ({ ...f, monthly_price: e.target.value }))}
                  placeholder="2500"
                  className={inputClass}
                />
                {form.id && originalPrice !== null && Number(form.monthly_price) !== originalPrice && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-600">
                    Was ₹{originalPrice} — you&apos;ll be asked how to apply the new rate
                  </p>
                )}
              </Field>
              <Field label="Active days">
                <input required type="number" min="1" value={form.active_days} onChange={(e) => setForm(f => ({ ...f, active_days: e.target.value }))} className={inputClass} />
              </Field>
            </div>

            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional notes for your team" className={`${inputClass} resize-none`} />
            </Field>

            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as MealPlanStatus }))} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>

            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

            <button disabled={saving} className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold disabled:opacity-60">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save meal plan'}
            </button>
          </form>
        )}

        {mealPlans.length === 0 && !showForm ? (
          <div className="glass-card rounded-2xl px-6 py-12 text-center">
            <ClipboardList className="mx-auto mb-4 w-10 h-10 text-orange-500" />
            <p className="font-black text-gray-900">Create your first meal plan</p>
            <p className="mt-1 text-sm text-gray-500">Plans define the subscription structure. Menus define the actual dishes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mealPlans.map(plan => {
              const history = priceHistory[plan.id] ?? []
              const historyExpanded = expandedHistory.has(plan.id)

              return (
                <div key={plan.id} className="rounded-2xl bg-white shadow-sm border border-gray-100">
                  {/* Plan header */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-black text-gray-900">{plan.name}</h2>
                          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {plan.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-gray-500">
                          {formatMealSlots(plan.meal_slots)} · {PLAN_TYPE_LABEL[plan.plan_type]} · {FREQUENCY_LABEL[plan.frequency]}
                        </p>
                        {plan.description && <p className="mt-2 text-xs text-gray-400">{plan.description}</p>}
                      </div>
                      <p className="shrink-0 text-right text-lg font-black text-gray-900">₹{plan.monthly_price}<span className="text-xs font-semibold text-gray-400">/mo</span></p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => startEdit(plan)} className="flex-1 rounded-2xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600">
                        Edit
                      </button>
                      <button onClick={() => toggleStatus(plan)} className="flex-1 rounded-2xl bg-orange-50 py-2.5 text-xs font-bold text-orange-600">
                        {plan.status === 'active' ? 'Mark inactive' : 'Reactivate'}
                      </button>
                    </div>
                  </div>

                  {/* Price history */}
                  {history.length > 0 && (
                    <div className="border-t border-gray-100">
                      <button
                        onClick={() => toggleHistory(plan.id)}
                        className="flex w-full items-center justify-between px-5 py-3 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-gray-400" />
                          Price history · {history.length} {history.length === 1 ? 'change' : 'changes'}
                        </span>
                        {historyExpanded
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        }
                      </button>
                      {historyExpanded && (
                        <div className="px-5 pb-4 space-y-2">
                          {history.map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                              <div>
                                <p className="text-xs font-black text-gray-700">
                                  ₹{entry.old_price} → ₹{entry.new_price}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(entry.changed_at)}</p>
                              </div>
                              <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                                entry.new_price > entry.old_price
                                  ? 'bg-red-50 text-red-500'
                                  : 'bg-green-50 text-green-600'
                              }`}>
                                {entry.new_price > entry.old_price ? '↑' : '↓'} ₹{Math.abs(entry.new_price - entry.old_price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />

      {/* ── Price-change dialog ── */}
      {priceDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6 space-y-5">
            {/* Header */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-1">Price change</p>
              <h2 className="text-lg font-black text-gray-900 leading-tight">{priceDialog.planName}</h2>
              <div className="flex items-center gap-3 mt-3">
                <span className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-black text-gray-400 line-through">₹{priceDialog.oldPrice}/mo</span>
                <span className="text-gray-400 text-sm">→</span>
                <span className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-black text-white">₹{priceDialog.newPrice}/mo</span>
              </div>
            </div>

            {/* Question */}
            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-4">
              <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" />
                {priceDialog.affectedCount > 0
                  ? `${priceDialog.affectedCount} existing customer${priceDialog.affectedCount > 1 ? 's are' : ' is'} on this plan`
                  : 'No active customers on this plan yet'}
              </p>
              <p className="text-xs text-amber-700 mt-1.5">
                Should the new ₹{priceDialog.newPrice}/mo rate apply to them, or should they stay on the old ₹{priceDialog.oldPrice}/mo rate?
              </p>
            </div>

            {/* Radio choices */}
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={dialogSaving}
                onClick={() => setDialogChoice('apply')}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                  dialogChoice === 'apply'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  dialogChoice === 'apply' ? 'border-orange-500' : 'border-gray-300'
                }`}>
                  {dialogChoice === 'apply' && <span className="h-2 w-2 rounded-full bg-orange-500" />}
                </span>
                <div>
                  <p className={`text-sm font-black ${dialogChoice === 'apply' ? 'text-orange-700' : 'text-gray-700'}`}>Apply to everyone</p>
                  <p className={`text-xs mt-0.5 ${dialogChoice === 'apply' ? 'text-orange-500' : 'text-gray-400'}`}>
                    Update all {priceDialog.affectedCount} existing customers to ₹{priceDialog.newPrice}/mo
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={dialogSaving}
                onClick={() => setDialogChoice('keep')}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                  dialogChoice === 'keep'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  dialogChoice === 'keep' ? 'border-orange-500' : 'border-gray-300'
                }`}>
                  {dialogChoice === 'keep' && <span className="h-2 w-2 rounded-full bg-orange-500" />}
                </span>
                <div>
                  <p className={`text-sm font-black ${dialogChoice === 'keep' ? 'text-orange-700' : 'text-gray-700'}`}>Keep old rate for existing customers</p>
                  <p className={`text-xs mt-0.5 ${dialogChoice === 'keep' ? 'text-orange-500' : 'text-gray-400'}`}>
                    They stay on ₹{priceDialog.oldPrice}/mo — new customers get ₹{priceDialog.newPrice}/mo
                  </p>
                </div>
              </button>
            </div>

            {/* Confirm + Cancel */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={!dialogChoice || dialogSaving}
                onClick={() => handlePriceDialogChoice(dialogChoice === 'apply')}
                className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40"
              >
                {dialogSaving ? 'Saving…' : 'Confirm price change'}
              </button>
              <button
                type="button"
                disabled={dialogSaving}
                onClick={() => setPriceDialog(null)}
                className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-bold text-gray-500 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100'
