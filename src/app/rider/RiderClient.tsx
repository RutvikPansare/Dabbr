'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle2, PackageX, Clock3, ChevronDown, ChevronUp, Truck } from 'lucide-react'

type MealSlot = 'breakfast' | 'lunch' | 'dinner'
type DeliveryStatus = 'pending' | 'delivered' | 'skipped'

interface Customer {
  id: string
  name: string
  area: string | null
  subscriptions: { meal_plans: { meal_slots: MealSlot[] } | null }[]
  pauses: { pause_date: string }[]
}

const STATUS_CYCLE: DeliveryStatus[] = ['pending', 'delivered', 'skipped']

function nextStatus(current: DeliveryStatus): DeliveryStatus {
  const i = STATUS_CYCLE.indexOf(current)
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length]
}

function getSlots(c: Customer): MealSlot[] {
  for (const sub of c.subscriptions) {
    const slots = sub.meal_plans?.meal_slots
    if (slots && slots.length > 0) return slots
  }
  return ['lunch']
}

function slotLabel(slot: MealSlot) {
  return { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }[slot]
}

function isPaused(c: Customer, today: string) {
  return c.pauses?.some((p: { pause_date: string }) => p.pause_date === today)
}

interface Props {
  riderName: string
  today: string
  customers: Customer[]
  initialStatuses: Record<string, string>
  hasAssignment: boolean
}

