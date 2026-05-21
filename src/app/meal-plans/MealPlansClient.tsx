'use client'

import { useState } from 'react'
import { ArrowLeft, ClipboardList, Drumstick, Leaf, Plus, Save, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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

interface Props {
  providerId: string
  initialMealPlans: MealPlan[]
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

export default function MealPlansClient({ providerId, initialMealPlans }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [mealPlans, setMealPlans] = useState<MealPlan[]>(initialMealPlans)
  const [showForm, setShowForm] = useState(initialMealPlans.length === 0)
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function startCreate() {
    setForm(EMPTY_FORM)
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!form.name.trim()) {
      setError('Plan name is required.')
      setSaving(false)
      return
    }

    const payload = {
      provider_id: providerId,
      name: form.name.trim(),
      meal_slots: form.meal_slots,
      plan_type: form.plan_type,
      frequency: form.frequency,
      monthly_price: Number(form.monthly_price || 0),
      active_days: Number(form.active_days || 30),
      description: form.description.trim() || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    }

    const query = form.id
      ? db.from('meal_plans').update(payload).eq('id', form.id)
      : db.from('meal_plans').insert(payload)

    const { data, error: saveError } = await query.select('*').single()
    setSaving(false)

    if (saveError) {
      setError(saveError.message ?? 'Failed to save meal plan.')
      return
    }

    setMealPlans(prev => {
      const without = prev.filter(plan => plan.id !== data.id)
      return [...without, data].sort((a, b) => a.name.localeCompare(b.name))
    })
    setShowForm(false)
    setForm(EMPTY_FORM)
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
    }
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="fixed inset-x-0 top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
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
          <form onSubmit={handleSave} className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-gray-900">{form.id ? 'Edit plan' : 'New plan'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-50">
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
                <input required type="number" min="0" value={form.monthly_price} onChange={(e) => setForm(f => ({ ...f, monthly_price: e.target.value }))} placeholder="2500" className={inputClass} />
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
          <div className="glass-card rounded-3xl px-6 py-12 text-center">
            <ClipboardList className="mx-auto mb-4 w-10 h-10 text-orange-500" />
            <p className="font-black text-gray-900">Create your first meal plan</p>
            <p className="mt-1 text-sm text-gray-500">Plans define the subscription structure. Menus define the actual dishes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mealPlans.map(plan => (
              <div key={plan.id} className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100">
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
                  <p className="shrink-0 text-right text-lg font-black text-gray-900">₹{plan.monthly_price}</p>
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
            ))}
          </div>
        )}
      </main>

      <BottomNav />
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
