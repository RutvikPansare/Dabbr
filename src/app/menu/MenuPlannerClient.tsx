'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Save, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import type { MealSlot, PlanType } from '@/types/database'
import { MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL, MEAL_SLOTS } from '@/lib/meals'

interface DailyMenu {
  id: string
  provider_id: string
  menu_date: string
  meal_slot: MealSlot
  dish_name: string
  plan_type: PlanType | null
  notes: string | null
}

interface Props {
  providerId: string
  initialMenus: DailyMenu[]
  initialWeekStart: string
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function labelDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function MenuPlannerClient({ providerId, initialMenus, initialWeekStart }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const today = new Date().toISOString().split('T')[0]
  // Compute Monday of the current week (client-side) for jump-to-today
  const thisWeekStart = useMemo(() => {
    const d = new Date()
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    return d.toISOString().split('T')[0]
  }, [])

  const [weekStart, setWeekStart] = useState(initialWeekStart)
  const [menus, setMenus] = useState<DailyMenu[]>(initialMenus)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  function menuKey(date: string, slot: MealSlot, planType: PlanType | null) {
    return `${date}:${slot}:${planType ?? 'any'}`
  }

  function getMenu(date: string, slot: MealSlot, planType: PlanType | null) {
    return menus.find(item => item.menu_date === date && item.meal_slot === slot && item.plan_type === planType) ?? null
  }

  async function loadWeek(nextStart: string) {
    setWeekStart(nextStart)
    const end = addDays(nextStart, 6)
    const { data } = await db
      .from('daily_menus')
      .select('*')
      .eq('provider_id', providerId)
      .gte('menu_date', nextStart)
      .lte('menu_date', end)
      .order('menu_date')
      .order('meal_slot')
    setMenus(data ?? [])
    setDrafts({})
  }

  async function saveMenu(date: string, slot: MealSlot, planType: PlanType | null) {
    const key = menuKey(date, slot, planType)
    const existing = getMenu(date, slot, planType)
    const dish = (drafts[key] ?? existing?.dish_name ?? '').trim()
    if (!dish) return

    setSavingKey(key)
    setSaveError(null)
    const payload = {
      provider_id: providerId,
      menu_date: date,
      meal_slot: slot,
      plan_type: planType,
      dish_name: dish,
      updated_at: new Date().toISOString(),
    }
    const query = existing
      ? db.from('daily_menus').update(payload).eq('id', existing.id)
      : db.from('daily_menus').insert(payload)
    const { data, error } = await query.select('*').single()
    setSavingKey(null)
    if (error || !data) {
      setSaveError(error?.message ?? 'Save failed — please try again')
      return
    }

    setMenus(prev => {
      const without = prev.filter(item => item.id !== data.id)
      return [...without, data]
    })
    // Remove draft so input falls back to the saved dish_name from state
    setDrafts(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    // Brief ✓ confirmation on the button
    setSavedKey(key)
    setTimeout(() => setSavedKey(k => k === key ? null : k), 1500)
  }

  async function deleteMenu(menu: DailyMenu) {
    await db.from('daily_menus').delete().eq('id', menu.id)
    setMenus(prev => prev.filter(item => item.id !== menu.id))
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Daily Menu</h1>
            <p className="text-xs font-semibold text-orange-600/80">Plan dishes without changing subscriptions</p>
          </div>
          <CalendarDays className="w-5 h-5 text-orange-500" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-24 space-y-4">
        {saveError && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium flex items-center justify-between">
            <span>⚠️ {saveError}</span>
            <button onClick={() => setSaveError(null)} className="ml-3 text-red-400 hover:text-red-600 font-bold text-xs">✕</button>
          </div>
        )}
        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => loadWeek(addDays(weekStart, -7))} className="rounded-2xl bg-orange-50 px-4 py-2 text-xs font-bold text-orange-600">Prev</button>
            <div className="text-center">
              <p className="text-sm font-black text-gray-900">Week menu</p>
              <p className="text-xs font-semibold text-gray-400">{labelDate(weekStart)} – {labelDate(addDays(weekStart, 6))}</p>
            </div>
            <button onClick={() => loadWeek(addDays(weekStart, 7))} className="rounded-2xl bg-orange-50 px-4 py-2 text-xs font-bold text-orange-600">Next</button>
          </div>
          {/* Today shortcut — only show if today is not in this week */}
          {(today < weekStart || today > addDays(weekStart, 6)) && (
            <button
              onClick={() => loadWeek(thisWeekStart)}
              className="w-full border-t border-orange-100 py-2 text-xs font-bold text-orange-500 bg-orange-50 hover:bg-orange-100 transition-colors"
            >
              ↩ Jump to current week
            </button>
          )}
        </div>

        {days.map(date => {
          const isToday = date === today
          return (
          <section
            key={date}
            id={isToday ? 'today-section' : undefined}
            className={`rounded-3xl p-4 border shadow-sm ${isToday ? 'bg-orange-50 border-orange-200 ring-2 ring-orange-300/40' : 'bg-white border-gray-100'}`}
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-gray-900">
              {labelDate(date)}
              {isToday && (
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-wider">
                  Today
                </span>
              )}
            </h2>
            <div className="space-y-3">
              {MEAL_SLOTS.map(slot => (
                <div key={slot} className="rounded-2xl bg-[#FDF8F3] p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500">
                    {MEAL_SLOT_EMOJI[slot]} {MEAL_SLOT_LABEL[slot]}
                  </p>
                  <div className="space-y-2">
                    {([null, 'veg', 'nonveg'] as const).map(planType => {
                      const menu = getMenu(date, slot, planType)
                      const key = menuKey(date, slot, planType)
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-14 shrink-0 text-[10px] font-bold uppercase text-gray-400">
                            {planType ?? 'Any'}
                          </span>
                          <input
                            value={drafts[key] ?? menu?.dish_name ?? ''}
                            onChange={(e) => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={planType === 'nonveg' ? 'Chicken curry' : planType === 'veg' ? 'Paneer, dal...' : 'Common item'}
                            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                          />
                          <button
                            onClick={() => saveMenu(date, slot, planType)}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl text-white disabled:opacity-60 transition-colors ${savedKey === key ? 'bg-emerald-500' : 'bg-orange-500'}`}
                            disabled={savingKey === key}
                          >
                            {savedKey === key ? '✓' : <Save className="w-4 h-4" />}
                          </button>
                          {menu && (
                            <button onClick={() => deleteMenu(menu)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
          )
        })}
      </main>

      <BottomNav />
    </div>
  )
}
