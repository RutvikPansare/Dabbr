'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Sun, Sunrise, Moon, Leaf, Drumstick, AlertTriangle, Box, PartyPopper,
  Copy, Check, LogOut, MessageSquare, X, Users, CheckCheck, Bike, Send, Edit2, ChevronDown,
  MapPin, HandCoins, ChevronRight, UtensilsCrossed,
} from 'lucide-react'
import { formatMealSlots, MEAL_SLOTS, MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL } from '@/lib/meals'
import BottomNav from '@/components/BottomNav'
import SummarySection from './SummarySection'
import Paywall from '@/components/Paywall'
import { getThemeVars } from '@/lib/branding'
import type { Frequency, MealSlot, PlanType, SubscriptionStatus } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────────────────

interface Pause {
  id: string
  customer_id: string
  start_date: string
  end_date: string
  reason: string | null
}

interface Customer {
  id: string
  name: string
  whatsapp_number: string
  address: string | null
  area: string | null
  plan_type: PlanType
  frequency: Frequency
  meal_slots: MealSlot[]
  status: 'active' | 'paused' | 'inactive'
  balance_days: number
  billing_type: 'prepaid' | 'monthly_settlement'
  meals_delivered: number
  created_at: string
  pauses: Pause[]
  subscriptions?: Subscription[]
  notes: string | null
}

interface MealPlan {
  id: string
  name: string
  meal_slots: MealSlot[]
  plan_type: PlanType
  frequency: Frequency
  monthly_price: number
  active_days: number
  status: 'active' | 'inactive'
}

interface Subscription {
  id: string
  meal_plan_id: string
  status: SubscriptionStatus
  start_date: string
  meal_plans?: MealPlan | null
}

interface Provider {
  id: string
  name: string
  phone: string | null
  upi_id: string | null
  enable_delivery_tracking: boolean
  accent_color: string | null
  logo_url: string | null
}

interface DeliveryRider {
  id: string
  name: string
  whatsapp_number: string
}

interface TodayMenu {
  meal_slot: string
  plan_type: string | null
  dish_name: string
  quantities: Record<string, number> | null
}

interface InitialData {
  customers: any[]
  provider: any
  riders: any[]
  trial: { trialDaysLeft: number | null; isExpired: boolean; isSubscribed: boolean }
  deliveryStatuses: Record<string, string>
  todayHoliday: { label: string | null } | null
  todayMenus?: TodayMenu[]
}

interface Props {
  userId: string
  userEmail: string
  initialData: InitialData
}

type DeliveryStatus = 'pending' | 'delivered' | 'skipped'

// ── Core delivery logic ────────────────────────────────────────────────────

function isAlternateDeliveryDay(createdAt: string, todayStr: string): boolean {
  const t0 = new Date(createdAt)
  t0.setHours(0, 0, 0, 0)
  const t1 = new Date(todayStr)
  t1.setHours(0, 0, 0, 0)
  const diff = Math.round((t1.getTime() - t0.getTime()) / 86_400_000)
  return diff >= 0 && diff % 2 === 0
}

function activeSubscription(c: Customer | null | undefined): Subscription | null {
  return c?.subscriptions?.find(s => s.status === 'active') ?? null
}

function customerPlan(c: Customer | null | undefined): MealPlan | null {
  return activeSubscription(c)?.meal_plans ?? null
}

