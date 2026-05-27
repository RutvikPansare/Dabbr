'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle2, PackageX, Clock3, ChevronDown, ChevronUp, Truck, Bell, X, LayoutDashboard, LogOut } from 'lucide-react'
import { dismissRiderNotification, dismissAllRiderNotifications } from './actions'

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

interface RiderNotification {
  id: string
  type: string
  title: string
  message: string
  payload: Record<string, any> | null
  created_at: string
  read_at: string | null
}

interface Props {
  riderName: string
  today: string
  customers: Customer[]
  initialStatuses: Record<string, string>
  hasAssignment: boolean
  notifications: RiderNotification[]
  isAlsoProvider?: boolean
}

export default function RiderClient({ riderName, today, customers, initialStatuses, hasAssignment, notifications: initialNotifications, isAlsoProvider }: Props) {
  const [statuses, setStatuses] = useState<Record<string, DeliveryStatus>>(
    initialStatuses as Record<string, DeliveryStatus>
  )
  const statusesRef = useRef(statuses)
  const lastTouchMs = useRef<Record<string, number>>({})

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<RiderNotification[]>(initialNotifications)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [bellDropPos, setBellDropPos] = useState<{ top: number; right: number } | null>(null)
  const totalBellCount = notifications.length

  function openBell() {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect()
      setBellDropPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setBellOpen(o => !o)
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function dismissOne(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    dismissRiderNotification(id).catch(() => {})
  }

  function dismissAll() {
    setNotifications([])
    dismissAllRiderNotifications().catch(() => {})
    setBellOpen(false)
  }

  // Fire native Android notifications for unread items on first mount
  const nativeFiredRef = useRef(false)
  useEffect(() => {
    const unread = notifications.filter(n => n.read_at === null)
    if (nativeFiredRef.current || unread.length === 0) return
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) return
    nativeFiredRef.current = true
    ;(async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const perm = await LocalNotifications.requestPermissions()
        if (perm.display !== 'granted') return
        await LocalNotifications.schedule({
          notifications: unread.map((n, i) => ({
            id: Math.abs(n.id.split('').reduce((a: number, c: string) => (a << 5) - a + c.charCodeAt(0), 0)) % 2147483647 || (i + 1),
            title: n.title,
            body: n.message,
            schedule: { at: new Date(Date.now() + 1000) },
            channelId: 'dabbr-alerts',
          })),
        })
      } catch (e) { console.warn('Rider notification error:', e) }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Overall progress (across all slots × all customers)
  const allSlotKeys = activeCustomers.flatMap(c => getSlots(c).map(s => `${c.id}:${s}`))
  const totalSlots = allSlotKeys.length
  const deliveredSlots = allSlotKeys.filter(k => (statuses[k] ?? 'pending') === 'delivered').length
  const skippedSlots = allSlotKeys.filter(k => (statuses[k] ?? 'pending') === 'skipped').length
  const pendingSlots = totalSlots - deliveredSlots - skippedSlots
  const allDone = totalSlots > 0 && pendingSlots === 0

  // Group by slot — customers appear once per slot they subscribe to
  const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner']
  const slotGroups = SLOT_ORDER
    .map(slot => {
      const slotCustomers = activeCustomers.filter(c => getSlots(c).includes(slot))
      const pending = slotCustomers.filter(c => (statuses[`${c.id}:${slot}`] ?? 'pending') === 'pending')
      const done    = slotCustomers.filter(c => (statuses[`${c.id}:${slot}`] ?? 'pending') !== 'pending')
      return { slot, slotCustomers, pending, done }
    })
    .filter(g => g.slotCustomers.length > 0)

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
          {/* Switch to provider view — only shown when this user is also a provider */}
          {isAlsoProvider && (
            <a
              href="/api/set-view?view=provider"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-orange-200 bg-orange-50 text-orange-600 text-xs font-bold hover:bg-orange-100 active:scale-95 transition-all"
              title="Switch to Provider Dashboard"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Provider</span>
            </a>
          )}
          {/* Bell */}
          <button
            ref={bellRef}
            onClick={openBell}
            className="relative flex items-center justify-center h-9 w-9 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:scale-95 transition-all shrink-0"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {totalBellCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white leading-none">
                {totalBellCount}
              </span>
            )}
          </button>
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center h-9 w-9 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all shrink-0"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
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

        {/* Slot groups */}
        {hasAssignment && slotGroups.map(({ slot, slotCustomers, pending, done }) => {
          const slotAllDone = pending.length === 0
          return (
            <SlotSection
              key={slot}
              slot={slot}
              total={slotCustomers.length}
              pending={pending}
              done={done}
              slotAllDone={slotAllDone}
              today={today}
              statuses={statuses}
              onMark={markDelivery}
              lastTouchMs={lastTouchMs}
            />
          )
        })}

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

      {/* ── Notification dropdown (anchored to bell button) ── */}
      {bellOpen && bellDropPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
          <div
            className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{ top: bellDropPos.top, right: bellDropPos.right }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-600" />
                <p className="text-sm font-black text-gray-900">Notifications</p>
                {totalBellCount > 0 && (
                  <span className="flex items-center justify-center h-5 px-1.5 rounded-full bg-red-100 text-red-600 text-[10px] font-black">
                    {totalBellCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifications.length > 1 && (
                  <button
                    onClick={dismissAll}
                    className="text-[11px] font-bold text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setBellOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 px-5 text-center">
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-gray-300" />
                  </div>
                  <p className="text-sm font-bold text-gray-400">All clear — no notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map(n => (
                    <RiderNotificationRow
                      key={n.id}
                      n={n}
                      onDismiss={() => dismissOne(n.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Rider notification row ───────────────────────────────────────────────────

const RIDER_NOTIF_META: Record<string, { badge: string; badgeClass: string }> = {
  assignment: { badge: '📦 New Assignment', badgeClass: 'text-orange-500' },
  message:    { badge: '💬 Message',        badgeClass: 'text-blue-500'   },
}

function RiderNotificationRow({ n, onDismiss }: { n: RiderNotification; onDismiss: () => void }) {
  const meta = RIDER_NOTIF_META[n.type] ?? { badge: n.type, badgeClass: 'text-gray-500' }
  const isUnread = n.read_at === null

  return (
    <div className={`flex items-start gap-3 px-5 py-4 ${isUnread ? 'bg-orange-50/40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />}
          <span className={`text-[10px] font-black uppercase tracking-wider ${meta.badgeClass}`}>
            {meta.badge}
          </span>
        </div>
        <p className="text-sm font-black text-gray-900">{n.title}</p>
        <p className="text-xs font-semibold text-gray-500 mt-0.5">{n.message}</p>
        <p className="text-[10px] text-gray-400 mt-1">
          {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Slot section ────────────────────────────────────────────────────────────────

const SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: '🌅',
  lunch:     '☀️',
  dinner:    '🌙',
}

function SlotSection({
  slot, total, pending, done, slotAllDone, today, statuses, onMark, lastTouchMs,
}: {
  slot: MealSlot
  total: number
  pending: Customer[]
  done: Customer[]
  slotAllDone: boolean
  today: string
  statuses: Record<string, DeliveryStatus>
  onMark: (id: string, slot: MealSlot, status: DeliveryStatus) => void
  lastTouchMs: React.MutableRefObject<Record<string, number>>
}) {
  const [showDone, setShowDone] = useState(false)

  return (
    <section className="space-y-2">
      {/* Slot header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-base leading-none">{SLOT_EMOJI[slot]}</span>
        <p className="text-xs font-black text-gray-500 uppercase tracking-wide flex-1">
          {slotLabel(slot)}
        </p>
        <span className={`text-xs font-black ${slotAllDone ? 'text-green-600' : 'text-gray-400'}`}>
          {total - pending.length}/{total}
        </span>
        {slotAllDone && (
          <span className="text-[10px] font-black text-green-600 uppercase tracking-wide bg-green-50 px-2 py-0.5 rounded-full">
            Done
          </span>
        )}
      </div>

      {/* Pending rows */}
      {pending.length > 0 && (
        <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
          {pending.map(c => (
            <CustomerRow
              key={c.id}
              c={c}
              today={today}
              statuses={statuses}
              onMark={onMark}
              lastTouchMs={lastTouchMs}
              filterSlot={slot}
            />
          ))}
        </div>
      )}

      {/* Done rows (collapsible) */}
      {done.length > 0 && (
        <div className="rounded-3xl border border-green-100 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setShowDone(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span className="text-xs font-black text-green-700 flex-1">
              {done.length} {done.length === 1 ? 'delivery' : 'deliveries'} done
            </span>
            {showDone
              ? <ChevronUp className="w-3.5 h-3.5 text-green-500" />
              : <ChevronDown className="w-3.5 h-3.5 text-green-500" />}
          </button>
          {showDone && (
            <div className="divide-y divide-green-50/50 border-t border-green-100">
              {done.map(c => (
                <CustomerRow
                  key={c.id}
                  c={c}
                  today={today}
                  statuses={statuses}
                  onMark={onMark}
                  lastTouchMs={lastTouchMs}
                  filterSlot={slot}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Customer row ────────────────────────────────────────────────────────────────

function CustomerRow({
  c, today, statuses, onMark, lastTouchMs, filterSlot,
}: {
  c: Customer
  today: string
  statuses: Record<string, DeliveryStatus>
  onMark: (id: string, slot: MealSlot, status: DeliveryStatus) => void
  lastTouchMs: React.MutableRefObject<Record<string, number>>
  filterSlot?: MealSlot
}) {
  const slots = filterSlot ? [filterSlot] : getSlots(c)
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
