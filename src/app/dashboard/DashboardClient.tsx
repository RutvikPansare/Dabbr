'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTrialStatus } from '@/lib/trial'
import { useRouter } from 'next/navigation'
import {
  Sun, Sunrise, Moon, Leaf, Drumstick, AlertTriangle, Box, PartyPopper,
  Copy, Check, LogOut, MessageSquare, X, Users, CheckCheck, Bike, Send,
} from 'lucide-react'
import BottomNav from '@/components/BottomNav'
import Paywall from '@/components/Paywall'
import { getThemeVars } from '@/lib/branding'
import type { Frequency, MealSlot, PlanType, SubscriptionStatus } from '@/types/database'
import { formatMealSlots, MEAL_SLOT_EMOJI } from '@/lib/meals'

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

interface Props {
  userId: string
  userEmail: string
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
  const mealBadge = slots.map(slot => MEAL_SLOT_EMOJI[slot]).join('')
  const planType = plan?.plan_type ?? c.plan_type

  return (
    <div onClick={onOpen} className={`group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50/50 cursor-pointer ${!isLast ? 'border-b border-gray-100/50' : ''}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100/80 text-xs font-bold text-gray-500 shadow-sm border border-gray-200/50">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
          {c.name}
        </p>
        {c.notes ? (
          <p className="text-xs font-medium text-gray-400 mt-0.5 truncate">{c.notes.split('\n')[0]}</p>
        ) : !hideArea && c.area ? (
          <p className="text-xs font-medium text-gray-500 mt-0.5">{c.area}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-base" title={formatMealSlots(slots)}>{mealBadge}</span>
      <div className={`shrink-0 flex items-center justify-center h-9 w-9 rounded-xl shadow-sm ${planType === 'veg' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-orange-50 border border-orange-100 text-orange-600'}`}>
        {planType === 'veg' ? <Leaf className="w-4 h-4" /> : <Drumstick className="w-4 h-4" />}
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
  const [tracking, setTracking] = useState(false)

  const plan = customerPlan(c)
  const slots = plan?.meal_slots ?? c.meal_slots ?? ['lunch']
  const mealBadge = slots.map(slot => MEAL_SLOT_EMOJI[slot]).join('')
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
      }}
      onTouchMove={(e) => {
        if (!tracking || bulkMode) return
        const dx = e.touches[0].clientX - startX.current
        const dy = e.touches[0].clientY - startY.current
        if (Math.abs(dx) > Math.abs(dy) + 8) {
          setDeltaX(dx)
        }
      }}
      onTouchEnd={() => {
        if (!tracking) return
        setTracking(false)
        if (deltaX > SWIPE_THRESHOLD) onMark('delivered')
        else if (deltaX < -SWIPE_THRESHOLD) onMark('skipped')
        else if (Math.abs(deltaX) < 10) onOpen?.()
        setDeltaX(0)
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
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-sm border ${
          isDelivered ? 'bg-green-100 border-green-200 text-green-600' :
          isSkipped   ? 'bg-amber-100 border-amber-200 text-amber-600' :
                        'bg-gray-100/80 border-gray-200/50 text-gray-500'
        }`}>
          {isDelivered ? <Check className="w-3.5 h-3.5" /> : isSkipped ? <X className="w-3 h-3" /> : index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-bold transition-colors ${
            isDelivered ? 'text-gray-400 line-through' :
            isSkipped   ? 'text-gray-500' :
                          'text-gray-900'
          }`}>
            {c.name}
          </p>
          {isSkipped ? (
            <p className="text-xs font-semibold text-amber-600 mt-0.5">Skipped today</p>
          ) : c.notes && !isDelivered ? (
            <p className="text-xs font-medium text-gray-400 mt-0.5 truncate">{c.notes.split('\n')[0]}</p>
          ) : !hideArea && c.area ? (
            <p className={`text-xs font-medium mt-0.5 ${isDelivered ? 'text-gray-300' : 'text-gray-400'}`}>{c.area}</p>
          ) : null}
        </div>

        <span className={`shrink-0 text-base ${isDelivered || isSkipped ? 'opacity-30' : ''}`}>{mealBadge}</span>
        <div className={`shrink-0 flex items-center justify-center h-9 w-9 rounded-xl ${
          planType === 'veg' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-orange-50 border border-orange-100 text-orange-600'
        } ${isDelivered || isSkipped ? 'opacity-30' : ''}`}>
          {planType === 'veg' ? <Leaf className="w-4 h-4" /> : <Drumstick className="w-4 h-4" />}
        </div>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardClient({ userId, userEmail }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [copied, setCopied] = useState(false)
  const [deliveryView, setDeliveryView] = useState<'list' | 'area'>('list')

  // ── Data state ────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const customersRef = useRef<Customer[]>([])
  customersRef.current = customers

  const [provider, setProvider] = useState<Provider | null>(null)
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null)
  const [isExpired, setIsExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [todayHoliday, setTodayHoliday] = useState<{ label: string | null } | null>(null)
  const [riders, setRiders] = useState<DeliveryRider[]>([])
  const [riderModal, setRiderModal] = useState<{ area: string; members: Customer[] } | null>(null)
  const [areaCopied, setAreaCopied] = useState<string | null>(null)

  // ── Delivery tracking state ───────────────────────────────────────────────
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, DeliveryStatus>>({})
  const deliveryStatusesRef = useRef<Record<string, DeliveryStatus>>({})
  deliveryStatusesRef.current = deliveryStatuses

  const [undoSnackbar, setUndoSnackbar] = useState<{ id: string; prevStatus: DeliveryStatus; name: string; action: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const deliveryTrackingEnabled = provider?.enable_delivery_tracking ?? false

  const today = new Date().toISOString().split('T')[0]
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const hour = nowIST.getUTCHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const GreetingIcon = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon

  // ── Fetch on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [
        { data: customersData },
        { data: mealPlansData },
        { data: providerData },
        trial,
        { data: logsData },
        { data: holidayData },
        { data: ridersData },
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('*, pauses(*), subscriptions(*)')
          .eq('provider_id', userId)
          .order('name'),
        db.from('meal_plans').select('*').eq('provider_id', userId),
        supabase.from('providers').select('*').eq('id', userId).single(),
        getTrialStatus(supabase, userId),
        db.from('delivery_logs')
          .select('customer_id, status')
          .eq('provider_id', userId)
          .eq('date', today),
        db.from('provider_holidays')
          .select('label')
          .eq('provider_id', userId)
          .eq('date', today)
          .maybeSingle(),
        db.from('delivery_riders')
          .select('id, name, whatsapp_number')
          .eq('provider_id', userId)
          .order('created_at'),
      ])

      // Merge meal_plans into subscriptions manually (PostgREST embedded join workaround)
      const mpMap: Record<string, any> = {}
      for (const mp of (mealPlansData ?? [])) mpMap[mp.id] = mp
      const enriched = (customersData ?? []).map((c: any) => ({
        ...c,
        subscriptions: (c.subscriptions ?? []).map((s: any) => ({
          ...s,
          meal_plans: mpMap[s.meal_plan_id] ?? null,
        })),
      }))

      setCustomers(enriched)
      setProvider(providerData)
      setTrialDaysLeft(trial.trialDaysLeft)
      setIsExpired(trial.isExpired)
      setRiders(ridersData ?? [])

      // Check if today is a provider holiday or off-day
      const offDays: number[] = (providerData as any)?.off_days ?? []
      const todayDow = new Date(today + 'T12:00:00Z').getUTCDay()
      const isOffDay = offDays.includes(todayDow)
      if (holidayData || isOffDay) {
        setTodayHoliday({ label: holidayData?.label ?? null })
      }

      if (logsData) {
        const statusMap: Record<string, DeliveryStatus> = {}
        logsData.forEach((log: { customer_id: string; status: DeliveryStatus }) => {
          statusMap[log.customer_id] = log.status
        })
        setDeliveryStatuses(statusMap)
      }

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ── Delivery mutation ─────────────────────────────────────────────────────

  const markDelivery = useCallback(async (customerId: string, newStatus: 'delivered' | 'skipped' | 'pending') => {
    const prevStatus: DeliveryStatus = deliveryStatusesRef.current[customerId] ?? 'pending'
    if (prevStatus === newStatus) return

    // Balance only changes when delivering or un-delivering
    let balanceDelta = 0
    if (newStatus === 'delivered' && prevStatus !== 'delivered') balanceDelta = -1
    if (prevStatus === 'delivered' && newStatus !== 'delivered') balanceDelta = +1

    // Optimistic UI
    setDeliveryStatuses(prev => {
      const next = { ...prev }
      if (newStatus === 'pending') delete next[customerId]
      else next[customerId] = newStatus
      return next
    })

    if (balanceDelta !== 0) {
      setCustomers(prev => prev.map(c =>
        c.id === customerId
          ? { ...c, balance_days: Math.max(0, c.balance_days + balanceDelta) }
          : c
      ))
    }

    // Undo snackbar (single actions only)
    if (newStatus !== 'pending') {
      const customer = customersRef.current.find(c => c.id === customerId)
      setUndoSnackbar({
        id: customerId,
        prevStatus,
        name: customer?.name ?? '',
        action: newStatus === 'delivered' ? 'Delivered' : 'Skipped',
      })
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(() => setUndoSnackbar(null), 4000)
    }

    // Persist to DB
    if (newStatus === 'pending') {
      await db.from('delivery_logs').delete().eq('customer_id', customerId).eq('date', today)
    } else {
      await db.from('delivery_logs').upsert(
        { customer_id: customerId, provider_id: userId, date: today, status: newStatus },
        { onConflict: 'customer_id,date' }
      )
    }

    if (balanceDelta !== 0) {
      const customer = customersRef.current.find(c => c.id === customerId)
      if (customer) {
        await db.from('customers').update({
          balance_days: Math.max(0, customer.balance_days + balanceDelta),
        }).eq('id', customerId)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today])

  async function handleUndo() {
    if (!undoSnackbar) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const { id, prevStatus } = undoSnackbar
    setUndoSnackbar(null)
    await markDelivery(id, prevStatus)
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
    const ids = Array.from(selectedIds)
    setBulkMode(false)
    setSelectedIds(new Set())
    await Promise.all(ids.map(id => markDelivery(id, newStatus)))
  }

  async function markAllDelivered(list: Customer[]) {
    const ids = list
      .filter(c => (deliveryStatusesRef.current[c.id] ?? 'pending') === 'pending')
      .map(c => c.id)
    await Promise.all(ids.map(id => markDelivery(id, 'delivered')))
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] px-5 pt-5 pb-5">
          <div className="mx-auto max-w-2xl flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-28 rounded-full bg-white/20" />
              <div className="h-5 w-44 rounded-full bg-white/30" />
              <div className="h-4 w-20 rounded-full bg-white/15" />
            </div>
            <div className="h-9 w-9 rounded-xl bg-white/15 shrink-0" />
          </div>
        </div>
        <div className="mx-auto max-w-2xl px-4 mt-4">
          <div className="h-3 w-32 rounded-full bg-gray-200 mb-2 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-[72px] rounded-2xl bg-emerald-300/60 animate-pulse" />
            <div className="h-[72px] rounded-2xl bg-orange-300/60 animate-pulse" />
            <div className="h-[72px] rounded-2xl bg-amber-300/60 animate-pulse" />
            <div className="h-[72px] rounded-2xl bg-indigo-300/60 animate-pulse" />
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

  const vegToday       = deliveryToday.filter(c => customerPlan(c)?.plan_type === 'veg')
  const nonvegToday    = deliveryToday.filter(c => customerPlan(c)?.plan_type === 'nonveg')
  const breakfastToday = deliveryToday.filter(c => customerPlan(c)?.meal_slots.includes('breakfast'))
  const lunchToday     = deliveryToday.filter(c => customerPlan(c)?.meal_slots.includes('lunch'))
  const dinnerToday    = deliveryToday.filter(c => customerPlan(c)?.meal_slots.includes('dinner'))

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

  const trialBadgeClass =
    trialDaysLeft === null ? ''
    : trialDaysLeft > 20 ? 'bg-green-500/20 text-green-100'
    : trialDaysLeft > 7  ? 'bg-amber-400/25 text-amber-100'
    : 'bg-red-500/30 text-red-100'

  // Tracking counts
  const deliveredCount = deliveryToday.filter(c => deliveryStatuses[c.id] === 'delivered').length
  const skippedCount   = deliveryToday.filter(c => deliveryStatuses[c.id] === 'skipped').length
  const pendingCount   = deliveryToday.length - deliveredCount - skippedCount
  const allDone        = deliveryToday.length > 0 && pendingCount === 0

  // Sorted list: pending first, skipped, delivered last
  const statusOrder: Record<DeliveryStatus, number> = { pending: 0, skipped: 1, delivered: 2 }
  const sortedDeliveryToday = deliveryTrackingEnabled
    ? [...deliveryToday].sort((a, b) =>
        statusOrder[deliveryStatuses[a.id] ?? 'pending'] - statusOrder[deliveryStatuses[b.id] ?? 'pending']
      )
    : deliveryToday

  function handleCopyList() {
    const lines = [
      `Delivery list — ${formatTodayShort(today)}`,
      '',
      ...deliveryToday.map(
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
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]" style={themeVars as React.CSSProperties}>

      {isExpired && <Paywall />}

      {/* ── Header ── */}
      <div
        className="relative overflow-hidden px-5 pt-5 pb-5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-2xl flex items-center gap-3">
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

      {/* ── Packing count cards ── */}
      <div className="relative z-10 mx-auto max-w-2xl px-4 mt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">Today&apos;s packing count</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="group relative overflow-hidden flex flex-col rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 p-4 shadow-[0_4px_20px_rgba(52,211,153,0.2)] transition-transform duration-300 hover:-translate-y-0.5">
            <Leaf className="absolute -right-3 -top-3 w-16 h-16 text-emerald-900 opacity-10" />
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-0.5 relative z-10">🥦 Veg</p>
            <p className="text-3xl font-black text-white relative z-10">{vegToday.length}</p>
          </div>
          <div className="group relative overflow-hidden flex flex-col rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] p-4 shadow-[0_4px_20px_rgba(244,98,42,0.2)] transition-transform duration-300 hover:-translate-y-0.5">
            <Drumstick className="absolute -right-3 -top-3 w-16 h-16 text-orange-950 opacity-10" />
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-0.5 relative z-10">🍗 Non-veg</p>
            <p className="text-3xl font-black text-white relative z-10">{nonvegToday.length}</p>
          </div>
          <div className="group relative overflow-hidden flex flex-col rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 p-4 shadow-[0_4px_20px_rgba(14,165,233,0.2)] transition-transform duration-300 hover:-translate-y-0.5">
            <Sunrise className="absolute -right-3 -top-3 w-16 h-16 text-sky-900 opacity-10" />
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-0.5 relative z-10">🌅 Breakfast</p>
            <p className="text-3xl font-black text-white relative z-10">{breakfastToday.length}</p>
          </div>
          <div className="group relative overflow-hidden flex flex-col rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 p-4 shadow-[0_4px_20px_rgba(251,191,36,0.2)] transition-transform duration-300 hover:-translate-y-0.5">
            <Sun className="absolute -right-3 -top-3 w-16 h-16 text-yellow-900 opacity-10" />
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-0.5 relative z-10">☀️ Lunch</p>
            <p className="text-3xl font-black text-white relative z-10">{lunchToday.length}</p>
          </div>
          <div className="group relative overflow-hidden flex flex-col rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-4 shadow-[0_4px_20px_rgba(99,102,241,0.2)] transition-transform duration-300 hover:-translate-y-0.5">
            <Moon className="absolute -right-3 -top-3 w-16 h-16 text-indigo-950 opacity-10" />
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-0.5 relative z-10">🌙 Dinner</p>
            <p className="text-3xl font-black text-white relative z-10">{dinnerToday.length}</p>
          </div>
        </div>
      </div>

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
        <main className="mx-auto mt-5 max-w-2xl space-y-5 px-4">

          {/* ── Payment alerts ── */}
          {paymentAlerts.length > 0 && (
            <section className="mt-8">
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

          {/* ── Today's delivery list ── */}
          <section className="mb-8">

            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <span className="flex items-center justify-center p-1.5 bg-orange-100 rounded-xl">
                    <Box className="w-4 h-4 text-orange-600" />
                  </span>
                  Today&apos;s Deliveries
                </h2>
                <p className="text-xs font-medium text-gray-500 mt-0.5">
                  {deliveryToday.length} customer{deliveryToday.length !== 1 ? 's' : ''} total
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyList}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide transition-all duration-300 active:scale-95 ${
                    copied
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'btn-secondary'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                {riders.length > 0 && deliveryToday.length > 0 && (
                  <button
                    onClick={() => setRiderModal({ area: 'All deliveries', members: deliveryToday })}
                    className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide bg-orange-500 text-white shadow-sm active:scale-95 transition-all duration-300"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </button>
                )}
              </div>
            </div>

            {/* Progress strip (tracking ON) */}
            {deliveryTrackingEnabled && deliveryToday.length > 0 && (
              <div className={`mb-3 rounded-2xl px-4 py-3 ${allDone ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/60' : 'bg-white/70 border border-gray-100'}`}>
                {allDone ? (
                  <div className="flex items-center gap-2">
                    <PartyPopper className="w-4 h-4 text-green-500 shrink-0" />
                    <p className="text-sm font-bold text-green-700">All deliveries done!</p>
                    {skippedCount > 0 && (
                      <span className="ml-auto text-xs font-semibold text-green-600">{skippedCount} skipped</span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="text-green-600">{deliveredCount} done</span>
                        {skippedCount > 0 && <span className="text-amber-600">{skippedCount} skipped</span>}
                        <span className="text-gray-400">{pendingCount} pending</span>
                      </div>
                      <span className="text-xs font-black text-gray-700">{deliveredCount} / {deliveryToday.length}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                        style={{ width: `${(deliveredCount / deliveryToday.length) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* View toggle + bulk controls */}
            {deliveryToday.length > 0 && (
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setDeliveryView('list')}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                    deliveryView === 'list'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor"/><rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor"/><rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor"/></svg>
                  List
                </button>
                <button
                  onClick={() => setDeliveryView('area')}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                    deliveryView === 'area'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M8 1.5C5.51 1.5 3.5 3.51 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.49-2.01-4.5-4.5-4.5zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="currentColor"/></svg>
                  By Area
                </button>

                {deliveryTrackingEnabled && (
                  <>
                    <div className="flex-1" />
                    {!bulkMode && pendingCount > 0 && (
                      <button
                        onClick={() => markAllDelivered(deliveryToday)}
                        className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-all active:scale-95"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        All done
                      </button>
                    )}
                    <button
                      onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()) }}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                        bulkMode
                          ? 'bg-orange-500 text-white'
                          : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      {bulkMode ? 'Cancel' : 'Select'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Swipe hint */}
            {deliveryTrackingEnabled && !bulkMode && deliveryToday.length > 0 && deliveredCount === 0 && skippedCount === 0 && (
              <p className="mb-2 text-center text-[11px] font-medium text-gray-400">
                Swipe right to deliver · Swipe left to skip
              </p>
            )}

            {/* ── List ── */}
            {deliveryToday.length === 0 ? (
              <div className="glass-card flex flex-col items-center justify-center rounded-3xl py-12">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-400 shadow-inner border border-orange-100/50">
                  <PartyPopper className="w-8 h-8" />
                </div>
                <p className="text-sm font-bold text-gray-600">No deliveries today</p>
                <p className="text-xs text-gray-400 mt-1">Enjoy your day off!</p>
              </div>

            ) : deliveryView === 'list' ? (
              <div className="glass-card overflow-hidden rounded-3xl">
                {sortedDeliveryToday.map((c, i) =>
                  deliveryTrackingEnabled ? (
                    <SwipeableDeliveryRow
                      key={c.id}
                      c={c}
                      index={i}
                      isLast={i === sortedDeliveryToday.length - 1}
                      status={deliveryStatuses[c.id] ?? 'pending'}
                      onMark={(s) => markDelivery(c.id, s)}
                      bulkMode={bulkMode}
                      selected={selectedIds.has(c.id)}
                      onToggleSelect={() => toggleSelect(c.id)}
                      onOpen={() => router.push(`/customers?open=${c.id}`)}
                    />
                  ) : (
                    <DeliveryRow key={c.id} c={c} index={i} isLast={i === deliveryToday.length - 1} onOpen={() => router.push(`/customers?open=${c.id}`)} />
                  )
                )}
              </div>

            ) : (
              <div className="space-y-3">
                {sortedAreas.map(([area, members]) => (
                  <div key={area} className="glass-card overflow-hidden rounded-3xl">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/80 border-b border-gray-100">
                      <span className="text-sm">📍</span>
                      <span className="text-sm font-black text-gray-800">{area}</span>
                      <span className="rounded-lg bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                        {members.length}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyArea(area, members)}
                          className="flex items-center gap-1 rounded-xl bg-white border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-600 active:scale-95 transition-all"
                        >
                          {areaCopied === area ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          {areaCopied === area ? 'Copied' : 'Copy'}
                        </button>
                        {riders.length > 0 && (
                          <button
                            onClick={() => setRiderModal({ area, members })}
                            className="flex items-center gap-1 rounded-xl bg-orange-500 px-2.5 py-1.5 text-[11px] font-bold text-white active:scale-95 transition-all shadow-sm"
                          >
                            <Send className="w-3 h-3" />
                            Send
                          </button>
                        )}
                      </div>
                    </div>
                    {members.map((c, i) =>
                      deliveryTrackingEnabled ? (
                        <SwipeableDeliveryRow
                          key={c.id}
                          c={c}
                          index={i}
                          isLast={i === members.length - 1}
                          hideArea
                          status={deliveryStatuses[c.id] ?? 'pending'}
                          onMark={(s) => markDelivery(c.id, s)}
                          bulkMode={bulkMode}
                          selected={selectedIds.has(c.id)}
                          onToggleSelect={() => toggleSelect(c.id)}
                          onOpen={() => router.push(`/customers?open=${c.id}`)}
                        />
                      ) : (
                        <DeliveryRow key={c.id} c={c} index={i} isLast={i === members.length - 1} hideArea onOpen={() => router.push(`/customers?open=${c.id}`)} />
                      )
                    )}
                  </div>
                ))}
              </div>
            )}

          </section>

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
                onClick={() => bulkMark('skipped')}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-4 py-2.5 text-xs font-bold text-amber-300 active:scale-95 transition-all"
              >
                <X className="w-3.5 h-3.5" /> Skip
              </button>
              <button
                onClick={() => bulkMark('delivered')}
                className="flex items-center gap-1.5 rounded-xl bg-green-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-green-900/30 active:scale-95 transition-all"
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
              <span className={`text-xs font-bold ${undoSnackbar.action === 'Delivered' ? 'text-green-400' : 'text-amber-400'}`}>
                {undoSnackbar.action === 'Delivered' ? '✓' : '—'} {undoSnackbar.name}
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

      {/* ── Rider picker modal ── */}
      {riderModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setRiderModal(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-2xl sm:mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100">
                <Send className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-black text-gray-900">Send to rider</p>
                <p className="text-xs font-semibold text-gray-400">📍 {riderModal.area} · {riderModal.members.length} deliveries</p>
              </div>
              <button
                onClick={() => setRiderModal(null)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {riders.map(rider => (
                <button
                  key={rider.id}
                  onClick={() => sendToRider(rider, riderModal.area, riderModal.members)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5 text-left active:bg-orange-50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                    <Bike className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{rider.name}</p>
                    <p className="text-xs font-medium text-gray-400">{rider.whatsapp_number}</p>
                  </div>
                  <div className="flex items-center gap-1 text-green-600">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.054 1.473 5.763L0 24l6.395-1.673C8.09 23.447 10.01 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.857 0-3.599-.5-5.107-1.375l-.366-.217-3.795.995 1.012-3.695-.237-.381C2.451 15.483 2 13.8 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