function isActiveToday(c: Customer | null | undefined, today: string): boolean {
  if (!c) return false
  if (c.status !== 'active') return false
  const subscription = activeSubscription(c)
  if (!subscription || subscription.status !== 'active') return false
  // Use enriched meal plan if available, fall back to denormalized customer fields
  const plan = subscription.meal_plans
  const frequency = plan?.frequency ?? c.frequency
  if (Array.isArray(c.pauses) && c.pauses.some((p) => today >= p.start_date && today <= p.end_date)) return false
  if (frequency === 'daily') return true
  return isAlternateDeliveryDay(subscription.start_date ?? c.created_at, today)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTodayLong(today: string): string {
  return new Date(today + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTodayShort(today: string): string {
  return new Date(today + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const PLAN_EMOJI: Record<PlanType, string> = { veg: '🥦', nonveg: '🍗' }

function balancePill(days: number): string {
  if (days > 7)  return 'bg-green-100 text-green-700 border border-green-200'
  if (days >= 3) return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-red-100 text-red-700 border border-red-200'
}

// Returns the customer's meal slots from their active plan (or denormalized fallback).
// Returns [] (not ['lunch']) when slots are unknown — a customer with no slots should
// be visible in Full Day overview but absent from all slot workspaces. Defaulting to
// 'lunch' silently assigned customers to the wrong workspace and could generate
// phantom delivery logs for a slot they don't subscribe to.
function customerMealSlots(c: Customer | null | undefined): MealSlot[] {
  return ((customerPlan(c)?.meal_slots ?? c?.meal_slots ?? []) as MealSlot[])
}

function reminderLink(c: Customer): string {
  const msg = encodeURIComponent(
    `Hi ${c.name} 🙏, your tiffin balance is running low — only *${c.balance_days} days* remaining. Please recharge soon to keep your deliveries going. Thank you! 🍱`
  )
  return `https://wa.me/91${c.whatsapp_number.replace(/\D/g, '')}?text=${msg}`
}

// ── Static DeliveryRow (delivery tracking OFF) ─────────────────────────────

function DeliveryRow({ c, index, isLast, hideArea, onOpen }: {
  c: Customer
  index: number
  isLast: boolean
  hideArea?: boolean
  onOpen?: () => void
}) {
  const plan = customerPlan(c)
  const slots = plan?.meal_slots ?? c.meal_slots ?? ['lunch']
  const planType = plan?.plan_type ?? c.plan_type
  const isMonthly = (c.billing_type ?? 'prepaid') === 'monthly_settlement'

  return (
    <div onClick={onOpen} className={`group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-gray-50/40 cursor-pointer ${!isLast ? 'border-b border-gray-100' : ''}`}>
      {/* Index circle */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500 mt-0.5">
        {index + 1}
      </span>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-black text-gray-900 leading-snug">
          {c.name}
        </p>
        {!hideArea && c.area && (
          <p className="flex items-center gap-1 text-xs font-medium text-gray-400 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0" />{c.area}
          </p>
        )}
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-gray-100/80 px-2 py-0.5">
          <span className="text-[11px]">{PLAN_EMOJI[planType]}</span>
          <span className="text-[11px] font-semibold text-gray-600 truncate max-w-[80px]">{plan?.name ?? planType}</span>
          <span className="text-gray-300 text-xs">·</span>
          <span className="text-[11px] text-gray-400">{slots.map(s => MEAL_SLOT_EMOJI[s]).join('')}</span>
        </div>
        {c.notes && (
          <p className="mt-1 text-[11px] text-gray-400 truncate">{c.notes.split('\n')[0]}</p>
        )}
      </div>

      {/* Right: balance badge + diet icon */}
      <div className="shrink-0 flex flex-col items-end gap-1.5 mt-0.5">
        {isMonthly ? (
          <span className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            <HandCoins className="w-3 h-3" /> Monthly
          </span>
        ) : (
          <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-xs font-bold ${balancePill(c.balance_days)}`}>
            {c.balance_days}d left
          </span>
        )}
        {planType === 'veg'
          ? <Leaf className="w-3.5 h-3.5 text-emerald-400" />
          : <Drumstick className="w-3.5 h-3.5 text-orange-300" />}
      </div>
    </div>
  )
}

// ── SwipeableDeliveryRow (delivery tracking ON) ────────────────────────────

const SWIPE_THRESHOLD = 72

function SwipeableDeliveryRow({ c, index, isLast, hideArea, status, onMark, bulkMode, selected, onToggleSelect, onOpen }: {
  c: Customer
  index: number
  isLast: boolean
  hideArea?: boolean
  status: DeliveryStatus
  onMark: (s: 'delivered' | 'skipped') => void
  bulkMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen?: () => void
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [deltaX, setDeltaX] = useState(0)
  const [deltaY, setDeltaY] = useState(0)
  const [tracking, setTracking] = useState(false)

  const plan = customerPlan(c)
  const slots = plan?.meal_slots ?? c.meal_slots ?? ['lunch']
  const planType = plan?.plan_type ?? c.plan_type
  const isDelivered = status === 'delivered'
  const isSkipped = status === 'skipped'
  const swipeProgress = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1)

  return (
    <div
      className={`relative overflow-hidden select-none touch-pan-y ${!isLast ? 'border-b border-gray-100/50' : ''}`}
      onTouchStart={(e) => {
        if (bulkMode) return
        startX.current = e.touches[0].clientX
        startY.current = e.touches[0].clientY
        setTracking(true)
        setDeltaX(0)
        setDeltaY(0)
      }}
      onTouchMove={(e) => {
        if (!tracking || bulkMode) return
        const dx = e.touches[0].clientX - startX.current
        const dy = e.touches[0].clientY - startY.current
        setDeltaY(dy)
        if (Math.abs(dx) > Math.abs(dy) + 8) {
          setDeltaX(dx)
        }
      }}
      onTouchEnd={() => {
        if (!tracking) return
        setTracking(false)
        if (deltaX > SWIPE_THRESHOLD) onMark('delivered')
        else if (deltaX < -SWIPE_THRESHOLD) onMark('skipped')
        else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 12) onOpen?.()
        setDeltaX(0)
        setDeltaY(0)
      }}
    >
      {/* Green reveal: swipe right = delivered */}
      <div
        className="absolute inset-0 flex items-center justify-start pl-5 pointer-events-none"
        style={{ opacity: deltaX > 0 ? swipeProgress : 0, background: `rgba(34,197,94,${swipeProgress * 0.22})` }}
      >
        <Check className="w-5 h-5 text-green-600" />
        <span className="ml-2 text-xs font-bold text-green-700" style={{ opacity: swipeProgress > 0.6 ? 1 : 0 }}>Delivered</span>
      </div>
      {/* Orange reveal: swipe left = skipped */}
      <div
        className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none"
        style={{ opacity: deltaX < 0 ? swipeProgress : 0, background: `rgba(251,146,60,${swipeProgress * 0.22})` }}
      >
        <span className="mr-2 text-xs font-bold text-orange-600" style={{ opacity: swipeProgress > 0.6 ? 1 : 0 }}>Skip</span>
        <X className="w-5 h-5 text-orange-500" />
      </div>

      {/* Row content */}
      <div
        onClick={bulkMode ? onToggleSelect : onOpen}
        className={`flex items-center gap-3 px-5 py-4 transition-colors ${
          isDelivered ? 'bg-green-50/40' :
          isSkipped   ? 'bg-amber-50/30' :
          'hover:bg-gray-50/50'
        } ${bulkMode ? 'cursor-pointer active:bg-orange-50' : 'cursor-pointer'}`}
        style={{
          transform: tracking ? `translateX(${deltaX * 0.45}px)` : 'translateX(0)',
          transition: tracking ? 'none' : 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',
        }}
      >
        {/* Bulk checkbox */}
        {bulkMode && (
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'
          }`}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        )}

        {/* Index / status icon */}
        {/* Index / status circle */}
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isDelivered ? 'bg-green-100 text-green-600' :
          isSkipped   ? 'bg-amber-100 text-amber-600' :
                        'bg-gray-100 text-gray-500'
        }`}>
          {isDelivered ? <Check className="w-3.5 h-3.5" /> : isSkipped ? <X className="w-3 h-3" /> : index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-black leading-snug ${
            isDelivered ? 'text-gray-400 line-through' :
            isSkipped   ? 'text-gray-500' :
                          'text-gray-900'
          }`}>
            {c.name}
          </p>
          {isSkipped ? (
            <p className="text-xs font-semibold text-amber-600 mt-0.5">Skipped today</p>
          ) : (
            <>
              {!hideArea && c.area && (
                <p className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${isDelivered ? 'text-gray-300' : 'text-gray-400'}`}>
                  <MapPin className="w-3 h-3 shrink-0" />{c.area}
                </p>
              )}
              <div className={`mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 ${
                isDelivered ? 'bg-gray-100/50' : 'bg-gray-100/80'
              }`}>
                <span className={`text-[11px] ${isDelivered ? 'opacity-40' : ''}`}>{PLAN_EMOJI[planType]}</span>
                <span className={`text-[11px] font-semibold truncate max-w-[80px] ${isDelivered ? 'text-gray-300' : 'text-gray-600'}`}>{plan?.name ?? planType}</span>
                <span className={`text-xs ${isDelivered ? 'text-gray-200' : 'text-gray-300'}`}>·</span>
                <span className={`text-[11px] ${isDelivered ? 'text-gray-300' : 'text-gray-400'}`}>{slots.map(s => MEAL_SLOT_EMOJI[s]).join('')}</span>
              </div>
              {c.notes && !isDelivered && (
                <p className="mt-1 text-[11px] text-gray-400 truncate">{c.notes.split('\n')[0]}</p>
              )}
            </>
          )}
        </div>

        {/* Right: balance badge + diet icon */}
        <div className={`shrink-0 flex flex-col items-end gap-1.5 mt-0.5 ${isDelivered || isSkipped ? 'opacity-30' : ''}`}>
          {(c.billing_type ?? 'prepaid') === 'monthly_settlement' ? (
            <span className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              <HandCoins className="w-3 h-3" /> Monthly
            </span>
          ) : (
            <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-xs font-bold ${balancePill(c.balance_days)}`}>
              {c.balance_days}d left
            </span>
          )}
          {planType === 'veg'
            ? <Leaf className="w-3.5 h-3.5 text-emerald-400" />
            : <Drumstick className="w-3.5 h-3.5 text-orange-300" />}
        </div>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardClient({ userId, userEmail, initialData }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [copied, setCopied] = useState(false)
  const [deliveryView, setDeliveryView] = useState<'list' | 'area'>('list')

  const [customerModal, setCustomerModal] = useState<Customer | null>(null)
  const [showDelivered, setShowDelivered] = useState(false)
  const [cookListOpen, setCookListOpen] = useState(true)
  const [packingListOpen, setPackingListOpen] = useState(false)
  const [slotFilter, setSlotFilter] = useState<'all' | MealSlot>('all')

  // ── Data state — seeded from server-side cached initialData ───────────────
  const [customers, setCustomers] = useState<Customer[]>(initialData.customers)
  const customersRef = useRef<Customer[]>([])
  customersRef.current = customers

  const [provider, setProvider] = useState<Provider | null>(initialData.provider)
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(initialData.trial.trialDaysLeft)
  const [isExpired, setIsExpired] = useState(initialData.trial.isExpired)
  const [loading, setLoading] = useState(false)
  const [todayHoliday, setTodayHoliday] = useState<{ label: string | null } | null>(initialData.todayHoliday)
  const [riders, setRiders] = useState<DeliveryRider[]>(initialData.riders)
  const todayMenus: TodayMenu[] = initialData.todayMenus ?? []
  const [riderModal, setRiderModal] = useState<{ area: string; members: Customer[] } | null>(null)
  const [areaCopied, setAreaCopied] = useState<string | null>(null)

  // ── Delivery tracking state ───────────────────────────────────────────────
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, DeliveryStatus>>(
    initialData.deliveryStatuses as Record<string, DeliveryStatus>
  )
  const deliveryStatusesRef = useRef<Record<string, DeliveryStatus>>({})
  deliveryStatusesRef.current = deliveryStatuses

  const [undoSnackbar, setUndoSnackbar] = useState<{ id: string; slot: MealSlot; prevStatus: DeliveryStatus; name: string; action: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const deliveryTrackingEnabled = provider?.enable_delivery_tracking ?? false

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const hour = nowIST.getUTCHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const GreetingIcon = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon

  // ── Delivery log sync: initial fetch + Realtime subscription ─────────────
  // initialData.deliveryStatuses is populated server-side, but may be slightly
  // stale by the time the client renders (Next.js cache + ISR). We re-fetch
  // once on mount to ensure freshness, then subscribe to Realtime so that
  // changes made on another device/tab are reflected immediately.
  useEffect(() => {
    // Helper: rebuild statusMap from a raw log array
    function buildStatusMap(rows: { customer_id: string; meal_slot: string; status: string }[]) {
      const m: Record<string, DeliveryStatus> = {}
      for (const r of rows) m[`${r.customer_id}:${r.meal_slot}`] = r.status as DeliveryStatus
      return m
    }

    // Initial full fetch — brings client in sync regardless of cache age
    db.from('delivery_logs')
      .select('customer_id, meal_slot, status')
      .eq('provider_id', userId)
      .eq('date', today)
      .then(({ data }: { data: { customer_id: string; meal_slot: string; status: string }[] | null }) => {
        if (data) setDeliveryStatuses(buildStatusMap(data))
      })

    // Realtime subscription — incremental updates from other devices/tabs.
    // Requires `REPLICA IDENTITY FULL` on delivery_logs so DELETE payloads
    // carry all columns (not just the PK). Covered in migration
    // 20260521_delivery_logs_realtime.sql.
    const channel = supabase
      .channel(`delivery-${userId}-${today}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_logs', filter: `provider_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // old record has all columns because of REPLICA IDENTITY FULL
            const old = payload.old as { customer_id?: string; meal_slot?: string; date?: string }
            if (!old.customer_id || !old.meal_slot || old.date !== today) return
            setDeliveryStatuses(prev => {
              const next = { ...prev }
              delete next[`${old.customer_id}:${old.meal_slot}`]
              return next
            })
          } else {
            // INSERT or UPDATE
            const row = payload.new as { customer_id: string; meal_slot: string; status: string; date: string }
            if (row.date !== today) return
            setDeliveryStatuses(prev => ({
              ...prev,
              [`${row.customer_id}:${row.meal_slot}`]: row.status as DeliveryStatus,
            }))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today])

  // ── Delivery mutation ─────────────────────────────────────────────────────

  const markDelivery = useCallback(async (customerId: string, slot: MealSlot, newStatus: 'delivered' | 'skipped' | 'pending') => {
    const key = `${customerId}:${slot}`
    const prevStatus: DeliveryStatus = deliveryStatusesRef.current[key] ?? 'pending'
    if (prevStatus === newStatus) return

    const customer = customersRef.current.find(c => c.id === customerId)
    const isMonthly = (customer?.billing_type ?? 'prepaid') === 'monthly_settlement'

    // ── Optimistic delivery status update ────────────────────────────────────
    setDeliveryStatuses(prev => {
      const next = { ...prev }
      if (newStatus === 'pending') delete next[key]
      else next[key] = newStatus
      return next
    })

    // Undo snackbar (single-action only, not for resets)
    if (newStatus !== 'pending') {
      setUndoSnackbar({
        id: customerId,
        slot,
        prevStatus,
        name: customer?.name ?? '',
        action: newStatus === 'delivered' ? 'Delivered' : 'Skipped',
      })
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(() => setUndoSnackbar(null), 4000)
    }

    // ── Server RPC: delivery_logs write + balance update in ONE transaction ──
    // Fixes two critical bugs:
    //   1. Race condition: balance delta is computed server-side from DB counts,
    //      not from stale React state. Two concurrent calls can't both deduct.
    //   2. Two-phase commit: both writes happen atomically. A network failure
    //      can't leave delivery logged but balance unchanged.
    const { data, error } = await db.rpc('mark_slot_delivery', {
      p_customer_id: customerId,
      p_provider_id: userId,
      p_date:        today,
      p_meal_slot:   slot,
      p_status:      newStatus,
    })

    if (error) {
      // ── Rollback optimistic delivery status ───────────────────────────────
      setDeliveryStatuses(prev => {
        const next = { ...prev }
        if (prevStatus === 'pending') delete next[key]
        else next[key] = prevStatus
        return next
      })
      // Dismiss the undo snackbar for this failed action
      setUndoSnackbar(prev => (prev?.id === customerId && prev?.slot === slot ? null : prev))
      console.error('[Dabbr] markDelivery RPC failed:', error.message)
      return
    }

    // ── Apply server-returned balance delta to local state (UI stays live) ──
    // The server computed the correct delta atomically; we just mirror it here.
    const balanceDelta: number = (data as any)?.balance_delta ?? 0
    if (balanceDelta !== 0) {
      setCustomers(prev => prev.map(c => {
        if (c.id !== customerId) return c
        if (isMonthly) {
          return { ...c, meals_delivered: Math.max(0, (c.meals_delivered ?? 0) - balanceDelta) }
        } else {
          return { ...c, balance_days: Math.max(0, c.balance_days + balanceDelta) }
        }
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today])

  async function handleUndo() {
    if (!undoSnackbar) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const { id, slot, prevStatus } = undoSnackbar
    setUndoSnackbar(null)
    await markDelivery(id, slot, prevStatus)
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function bulkMark(newStatus: 'delivered' | 'skipped') {
    if (slotFilter === 'all') return  // No bulk marking in overview mode
    const slot = slotFilter as MealSlot
    const ids = Array.from(selectedIds)
    setBulkMode(false)
    setSelectedIds(new Set())
    // Sequential — not concurrent — to avoid saturating the Supabase connection
    // pool and to keep balance RPCs properly serialised at the DB level.
    // Each markDelivery call does its own optimistic update immediately, so the
    // visual cascade (rows flipping one by one) gives natural progress feedback.
    for (const id of ids) {
      await markDelivery(id, slot, newStatus)
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // ── Midnight date-staleness guard ────────────────────────────────────────
  // `today` is derived at component mount. If the app stays open across
  // midnight (IST), `today` becomes yesterday — deliveries get logged to the
  // wrong date and the delivery list shows yesterday's customers.
  // Checking every 60s and hard-refreshing when the IST date changes keeps the
  // component in sync. The interval is cheap; the refresh is rare (once/day).
  useEffect(() => {
    const interval = setInterval(() => {
      const nowDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      if (nowDate !== today) router.refresh()
    }, 60_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  // Auto-expand delivered section when the current workspace is fully actioned.
  // NOTE: must stay here — before the loading early-return — to satisfy Rules of Hooks.
  // We cannot reference `workspaceCustomers`/`deliveredCount`/`pendingCount` here because
  // those derived values are declared after the early return. Use raw state instead.
  useEffect(() => {
    if (!(provider?.enable_delivery_tracking)) return
    const activeToday = customers.filter(c => isActiveToday(c, today))
    if (!activeToday.length) return

    const wc = slotFilter === 'all'
      ? activeToday
      : activeToday.filter(c => customerMealSlots(c).includes(slotFilter as MealSlot))
    if (!wc.length) return

    // Slot workspace: done = every customer has a terminal status for this slot.
    // Full Day: done = every customer has at least one slot actioned (issue 9 fix).
    const noPending = slotFilter !== 'all'
      ? wc.every(c => {
          const s = deliveryStatuses[`${c.id}:${slotFilter}`]
          return s === 'delivered' || s === 'skipped'
        })
      : wc.every(c => {
          const slots = customerMealSlots(c)
          return !slots.length || slots.some(s => deliveryStatuses[`${c.id}:${s}`])
        })

    const anyDelivered = wc.some(c =>
      slotFilter !== 'all'
        ? deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered'
        : customerMealSlots(c).some(s => deliveryStatuses[`${c.id}:${s}`] === 'delivered')
    )

    if (anyDelivered && noPending) setShowDelivered(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryStatuses, slotFilter])

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-[#FDF8F3]">
        <div className="shrink-0 bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] pt-5 pb-5">
          <div className="mx-auto max-w-2xl px-4 flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-28 rounded-full bg-white/20" />
              <div className="h-5 w-44 rounded-full bg-white/30" />
              <div className="h-4 w-20 rounded-full bg-white/15" />
            </div>
            <div className="h-9 w-9 rounded-xl bg-white/15 shrink-0" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-none pb-[calc(7rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-2xl px-4 mt-5">
            <div className="h-3 w-32 rounded-full bg-gray-200 mb-2 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-[72px] rounded-2xl bg-emerald-300/60 animate-pulse" />
              <div className="h-[72px] rounded-2xl bg-orange-300/60 animate-pulse" />
              <div className="h-[72px] rounded-2xl bg-amber-300/60 animate-pulse" />
              <div className="h-[72px] rounded-2xl bg-indigo-300/60 animate-pulse" />
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const providerName = provider?.name ?? userEmail.split('@')[0] ?? 'there'

  const safeCustomers = Array.isArray(customers)
    ? customers.reduce((acc, c) => { if (c) acc.push(c); return acc }, [] as Customer[])
    : []

  const deliveryToday = safeCustomers.reduce((acc, c) => {
    if (isActiveToday(c, today)) acc.push(c)
    return acc
  }, [] as Customer[])


  const areaGroups = deliveryToday.reduce((acc, c) => {
    const key = c.area?.trim() || 'Other'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {} as Record<string, Customer[]>)

  const sortedAreas = Object.entries(areaGroups).sort(([a], [b]) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })

  const paymentAlerts = safeCustomers
    .reduce((acc, c) => { if (c.status === 'active' && c.balance_days < 5) acc.push(c); return acc }, [] as Customer[])
    .sort((a, b) => a.balance_days - b.balance_days)

  // ── Cook list — show every slot that has a menu saved, regardless of customer slots ─
  const cookList = MEAL_SLOTS.map(slot => {
    const slotMenus = todayMenus.filter(m => m.meal_slot === slot)
    if (!slotMenus.length) return null  // no menu saved for this slot — skip

    const slotCustomers = deliveryToday.filter(c => (customerPlan(c)?.meal_slots ?? c.meal_slots)?.includes(slot))
    const vegCount    = slotCustomers.filter(c => (customerPlan(c)?.plan_type ?? c.plan_type) === 'veg').length
    const nonvegCount = slotCustomers.filter(c => (customerPlan(c)?.plan_type ?? c.plan_type) === 'nonveg').length
    // Customers with neither veg nor nonveg tag count as "all" for common dishes
    const allCount = slotCustomers.length || deliveryToday.length

    const totals = new Map<string, { total: number; perCustomer: number; label: string | null }>()

    function processMenu(menu: TodayMenu | undefined, count: number, label: string | null) {
      if (!menu || !menu.dish_name.trim()) return
      const dishes = menu.dish_name.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
      const qtys: Record<string, number> = menu.quantities ?? {}
      for (const dish of dishes) {
        const qty = qtys[dish] ?? 1
        const prev = totals.get(dish)
        totals.set(dish, {
          total: (prev?.total ?? 0) + qty * count,
          perCustomer: qty,
          label: prev ? prev.label : label,
        })
      }
    }

    processMenu(slotMenus.find(m => m.plan_type === null), allCount, null)
    if (vegCount)    processMenu(slotMenus.find(m => m.plan_type === 'veg'),    vegCount,    'veg only')
    if (nonvegCount) processMenu(slotMenus.find(m => m.plan_type === 'nonveg'), nonvegCount, 'non-veg only')
    // If no plan-type breakdown, still show non-common menus with their counts
    if (!vegCount)    processMenu(slotMenus.find(m => m.plan_type === 'veg'),    deliveryToday.length, 'veg')
    if (!nonvegCount) processMenu(slotMenus.find(m => m.plan_type === 'nonveg'), deliveryToday.length, 'non-veg')

    if (!totals.size) return null
    return { slot, customerCount: slotCustomers.length, items: Array.from(totals.entries()).map(([name, d]) => ({ name, ...d })) }
  }).filter(Boolean) as Array<{ slot: MealSlot; customerCount: number; items: { name: string; total: number; perCustomer: number; label: string | null }[] }>

  // ── Packing list (per-customer dish breakdown) ────────────────────────────
  function getDishesForMenus(menus: (TodayMenu | undefined)[]) {
    const dishes: Array<{ name: string; qty: number }> = []
    for (const menu of menus) {
      if (!menu?.dish_name.trim()) continue
      const items = menu.dish_name.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
      const qtys = menu.quantities ?? {}
      for (const item of items) dishes.push({ name: item, qty: qtys[item] ?? 1 })
    }
    return dishes
  }

  const packingList = deliveryToday.map(c => {
    const plan = customerPlan(c)
    const planType = plan?.plan_type ?? c.plan_type
    // Iterate over slots that have menus saved (not customer's subscribed slots)
    const slotItems = MEAL_SLOTS.map(slot => {
      const slotMenus = todayMenus.filter(m => m.meal_slot === slot)
      if (!slotMenus.length) return null
      const dishes = getDishesForMenus([
        slotMenus.find(m => m.plan_type === null),
        slotMenus.find(m => m.plan_type === planType),
      ])
      return dishes.length ? { slot, dishes } : null
    }).filter(Boolean) as Array<{ slot: MealSlot; dishes: Array<{ name: string; qty: number }> }>
    return slotItems.length ? { customer: c, slots: slotItems } : null
  }).filter(Boolean) as Array<{ customer: Customer; slots: Array<{ slot: MealSlot; dishes: Array<{ name: string; qty: number }> }> }>

  // Packing list badge count: how many customers have dishes for the current slot filter.
  // Using packingList.length (total) showed "32 boxes" in Breakfast workspace even when
  // only 12 were breakfast-relevant. A packer would pick up 32 boxes unnecessarily.
  const packingBadgeCount = packingList.filter(({ slots }) =>
    slots.some(s => slotFilter === 'all' || s.slot === slotFilter)
  ).length

  const trialBadgeClass =
    trialDaysLeft === null ? ''
    : trialDaysLeft > 20 ? 'bg-green-500/20 text-green-100'
    : trialDaysLeft > 7  ? 'bg-amber-400/25 text-amber-100'
    : 'bg-red-500/30 text-red-100'

  // Workspace customers: slot-filtered when in a workspace, all customers in overview
  const workspaceCustomers = slotFilter === 'all'
    ? deliveryToday
    : deliveryToday.filter(c => customerMealSlots(c).includes(slotFilter as MealSlot))

  // ── Tracking counts ───────────────────────────────────────────────────────
  //
  // Slot workspace: counts are scoped to that slot.
  //
  // Full Day overview uses intentionally asymmetric definitions to avoid two bugs:
  //   • Vacuous truth: [].every() is always true, so a customer with no slots
  //     would count as "delivered" without any logs. Guard with slots.length > 0.
  //   • allDone too strict (issue 9): requiring ALL slots terminal meant a customer
  //     with breakfast=delivered + lunch=pending blocked allDone all day. Full Day
  //     "pending" is now "no slots actioned at all" — once every customer has had
  //     at least one mark, allDone fires and the Delivered section auto-expands.
  //     Customers partially done (some slots terminal) fall into neither bucket
  //     and don't block completion. The progress bar is hidden in Full Day anyway.

  const deliveredCount = workspaceCustomers.filter(c => {
    if (slotFilter !== 'all') return deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered'
    const slots = customerMealSlots(c)
    return slots.length > 0 && slots.every(s => deliveryStatuses[`${c.id}:${s}`] === 'delivered')
  }).length

  const skippedCount = workspaceCustomers.filter(c => {
    if (slotFilter !== 'all') return deliveryStatuses[`${c.id}:${slotFilter}`] === 'skipped'
    const slots = customerMealSlots(c)
    return slots.length > 0 && slots.every(s => deliveryStatuses[`${c.id}:${s}`] === 'skipped')
  }).length

  // Full Day pending = customer has zero delivery logs today (completely untouched).
  // Slot workspace pending = simple: not delivered and not skipped for this slot.
  const pendingCount = slotFilter !== 'all'
    ? workspaceCustomers.length - deliveredCount - skippedCount
    : workspaceCustomers.filter(c => {
        const slots = customerMealSlots(c)
        // No slots → doesn't block completion; treat as done
        if (!slots.length) return false
        // All slots have no log at all = truly pending
        return slots.every(s => !deliveryStatuses[`${c.id}:${s}`])
      }).length

  const allDone = workspaceCustomers.length > 0 && pendingCount === 0

  // Active / delivered split — only meaningful in a slot workspace; overview is always static
  const activeList = (slotFilter !== 'all' && deliveryTrackingEnabled)
    ? workspaceCustomers
        .filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] !== 'delivered')
        .sort((a, b) =>
          (deliveryStatuses[`${a.id}:${slotFilter}`] === 'skipped' ? 1 : 0) -
          (deliveryStatuses[`${b.id}:${slotFilter}`] === 'skipped' ? 1 : 0)
        )
    : workspaceCustomers
  const deliveredList = (slotFilter !== 'all' && deliveryTrackingEnabled)
    ? workspaceCustomers.filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered')
    : []


  function handleCopyList() {
    // Copy workspace-filtered list (respects active slot) not the full deliveryToday list.
    // In a slot workspace this means only customers subscribed to that slot are included,
    // which matches what the packer/rider actually sees on screen.
    const listToCopy = workspaceCustomers
    const slotLabel = slotFilter === 'all' ? '' : ` — ${MEAL_SLOT_LABEL[slotFilter as MealSlot]}`
    const lines = [
      `Delivery list${slotLabel} — ${formatTodayShort(today)}`,
      '',
      ...listToCopy.map(
        (c, i) =>
          `${i + 1}. ${c.name}${c.area ? ` — ${c.area}` : ''} — ${
            customerPlan(c)?.plan_type === 'veg' ? '🥦 Veg' : '🍗 Non-veg'
          } — ${formatMealSlots(customerPlan(c)?.meal_slots)}`
      ),
    ]
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => {
        const el = document.createElement('textarea')
        el.value = lines.join('\n')
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
  }

  function slotLabel(slots: MealSlot[] | null | undefined): string {
    const safe = slots?.length ? slots : (['lunch'] as MealSlot[])
    return safe.map(s => ({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }[s])).join(' + ')
  }

  function areaListText(area: string, members: Customer[]) {
    const isAll = area === 'All deliveries'
    const lines = [
      isAll
        ? `*Delivery list* — ${formatTodayShort(today)}`
        : `*${area}* — ${formatTodayShort(today)}`,
      '',
      ...members.flatMap((c, i) => {
        const plan = customerPlan(c)
        const entry = [
          `${i + 1}. *${c.name}*${isAll && c.area ? ` (${c.area})` : ''} — ${
            plan?.plan_type === 'veg' ? 'Veg' : 'Non-veg'
          } — ${slotLabel(plan?.meal_slots)}`,
        ]
        if (c.whatsapp_number) entry.push(`   Ph: ${c.whatsapp_number}`)
        if (c.address) entry.push(`   Addr: ${c.address}`)
        return entry
      }),
      '',
      `Total: ${members.length}`,
    ]
    return lines.join('\n')
  }

  function handleCopyArea(area: string, members: Customer[]) {
    const text = areaListText(area, members)
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setAreaCopied(area)
    setTimeout(() => setAreaCopied(null), 2500)
  }

  function sendToRider(rider: DeliveryRider, area: string, members: Customer[]) {
    const text = areaListText(area, members)
    const url = `https://wa.me/91${rider.whatsapp_number}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    setRiderModal(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const themeVars = getThemeVars(provider?.accent_color)

  return (
    // Mobile: full-screen flex col (header pinned top, scrollable body, nav pinned bottom)
    // Desktop: natural document flow (sidebar handles nav, page scrolls normally)
    <div className="h-screen flex flex-col bg-[#FAF8F5] lg:h-auto lg:min-h-screen lg:block" style={themeVars as React.CSSProperties}>

      {isExpired && <Paywall />}

      {/* ── Mobile header — gradient pill, hidden on desktop ── */}
      <div
        className="shrink-0 z-30 overflow-hidden pt-5 pb-5 shadow-[0_4px_20px_rgba(0,0,0,0.12)] lg:hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-2xl px-4 flex items-center gap-3">
          {provider?.logo_url && (
            <img
              src={provider.logo_url}
              alt={provider.name}
              className="w-11 h-11 rounded-2xl object-cover border-2 border-white/25 shrink-0 shadow-md"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white/60 tracking-wide leading-none mb-1">
              {formatTodayLong(today)}
            </p>
            <h1 className="text-xl font-black text-white tracking-tight leading-tight flex items-center gap-1.5">
              {greeting}, {providerName}
              <GreetingIcon className="w-5 h-5 text-yellow-300 shrink-0" strokeWidth={2.5} />
            </h1>
            {trialDaysLeft !== null && (
              <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border border-white/20 ${trialBadgeClass}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {trialDaysLeft > 0 ? `Trial: ${trialDaysLeft}d left` : 'Trial expired'}
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="shrink-0 flex items-center justify-center h-9 w-9 rounded-xl bg-white/15 text-white border border-white/20 hover:bg-white/25 active:scale-95 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Desktop page header — flat sticky bar, hidden on mobile ── */}
      <div className="hidden lg:flex items-center justify-between sticky top-0 z-30 px-8 py-3 bg-[#FAF8F5]/90 backdrop-blur-sm">
        <div className="min-w-0">
          <p className="text-sm font-bold text-orange-500 leading-none mb-1">{formatTodayLong(today)}</p>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-1.5 leading-tight">
            {greeting}, {providerName}
            <GreetingIcon className="w-5 h-5 text-yellow-400 shrink-0" strokeWidth={2} />
          </h1>
        </div>
        {trialDaysLeft !== null && (
          <span className={`chip font-semibold ${trialDaysLeft <= 7 ? 'bg-red-50 text-red-600' : trialDaysLeft <= 20 ? 'bg-amber-50 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
            {trialDaysLeft > 0 ? `Trial: ${trialDaysLeft}d left` : 'Trial expired'}
          </span>
        )}
      </div>

      {/* ── Scrollable content (mobile) / Document flow (desktop) ── */}
      <div className="flex-1 overflow-y-auto overscroll-none pb-[calc(7rem+env(safe-area-inset-bottom))] lg:flex-none lg:overflow-visible lg:pb-12">


      {/* ── Desktop stat tiles — above slot tabs, hidden on mobile ── */}
      {safeCustomers.length > 0 && (
        <div className="hidden lg:grid px-8 pt-3 pb-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          <div className="stat-tile">
            <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Today</p>
            <p className="text-3xl font-black text-gray-900 leading-none">{deliveryToday.length}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">deliveries</p>
          </div>
          <div className="stat-tile">
            <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Delivered</p>
            <p className="text-3xl font-black text-emerald-600 leading-none">{deliveredCount}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">of {deliveryToday.length}</p>
          </div>
          <div className="stat-tile">
            <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Pending</p>
            <p className="text-3xl font-black text-orange-500 leading-none">{pendingCount}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">{slotFilter === 'all' ? 'untouched' : 'this slot'}</p>
          </div>
          {paymentAlerts.length > 0 && (
            <div className="stat-tile border-red-100 bg-red-50/60">
              <p className="text-[11px] font-semibold text-red-400 mb-1.5">Pay alerts</p>
              <p className="text-3xl font-black text-red-600 leading-none">{paymentAlerts.length}</p>
              <p className="text-[11px] text-red-400 mt-1.5">customers</p>
            </div>
          )}
        </div>
      )}

      {/* ── Cook List + Packing List with shared slot filter ── */}
      {(todayMenus.length > 0 || deliveryToday.length > 0) && (
        <div className="mx-auto max-w-2xl px-4 mt-4 lg:max-w-none lg:px-8 lg:mt-4">

          {/* Shared slot filter bar — doubles as workspace selector.
              Shown whenever there are deliveries today, regardless of menus.
              The slot buttons are the delivery workspace picker; they must
              always be visible so the provider can enter B/L/D workspaces
              even on days with no menu saved. */}
          {deliveryToday.length > 0 && (
            <div className="space-y-2">

            {/* ── Hero illustration — desktop only ── */}
            <div className="hidden lg:flex items-center justify-center rounded-2xl bg-[#FDF6EF] border border-orange-100/60 overflow-hidden mb-4" style={{ height: 200 }}>
              <svg viewBox="0 0 520 190" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                {/* ── Tiffin box ─────────────────────────────────── */}
                {/* Handle */}
                <path d="M148 52 C148 34 164 26 178 26 C192 26 208 34 208 52" stroke="#E8956A" strokeWidth="3.5" strokeLinecap="round"/>
                {/* Handle grip detail */}
                <path d="M162 42 C162 36 168 32 178 32 C188 32 194 36 194 42" stroke="#E8956A" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5"/>
                {/* Top cap */}
                <rect x="138" y="52" width="80" height="18" rx="5" stroke="#E8956A" strokeWidth="2.5"/>
                {/* Section 1 */}
                <rect x="134" y="68" width="88" height="38" rx="5" stroke="#E8956A" strokeWidth="2.5"/>
                {/* Section 1 inner detail line */}
                <path d="M142 86 Q178 90 214 86" stroke="#E8956A" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4"/>
                {/* Section 2 */}
                <rect x="131" y="104" width="94" height="40" rx="5" stroke="#E8956A" strokeWidth="2.5"/>
                {/* Section 2 inner detail */}
                <path d="M140 124 Q178 128 218 124" stroke="#E8956A" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4"/>
                {/* Bottom section */}
                <rect x="128" y="142" width="100" height="44" rx="7" stroke="#E8956A" strokeWidth="2.5"/>
                {/* Bottom feet */}
                <path d="M141 186 Q141 192 148 192" stroke="#E8956A" strokeWidth="2" strokeLinecap="round"/>
                <path d="M215 186 Q215 192 208 192" stroke="#E8956A" strokeWidth="2" strokeLinecap="round"/>
                {/* Latch */}
                <rect x="220" y="106" width="14" height="20" rx="3" stroke="#E8956A" strokeWidth="2"/>
                <path d="M227 126 L227 134" stroke="#E8956A" strokeWidth="2" strokeLinecap="round"/>
                <path d="M222 134 Q227 140 232 134" stroke="#E8956A" strokeWidth="2" strokeLinecap="round"/>

                {/* ── Bowl ────────────────────────────────────────── */}
                {/* Steam lines */}
                <path d="M322 78 C318 68 326 58 322 48" stroke="#E8956A" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M344 72 C340 60 348 50 344 38" stroke="#E8956A" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M366 78 C362 68 370 58 366 48" stroke="#E8956A" strokeWidth="2.5" strokeLinecap="round"/>
                {/* Bowl rim ellipse */}
                <ellipse cx="352" cy="108" rx="76" ry="14" stroke="#E8956A" strokeWidth="2.5"/>
                {/* Bowl body */}
                <path d="M276 108 Q278 168 352 176 Q426 168 428 108" stroke="#E8956A" strokeWidth="2.5" strokeLinecap="round"/>
                {/* Bowl base */}
                <ellipse cx="352" cy="176" rx="28" ry="6" stroke="#E8956A" strokeWidth="2" strokeOpacity="0.6"/>
                {/* Food items — floating ingredients */}
                <circle cx="326" cy="130" r="10" stroke="#E8956A" strokeWidth="2"/>
                <path d="M320 128 Q326 124 332 128" stroke="#E8956A" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6"/>
                <circle cx="355" cy="122" r="8" stroke="#E8956A" strokeWidth="2"/>
                <circle cx="380" cy="133" r="9" stroke="#E8956A" strokeWidth="2"/>
                <path d="M374 131 Q380 127 386 131" stroke="#E8956A" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6"/>
                {/* Broth surface ripple */}
                <path d="M300 152 Q330 157 360 153 Q390 149 415 154" stroke="#E8956A" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35"/>

                {/* ── Subtle scattered dots ── */}
                <circle cx="80" cy="100" r="3" fill="#E8956A" fillOpacity="0.18"/>
                <circle cx="95" cy="155" r="2" fill="#E8956A" fillOpacity="0.14"/>
                <circle cx="460" cy="90" r="2.5" fill="#E8956A" fillOpacity="0.18"/>
                <circle cx="472" cy="140" r="2" fill="#E8956A" fillOpacity="0.14"/>
              </svg>
            </div>

            {/* Date label */}
            <p className="text-[15px] font-bold text-orange-500 tracking-tight">
              {formatTodayLong(today)}
            </p>

            {/* Slot filter — horizontal pill tabs */}
            <div className="flex bg-white border border-black/[0.06] rounded-xl p-1 gap-0.5"
                 style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              {([
                { key: 'all',       label: 'Full Day',  emoji: '🍱' },
                { key: 'breakfast', label: 'Breakfast', emoji: MEAL_SLOT_EMOJI.breakfast },
                { key: 'lunch',     label: 'Lunch',     emoji: MEAL_SLOT_EMOJI.lunch },
                { key: 'dinner',    label: 'Dinner',    emoji: MEAL_SLOT_EMOJI.dinner },
              ] as const).map(f => {
                const active = slotFilter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => {
                      setSlotFilter(f.key)
                      setBulkMode(false)
                      setSelectedIds(new Set())
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 rounded-lg transition-all duration-200 active:scale-95 ${
                      active ? 'bg-orange-50' : 'bg-transparent'
                    }`}
                  >
                    <span className="text-base leading-none">{f.emoji}</span>
                    <span className={`text-[13px] font-bold leading-none transition-colors duration-200 ${
                      active ? 'text-orange-500' : 'text-gray-400'
                    }`}>{f.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Cross-slot awareness — other slots' progress when in a workspace */}
            {slotFilter !== 'all' && deliveryTrackingEnabled && deliveryToday.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {MEAL_SLOTS.filter(s => s !== slotFilter).map(s => {
                  const sCusts = deliveryToday.filter(c => customerMealSlots(c).includes(s))
                  if (!sCusts.length) return null
                  const sDone = sCusts.filter(c => deliveryStatuses[`${c.id}:${s}`] === 'delivered').length
                  const isAllDone = sDone === sCusts.length
                  const hasProgress = sDone > 0 && !isAllDone
                  return (
                    <button
                      key={s}
                      onClick={() => { setSlotFilter(s); setBulkMode(false); setSelectedIds(new Set()) }}
                      className={`chip transition-all active:scale-95 ${
                        isAllDone   ? 'bg-emerald-50 text-emerald-700'
                        : hasProgress ? 'bg-orange-50 text-orange-700'
                        : 'bg-white text-gray-500'
                      }`}
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                      <span>{MEAL_SLOT_EMOJI[s]}</span>
                      <span className="font-semibold">{MEAL_SLOT_LABEL[s]}</span>
                      <span className={`font-bold ${isAllDone ? 'text-emerald-600' : hasProgress ? 'text-orange-500' : 'text-gray-400'}`}>
                        {sDone}/{sCusts.length}
                      </span>
                      {isAllDone && <span className="text-emerald-500">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
            </div>
          )}

          {/* Cook List + Packing List — stacked on mobile, side-by-side on desktop */}
          <div className="mt-3 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">

          {/* ── Cook List ─────────────────────────────────────────────── */}
          {todayMenus.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

              {/* Header */}
              <button
                onClick={() => setCookListOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50/50 transition-colors"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 shrink-0">
                  <UtensilsCrossed className="w-5 h-5 text-orange-500" />
                </span>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[15px] font-black text-gray-900 leading-tight">Cook List</p>
                  <p className="text-xs font-medium text-gray-400 mt-0.5">Items to be prepared</p>
                </div>
                {cookList.length === 0 && <span className="text-[11px] font-semibold text-gray-400">No menu set</span>}
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${cookListOpen ? 'rotate-180' : ''}`} />
              </button>

              {cookListOpen && (
                <div className="border-t border-gray-100">
                  {cookList.length === 0 ? (
                    <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
                      <p className="text-xs font-bold text-gray-400">No menu saved for today yet.</p>
                      <button onClick={() => router.push('/menu')} className="text-xs font-black text-orange-500 active:opacity-70">Go to Menu Planner →</button>
                    </div>
                  ) : (
                    <div>
                      {cookList
                        .filter(s => slotFilter === 'all' || s.slot === slotFilter)
                        .map(({ slot, customerCount, items }, slotIndex) => (
                          <div key={slot} className={slotIndex > 0 ? 'border-t border-gray-100' : ''}>
                            {/* Slot label — clean, no background */}
                            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">
                                {MEAL_SLOT_LABEL[slot]}
                              </span>
                              {customerCount > 0 && (
                                <span className="text-[11px] text-gray-300">· {customerCount} customer{customerCount !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                            {/* Item rows */}
                            <div className="px-4 pb-3 divide-y divide-gray-50">
                              {items.map(item => {
                                const isVeg    = item.label === 'veg only' || item.label === 'veg'
                                const isNonveg = item.label === 'non-veg only' || item.label === 'non-veg'
                                return (
                                  <div key={item.name} className="flex items-center gap-3 py-2.5">
                                    {/* Dot bullet */}
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isVeg ? 'bg-emerald-500' : 'bg-orange-400'}`} />
                                    {/* Name + diet label */}
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                      <span className="text-[14px] font-semibold text-gray-800 leading-none">{item.name}</span>
                                      {isVeg && <span className="text-[11px] font-bold text-emerald-500">veg</span>}
                                      {isNonveg && <span className="text-[11px] font-bold text-orange-400">non-veg</span>}
                                    </div>
                                    {/* Qty + total */}
                                    <div className="flex items-baseline gap-1.5 shrink-0">
                                      {item.perCustomer > 1 && (
                                        <span className="text-[11px] font-medium text-gray-400">×{item.perCustomer} ea</span>
                                      )}
                                      <span className="text-[22px] font-black leading-none text-orange-500">{item.total}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Packing List ───────────────────────────────────────────── */}
          {deliveryToday.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 shrink-0">
                  <Box className="w-5 h-5 text-orange-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-black text-gray-900 leading-tight">Packing List</p>
                  <p className="text-xs font-medium text-gray-400 mt-0.5">Orders to be packed</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {packingBadgeCount > 0 && (
                    <span className="rounded-full border border-orange-200 px-3 py-1 text-[12px] font-bold text-orange-500">
                      {packingBadgeCount} box{packingBadgeCount !== 1 ? 'es' : ''}
                    </span>
                  )}
                  <button
                    onClick={() => setPackingListOpen(v => !v)}
                    className="flex items-center gap-0.5 text-[12px] font-bold text-orange-500 active:opacity-70 transition-opacity"
                  >
                    {packingListOpen ? 'Hide' : 'View all'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {packingListOpen && (
                <div className="border-t border-gray-100">
                  {packingList.length === 0 ? (
                    <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
                      <p className="text-xs font-bold text-gray-400">No menu saved for today yet.</p>
                      <button onClick={() => router.push('/menu')} className="text-xs font-black text-orange-500 active:opacity-70">Go to Menu Planner →</button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {packingList.map(({ customer: c, slots }) => {
                        const isDelivered = slotFilter !== 'all'
                          ? deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered'
                          : customerMealSlots(c).every(s => deliveryStatuses[`${c.id}:${s}`] === 'delivered')
                        const isSkipped = slotFilter !== 'all'
                          ? deliveryStatuses[`${c.id}:${slotFilter}`] === 'skipped'
                          : customerMealSlots(c).every(s => deliveryStatuses[`${c.id}:${s}`] === 'skipped')
                        const filteredSlots = slots.filter(s => slotFilter === 'all' || s.slot === slotFilter)
                        if (!filteredSlots.length) return null

                        const totalItems = filteredSlots.reduce((sum, s) => sum + s.dishes.length, 0)
                        const boxCount   = filteredSlots.length
                        const initial    = c.name.charAt(0).toUpperCase()
                        // Deterministic pastel avatar colour from name
                        const AVATAR_PALETTES = [
                          { bg: 'bg-emerald-100', text: 'text-emerald-700' },
                          { bg: 'bg-violet-100',  text: 'text-violet-700'  },
                          { bg: 'bg-blue-100',    text: 'text-blue-700'    },
                          { bg: 'bg-amber-100',   text: 'text-amber-700'   },
                          { bg: 'bg-pink-100',    text: 'text-pink-700'    },
                          { bg: 'bg-cyan-100',    text: 'text-cyan-700'    },
                        ]
                        const palette = AVATAR_PALETTES[
                          (c.name.charCodeAt(0) + (c.name.charCodeAt(c.name.length - 1) || 0)) % AVATAR_PALETTES.length
                        ]

                        return (
                          <div
                            key={c.id}
                            className={`flex items-start gap-3 px-4 py-3.5 ${isDelivered ? 'opacity-40' : ''}`}
                          >
                            {/* Letter avatar */}
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${palette.bg}`}>
                              <span className={`text-[15px] font-black leading-none ${palette.text}`}>{initial}</span>
                            </div>

                            {/* Name + meta + chips */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[13px] font-black tracking-tight text-gray-900">
                                  {c.name.toUpperCase()}
                                </span>
                                {isDelivered && (
                                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">✓ Done</span>
                                )}
                                {isSkipped && (
                                  <span className="text-[10px] font-black text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">Skipped</span>
                                )}
                              </div>
                              <p className="text-[11px] font-medium text-gray-400 mb-2">
                                {boxCount} box{boxCount !== 1 ? 'es' : ''} · {totalItems} item{totalItems !== 1 ? 's' : ''}
                              </p>
                              {/* Dish chips */}
                              <div className="flex flex-wrap gap-1.5">
                                {filteredSlots.flatMap(({ slot, dishes }) =>
                                  dishes.map(d => (
                                    <span
                                      key={`${slot}-${d.name}`}
                                      className="inline-flex items-center gap-0.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"
                                    >
                                      {d.name}
                                      {d.qty > 1 && <span className="ml-0.5 text-emerald-500 font-bold">×{d.qty}</span>}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* Chevron */}
                            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-3" />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          </div>
        </div>
      )}

      {/* ── Onboarding ── */}
      {safeCustomers.length === 0 && !isExpired && (
        <main className="mx-auto mt-8 max-w-2xl px-4">
          <div className="glass-card flex flex-col items-center rounded-[2.5rem] p-10 text-center relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl" />
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-orange-50 to-orange-100 shadow-inner border border-orange-200/50">
              <Box className="w-10 h-10 text-orange-500" strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Welcome to Dabbr!</h2>
            <p className="mt-3 max-w-xs text-sm font-medium text-gray-500">
              Let&apos;s add your first customer. It takes less than 2 minutes.
            </p>
            <button
              onClick={() => router.push('/customers?openAdd=true')}
              className="btn-primary mt-8 w-full max-w-xs rounded-2xl py-4 text-sm font-bold shadow-xl shadow-orange-500/20"
            >
              Add my first customer →
            </button>
            <button
              onClick={() => router.push('/customers')}
              className="mt-4 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider"
            >
              Skip, explore first
            </button>
          </div>
        </main>
      )}

      {/* ── Main content ── */}
      {safeCustomers.length > 0 && (
        <main className="mx-auto mt-5 max-w-2xl px-4 lg:max-w-none lg:px-8 lg:mt-5">

          {/* Desktop two-column grid: left = operational, right = status panel */}
          <div className="lg:grid lg:gap-6 lg:items-start" style={{ gridTemplateColumns: '1fr 280px' }}>

          {/* ── Left column ── */}
          <div className="space-y-5">

          {/* ── Payment alerts — mobile / left-column position ── */}
          {paymentAlerts.length > 0 && (
            <section className="mt-8 lg:hidden">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <span className="flex items-center justify-center p-1.5 bg-red-100 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </span>
                  Payment Alerts
                </h2>
                <span className="rounded-xl bg-red-500 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                  {paymentAlerts.length}
                </span>
              </div>
              <div className="space-y-3">
                {paymentAlerts.map((c) => (
                  <div
                    key={c.id}
                    className="group relative overflow-hidden flex items-center justify-between rounded-[1.5rem] bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 p-4 shadow-[0_4px_20px_rgba(239,68,68,0.05)] transition-all duration-300 hover:shadow-[0_4px_20px_rgba(239,68,68,0.15)] hover:-translate-y-0.5"
                  >
                    <div className="absolute top-0 right-0 p-8 bg-red-500/5 rounded-bl-full" />
                    <div className="relative z-10">
                      <p className="text-sm font-bold text-gray-900 group-hover:text-red-700 transition-colors">{c.name}</p>
                      <p className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className={`rounded-lg px-2.5 py-1 font-bold ${
                          c.balance_days <= 2 ? 'bg-red-200 text-red-900 shadow-sm' : 'bg-amber-200 text-amber-900 shadow-sm'
                        }`}>
                          {c.balance_days}d left
                        </span>
                        {c.area && <span className="text-gray-500 font-medium">{c.area}</span>}
                      </p>
                    </div>
                    <a
                      href={reminderLink(c)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500 text-white shadow-[0_4px_15px_rgba(34,197,94,0.3)] transition-all duration-300 hover:bg-green-600 hover:scale-110 active:scale-95 group/btn"
                    >
                      <MessageSquare className="w-4 h-4 group-hover/btn:-rotate-12 transition-transform" fill="currentColor" />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Holiday banner ── */}
          {todayHoliday && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-4 flex items-center gap-3">
              <span className="text-2xl shrink-0">🏖️</span>
              <div>
                <p className="text-sm font-black text-amber-800">
                  Today is a holiday{todayHoliday.label ? ` · ${todayHoliday.label}` : ''}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">No deliveries scheduled. Balance won&apos;t deduct today.</p>
              </div>
            </div>
          )}

          {/* ── Today's delivery list — everything in one card ── */}
          <section className="mb-8">
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">

            {/* ── Card header ── */}
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 shrink-0 text-[18px] leading-none">
                  🛵
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-black text-gray-900 leading-tight">
                    {slotFilter === 'all' ? "Today's Deliveries" : `${MEAL_SLOT_LABEL[slotFilter as MealSlot]} Deliveries`}
                  </p>
                  <p className="text-xs font-medium text-gray-400 mt-0.5">
                    {workspaceCustomers.length} customer{workspaceCustomers.length !== 1 ? 's' : ''}
                    {slotFilter !== 'all' && deliveryTrackingEnabled && pendingCount > 0 && (
                      <span className="ml-1 text-orange-500 font-bold">· {pendingCount} pending</span>
                    )}
                  </p>
                </div>
              </div>
              {riders.length > 0 && workspaceCustomers.length > 0 && (
                <button
                  onClick={() => setRiderModal({ area: 'All deliveries', members: workspaceCustomers })}
                  className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-black uppercase tracking-wide bg-orange-500 text-white shadow-[0_4px_14px_rgba(244,98,42,0.35)] active:scale-95 transition-all duration-200 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              )}
            </div>

            {/* ── Overview: per-slot progress chips ── */}
            {slotFilter === 'all' && deliveryTrackingEnabled && deliveryToday.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50/40">
                {MEAL_SLOTS.map(s => {
                  const sCusts = deliveryToday.filter(c => customerMealSlots(c).includes(s))
                  if (!sCusts.length) return null
                  const sDone = sCusts.filter(c => deliveryStatuses[`${c.id}:${s}`] === 'delivered').length
                  const isAllDone = sDone === sCusts.length
                  const hasProgress = sDone > 0 && !isAllDone
                  return (
                    <button
                      key={s}
                      onClick={() => setSlotFilter(s)}
                      className={`chip transition-all active:scale-95 ${
                        isAllDone   ? 'bg-emerald-50 text-emerald-700'
                        : hasProgress ? 'bg-orange-50 text-orange-700'
                        : 'bg-white text-gray-500'
                      }`}
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                      <span className="text-sm leading-none">{MEAL_SLOT_EMOJI[s]}</span>
                      <span className="font-semibold">{MEAL_SLOT_LABEL[s]}</span>
                      <span className={`font-bold ${isAllDone ? 'text-emerald-600' : hasProgress ? 'text-orange-500' : 'text-gray-400'}`}>
                        {sDone}/{sCusts.length}
                      </span>
                      {isAllDone
                        ? <span className="text-emerald-500 text-[10px]">✓</span>
                        : <ChevronRight className="w-3 h-3 opacity-40" />
                      }
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── Workspace: progress bar ── */}
            {slotFilter !== 'all' && deliveryTrackingEnabled && workspaceCustomers.length > 0 && !allDone && (
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className="text-emerald-600">{deliveredCount} done</span>
                    {skippedCount > 0 && <span className="text-amber-600">{skippedCount} skipped</span>}
                    <span className="text-gray-400">{pendingCount} pending</span>
                  </div>
                  <span className="text-xs font-bold text-gray-600">{deliveredCount}/{workspaceCustomers.length}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(deliveredCount / workspaceCustomers.length) * 100}%` }} />
                </div>
              </div>
            )}

            {/* ── Workspace: view toggle + bulk controls ── */}
            {workspaceCustomers.length > 0 && slotFilter !== 'all' && (
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
                <div className="flex items-center bg-black/[0.05] rounded-xl p-0.5 gap-0.5">
                  <button
                    onClick={() => setDeliveryView('list')}
                    className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                      deliveryView === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor"/><rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor"/><rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor"/></svg>
                    List
                  </button>
                  <button
                    onClick={() => setDeliveryView('area')}
                    className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                      deliveryView === 'area' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    By area
                  </button>
                </div>
                {deliveryTrackingEnabled && (
                  <div className="flex items-center gap-1.5">
                    {bulkMode && (
                      <button
                        onClick={() => {
                          const allIds = new Set(workspaceCustomers.map(c => c.id))
                          const allSelected = workspaceCustomers.every(c => selectedIds.has(c.id))
                          setSelectedIds(allSelected ? new Set() : allIds)
                        }}
                        className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 active:scale-95 transition-all"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        {workspaceCustomers.every(c => selectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                    <button
                      onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()) }}
                      className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 active:scale-95 transition-all"
                    >
                      {bulkMode ? <X className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                      {bulkMode ? 'Cancel' : 'Select'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Swipe hint ── */}
            {slotFilter !== 'all' && deliveryTrackingEnabled && !bulkMode && workspaceCustomers.length > 0 && deliveredCount === 0 && skippedCount === 0 && (
              <p className="text-center text-[11px] font-medium text-gray-400 tracking-wide py-2 border-b border-gray-100 bg-gray-50/30">
                ← Skip &nbsp;·&nbsp; Swipe to mark &nbsp;·&nbsp; Deliver →
              </p>
            )}

            {/* ── Delivery rows ── */}
            {workspaceCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-400">
                  <PartyPopper className="w-8 h-8" />
                </div>
                <p className="text-sm font-bold text-gray-600">
                  {slotFilter === 'all' ? 'No deliveries today' : `No ${MEAL_SLOT_LABEL[slotFilter as MealSlot]} deliveries`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {slotFilter === 'all' ? 'Enjoy your day off!' : 'No customers subscribed to this slot'}
                </p>
              </div>

            ) : slotFilter === 'all' ? (
              /* Overview: all customers */
              <div>
                {deliveryToday.map((c, i) => (
                  <DeliveryRow key={c.id} c={c} index={i} isLast={i === deliveryToday.length - 1} onOpen={() => setCustomerModal(c)} />
                ))}
              </div>

            ) : deliveryView === 'list' ? (
              /* Slot workspace — list view */
              <div>
                {activeList.length > 0 ? (
                  activeList.map((c, i) =>
                    deliveryTrackingEnabled ? (
                      <SwipeableDeliveryRow
                        key={c.id} c={c} index={i}
                        isLast={i === activeList.length - 1 && deliveredList.length === 0}
                        status={deliveryStatuses[`${c.id}:${slotFilter}`] ?? 'pending'}
                        onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                        bulkMode={bulkMode} selected={selectedIds.has(c.id)}
                        onToggleSelect={() => toggleSelect(c.id)}
                        onOpen={() => setCustomerModal(c)}
                      />
                    ) : (
                      <DeliveryRow key={c.id} c={c} index={i} isLast={i === activeList.length - 1 && deliveredList.length === 0} onOpen={() => setCustomerModal(c)} />
                    )
                  )
                ) : deliveryTrackingEnabled ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-500">
                      <PartyPopper className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-black text-green-700">All {MEAL_SLOT_LABEL[slotFilter as MealSlot]} deliveries done!</p>
                    <p className="text-xs text-gray-400 mt-1">Everyone&apos;s been taken care of 🎉</p>
                  </div>
                ) : null}

                {/* Delivered section — collapsible row inside same card */}
                {deliveredList.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowDelivered(v => !v)}
                      className="w-full flex items-center gap-2 px-5 py-3.5 bg-green-50/60 border-t border-green-100 transition-colors active:bg-green-100/60"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-500 shrink-0">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-black text-green-800">Delivered</span>
                      <span className="rounded-lg bg-green-100 border border-green-200 px-2 py-0.5 text-xs font-bold text-green-700">{deliveredList.length}</span>
                      <ChevronDown className={`w-4 h-4 text-green-500 ml-auto transition-transform duration-200 ${showDelivered ? 'rotate-180' : ''}`} />
                    </button>
                    {showDelivered && deliveredList.map((c, i) => (
                      <DeliveryRow key={c.id} c={c} index={i} isLast={i === deliveredList.length - 1} onOpen={() => setCustomerModal(c)} />
                    ))}
                  </>
                )}
              </div>

            ) : (
              /* Slot workspace — area view */
              <div className="px-4 py-4 space-y-3">
                {sortedAreas.map(([area, allMembers]) => {
                  const members = allMembers.filter(c => customerMealSlots(c).includes(slotFilter as MealSlot))
                  if (!members.length) return null
                  const areaActive = deliveryTrackingEnabled
                    ? members.filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] !== 'delivered')
                    : members
                  const areaDelivered = deliveryTrackingEnabled
                    ? members.filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered')
                    : []
                  const allAreaDone = deliveryTrackingEnabled && areaActive.length === 0
                  return (
                    <div key={area} className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">

                      {/* Area header */}
                      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="text-[14px] font-black text-gray-900 truncate">{area}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                            allAreaDone
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-orange-50 text-orange-600'
                          }`}>
                            {allAreaDone ? `${members.length} ✓` : `${areaActive.length} left`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleCopyArea(area, members)}
                            className="flex items-center gap-1.5 rounded-xl bg-white border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-600 active:scale-95 transition-all hover:bg-gray-50"
                          >
                            {areaCopied === area
                              ? <><Check className="w-3 h-3 text-green-500" />Copied</>
                              : <><Copy className="w-3 h-3" />Copy</>}
                          </button>
                          {riders.length > 0 && (
                            <button
                              onClick={() => setRiderModal({ area, members })}
                              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-1.5 text-[12px] font-bold text-white active:scale-95 transition-all shadow-[0_2px_8px_rgba(244,98,42,0.3)]"
                            >
                              <Send className="w-3 h-3" />
                              Send
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Customer rows */}
                      <div className="divide-y divide-gray-50">
                        {areaActive.map((c, i) =>
                          deliveryTrackingEnabled ? (
                            <SwipeableDeliveryRow
                              key={c.id} c={c} index={i}
                              isLast={i === areaActive.length - 1 && areaDelivered.length === 0}
                              hideArea
                              status={deliveryStatuses[`${c.id}:${slotFilter}`] ?? 'pending'}
                              onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                              bulkMode={bulkMode} selected={selectedIds.has(c.id)}
                              onToggleSelect={() => toggleSelect(c.id)}
                              onOpen={() => setCustomerModal(c)}
                            />
                          ) : (
                            <DeliveryRow key={c.id} c={c} index={i} isLast={i === areaActive.length - 1} hideArea onOpen={() => setCustomerModal(c)} />
                          )
                        )}
                      </div>

                      {/* Delivered footer */}
                      {areaDelivered.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50/60 border-t border-emerald-100/60">
                          <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-500 shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-bold text-emerald-700">{areaDelivered.length} delivered</span>
                          <span className="text-xs text-emerald-500 truncate">· {areaDelivered.map(c => c.name).join(', ')}</span>
                        </div>
                      )}

                    </div>
                  )
                })}
              </div>
            )}

          </div>
          </section>

          {/* ── Summary — mobile only (desktop shows in sidebar) ── */}
          <div className="lg:hidden">
            <SummarySection userId={userId} deliveryTrackingEnabled={deliveryTrackingEnabled} />
          </div>

          </div>{/* end left column */}

          {/* ── Desktop right panel — slot progress + payment alerts ── */}
          <div className="hidden lg:flex flex-col gap-4 sticky top-[73px] self-start">

            {/* Slot workspace progress */}
            {deliveryTrackingEnabled && deliveryToday.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Slot progress</p>
                <div className="space-y-1">
                  {MEAL_SLOTS.map(s => {
                    const sCusts = deliveryToday.filter(c => customerMealSlots(c).includes(s))
                    if (!sCusts.length) return null
                    const sDone = sCusts.filter(c => deliveryStatuses[`${c.id}:${s}`] === 'delivered').length
                    const pct  = Math.round((sDone / sCusts.length) * 100)
                    const isAllDone = sDone === sCusts.length
                    return (
                      <button
                        key={s}
                        onClick={() => { setSlotFilter(s); setBulkMode(false); setSelectedIds(new Set()) }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all hover:bg-gray-50 active:scale-[0.98] ${slotFilter === s ? 'bg-orange-50' : ''}`}
                      >
                        <span className="text-base leading-none shrink-0">{MEAL_SLOT_EMOJI[s]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-xs font-semibold ${slotFilter === s ? 'text-orange-600' : 'text-gray-700'}`}>{MEAL_SLOT_LABEL[s]}</span>
                            <span className={`text-xs font-bold ${isAllDone ? 'text-emerald-600' : 'text-gray-400'}`}>{sDone}/{sCusts.length}</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        {isAllDone && <span className="text-emerald-500 text-xs shrink-0">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Payment alerts — desktop compact */}
            {paymentAlerts.length > 0 && (
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment alerts</p>
                  <span className="chip-sm bg-red-50 text-red-600 font-bold">{paymentAlerts.length}</span>
                </div>
                <div className="space-y-2">
                  {paymentAlerts.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.balance_days}d left</p>
                      </div>
                      <a
                        href={reminderLink(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500 text-white ml-2 shrink-0 hover:bg-green-600 transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" fill="currentColor" />
                      </a>
                    </div>
                  ))}
                  {paymentAlerts.length > 5 && (
                    <p className="text-[11px] text-gray-400 text-center pt-1">+{paymentAlerts.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Today's summary stats */}
            {deliveryToday.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Today's status</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-emerald-50 p-3 text-center">
                    <p className="text-xl font-black text-emerald-600 leading-none">{deliveredCount}</p>
                    <p className="text-[10px] font-semibold text-emerald-500 mt-1">Done</p>
                  </div>
                  <div className="rounded-xl bg-orange-50 p-3 text-center">
                    <p className="text-xl font-black text-orange-500 leading-none">{pendingCount}</p>
                    <p className="text-[10px] font-semibold text-orange-400 mt-1">Pending</p>
                  </div>
                  {skippedCount > 0 && (
                    <div className="col-span-2 rounded-xl bg-amber-50 p-3 text-center">
                      <p className="text-xl font-black text-amber-600 leading-none">{skippedCount}</p>
                      <p className="text-[10px] font-semibold text-amber-500 mt-1">Skipped</p>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>{/* end right panel */}

          </div>{/* end desktop grid */}

        </main>
      )}

      {/* ── Bulk action bar ── */}
      {deliveryTrackingEnabled && bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl">
              <span className="text-xs font-bold text-gray-300">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                onClick={handleCopyList}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                  copied ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-200'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => bulkMark('skipped')}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-300 active:scale-95 transition-all"
              >
                <X className="w-3.5 h-3.5" /> Skip
              </button>
              <button
                onClick={() => bulkMark('delivered')}
                className="flex items-center gap-1.5 rounded-xl bg-green-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-green-900/30 active:scale-95 transition-all"
              >
                <Check className="w-3.5 h-3.5" /> Delivered
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Undo snackbar ── */}
      {undoSnackbar && !bulkMode && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl pointer-events-auto">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${undoSnackbar.action === 'Delivered' ? 'text-green-400' : 'text-amber-400'}`}>
                {undoSnackbar.action === 'Delivered' ? '✓' : '—'} {undoSnackbar.name}
                <span className="opacity-60">{MEAL_SLOT_EMOJI[undoSnackbar.slot]}</span>
              </span>
              <div className="flex-1" />
              <button
                onClick={handleUndo}
                className="text-xs font-black text-orange-400 uppercase tracking-wide active:scale-95 transition-all"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer quick-view modal ── */}
      {customerModal && (() => {
        const c = customerModal
        const plan = customerPlan(c)
        const balanceClass = c.balance_days > 7
          ? 'bg-green-50 text-green-700 border-green-200'
          : c.balance_days >= 3
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-red-50 text-red-700 border-red-200'
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            onClick={() => setCustomerModal(null)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-2xl sm:mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-gray-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold border ${
                      c.status === 'active' ? 'bg-green-50 text-green-700 border-green-200'
                      : c.status === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                    {deliveryTrackingEnabled && customerMealSlots(c).map(s => {
                      const slotSt = deliveryStatuses[`${c.id}:${s}`] ?? 'pending'
                      return (
                        <span key={s} className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold border ${
                          slotSt === 'delivered' ? 'bg-green-50 text-green-700 border-green-200'
                          : slotSt === 'skipped'  ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>
                          <span>{MEAL_SLOT_EMOJI[s]}</span>
                          {slotSt === 'delivered' ? '✓' : slotSt === 'skipped' ? '—' : '·'}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <button
                  onClick={() => { setCustomerModal(null); router.push(`/customers?open=${c.id}`) }}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition-all shrink-0"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setCustomerModal(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 pt-4 space-y-3 max-h-[60vh] overflow-y-auto">

                {/* Plan + balance */}
                <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    plan?.plan_type === 'veg' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                  }`}>
                    {plan?.plan_type === 'veg' ? <Leaf className="w-4 h-4" /> : <Drumstick className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {plan?.name ?? (plan?.plan_type === 'veg' ? 'Veg' : 'Non-veg')}
                    </p>
                    <p className="text-xs font-medium text-gray-400">
                      {formatMealSlots(plan?.meal_slots ?? c.meal_slots)} · {(plan?.frequency ?? c.frequency) === 'daily' ? 'Daily' : 'Alternate days'}
                    </p>
                  </div>
                  <div className={`rounded-xl border px-3 py-1.5 text-center shrink-0 ${balanceClass}`}>
                    <p className="text-base font-black leading-none">{c.balance_days}</p>
                    <p className="text-[10px] font-bold mt-0.5">days left</p>
                  </div>
                </div>

                {/* Contact */}
                <a
                  href={`https://wa.me/91${c.whatsapp_number.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 active:bg-green-50 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">WhatsApp</p>
                    <p className="text-sm font-bold text-gray-900">{c.whatsapp_number}</p>
                  </div>
                </a>

                {/* Address */}
                {(c.address || c.area) && (
                  <div className="flex items-start gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 mt-0.5">
                      <Box className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {c.area && <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{c.area}</p>}
                      {c.address && <p className="text-sm font-medium text-gray-700 mt-0.5">{c.address}</p>}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {c.notes && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm font-medium text-gray-700 whitespace-pre-line">{c.notes}</p>
                  </div>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Rider picker modal ── */}
      {riderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setRiderModal(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-green-100 shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-green-600">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.054 1.473 5.763L0 24l6.395-1.673C8.09 23.447 10.01 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.857 0-3.599-.5-5.107-1.375l-.366-.217-3.795.995 1.012-3.695-.237-.381C2.451 15.483 2 13.8 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">Send to rider</p>
                <p className="text-xs font-semibold text-gray-400">📍 {riderModal.area} · {riderModal.members.length} {riderModal.members.length === 1 ? 'delivery' : 'deliveries'}</p>
              </div>
              <button
                onClick={() => setRiderModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-95 transition-all shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Empty state */}
            {riders.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-10 gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <Bike className="w-7 h-7 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-800">No riders yet</p>
                  <p className="text-xs font-medium text-gray-400 mt-1">Add a rider in Settings to send delivery lists over WhatsApp.</p>
                </div>
                <button
                  onClick={() => { setRiderModal(null); router.push('/settings') }}
                  className="flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-sm active:scale-95 transition-all"
                >
                  <Bike className="w-4 h-4" /> Add a rider
                </button>
              </div>
            )}

            {/* Scrollable rider list */}
            {riders.length > 0 && (
            <div
              className="overflow-y-auto overscroll-contain divide-y divide-gray-100"
              style={{ maxHeight: 'min(50vh, 400px)' }}
            >
              {riders.map(rider => (
                <button
                  key={rider.id}
                  onClick={() => sendToRider(rider, riderModal.area, riderModal.members)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 active:bg-green-50 transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-green-600">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.054 1.473 5.763L0 24l6.395-1.673C8.09 23.447 10.01 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.857 0-3.599-.5-5.107-1.375l-.366-.217-3.795.995 1.012-3.695-.237-.381C2.451 15.483 2 13.8 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{rider.name}</p>
                    <p className="text-xs font-medium text-gray-400">{rider.whatsapp_number}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
            )}
            {/* Footer cancel */}
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setRiderModal(null)}
                className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      </div>{/* end scrollable content */}

      <BottomNav />
    </div>
  )
}