export default function RiderClient({ riderName, today, customers, initialStatuses, hasAssignment }: Props) {
  const [statuses, setStatuses] = useState<Record<string, DeliveryStatus>>(
    initialStatuses as Record<string, DeliveryStatus>
  )
  const statusesRef = useRef(statuses)
  const [showDone, setShowDone] = useState(false)
  const lastTouchMs = useRef<Record<string, number>>({})

  useEffect(() => { statusesRef.current = statuses }, [statuses])

  // Realtime subscription
  useEffect(() => {
    let channel: any = null
    async function subscribe() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      channel = supabase
        .channel(`rider-logs-${today}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'delivery_logs',
          filter: `date=eq.${today}`,
        }, (payload: any) => {
          const row = payload.new ?? payload.old
          if (!row) return
          const key = `${row.customer_id}:${row.meal_slot}`
          setStatuses(prev => ({
            ...prev,
            [key]: payload.eventType === 'DELETE' ? 'pending' : row.status,
          }))
        })
        .subscribe()
    }
    subscribe()
    return () => { channel?.unsubscribe() }
  }, [today])

  const markDelivery = useCallback(async (customerId: string, slot: MealSlot, newStatus: DeliveryStatus) => {
    const key = `${customerId}:${slot}`
    const prev = statusesRef.current[key] ?? 'pending'
    setStatuses(s => ({ ...s, [key]: newStatus }))
    try {
      const res = await fetch('/api/mark-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, date: today, meal_slot: slot, status: newStatus }),
      })
      if (!res.ok) {
        setStatuses(s => ({ ...s, [key]: prev }))
      }
    } catch {
      setStatuses(s => ({ ...s, [key]: prev }))
    }
  }, [today])

  const todayFormatted = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const activeCustomers = customers.filter(c => !isPaused(c, today))
  const pausedCustomers = customers.filter(c => isPaused(c, today))

  // Slot-level summary
  const allSlotKeys = activeCustomers.flatMap(c => getSlots(c).map(s => `${c.id}:${s}`))
  const totalSlots = allSlotKeys.length
  const deliveredSlots = allSlotKeys.filter(k => (statuses[k] ?? 'pending') === 'delivered').length
  const skippedSlots = allSlotKeys.filter(k => (statuses[k] ?? 'pending') === 'skipped').length
  const pendingSlots = totalSlots - deliveredSlots - skippedSlots
  const allDone = totalSlots > 0 && pendingSlots === 0

  const pendingCustomers = activeCustomers.filter(c =>
    getSlots(c).some(s => (statuses[`${c.id}:${s}`] ?? 'pending') === 'pending')
  )
  const doneCustomers = activeCustomers.filter(c =>
    getSlots(c).every(s => (statuses[`${c.id}:${s}`] ?? 'pending') !== 'pending')
  )

  return (
    <div className="min-h-screen bg-[#FDF8F3]">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-30 bg-[#FDF8F3]/90 backdrop-blur-sm border-b border-orange-100/50">
        <div className="px-4 py-3 max-w-2xl mx-auto flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-500 shrink-0">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-900 truncate">{riderName}</p>
            <p className="text-xs font-semibold text-orange-600/80">{todayFormatted}</p>
          </div>
          {totalSlots > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-sm font-black text-gray-900">{deliveredSlots}/{totalSlots}</p>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">done</p>
            </div>
          )}
        </div>
        {totalSlots > 0 && (
          <div className="h-1 bg-gray-100 mx-4 mb-2 rounded-full overflow-hidden max-w-2xl mx-auto">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${(deliveredSlots / totalSlots) * 100}%` }}
            />
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-24 pb-12 space-y-4">

        {/* No assignment today */}
        {!hasAssignment && (
          <div className="rounded-3xl border border-gray-100 bg-white shadow-sm p-8 text-center">
            <Clock3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-black text-gray-600 mb-1">No deliveries assigned today</p>
            <p className="text-xs font-semibold text-gray-400">Check back when your provider assigns you a route.</p>
          </div>
        )}

        {/* All done celebration */}
        {hasAssignment && allDone && (
          <div className="rounded-3xl border border-green-100 bg-green-50 p-5 text-center">
            <p className="text-2xl mb-1">🎉</p>
            <p className="text-sm font-black text-green-800">All deliveries done!</p>
            <p className="text-xs font-semibold text-green-600 mt-0.5">
              {deliveredSlots} delivered · {skippedSlots > 0 ? `${skippedSlots} skipped` : 'none skipped'}
            </p>
          </div>
        )}

        {/* Pending customers */}
        {pendingCustomers.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide px-1">
              Pending · {pendingCustomers.length}
            </p>
            <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
              {pendingCustomers.map(c => (
                <CustomerRow
                  key={c.id}
                  c={c}
                  today={today}
                  statuses={statuses}
                  onMark={markDelivery}
                  lastTouchMs={lastTouchMs}
                />
              ))}
            </div>
          </section>
        )}

        {/* Done customers (collapsible) */}
        {doneCustomers.length > 0 && (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDone(v => !v)}
              className="flex items-center gap-2 px-1 w-full"
            >
              <p className="text-xs font-black text-gray-500 uppercase tracking-wide flex-1 text-left">
                Done · {doneCustomers.length}
              </p>
              {showDone
                ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              }
            </button>
            {showDone && (
              <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
                {doneCustomers.map(c => (
                  <CustomerRow
                    key={c.id}
                    c={c}
                    today={today}
                    statuses={statuses}
                    onMark={markDelivery}
                    lastTouchMs={lastTouchMs}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Paused customers */}
        {pausedCustomers.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide px-1">
              Paused today · {pausedCustomers.length}
            </p>
            <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
              {pausedCustomers.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 opacity-40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-500 truncate">{c.name}</p>
                    {c.area && <p className="text-xs font-semibold text-gray-400">{c.area}</p>}
                  </div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide bg-gray-100 px-2 py-0.5 rounded-full">
                    Paused
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}

// ── Customer row ────────────────────────────────────────────────────────────────

function CustomerRow({
  c, today, statuses, onMark, lastTouchMs,
}: {
  c: Customer
  today: string
  statuses: Record<string, DeliveryStatus>
  onMark: (id: string, slot: MealSlot, status: DeliveryStatus) => void
  lastTouchMs: React.MutableRefObject<Record<string, number>>
}) {
  const slots = getSlots(c)
  const allDone = slots.every(s => (statuses[`${c.id}:${s}`] ?? 'pending') !== 'pending')

  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${allDone ? 'bg-green-50/50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold truncate ${allDone ? 'text-green-800' : 'text-gray-900'}`}>
          {c.name}
        </p>
        {c.area && (
          <p className="text-xs font-semibold text-gray-400">{c.area}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {slots.map(slot => {
          const key = `${c.id}:${slot}`
          const status: DeliveryStatus = statuses[key] ?? 'pending'
          return (
            <SlotButton
              key={slot}
              customerId={c.id}
              slot={slot}
              status={status}
              onMark={onMark}
              lastTouchMs={lastTouchMs}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Slot button ─────────────────────────────────────────────────────────────────

function SlotButton({
  customerId, slot, status, onMark, lastTouchMs,
}: {
  customerId: string
  slot: MealSlot
  status: DeliveryStatus
  onMark: (id: string, slot: MealSlot, status: DeliveryStatus) => void
  lastTouchMs: React.MutableRefObject<Record<string, number>>
}) {
  const key = `${customerId}:${slot}`

  const label = { breakfast: 'B', lunch: 'L', dinner: 'D' }[slot]

  const baseClass = 'relative w-9 h-9 rounded-xl flex flex-col items-center justify-center transition-all active:scale-90 select-none'
  const styleMap: Record<DeliveryStatus, string> = {
    delivered: 'bg-green-500 text-white shadow-sm',
    skipped:   'bg-amber-500 text-white shadow-sm',
    pending:   'border-2 border-dashed border-gray-300 text-gray-400 bg-white hover:border-orange-400 hover:text-orange-500',
  }

  function handleTouch() {
    lastTouchMs.current[key] = Date.now()
    onMark(customerId, slot, nextStatus(status))
  }

  function handleClick() {
    if (Date.now() - (lastTouchMs.current[key] ?? 0) < 600) return
    onMark(customerId, slot, nextStatus(status))
  }

  return (
    <div className="relative group/slot shrink-0">
      <button
        type="button"
        onTouchEnd={handleTouch}
        onClick={handleClick}
        className={`${baseClass} ${styleMap[status]}`}
        aria-label={`${slotLabel(slot)}: ${status}`}
      >
        {status === 'delivered' && <CheckCircle2 className="w-4 h-4" />}
        {status === 'skipped' && <PackageX className="w-4 h-4" />}
        {status === 'pending' && <span className="text-[10px] font-black">{label}</span>}
      </button>
      {/* Tooltip */}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-75 group-hover/slot:opacity-100 z-50">
        {slotLabel(slot)}: {status}
      </span>
    </div>
  )
}
