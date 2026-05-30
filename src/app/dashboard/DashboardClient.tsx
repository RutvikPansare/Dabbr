'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { dismissNotification, dismissAllNotifications, resolveCancellation } from './actions'
import {
  Sun, Sunrise, Moon, Leaf, Drumstick, AlertTriangle, Box, PartyPopper,
  Copy, Check, LogOut, MessageSquare, X, Users, CheckCheck, Bike, Send, Edit2, ChevronDown,
  MapPin, ChevronRight, UtensilsCrossed, Plus, Sparkles, Bell, XCircle, Play, RotateCcw, Zap, ChevronUp, List,
  ChevronLeft, HelpCircle, Gift, Phone, Flag, AlignJustify,
} from 'lucide-react'
import { formatMealSlots, MEAL_SLOTS, MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL } from '@/lib/meals'
import { fetchWithRetry } from '@/lib/fetch-retry'
import { useSwipeGesture } from '@/lib/use-swipe-gesture'
import { computeBalance, fmtRupees, fmtDays } from '@/lib/udhar'
import BottomNav from '@/components/BottomNav'
import SummarySection from './SummarySection'
import Paywall from '@/components/Paywall'
import CustomerLimitModal from '@/components/CustomerLimitModal'
import { getThemeVars } from '@/lib/branding'
import { getCustomerLimit, BILLING_PLANS, isBillingPlanId, type BillingPlanId, type CustomerLimitPlanId } from '@/lib/billing'
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
  balance: number
  credit_limit: number
  price_per_month: number
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
  subscription_plan?: BillingPlanId | null
  subscription_status?: string | null
}

interface DeliveryRider {
  id: string
  name: string
  whatsapp_number: string
  email: string | null
  invite_status: string
}

interface TodayMenu {
  meal_slot: string
  plan_type: string | null
  dish_name: string
  quantities: Record<string, number> | null
}

interface ProviderNotification {
  id: string
  type: string  // 'pause' | 'cancellation_request' | …
  title: string // customer name
  message: string
  payload: Record<string, any> | null
  created_at: string
  read_at: string | null
}

interface InitialData {
  customers: any[]
  provider: any
  riders: any[]
  trial: { trialDaysLeft: number | null; isExpired: boolean; isSubscribed: boolean }
  deliveryStatuses: Record<string, string>
  todayHoliday: { label: string | null } | null
  todayMenus?: TodayMenu[]
  notifications?: ProviderNotification[]
  todayAssignments?: { id: string; rider_id: string; rider_name: string; scope: 'full' | 'area'; area_name: string | null }[]
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

function balancePillClass(state: 'good' | 'low' | 'critical'): string {
  if (state === 'good')     return 'bg-green-100 text-green-700 border border-green-200'
  if (state === 'low')      return 'bg-amber-100 text-amber-700 border border-amber-200'
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
  const price = customerPlan(c)?.monthly_price ?? c.price_per_month
  const bs    = computeBalance({ balance: c.balance, creditLimit: c.credit_limit, monthlyPrice: price })
  const msg = encodeURIComponent(
    bs.daysLeft <= 0
      ? `Hi ${c.name} 🙏, your tiffin balance has run out. Please recharge to continue receiving meals. Thank you! 🍱`
      : `Hi ${c.name} 🙏, your tiffin balance is running low — only *${fmtDays(bs.daysLeft)}* remaining (₹${Math.round(c.balance)} left). Please recharge soon. Thank you! 🍱`
  )
  return `https://wa.me/91${c.whatsapp_number.replace(/\D/g, '')}?text=${msg}`
}

// ── Static DeliveryRow (delivery tracking OFF) ─────────────────────────────

function DeliveryRow({ c, index, isLast, hideArea, status, onMark, onOpen, onAddExtra, onViewExtras, pendingExtraCount }: {
  c: Customer
  index: number
  isLast: boolean
  hideArea?: boolean
  status?: DeliveryStatus
  onMark?: (s: 'delivered' | 'skipped' | 'pending') => void
  onOpen?: () => void
  onAddExtra?: () => void
  onViewExtras?: () => void
  pendingExtraCount?: number
}) {
  const plan     = customerPlan(c)
  const slots    = plan?.meal_slots ?? c.meal_slots ?? ['lunch']
  const planType = plan?.plan_type ?? c.plan_type
  const price    = c.price_per_month
  const bs       = computeBalance({ balance: c.balance, creditLimit: c.credit_limit, monthlyPrice: price })
  const isDelivered = status === 'delivered'
  const isSkipped   = status === 'skipped'
  const lastCircleTouchMs = useRef(0)

  function cycleStatus() {
    if (!onMark) return
    if (!status || status === 'pending') onMark('delivered')
    else if (status === 'delivered') onMark('skipped')
    else onMark('pending')
  }

  return (
    <div className={`group flex items-start gap-3 px-5 py-4 transition-colors ${isDelivered ? 'bg-green-50' : isSkipped ? 'bg-amber-50/60' : 'hover:bg-gray-50/40'} ${!isLast ? 'border-b border-gray-100' : ''}`}>
      {/* Index / status circle — click/tap to cycle when onMark is provided */}
      <span className="relative group/dot shrink-0 mt-0.5">
        <span
          onTouchStart={onMark ? (e) => { lastCircleTouchMs.current = Date.now(); e.stopPropagation() } : undefined}
          onTouchEnd={onMark ? (e) => { lastCircleTouchMs.current = Date.now(); e.stopPropagation(); e.preventDefault(); cycleStatus() } : undefined}
          onClick={onMark ? (e) => { if (Date.now() - lastCircleTouchMs.current < 600) return; e.stopPropagation(); cycleStatus() } : onOpen}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-transform ${
            onMark ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-pointer'
          } ${
            isDelivered ? 'bg-green-500 text-white hover:bg-green-600' :
            isSkipped   ? 'bg-amber-500 text-white hover:bg-amber-600' :
            onMark      ? 'border-2 border-gray-300 bg-white text-gray-400 hover:border-green-400 hover:text-green-500 hover:bg-green-50' :
                          'bg-gray-100 text-gray-500'
          }`}
        >
          {isDelivered ? <Check className="w-3.5 h-3.5" /> : isSkipped ? <X className="w-3 h-3" /> : index + 1}
        </span>
        {onMark && (
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-75 group-hover/dot:opacity-100 z-50">
            {isDelivered ? 'Mark skipped' : isSkipped ? 'Reset to pending' : 'Mark delivered'}
          </span>
        )}
      </span>

      {/* Main info — tappable to open detail */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
        <p className="truncate text-[15px] font-black text-gray-900 leading-snug">
          {c.name}
        </p>
        {!hideArea && c.area && (
          <p className="flex items-center gap-1 text-xs font-medium text-gray-400 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0" />{c.area}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* Plan chip */}
          <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100/80 px-2 py-0.5">
            <span className="text-[11px]">{PLAN_EMOJI[planType]}</span>
            <span className="text-[11px] font-semibold text-gray-600 truncate max-w-[80px]">{plan?.name ?? planType}</span>
            <span className="text-gray-300 text-xs">·</span>
            <span className="text-[11px] text-gray-400">{slots.map(s => MEAL_SLOT_EMOJI[s]).join('')}</span>
          </div>
          {/* Extra chip — split view/add when extras exist */}
          {onAddExtra && (
            pendingExtraCount
              ? <div className="inline-flex items-center rounded-lg bg-orange-100 overflow-hidden">
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewExtras?.() }}
                    className="px-2 py-0.5 text-[11px] font-semibold text-orange-600"
                  >
                    {pendingExtraCount} extra{pendingExtraCount > 1 ? 's' : ''}
                  </button>
                  <span className="w-px h-3 bg-orange-200 shrink-0" />
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddExtra() }}
                    className="px-1.5 py-0.5 text-orange-600 hover:bg-orange-200 transition-colors"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>
              : <button
                  onClick={(e) => { e.stopPropagation(); onAddExtra() }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold bg-gray-100/80 text-gray-500 hover:bg-orange-50 hover:text-orange-500 transition-colors"
                >
                  <Plus className="w-2.5 h-2.5" />Extra
                </button>
          )}
        </div>
        {c.notes && (
          <p className="mt-1 text-[11px] text-gray-400 truncate">{c.notes.split('\n')[0]}</p>
        )}
      </div>

      {/* Right: balance badge + rupees + diet icon */}
      <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5 cursor-pointer" onClick={onOpen}>
        <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-xs font-bold ${balancePillClass(bs.state)}`}>
          {bs.daysLeft <= 0 ? 'Overdue' : `${fmtDays(bs.daysLeft)} left`}
        </span>
        <span className={`text-[11px] font-semibold ${bs.state === 'critical' ? 'text-red-400' : bs.state === 'low' ? 'text-amber-400' : 'text-gray-400'}`}>
          {fmtRupees(c.balance)}
        </span>
        {planType === 'veg'
          ? <Leaf className="w-3.5 h-3.5 text-emerald-400" />
          : <Drumstick className="w-3.5 h-3.5 text-orange-300" />}
      </div>
    </div>
  )
}

// ── ExtraPreset type ──────────────────────────────────────────────────────
interface ExtraPreset {
  id: string
  name: string
  amount: number
}

interface PendingExtraItem {
  id: string
  item: string
  amount: number
  note: string | null
}

// ── SwipeableDeliveryRow (delivery tracking ON) ────────────────────────────

function SwipeableDeliveryRow({ c, index, isLast, hideArea, status, onMark, bulkMode, selected, onToggleSelect, onOpen, onAddExtra, onViewExtras, pendingExtraCount }: {
  c: Customer
  index: number
  isLast: boolean
  hideArea?: boolean
  status: DeliveryStatus
  onMark: (s: 'delivered' | 'skipped' | 'pending') => void
  bulkMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen?: () => void
  onAddExtra?: () => void
  onViewExtras?: () => void
  pendingExtraCount?: number
}) {
  const lastCircleTouchMs = useRef(0)

  const { deltaX, deltaY, tracking, swipeProgress, handlers: swipeHandlers } = useSwipeGesture({
    onSwipeRight: () => onMark('delivered'),
    onSwipeLeft:  () => onMark('skipped'),
    onTap: onOpen,
    disabled: bulkMode,
  })

  const plan = customerPlan(c)
  const slots = plan?.meal_slots ?? c.meal_slots ?? ['lunch']
  const planType = plan?.plan_type ?? c.plan_type
  const isDelivered = status === 'delivered'
  const isSkipped = status === 'skipped'

  return (
    <div
      className={`relative overflow-hidden select-none touch-pan-y ${!isLast ? 'border-b border-gray-100/50' : ''}`}
      {...swipeHandlers}
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
          isDelivered ? 'bg-green-50' :
          isSkipped   ? 'bg-amber-50/70' :
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

        {/* Index / status circle — click/tap to cycle pending → delivered → skipped → pending */}
        <span className="relative group/dot">
          <span
            onTouchStart={(e) => {
              lastCircleTouchMs.current = Date.now()
              e.stopPropagation()
            }}
            onTouchEnd={(e) => {
              lastCircleTouchMs.current = Date.now()
              e.stopPropagation()
              e.preventDefault()
              if (bulkMode) return
              if (status === 'pending') onMark('delivered')
              else if (status === 'delivered') onMark('skipped')
              else onMark('pending')
            }}
            onClick={(e) => {
              // Suppress ghost click that fires ~300ms after touch on Android WebView
              if (Date.now() - lastCircleTouchMs.current < 600) return
              e.stopPropagation()
              if (bulkMode) return
              if (status === 'pending') onMark('delivered')
              else if (status === 'delivered') onMark('skipped')
              else onMark('pending')
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold cursor-pointer transition-transform hover:scale-110 active:scale-95 ${
              isDelivered ? 'bg-green-500 text-white hover:bg-green-600' :
              isSkipped   ? 'bg-amber-500 text-white hover:bg-amber-600' :
                            'border-2 border-gray-300 bg-white text-gray-400 hover:border-green-400 hover:text-green-500 hover:bg-green-50'
            }`}
          >
            {isDelivered ? <Check className="w-3.5 h-3.5" /> : isSkipped ? <X className="w-3 h-3" /> : index + 1}
          </span>
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-75 group-hover/dot:opacity-100 z-50">
            {status === 'pending' ? 'Mark delivered' : status === 'delivered' ? 'Mark skipped' : 'Reset to pending'}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-black leading-snug ${
            isDelivered ? 'text-green-800' :
            isSkipped   ? 'text-amber-800' :
                          'text-gray-900'
          }`}>
            {c.name}
          </p>
          {isSkipped ? (
            <p className="text-xs font-semibold text-amber-600 mt-0.5">Skipped today</p>
          ) : (
            <>
              {!hideArea && c.area && (
                <p className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${isDelivered ? 'text-green-600/60' : 'text-gray-400'}`}>
                  <MapPin className="w-3 h-3 shrink-0" />{c.area}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {/* Plan chip */}
                <div className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 ${
                  isDelivered ? 'bg-green-100/60' : 'bg-gray-100/80'
                }`}>
                  <span className="text-[11px]">{PLAN_EMOJI[planType]}</span>
                  <span className={`text-[11px] font-semibold truncate max-w-[80px] ${isDelivered ? 'text-green-700' : 'text-gray-600'}`}>{plan?.name ?? planType}</span>
                  <span className={`text-xs ${isDelivered ? 'text-green-400' : 'text-gray-300'}`}>·</span>
                  <span className={`text-[11px] ${isDelivered ? 'text-green-600/70' : 'text-gray-400'}`}>{slots.map(s => MEAL_SLOT_EMOJI[s]).join('')}</span>
                </div>
                {/* Extra chip — split view/add when extras exist */}
                {!bulkMode && onAddExtra && (
                  isDelivered && pendingExtraCount
                    ? <div className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-600">
                        <Sparkles className="w-2.5 h-2.5" />{pendingExtraCount} extra{pendingExtraCount > 1 ? 's' : ''} billed
                      </div>
                    : pendingExtraCount
                      ? <div className="inline-flex items-center rounded-lg bg-orange-100 overflow-hidden">
                          <button
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onViewExtras?.() }}
                            onClick={(e) => { e.stopPropagation(); onViewExtras?.() }}
                            className="px-2 py-0.5 text-[11px] font-semibold text-orange-600"
                          >
                            {pendingExtraCount} extra{pendingExtraCount > 1 ? 's' : ''}
                          </button>
                          <span className="w-px h-3 bg-orange-200 shrink-0" />
                          <button
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onAddExtra() }}
                            onClick={(e) => { e.stopPropagation(); onAddExtra() }}
                            className="px-1.5 py-0.5 text-orange-600 hover:bg-orange-200 transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      : <button
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onAddExtra() }}
                          onClick={(e) => { e.stopPropagation(); onAddExtra() }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold bg-gray-100/80 text-gray-500 hover:bg-orange-50 hover:text-orange-500 transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5" />Extra
                        </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: balance badge + diet icon */}
        {(() => {
          const swipePrice = plan?.monthly_price ?? c.price_per_month
          const swipeBS    = computeBalance({ balance: c.balance, creditLimit: c.credit_limit, monthlyPrice: swipePrice })
          return (
            <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
              <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-xs font-bold ${balancePillClass(swipeBS.state)}`}>
                {swipeBS.daysLeft <= 0 ? 'Overdue' : `${fmtDays(swipeBS.daysLeft)} left`}
              </span>
              <span className={`text-[11px] font-semibold ${swipeBS.state === 'critical' ? 'text-red-400' : swipeBS.state === 'low' ? 'text-amber-400' : 'text-gray-400'}`}>
                {fmtRupees(c.balance)}
              </span>
              {planType === 'veg'
                ? <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                : <Drumstick className="w-3.5 h-3.5 text-orange-300" />}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── NotificationRow ────────────────────────────────────────────────────────

const NOTIF_META: Record<string, { badge: string; badgeClass: string }> = {
  pause:                { badge: '⏸ Delivery Paused',   badgeClass: 'text-amber-500' },
  cancellation_request: { badge: 'Cancellation Request', badgeClass: 'text-red-500'   },
}

function NotificationRow({
  n,
  onDismiss,
  onClose,
  onResolve,
}: {
  n: ProviderNotification
  onDismiss: () => void
  onClose: () => void
  onResolve?: (action: 'approve' | 'reject') => void
}) {
  const meta = NOTIF_META[n.type] ?? { badge: n.type, badgeClass: 'text-gray-500' }
  const customerId: string | undefined = n.payload?.customer_id
  const isUnread = n.read_at === null
  const isCancellation = n.type === 'cancellation_request'

  return (
    <div className={`flex items-start gap-3 px-5 py-4 transition-colors ${isUnread ? 'bg-orange-50/40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />}
          <span className={`text-[10px] font-black uppercase tracking-wider ${meta.badgeClass}`}>
            {meta.badge}
          </span>
        </div>
        <p className="text-sm font-black text-gray-900 truncate">{n.title}</p>
        <p className="text-xs font-semibold text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
        <p className="text-[10px] text-gray-400 mt-1">
          {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        {/* Cancellation: quick approve / reject actions */}
        {isCancellation && onResolve && (
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => onResolve('approve')}
              className="flex-1 rounded-xl bg-red-500 py-1.5 text-[11px] font-black text-white hover:bg-red-600 active:scale-95 transition-all"
            >
              Confirm cancellation
            </button>
            <button
              onClick={() => onResolve('reject')}
              className="flex-1 rounded-xl bg-gray-100 py-1.5 text-[11px] font-black text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
            >
              Keep active
            </button>
          </div>
        )}
        {/* Cancellation: view customer link (fallback when no onResolve) */}
        {isCancellation && !onResolve && customerId && (
          <a
            href={`/customers?open=${customerId}`}
            onClick={onClose}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700"
          >
            View customer →
          </a>
        )}
      </div>
      {/* Cancellation requests must be resolved — no silent dismiss */}
      {!isCancellation && (
        <button
          onClick={onDismiss}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
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
  const [showDelivered, setShowDelivered] = useState(true)
  const [showSkipped, setShowSkipped] = useState(false)
  // Per-area collapsed state for delivered/skipped sub-sections in area view
  const [areaShowDelivered, setAreaShowDelivered] = useState<Record<string, boolean>>({})
  const [areaShowSkipped, setAreaShowSkipped] = useState<Record<string, boolean>>({})
  const [cookListOpen, setCookListOpen] = useState(true)
  const [packingListOpen, setPackingListOpen] = useState(true)
  const [slotFilter, setSlotFilter] = useState<'all' | MealSlot>('lunch')

  // Persist slot selection across navigation
  useEffect(() => {
    const saved = localStorage.getItem('dabbr_slot_filter')
    if (saved === 'all' || saved === 'breakfast' || saved === 'lunch' || saved === 'dinner') {
      setSlotFilter(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeSlot(f: 'all' | MealSlot) {
    setSlotFilter(f)
    localStorage.setItem('dabbr_slot_filter', f)
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  // ── Data state — seeded from server-side cached initialData ───────────────
  const [customers, setCustomers] = useState<Customer[]>(initialData.customers)
  const customersRef = useRef<Customer[]>([])
  customersRef.current = customers

  const [provider, setProvider] = useState<Provider | null>(initialData.provider)
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(initialData.trial.trialDaysLeft)
  const [isExpired, setIsExpired] = useState(initialData.trial.isExpired)
  const [loading, setLoading] = useState(false)

  // ── Plan trial state ──────────────────────────────────────────────────────
  const [showTrialEndedModal, setShowTrialEndedModal] = useState(false)

  // Fresh subscription status fetched client-side (bypasses Next.js data cache)
  const [liveStatus, setLiveStatus] = useState<{
    is_subscribed: boolean | null
    subscription_plan: string | null
    subscription_status: string | null
    plan_trial_ends_at: string | null
    subscription_current_period_end: string | null
  } | null>(null)

  // Effective subscription data: live fetch wins over cached server data
  const subData = liveStatus ?? (provider as any)

  // "On paid plan trial" = subscribed + plan_trial_ends_at set (not just subscription_status,
  // because every new user's DB row defaults to subscription_status='trial' for the old 30-day trial)
  const planTrialInfo = (() => {
    if (!subData?.is_subscribed || !subData?.plan_trial_ends_at) return null
    const msLeft = new Date(subData.plan_trial_ends_at).getTime() - Date.now()
    const daysLeft = Math.ceil(msLeft / 86_400_000)
    return { plan: subData.subscription_plan as string, daysLeft, expired: daysLeft <= 0 }
  })()

  // On mount: fetch fresh subscription status (bypasses Next.js data-cache)
  useEffect(() => {
    fetch('/api/provider-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setLiveStatus(d) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When live status arrives: auto-downgrade if paid trial expired, show one-time modal
  useEffect(() => {
    if (!liveStatus) return
    if (!liveStatus.is_subscribed || !liveStatus.plan_trial_ends_at) return
    const expired = new Date(liveStatus.plan_trial_ends_at) < new Date()
    if (!expired) return

    // Auto-downgrade
    fetch('/api/downgrade-to-free', { method: 'POST' }).then(r => {
      if (r.ok) fetch('/api/provider-status').then(r2 => r2.ok ? r2.json() : null).then(d => { if (d && !d.error) setLiveStatus(d) })
    })

    // Show one-time modal (keyed by trial end date so a new trial can show again)
    const key = `dabbr_trial_ended_${userId}_${liveStatus.plan_trial_ends_at}`
    if (!localStorage.getItem(key)) {
      setShowTrialEndedModal(true)
      localStorage.setItem(key, '1')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus])
  // Load extra presets + today's pending extras counts
  useEffect(() => {
    async function loadExtras() {
      const [presetsRes, extrasRes] = await Promise.all([
        db.from('extra_presets').select('id, name, amount').eq('provider_id', userId).order('sort_order').order('created_at'),
        db.from('delivery_extras').select('id, customer_id, item, amount, note').eq('provider_id', userId).eq('delivery_date', today).eq('status', 'pending'),
      ])
      if (presetsRes.data) setExtraPresets(presetsRes.data)
      if (extrasRes.data) {
        const map: Record<string, PendingExtraItem[]> = {}
        for (const row of extrasRes.data) {
          if (!map[row.customer_id]) map[row.customer_id] = []
          map[row.customer_id].push({ id: row.id, item: row.item, amount: row.amount, note: row.note })
        }
        setPendingExtras(map)
      }
    }
    loadExtras()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [todayHoliday, setTodayHoliday] = useState<{ label: string | null } | null>(initialData.todayHoliday)
  const [riders, setRiders] = useState<DeliveryRider[]>(initialData.riders)

  // ── Notification state ────────────────────────────────────────────────────
  // Server already filters dismissed_at IS NULL, so initial data = inbox.
  // Dismissal: optimistically removes from local list + calls server action
  // to set dismissed_at (never deletes the row — soft state).
  const [notifications, setNotifications] = useState<ProviderNotification[]>(
    initialData.notifications ?? [],
  )
  const [cancelBellOpen, setCancelBellOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const desktopBellRef = useRef<HTMLButtonElement>(null)
  const mobileHeaderRef = useRef<HTMLDivElement>(null)
  const [bellDropPos, setBellDropPos] = useState<{ top: number; right: number } | null>(null)

  function openBell() {
    // Use whichever bell button is currently rendered (desktop ref has offsetParent when lg: is active)
    const el = (desktopBellRef.current?.offsetParent != null ? desktopBellRef : bellRef).current
    if (el) {
      const rect = el.getBoundingClientRect()
      // On mobile, anchor below the full header (not just the bell button) so the
      // dropdown never gets clipped by the safe-area / gradient header.
      const headerBottom = mobileHeaderRef.current
        ? mobileHeaderRef.current.getBoundingClientRect().bottom
        : rect.bottom
      const top = window.innerWidth < 1024 ? headerBottom + 8 : rect.bottom + 8
      setBellDropPos({ top, right: window.innerWidth - rect.right })
    }
    setCancelBellOpen(o => !o)
  }

  const totalBellCount = notifications.length

  function dismissOne(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    dismissNotification(id).catch(() => {})
  }

  function dismissAll() {
    // Only dismiss non-cancellation notifications — cancellations must be explicitly resolved
    const toKeep = notifications.filter(n => n.type === 'cancellation_request')
    const toDismiss = notifications.filter(n => n.type !== 'cancellation_request')
    setNotifications(toKeep)
    toDismiss.forEach(n => dismissNotification(n.id).catch(() => {}))
    if (toKeep.length === 0) setCancelBellOpen(false)
  }

  // ── Fire native Android notification for unread push events ──────────────
  const nativeNotifFiredRef = useRef(false)
  useEffect(() => {
    const unread = notifications.filter(n => n.read_at === null)
    if (nativeNotifFiredRef.current || unread.length === 0) return
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) return
    nativeNotifFiredRef.current = true

    async function fireNativeNotifications() {
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
      } catch (e) {
        console.warn('Local notification error:', e)
      }
    }

    fireNativeNotifications()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Extras state ──────────────────────────────────────────────────────────
  const [extraPresets, setExtraPresets] = useState<ExtraPreset[]>([])
  // pendingExtras: customerId → list of pending extra items today
  const [pendingExtras, setPendingExtras] = useState<Record<string, PendingExtraItem[]>>({})
  // extraModal: which customer's add-extra sheet is open
  const [extraModal, setExtraModal] = useState<Customer | null>(null)
  // extrasViewModal: show list of pending extras for a customer
  const [extrasViewModal, setExtrasViewModal] = useState<{ customer: Customer; extras: PendingExtraItem[] } | null>(null)
  const [extraItem, setExtraItem] = useState('')
  const [extraAmount, setExtraAmount] = useState('')
  const [extraNote, setExtraNote] = useState('')
  const [extraSaving, setExtraSaving] = useState(false)
  const [extraError, setExtraError] = useState('')
  const todayMenus: TodayMenu[] = initialData.todayMenus ?? []
  const [riderModal, setRiderModal] = useState<{ area: string; members: Customer[] } | null>(null)
  const [areaCopied, setAreaCopied] = useState<string | null>(null)
  const [assignModal, setAssignModal] = useState(false)
  const [assignments, setAssignments] = useState<{ id: string; rider_id: string; rider_name: string; scope: 'full' | 'area'; area_name: string | null }[]>(initialData.todayAssignments ?? [])
  const assignmentsRef = useRef(assignments)
  assignmentsRef.current = assignments
  // Start Run dispatch state
  const [runGrouping, setRunGrouping] = useState<'list' | 'area'>('list')
  const [yesterdayAssignments, setYesterdayAssignments] = useState<{ rider_id: string; rider_name: string; scope: 'full' | 'area'; area_name: string | null }[]>([])
  const [pickerOpen, setPickerOpen] = useState<Set<string>>(new Set()) // keys of rows whose rider picker is expanded
  const [noAssignFlash, setNoAssignFlash] = useState(false) // flashes rows when user hits Start Deliveries with nothing assigned
  // draftAssignments: staged inside the modal only — no API calls until "Start Deliveries" is pressed
  const [draftAssignments, setDraftAssignments] = useState<{ id: string; rider_id: string; rider_name: string; scope: 'full' | 'area'; area_name: string | null }[]>([])
  const runIsActive = assignments.length > 0
  const [runCompleted, setRunCompleted] = useState(false)
  // Quick-add rider form (shown inside modal when no riders exist)
  const [quickRiderName, setQuickRiderName]   = useState('')
  const [quickRiderPhone, setQuickRiderPhone] = useState('')
  const [quickRiderSaving, setQuickRiderSaving] = useState(false)
  const [quickRiderError, setQuickRiderError]   = useState('')

  // ── Delivery tracking state ───────────────────────────────────────────────
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, DeliveryStatus>>(
    initialData.deliveryStatuses as Record<string, DeliveryStatus>
  )
  const deliveryStatusesRef = useRef<Record<string, DeliveryStatus>>({})
  deliveryStatusesRef.current = deliveryStatuses
  // Tracks whether any local mark has been made since mount.
  // Used to skip the initial full-fetch overwrite after an optimistic update.
  const hasMarkedAny = useRef(false)

  const [undoSnackbar, setUndoSnackbar] = useState<{ id: string; slot: MealSlot; prevStatus: DeliveryStatus; name: string; action: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const deliveryTrackingEnabled = provider?.enable_delivery_tracking ?? true
  const customerLimitPlan: CustomerLimitPlanId = (() => {
    if (isBillingPlanId(subData?.subscription_plan) && subData?.subscription_status === 'active') return subData.subscription_plan as BillingPlanId
    if (subData?.is_subscribed && isBillingPlanId(subData?.subscription_plan)) return subData.subscription_plan as BillingPlanId
    return 'free'
  })()
  const customerLimit = getCustomerLimit(customerLimitPlan)
  const overCustomerLimit = customerLimit != null && customers.length > customerLimit
  const [showCustomerLimitModal, setShowCustomerLimitModal] = useState(overCustomerLimit)

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

    // Initial full fetch — brings client in sync regardless of cache age.
    // Skip the overwrite if the user has already made optimistic updates so we
    // don't race-revert their click (the RPC + realtime subscription keeps us live).
    db.from('delivery_logs')
      .select('customer_id, meal_slot, status')
      .eq('provider_id', userId)
      .eq('date', today)
      .then(({ data }: { data: { customer_id: string; meal_slot: string; status: string }[] | null }) => {
        if (data && !hasMarkedAny.current) setDeliveryStatuses(buildStatusMap(data))
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
            const old = payload.old as { customer_id?: string; meal_slot?: string; date?: string }
            if (!old.customer_id || !old.meal_slot || old.date !== today) return
            setDeliveryStatuses(prev => {
              const next = { ...prev }
              delete next[`${old.customer_id}:${old.meal_slot}`]
              return next
            })
          } else {
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

  useEffect(() => {
    if (overCustomerLimit) setShowCustomerLimitModal(true)
  }, [overCustomerLimit])

  // ── Delivery mutation ─────────────────────────────────────────────────────

  const markDelivery = useCallback(async (customerId: string, slot: MealSlot, newStatus: 'delivered' | 'skipped' | 'pending') => {
    if (overCustomerLimit) {
      setShowCustomerLimitModal(true)
      return
    }

    const key = `${customerId}:${slot}`
    const prevStatus: DeliveryStatus = deliveryStatusesRef.current[key] ?? 'pending'

    if (prevStatus === newStatus) return

    // Moving a delivery back to pending reopens the run — clear the completed chip
    if (newStatus === 'pending') setRunCompleted(false)

    const customer = customersRef.current.find(c => c.id === customerId)

    // ── Optimistic update ────────────────────────────────────────────────────
    hasMarkedAny.current = true
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

    // ── Server write (with retry on transient failures) ───────────────────────
    let res: Response
    try {
      res = await fetchWithRetry(() => fetch('/api/mark-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, date: today, meal_slot: slot, status: newStatus }),
      }))
    } catch {
      // Network unreachable after all retries — revert
      console.error('[mark-delivery] network failure after retries')
      setDeliveryStatuses(prev => {
        const next = { ...prev }
        if (prevStatus === 'pending') delete next[key]
        else next[key] = prevStatus
        return next
      })
      setUndoSnackbar(prev => (prev?.id === customerId && prev?.slot === slot ? null : prev))
      return
    }

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error('[mark-delivery] failed:', json.error)
      setDeliveryStatuses(prev => {
        const next = { ...prev }
        if (prevStatus === 'pending') delete next[key]
        else next[key] = prevStatus
        return next
      })
      setUndoSnackbar(prev => (prev?.id === customerId && prev?.slot === slot ? null : prev))
      return
    }

    const json = await res.json().catch(() => ({}))

    // Re-assert confirmed status
    setDeliveryStatuses(prev => {
      const next = { ...prev }
      if (newStatus === 'pending') delete next[key]
      else next[key] = newStatus
      return next
    })

    // Update local balance display.
    // Prefer new_balance (authoritative server value) over local math with balance_delta.
    if (json.new_balance !== undefined && json.new_balance !== null) {
      setCustomers(prev => prev.map(c => c.id !== customerId ? c : { ...c, balance: json.new_balance }))
    } else {
      // Fallback: local estimate using balance_delta (±1 day unit → rupees)
      const balanceDelta: number = json.balance_delta ?? 0
      if (balanceDelta !== 0) {
        setCustomers(prev => prev.map(c => {
          if (c.id !== customerId) return c
          const perDayCost = (c.price_per_month ?? 0) / 30
          return { ...c, balance: c.balance + balanceDelta * perDayCost }
        }))
      }
    }

    if (newStatus === 'delivered' && pendingExtras[customerId]?.length) {
      billExtrasForCustomer(customerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today, overCustomerLimit])

  async function handleUndo() {
    if (!undoSnackbar) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const { id, slot, prevStatus } = undoSnackbar
    setUndoSnackbar(null)
    await markDelivery(id, slot, prevStatus)
  }

  // ── Extras ────────────────────────────────────────────────────────────────

  function openExtraModal(c: Customer) {
    setExtraModal(c)
    setExtraItem('')
    setExtraAmount('')
    setExtraNote('')
    setExtraError('')
  }

  async function handleSubmitExtra(e: React.FormEvent) {
    e.preventDefault()
    if (!extraModal || !extraItem.trim()) return
    setExtraSaving(true)
    setExtraError('')
    const res = await fetch('/api/add-extra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: extraModal.id,
        delivery_date: today,
        item: extraItem.trim(),
        amount: Number(extraAmount) || 0,
        note: extraNote.trim() || null,
      }),
    })
    const json = await res.json()
    setExtraSaving(false)
    if (!res.ok) { setExtraError(json.error ?? 'Failed to save extra'); return }
    // Append new extra to local list
    const newItem: PendingExtraItem = { id: json.extra.id, item: extraItem.trim(), amount: Number(extraAmount) || 0, note: extraNote.trim() || null }
    setPendingExtras(prev => ({ ...prev, [extraModal.id]: [...(prev[extraModal.id] ?? []), newItem] }))
    // Keep view modal in sync if it's open for this customer
    setExtrasViewModal(prev => prev?.customer.id === extraModal.id ? { ...prev, extras: [...prev.extras, newItem] } : prev)
    setExtraModal(null)
  }

  async function billExtrasForCustomer(customerId: string) {
    const res = await fetch('/api/bill-extras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, delivery_date: today }),
    })
    const json = await res.json()
    if (res.ok && json.newBalance !== null && json.newBalance !== undefined) {
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, balance: json.newBalance } : c))
      // Move extras from pending → billed in local state
      setPendingExtras(prev => { const n = { ...prev }; delete n[customerId]; return n })
      setExtrasViewModal(null)
    }
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
    if (overCustomerLimit) {
      setShowCustomerLimitModal(true)
      return
    }
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

  // ── Auto-complete run when every delivery is done/skipped ─────────────────
  // Checks all active-today customers across ALL their slots, independent of
  // the current slotFilter workspace. Guards with a ref so it only fires once
  // per run (reset when a new run starts).
  const autoCompletedRef = useRef(false)
  const prevRunActiveRef = useRef(false)
  useEffect(() => {
    // Reset guard when a fresh run becomes active
    if (runIsActive && !prevRunActiveRef.current) {
      autoCompletedRef.current = false
      setRunCompleted(false)
    }
    prevRunActiveRef.current = runIsActive
  }, [runIsActive])
  useEffect(() => {
    if (!runIsActive || autoCompletedRef.current || !deliveryTrackingEnabled) return
    const activeToday = customersRef.current.filter(c => isActiveToday(c, today))
    if (!activeToday.length) return
    const fullRunDone = activeToday.every(c => {
      const slots = customerMealSlots(c)
      return !slots.length || slots.every(s => {
        const st = deliveryStatusesRef.current[`${c.id}:${s}`]
        return st === 'delivered' || st === 'skipped'
      })
    })
    if (!fullRunDone) return
    autoCompletedRef.current = true
    setRunCompleted(true)
    // Clear all assignments — riders will see "No deliveries assigned" on next check
    const toRemove = assignmentsRef.current
    setAssignments([])
    toRemove.forEach(a => {
      fetch('/api/rider/unassign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: a.id }),
      }).catch(() => {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryStatuses, runIsActive])

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
    .reduce((acc, c) => {
      if (c.status !== 'active') return acc
      const price = customerPlan(c)?.monthly_price ?? c.price_per_month
      const bs    = computeBalance({ balance: c.balance, creditLimit: c.credit_limit, monthlyPrice: price })
      if (bs.state !== 'good') acc.push(c)
      return acc
    }, [] as Customer[])
    .sort((a, b) => a.balance - b.balance)

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

  // Current plan label — always shown (Free / Starter / Pro), trial badge shown separately
  const activePlanName = (() => {
    // During active paid trial: trialBadge handles display
    if (planTrialInfo && !planTrialInfo.expired) return null
    // Paid plan: subscription_plan is set to a known plan AND status is active
    // (use subscription_plan as primary signal — is_subscribed can be stale in some DB rows)
    if (isBillingPlanId(subData?.subscription_plan) && subData?.subscription_status === 'active') {
      return BILLING_PLANS[subData.subscription_plan as BillingPlanId].name
    }
    // Fallback: is_subscribed=true and plan set (covers edge cases)
    if (subData?.is_subscribed && isBillingPlanId(subData?.subscription_plan)) {
      return BILLING_PLANS[subData.subscription_plan as BillingPlanId].name
    }
    // Free plan (default for all new users)
    return 'Free'
  })()

  // Plan trial badge label + colour
  const trialBadge = (() => {
    if (!planTrialInfo || planTrialInfo.expired) return null
    const planName = isBillingPlanId(planTrialInfo.plan) ? BILLING_PLANS[planTrialInfo.plan as BillingPlanId].name : planTrialInfo.plan
    const d = planTrialInfo.daysLeft
    const label = d <= 1 ? `Trial ends today` : `Trial: ${d}d left`
    const cls = d <= 1 ? 'bg-red-500/25 text-red-100 border-red-400/30'
               : d <= 3 ? 'bg-amber-400/25 text-amber-100 border-amber-400/30'
               : 'bg-white/15 text-white border-white/20'
    const clsDesktop = d <= 1 ? 'bg-red-50 text-red-600'
                      : d <= 3 ? 'bg-amber-50 text-amber-700'
                      : 'bg-orange-50 text-orange-600'
    return { planName, label, cls, clsDesktop }
  })()

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

  // Active / delivered / skipped split — only meaningful in a slot workspace; overview is always static
  const activeList = (slotFilter !== 'all' && deliveryTrackingEnabled)
    ? workspaceCustomers.filter(c => {
        const s = deliveryStatuses[`${c.id}:${slotFilter}`]
        return s !== 'delivered' && s !== 'skipped'
      })
    : workspaceCustomers
  const deliveredList = (slotFilter !== 'all' && deliveryTrackingEnabled)
    ? workspaceCustomers.filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered')
    : []
  const skippedList = (slotFilter !== 'all' && deliveryTrackingEnabled)
    ? workspaceCustomers.filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] === 'skipped')
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

  async function openAssignModal() {
    setRunGrouping(deliveryView) // default to current dashboard grouping
    setPickerOpen(new Set())
    setNoAssignFlash(false)
    setDraftAssignments([...assignments]) // seed draft from current committed state
    setAssignModal(true)
    // Today's assignments already seeded from server — only fetch yesterday's for hints
    const yesterday = new Date(today + 'T00:00:00')
    yesterday.setDate(yesterday.getDate() - 1)
    const yd = yesterday.toISOString().split('T')[0]
    try {
      const ydRes = await fetch(`/api/rider/assignments?date=${yd}`)
      if (ydRes.ok) setYesterdayAssignments(await ydRes.json())
    } catch { /* ignore */ }
  }

  async function quickAddRider() {
    const name  = quickRiderName.trim()
    const phone = quickRiderPhone.replace(/\D/g, '').slice(-10)
    if (!name)          { setQuickRiderError('Name is required'); return }
    if (phone.length !== 10) { setQuickRiderError('Enter a valid 10-digit WhatsApp number'); return }
    setQuickRiderSaving(true)
    setQuickRiderError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setQuickRiderError('Not signed in'); setQuickRiderSaving(false); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createAdminClient } = await import('@/lib/supabase/admin')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any
      const { data, error } = await db
        .from('delivery_riders')
        .insert({ provider_id: user.id, name, whatsapp_number: phone, invite_status: 'pending' })
        .select('id, name, whatsapp_number, email, invite_status')
        .single()
      if (error) { setQuickRiderError(error.message); return }
      if (data) {
        setRiders(prev => [...prev, data])
        setQuickRiderName('')
        setQuickRiderPhone('')
      }
    } catch (e: any) {
      setQuickRiderError(e?.message ?? 'Failed to add rider')
    } finally {
      setQuickRiderSaving(false)
    }
  }

  function assignRider(riderId: string, scope: 'full' | 'area', areaName: string | null) {
    const rider = riders.find(r => r.id === riderId)
    const tempId = `temp-${Date.now()}-${Math.random()}`
    // Optimistic: add immediately with a temp ID
    setAssignments(prev => [
      ...prev.filter(a => !(a.scope === scope && (scope === 'full' || a.area_name === areaName))),
      { id: tempId, rider_id: riderId, rider_name: rider?.name ?? '', scope, area_name: areaName },
    ])
    // Background server write — replace temp ID with real ID, or revert on failure
    fetch('/api/rider/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rider_id: riderId, assignment_date: today, scope, area_name: areaName }),
    }).then(async res => {
      if (res.ok) {
        const { assignment } = await res.json()
        setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: assignment.id } : a))
      } else {
        setAssignments(prev => prev.filter(a => a.id !== tempId))
      }
    }).catch(() => {
      setAssignments(prev => prev.filter(a => a.id !== tempId))
    })
  }

  function removeAssignment(assignmentId: string) {
    const item = assignments.find(a => a.id === assignmentId)
    // Optimistic: remove immediately
    setAssignments(prev => prev.filter(a => a.id !== assignmentId))
    // Background server write — revert on failure
    fetch('/api/rider/unassign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment_id: assignmentId }),
    }).then(res => {
      if (!res.ok && item) setAssignments(prev => [...prev, item])
    }).catch(() => {
      if (item) setAssignments(prev => [...prev, item])
    })
  }

  function stopRun() {
    const toRemove = [...assignmentsRef.current]
    setAssignments([])
    setAssignModal(false)
    setPickerOpen(new Set())
    // Retry unassign calls — idempotent (DELETE is safe to repeat).
    // Pass composite key fields alongside assignment_id so the API can fall
    // back to composite-key delete if the UUID hasn't landed yet.
    toRemove.forEach(a => {
      fetchWithRetry(() => fetch('/api/rider/unassign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: a.id, rider_id: a.rider_id, assignment_date: today, scope: a.scope, area_name: a.area_name }),
      })).catch(err => console.warn('[stopRun] unassign failed after retries:', err))
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const themeVars = getThemeVars(provider?.accent_color)

  return (
    // Mobile: full-screen flex col (header pinned top, scrollable body, nav pinned bottom)
    // Desktop: natural document flow (sidebar handles nav, page scrolls normally)
    <div className="h-screen flex flex-col bg-[#FAF8F5] lg:h-auto lg:min-h-screen lg:block" style={themeVars as React.CSSProperties}>

      {isExpired && <Paywall />}

      {/* ── Mobile header — hidden on desktop ── */}
      <div
        ref={mobileHeaderRef}
        className="shrink-0 z-30 overflow-hidden lg:hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
      >
        {/* Decorative blur blob */}
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />

        <div
          className="relative mx-auto max-w-2xl px-4 pb-4 flex items-start gap-3"
          style={{ paddingTop: 'calc(0.85rem + env(safe-area-inset-top))' }}
        >
          {/* ── Menu / profile button ── */}
          <button
            onClick={() => setMoreOpen(true)}
            className="shrink-0 active:scale-95 transition-transform mt-0.5"
            aria-label="Open menu"
          >
            <div className="relative">
              {/* Avatar circle */}
              {provider?.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt={provider.name}
                  className="w-11 h-11 rounded-full object-cover border-2 border-white/30 shadow-md"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center shadow-md">
                  <span className="text-white text-[15px] font-black leading-none">
                    {providerName.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')}
                  </span>
                </div>
              )}
              {/* Menu badge — signals this is tappable */}
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                <AlignJustify className="w-2.5 h-2.5 text-orange-500" strokeWidth={2.5} />
              </div>
            </div>
          </button>

          {/* ── Greeting block ── */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white/55 tracking-wide leading-none">
              {formatTodayShort(today)}
            </p>
            <h1 className="mt-1 text-[1.35rem] font-black text-white tracking-tight leading-tight flex items-center gap-1.5">
              {greeting}, {providerName.split(' ')[0]}
              <GreetingIcon className="w-5 h-5 text-yellow-300 shrink-0" strokeWidth={2.5} />
            </h1>
            {/* Plan / trial badge */}
            {!trialBadge && activePlanName && (
              <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${activePlanName === 'Free' ? 'border-white/15 bg-white/10 text-white/70' : 'border-white/20 bg-white/15 text-white'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${activePlanName === 'Free' ? 'bg-white/50' : 'bg-emerald-300'}`} />
                Dabbr {activePlanName}
              </div>
            )}
            {trialBadge && (
              <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${trialBadge.cls}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {trialBadge.planName} · {trialBadge.label}
              </div>
            )}
          </div>

          {/* ── Bell only ── (logout moved to panel) */}
          <button
            ref={bellRef}
            onClick={openBell}
            className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-white/15 text-white border border-white/20 active:scale-95 transition-all mt-0.5 shrink-0"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {totalBellCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white leading-none">
                {totalBellCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Desktop page header — flat sticky bar, hidden on mobile ── */}
      <div className="hidden lg:flex items-center justify-between sticky top-0 z-30 px-8 pt-7 pb-4 bg-[#FAF8F5]/90 backdrop-blur-sm">
        <div className="min-w-0">
          <p className="text-sm font-bold text-orange-500 leading-none mb-1">{formatTodayLong(today)}</p>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-1.5 leading-tight">
            {greeting}, {providerName}
            <GreetingIcon className="w-5 h-5 text-yellow-400 shrink-0" strokeWidth={2} />
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!trialBadge && activePlanName && (
            <span className={`chip font-semibold flex items-center gap-1.5 ${activePlanName === 'Free' ? 'bg-gray-50 text-gray-400' : 'bg-emerald-50 text-emerald-600'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${activePlanName === 'Free' ? 'bg-gray-300' : 'bg-emerald-400'}`} />
              Dabbr {activePlanName}
            </span>
          )}
          {trialBadge && (
            <span className={`chip font-semibold flex items-center gap-1.5 ${trialBadge.clsDesktop}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              {trialBadge.planName} · {trialBadge.label}
            </span>
          )}
          {/* Desktop notification bell */}
          <button
            ref={desktopBellRef}
            onClick={openBell}
            className="relative flex items-center justify-center h-9 w-9 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {totalBellCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white leading-none">
                {totalBellCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Scrollable content (mobile) / Document flow (desktop) ── */}
      <div className="flex-1 overflow-y-auto overscroll-none pb-[calc(7rem+env(safe-area-inset-bottom))] lg:flex-none lg:overflow-visible lg:pb-12">

      {overCustomerLimit && customerLimit != null && (
        <main className="mx-auto max-w-2xl px-4 pt-6 lg:max-w-3xl lg:pt-10">
          <div className="rounded-[2rem] bg-white border border-orange-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-br from-orange-50 to-white px-5 py-5 border-b border-orange-100">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-orange-500">Plan action needed</p>
                  <h2 className="mt-1 text-xl font-black text-gray-900 tracking-tight">Dashboard actions are paused</h2>
                  <p className="mt-2 text-sm font-medium text-gray-500 leading-relaxed">
                    You have {customers.length} total customers, but your current plan allows {customerLimit}. Upgrade your plan or delete customers to continue daily delivery actions.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 px-5 py-4">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Customers</p>
                <p className="text-2xl font-black text-gray-900">{customers.length}</p>
              </div>
              <div className="rounded-2xl bg-orange-50 border border-orange-100 px-3 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">Limit</p>
                <p className="text-2xl font-black text-orange-600">{customerLimit}</p>
              </div>
              <div className="rounded-2xl bg-red-50 border border-red-100 px-3 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-wider text-red-400">Over</p>
                <p className="text-2xl font-black text-red-600">+{customers.length - customerLimit}</p>
              </div>
            </div>
            <div className="px-5 pb-5 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => setShowCustomerLimitModal(true)}
                className="rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-3.5 text-sm font-black text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
              >
                Upgrade plan
              </button>
              <button
                onClick={() => router.push('/customers')}
                className="rounded-2xl border border-orange-200 bg-orange-50 py-3.5 text-sm font-black text-orange-600 hover:bg-orange-100 active:scale-[0.98] transition-all"
              >
                Manage customers
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ── Desktop stat tiles — above slot tabs, hidden on mobile ── */}
      {!overCustomerLimit && safeCustomers.length > 0 && (
        <div className="hidden lg:block relative px-8 pt-3 pb-1">
          {/* Stat grid — unaffected by illustration */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
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
          </div>

          {/* Tiffin illustration — absolutely positioned, never affects tile layout */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tiffin-art.png"
            alt=""
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 right-16 w-72 h-auto pointer-events-none select-none"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
      )}

      {/* ── Cook List + Packing List with shared slot filter ── */}
      {!overCustomerLimit && deliveryToday.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 mt-4 lg:max-w-none lg:px-8 lg:mt-4">

          {/* Shared slot filter bar — doubles as workspace selector.
              Shown whenever there are deliveries today, regardless of menus.
              The slot buttons are the delivery workspace picker; they must
              always be visible so the provider can enter B/L/D workspaces
              even on days with no menu saved. */}
          {deliveryToday.length > 0 && (
            <div className="space-y-2">

            {/* Date label */}
            <p className="text-[15px] font-bold text-orange-500 tracking-tight">
              {formatTodayLong(today)}
            </p>

            {/* Slot filter — horizontal pill tabs */}
            <div className="flex bg-white border border-black/[0.06] rounded-xl p-1 gap-0.5"
                 style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              {([
                { key: 'breakfast', label: 'Breakfast', emoji: MEAL_SLOT_EMOJI.breakfast },
                { key: 'lunch',     label: 'Lunch',     emoji: MEAL_SLOT_EMOJI.lunch },
                { key: 'dinner',    label: 'Dinner',    emoji: MEAL_SLOT_EMOJI.dinner },
                { key: 'all',       label: 'Full Day',  emoji: '🍱' },
              ] as const).map(f => {
                const active = slotFilter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => changeSlot(f.key)}
                    className={`flex flex-1 items-center justify-center gap-1 px-1 py-2.5 rounded-lg transition-all duration-200 active:scale-95 ${
                      active ? 'bg-orange-50' : 'bg-transparent'
                    }`}
                  >
                    <span className="hidden sm:inline text-base leading-none">{f.emoji}</span>
                    <span className={`text-[12px] sm:text-[13px] font-bold leading-none whitespace-nowrap transition-colors duration-200 ${
                      active ? 'text-orange-500' : 'text-gray-400'
                    }`}>{f.label}</span>
                  </button>
                )
              })}
            </div>

            </div>
          )}

          {/* Cook List + Packing List — stacked on mobile, side-by-side on desktop */}
          <div className="mt-3 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">

          {/* ── Cook List ─────────────────────────────────────────────── */}
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

          {/* ── Packing List ───────────────────────────────────────────── */}
          {!todayHoliday && deliveryToday.length > 0 && (
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
                    className="flex items-center gap-0.5 text-[12px] font-bold text-gray-400 active:opacity-70 transition-opacity"
                  >
                    {packingListOpen ? 'Hide' : 'View all'}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${packingListOpen ? 'rotate-180' : ''}`} />
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
      {!overCustomerLimit && safeCustomers.length === 0 && !isExpired && (
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
      {!overCustomerLimit && safeCustomers.length > 0 && (
        <main className="mx-auto mt-5 max-w-2xl px-4 lg:max-w-none lg:px-8 lg:mt-5">

          {/* Desktop two-column grid: left = operational, right = status panel */}
          <div className="lg:grid lg:gap-6 lg:items-start" style={{ gridTemplateColumns: '1fr 280px' }}>

          {/* ── Left column ── */}
          <div className="space-y-5">

          {/* ── Plan trial upgrade banner (3d / 1d warning) ── */}
          {planTrialInfo && !planTrialInfo.expired && planTrialInfo.daysLeft <= 3 && (
            <div className={`rounded-2xl px-4 py-4 flex items-center gap-3 mb-2 ${planTrialInfo.daysLeft <= 1 ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
              <span className="text-2xl shrink-0">{planTrialInfo.daysLeft <= 1 ? '🚨' : '⚠️'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black ${planTrialInfo.daysLeft <= 1 ? 'text-red-800' : 'text-amber-800'}`}>
                  {planTrialInfo.daysLeft <= 1 ? 'Trial ends today!' : `Trial ends in ${planTrialInfo.daysLeft} days`}
                </p>
                <p className={`text-xs font-semibold mt-0.5 ${planTrialInfo.daysLeft <= 1 ? 'text-red-600' : 'text-amber-600'}`}>
                  Subscribe to keep your {isBillingPlanId(planTrialInfo.plan) ? BILLING_PLANS[planTrialInfo.plan as BillingPlanId].name : planTrialInfo.plan} features.
                </p>
              </div>
              <button
                onClick={() => router.push('/settings#billing')}
                className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black text-white active:scale-95 transition-all ${planTrialInfo.daysLeft <= 1 ? 'bg-red-500' : 'bg-amber-500'}`}
              >
                Upgrade
              </button>
            </div>
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
          {!todayHoliday && <section className="mb-8">
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">

            {/* ── Card header ── */}
            <div className="px-4 py-4 border-b border-gray-100">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              {workspaceCustomers.length > 0 && (
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-1.5 sm:flex sm:items-center sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shrink-0">
                  {runCompleted && !runIsActive ? (
                    <span className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-black bg-green-100 border border-green-200 text-green-700 sm:rounded-2xl">
                      <CheckCheck className="w-3.5 h-3.5 shrink-0" /><span>Run Complete</span>
                    </span>
                  ) : (
                  <button
                    onClick={openAssignModal}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-black active:scale-95 transition-all duration-200 sm:rounded-2xl ${
                      runIsActive
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-white border border-gray-200 text-gray-700'
                    }`}
                  >
                    {runIsActive
                      ? <><Check className="w-3.5 h-3.5 shrink-0" /><span>Assigned</span></>
                      : <><Bike className="w-3.5 h-3.5" /><span>Assign Rider</span></>
                    }
                  </button>
                  )}
                  <button
                    onClick={() => setRiderModal({ area: 'All deliveries', members: workspaceCustomers })}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wide bg-orange-500 text-white shadow-[0_4px_14px_rgba(244,98,42,0.28)] active:scale-95 transition-all duration-200 sm:rounded-2xl sm:px-5"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              )}
              </div>
            </div>


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

            {/* ── Run Active: rider progress strip ── */}
            {runIsActive && deliveryTrackingEnabled && slotFilter !== 'all' && workspaceCustomers.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-green-50/40 overflow-x-auto">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-green-600 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Live
                </span>
                {riders.map(rider => {
                  const riderAssigned = assignments.some(a => a.rider_id === rider.id)
                  if (!riderAssigned) return null
                  const riderAreas = assignments.filter(a => a.rider_id === rider.id)
                  const hasFull = riderAreas.some(a => a.scope === 'full')
                  const riderCustomers = hasFull
                    ? workspaceCustomers
                    : workspaceCustomers.filter(c => riderAreas.some(a => a.scope === 'area' && a.area_name === (c.area?.trim() || 'Other')))
                  const done = riderCustomers.filter(c => deliveryStatuses[`${c.id}:${slotFilter}`] === 'delivered').length
                  const total = riderCustomers.length
                  if (total === 0) return null
                  return (
                    <div key={rider.id} className="flex items-center gap-1.5 shrink-0 bg-white rounded-xl px-2.5 py-1 border border-green-100">
                      <Bike className="w-3 h-3 text-green-600 shrink-0" />
                      <span className="text-[11px] font-bold text-gray-700 max-w-[80px] truncate">{rider.name.split(' ')[0]}</span>
                      <span className="text-[11px] font-black text-green-600">{done}/{total}</span>
                    </div>
                  )
                })}
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
                {deliveryToday.map((c, i) => {
                  const slots = customerMealSlots(c)
                  // Single-slot customer: allow clicking circle to cycle status directly.
                  // Multi-slot: circle opens detail modal (ambiguous which slot to mark).
                  const singleSlot = slots.length === 1 ? slots[0] : null
                  const allStatus: DeliveryStatus | undefined = singleSlot
                    ? (deliveryStatuses[`${c.id}:${singleSlot}`] ?? 'pending')
                    : undefined
                  return (
                    <DeliveryRow
                      key={c.id} c={c} index={i}
                      isLast={i === deliveryToday.length - 1}
                      status={allStatus}
                      onMark={singleSlot ? (s) => markDelivery(c.id, singleSlot, s) : undefined}
                      onOpen={() => setCustomerModal(c)}
                      onAddExtra={() => openExtraModal(c)}
                      pendingExtraCount={(pendingExtras[c.id] ?? []).length}
                      onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                    />
                  )
                })}
              </div>

            ) : deliveryView === 'list' ? (
              /* Slot workspace — list view */
              <div>
                {activeList.length > 0 ? (
                  activeList.map((c, i) =>
                    deliveryTrackingEnabled ? (
                      <SwipeableDeliveryRow
                        key={c.id} c={c} index={i}
                        isLast={i === activeList.length - 1 && deliveredList.length === 0 && skippedList.length === 0}
                        status={deliveryStatuses[`${c.id}:${slotFilter}`] ?? 'pending'}
                        onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                        bulkMode={bulkMode} selected={selectedIds.has(c.id)}
                        onToggleSelect={() => toggleSelect(c.id)}
                        onOpen={() => setCustomerModal(c)}
                        onAddExtra={() => openExtraModal(c)}
                        pendingExtraCount={(pendingExtras[c.id] ?? []).length} onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                      />
                    ) : (
                      <DeliveryRow key={c.id} c={c} index={i} isLast={i === activeList.length - 1 && deliveredList.length === 0 && skippedList.length === 0} status={deliveryStatuses[`${c.id}:${slotFilter}`] ?? 'pending'} onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)} onOpen={() => setCustomerModal(c)} onAddExtra={() => openExtraModal(c)} pendingExtraCount={(pendingExtras[c.id] ?? []).length} onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })} />
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
                      className="w-full flex items-center gap-3 px-5 py-3.5 bg-green-100/80 border-y border-green-200 shadow-inner transition-colors active:bg-green-100"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 shrink-0 shadow-sm">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-green-800">Delivered customers</span>
                      <span className="rounded-full bg-white/80 border border-green-200 px-2.5 py-0.5 text-xs font-black text-green-700">{deliveredList.length}</span>
                      <span className="ml-auto mr-2 hidden sm:inline text-[11px] font-semibold text-green-600/70">tap circle to undo</span>
                      <ChevronDown className={`w-4 h-4 text-green-500 transition-transform duration-200 ${showDelivered ? 'rotate-180' : ''}`} />
                    </button>
                    {showDelivered && (
                      <div className="border-b border-green-100 bg-green-50/20">
                        {deliveredList.map((c, i) => (
                          <DeliveryRow
                            key={c.id} c={c} index={i}
                            isLast={i === deliveredList.length - 1}
                            status="delivered"
                            onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                            onOpen={() => setCustomerModal(c)}
                            onAddExtra={() => openExtraModal(c)}
                            pendingExtraCount={(pendingExtras[c.id] ?? []).length}
                            onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Skipped section — collapsible */}
                {skippedList.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowSkipped(v => !v)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 bg-amber-100/80 border-y border-amber-200 shadow-inner transition-colors active:bg-amber-100"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 shrink-0 shadow-sm">
                        <X className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-800">Skipped customers</span>
                      <span className="rounded-full bg-white/80 border border-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-700">{skippedList.length}</span>
                      <span className="ml-auto mr-2 hidden sm:inline text-[11px] font-semibold text-amber-600/70">tap circle to undo</span>
                      <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${showSkipped ? 'rotate-180' : ''}`} />
                    </button>
                    {showSkipped && (
                      <div className="border-b border-amber-100 bg-amber-50/20">
                        {skippedList.map((c, i) => (
                          <DeliveryRow
                            key={c.id} c={c} index={i}
                            isLast={i === skippedList.length - 1}
                            status="skipped"
                            onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                            onOpen={() => setCustomerModal(c)}
                            onAddExtra={() => openExtraModal(c)}
                            pendingExtraCount={(pendingExtras[c.id] ?? []).length}
                            onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

            ) : (
              /* Slot workspace — area view */
              <div className="px-4 py-4 space-y-3">
                {sortedAreas.map(([area, allMembers]) => {
                  const members = allMembers.filter(c => customerMealSlots(c).includes(slotFilter as MealSlot))
                  if (!members.length) return null
                  const getStatus = (c: Customer) => deliveryStatuses[`${c.id}:${slotFilter}`] ?? 'pending'
                  const areaPending   = deliveryTrackingEnabled ? members.filter(c => getStatus(c) === 'pending')   : members
                  const areaDelivered = deliveryTrackingEnabled ? members.filter(c => getStatus(c) === 'delivered') : []
                  const areaSkipped   = deliveryTrackingEnabled ? members.filter(c => getStatus(c) === 'skipped')   : []
                  const pendingLeft   = areaPending.length
                  const allAreaDone   = deliveryTrackingEnabled && pendingLeft === 0
                  const showDel = areaShowDelivered[area] ?? false
                  const showSkip = areaShowSkipped[area] ?? false
                  return (
                    <div key={area} className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">

                      {/* Area header */}
                      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="text-[14px] font-black text-gray-900 truncate">{area}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                            allAreaDone ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                          }`}>
                            {allAreaDone ? `${members.length} ✓` : `${pendingLeft} left`}
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

                      {/* Pending rows */}
                      {areaPending.length > 0 && (
                        <div className="divide-y divide-gray-50">
                          {areaPending.map((c, i) =>
                            deliveryTrackingEnabled ? (
                              <SwipeableDeliveryRow
                                key={c.id} c={c} index={i}
                                isLast={i === areaPending.length - 1 && areaDelivered.length === 0 && areaSkipped.length === 0}
                                hideArea
                                status="pending"
                                onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                                bulkMode={bulkMode} selected={selectedIds.has(c.id)}
                                onToggleSelect={() => toggleSelect(c.id)}
                                onOpen={() => setCustomerModal(c)}
                                onAddExtra={() => openExtraModal(c)}
                                pendingExtraCount={(pendingExtras[c.id] ?? []).length}
                                onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                              />
                            ) : (
                              <DeliveryRow key={c.id} c={c} index={i} isLast={i === areaPending.length - 1} hideArea status="pending" onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)} onOpen={() => setCustomerModal(c)} onAddExtra={() => openExtraModal(c)} pendingExtraCount={(pendingExtras[c.id] ?? []).length} onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })} />
                            )
                          )}
                        </div>
                      )}

                      {/* Delivered section — collapsible, same pattern as list view */}
                      {areaDelivered.length > 0 && (
                        <>
                          <button
                            onClick={() => setAreaShowDelivered(prev => ({ ...prev, [area]: !showDel }))}
                            className="w-full flex items-center gap-3 px-5 py-3.5 bg-green-100/80 border-y border-green-200 shadow-inner transition-colors active:bg-green-100"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 shrink-0 shadow-sm">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-green-800">Delivered customers</span>
                            <span className="rounded-full bg-white/80 border border-green-200 px-2.5 py-0.5 text-xs font-black text-green-700">{areaDelivered.length}</span>
                            <span className="ml-auto mr-2 hidden sm:inline text-[11px] font-semibold text-green-600/70">tap circle to undo</span>
                            <ChevronDown className={`w-4 h-4 text-green-500 transition-transform duration-200 ${showDel ? 'rotate-180' : ''}`} />
                          </button>
                          {showDel && (
                            <div className="border-b border-green-100 bg-green-50/20">
                              {areaDelivered.map((c, i) => (
                                <DeliveryRow
                                  key={c.id} c={c} index={i}
                                  isLast={i === areaDelivered.length - 1 && areaSkipped.length === 0}
                                  hideArea
                                  status="delivered"
                                  onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                                  onOpen={() => setCustomerModal(c)}
                                  onAddExtra={() => openExtraModal(c)}
                                  pendingExtraCount={(pendingExtras[c.id] ?? []).length}
                                  onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Skipped section — collapsible, same pattern as list view */}
                      {areaSkipped.length > 0 && (
                        <>
                          <button
                            onClick={() => setAreaShowSkipped(prev => ({ ...prev, [area]: !showSkip }))}
                            className="w-full flex items-center gap-3 px-5 py-3.5 bg-amber-100/80 border-y border-amber-200 shadow-inner transition-colors active:bg-amber-100"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 shrink-0 shadow-sm">
                              <X className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-800">Skipped customers</span>
                            <span className="rounded-full bg-white/80 border border-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-700">{areaSkipped.length}</span>
                            <span className="ml-auto mr-2 hidden sm:inline text-[11px] font-semibold text-amber-600/70">tap circle to undo</span>
                            <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${showSkip ? 'rotate-180' : ''}`} />
                          </button>
                          {showSkip && (
                            <div className="border-b border-amber-100 bg-amber-50/20">
                              {areaSkipped.map((c, i) => (
                                <DeliveryRow
                                  key={c.id} c={c} index={i}
                                  isLast={i === areaSkipped.length - 1}
                                  hideArea
                                  status="skipped"
                                  onMark={(s) => markDelivery(c.id, slotFilter as MealSlot, s)}
                                  onOpen={() => setCustomerModal(c)}
                                  onAddExtra={() => openExtraModal(c)}
                                  pendingExtraCount={(pendingExtras[c.id] ?? []).length}
                                  onViewExtras={() => setExtrasViewModal({ customer: c, extras: pendingExtras[c.id] ?? [] })}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}

                    </div>
                  )
                })}
              </div>
            )}

          </div>
          </section>}

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
                        onClick={() => changeSlot(s)}
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


            {/* ── Payment alerts — desktop right panel only ── */}
            {paymentAlerts.length > 0 && (
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    Payment Alerts
                  </p>
                  <span className="rounded-lg bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                    {paymentAlerts.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {paymentAlerts.map((c) => {
                    const alertPrice = c.price_per_month
                    const alertBS    = computeBalance({ balance: c.balance, creditLimit: c.credit_limit, monthlyPrice: alertPrice })
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{c.name}</p>
                          <p className="text-[11px] font-semibold mt-0.5">
                            <span className={`${alertBS.state === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                              {alertBS.daysLeft <= 0 ? 'Overdue' : `${fmtDays(alertBS.daysLeft)} left`}
                            </span>
                            {c.area && <span className="text-gray-400 ml-1">· {c.area}</span>}
                          </p>
                        </div>
                        <a
                          href={reminderLink(c)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-green-500 text-white shadow-sm hover:bg-green-600 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" fill="currentColor" />
                        </a>
                      </div>
                    )
                  })}
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
      {!overCustomerLimit && deliveryTrackingEnabled && bulkMode && selectedIds.size > 0 && (
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

      {/* ── Cancellation notifications dropdown (anchored to bell button) ── */}
      {cancelBellOpen && bellDropPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCancelBellOpen(false)} />
          <div
            className="fixed z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{ top: bellDropPos.top, right: bellDropPos.right }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-600" />
                <p className="text-sm font-black text-gray-900">Notifications</p>
                {notifications.length > 0 && (
                  <span className="flex items-center justify-center h-5 px-1.5 rounded-full bg-red-100 text-red-600 text-[10px] font-black">
                    {notifications.length}
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
                  onClick={() => setCancelBellOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 px-5 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-sm font-bold text-gray-400">All clear — no pending notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map(n => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onDismiss={() => dismissOne(n.id)}
                      onClose={() => setCancelBellOpen(false)}
                      onResolve={n.type === 'cancellation_request' ? async (action) => {
                        setNotifications(prev => prev.filter(x => x.id !== n.id))
                        const result = await resolveCancellation(n.id, action)
                        if (!result.ok) {
                          setNotifications(prev => [n, ...prev])
                        }
                      } : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Undo snackbar ── */}
      {!overCustomerLimit && undoSnackbar && !bulkMode && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 lg:left-[220px] z-40 px-4 pointer-events-none">
          <div className="mx-auto max-w-2xl lg:flex lg:justify-end">
            <div className="flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl pointer-events-auto lg:w-auto lg:min-w-[260px]">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${undoSnackbar.action === 'Delivered' ? 'text-green-400' : 'text-amber-400'}`}>
                {undoSnackbar.action === 'Delivered' ? '✓' : '—'} {undoSnackbar.name}
                <span className="opacity-60">{MEAL_SLOT_EMOJI[undoSnackbar.slot]}</span>
              </span>
              <div className="flex-1" />
              <div className="h-4 w-px bg-gray-700" />
              <button
                onClick={handleUndo}
                className="text-xs font-bold text-gray-400 hover:text-white transition-colors px-1"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomerLimitModal && overCustomerLimit && (
        <CustomerLimitModal
          currentPlan={customerLimitPlan}
          currentCustomerCount={customers.length}
          manageCustomersButton
          blocking
        />
      )}

      {/* ── Plan trial ended modal (shown once after downgrade) ── */}
      {showTrialEndedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6">
            <div className="text-4xl text-center mb-3">⏰</div>
            <h2 className="text-center text-lg font-black text-gray-900 mb-1">Your trial has ended</h2>
            <p className="text-center text-sm text-gray-500 mb-6">
              Your paid plan trial has expired and you&apos;ve been moved back to the free plan. Subscribe to keep all your features.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { setShowTrialEndedModal(false); router.push('/settings#billing') }}
                className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white active:scale-95 transition-all"
              >
                See plans & subscribe
              </button>
              <button
                onClick={() => setShowTrialEndedModal(false)}
                className="w-full rounded-2xl border border-gray-200 py-3.5 text-sm font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                Stay on free plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer quick-view modal ── */}
      {customerModal && (() => {
        const c = customerModal
        const plan       = customerPlan(c)
        const modalPrice = plan?.monthly_price ?? c.price_per_month
        const modalBS    = computeBalance({ balance: c.balance, creditLimit: c.credit_limit, monthlyPrice: modalPrice })
        const balanceClass = modalBS.state === 'good'
          ? 'bg-green-50 text-green-700 border-green-200'
          : modalBS.state === 'low'
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
                    <p className="text-base font-black leading-none">{fmtRupees(c.balance)}</p>
                    <p className="text-[10px] font-bold mt-0.5">
                      {modalBS.daysLeft > 0 ? `${fmtDays(modalBS.daysLeft)} left` : 'overdue'}
                    </p>
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

      {/* ── Assign Rider modal ── */}
      {assignModal && (() => {
        // ── Draft helpers — operate on draftAssignments only, no API calls ──
        // API calls happen only when "Start Deliveries" is pressed.
        function getDraftRider(areaKey: string): typeof draftAssignments[0] | undefined {
          return draftAssignments.find(a => a.scope === 'area' && a.area_name === areaKey)
            ?? draftAssignments.find(a => a.scope === 'full')
        }
        function getYdHint(areaKey: string | null): string | null {
          if (yesterdayAssignments.length === 0) return null
          const yd = areaKey
            ? yesterdayAssignments.find(a => a.scope === 'area' && a.area_name === areaKey)
                ?? yesterdayAssignments.find(a => a.scope === 'full')
            : yesterdayAssignments.find(a => a.scope === 'full')
          return yd ? yd.rider_name : null
        }
        function draftAssignRow(scope: 'full' | 'area', areaKey: string | null, riderId: string) {
          const rider = riders.find(r => r.id === riderId)
          setDraftAssignments(prev => [
            ...prev.filter(a => !(a.scope === scope && (scope === 'full' || a.area_name === areaKey))),
            { id: `draft-${riderId}-${scope}-${areaKey}`, rider_id: riderId, rider_name: rider?.name ?? '', scope, area_name: areaKey },
          ])
          // Keep rows expanded after selecting a rider
        }
        function draftUnassignRow(scope: 'full' | 'area', areaKey: string | null) {
          setDraftAssignments(prev => prev.filter(a =>
            scope === 'full' ? a.scope !== 'full' : !(a.scope === 'area' && a.area_name === areaKey)
          ))
          // Keep rows expanded after removing a rider
        }
        function reuseYesterday() {
          setDraftAssignments(prev => {
            const next = [...prev]
            for (const ya of yesterdayAssignments) {
              const already = next.some(a => a.rider_id === ya.rider_id && a.scope === ya.scope && a.area_name === ya.area_name)
              if (!already) next.push({ id: `draft-${ya.rider_id}-${ya.scope}-${ya.area_name}`, rider_id: ya.rider_id, rider_name: ya.rider_name, scope: ya.scope, area_name: ya.area_name })
            }
            return next
          })
        }
        function autoAssign() {
          setDraftAssignments(prev => {
            const next = [...prev]
            for (const [area] of sortedAreas) {
              const already = next.some(a => (a.scope === 'area' && a.area_name === area) || a.scope === 'full')
              if (already) continue
              const hint = getYdHint(area)
              if (hint) {
                const rider = riders.find(r => r.name === hint)
                if (rider) next.push({ id: `draft-${rider.id}-area-${area}`, rider_id: rider.id, rider_name: rider.name, scope: 'area', area_name: area })
              }
            }
            if (sortedAreas.length === 0 && next.length === 0 && yesterdayAssignments.length > 0) {
              const ya = yesterdayAssignments.find(a => a.scope === 'full')
              if (ya) next.push({ id: `draft-${ya.rider_id}-full-null`, rider_id: ya.rider_id, rider_name: ya.rider_name, scope: 'full', area_name: null })
            }
            return next
          })
        }
        // Commit draft → make API calls → update committed assignments → close
        function commitRun(overrideDraft?: typeof draftAssignments) {
          const draft = overrideDraft ?? draftAssignments
          if (draft.length === 0) {
            setNoAssignFlash(true)
            setTimeout(() => setNoAssignFlash(false), 1200)
            return
          }
          // Optimistically commit
          setAssignments(draft)
          setAssignModal(false)
          setPickerOpen(new Set())
          // Remove stale assignments (in committed but not in draft) — retry, idempotent
          // Always send composite key fields alongside assignment_id so the API can fall back
          // to a composite-key delete if the ID is still a draft string (race condition guard).
          assignments.filter(a => !draft.some(d => d.rider_id === a.rider_id && d.scope === a.scope && d.area_name === a.area_name))
            .forEach(a => fetchWithRetry(() => fetch('/api/rider/unassign', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignment_id: a.id, rider_id: a.rider_id, assignment_date: today, scope: a.scope, area_name: a.area_name }) }))
              .catch(err => console.warn('[commitRun] unassign failed after retries:', err)))
          // Add new assignments (in draft but not in committed) — retry, upsert-safe
          draft.filter(d => !assignments.some(a => a.rider_id === d.rider_id && a.scope === d.scope && a.area_name === d.area_name))
            .forEach(d => {
              fetchWithRetry(() => fetch('/api/rider/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rider_id: d.rider_id, assignment_date: today, scope: d.scope, area_name: d.area_name }) }))
                .then(async res => {
                  if (res.ok) {
                    const { assignment } = await res.json()
                    setAssignments(prev => prev.map(a => a.id === d.id ? { ...a, id: assignment.id } : a))
                  }
                }).catch(err => console.warn('[commitRun] assign failed after retries:', err))
            })
        }

        const dispatchRows: { key: string; label: string; count: number; scope: 'full' | 'area'; areaKey: string | null }[] =
          runGrouping === 'area'
            ? sortedAreas.map(([area, members]) => ({
                key: area, label: area, count: members.length, scope: 'area', areaKey: area,
              }))
            : [{ key: 'full', label: 'All deliveries', count: deliveryToday.length, scope: 'full', areaKey: null }]

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-[calc(1rem+env(safe-area-inset-top))]">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => { setAssignModal(false); setPickerOpen(new Set()) }} />
            <div className="relative z-10 w-full max-w-md animate-in fade-in-0 zoom-in-95 duration-200">
              <div className="max-h-[min(82vh,720px)] rounded-[2rem] bg-white shadow-2xl border border-white/80 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      {runIsActive && <span className="w-2 h-2 rounded-full bg-green-500" />}
                      <p className="text-base font-black text-gray-900">
                        {runIsActive ? 'Rider Assignment' : 'Assign Rider'}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-gray-400 mt-0.5">
                      {deliveryToday.length} deliveries today
                      {runIsActive && <span className="ml-1 text-green-600 font-bold">· Active</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Grouping toggle */}
                    <div className="flex items-center bg-gray-100 rounded-xl p-0.5 gap-0.5">
                      <button
                        onClick={() => { setRunGrouping('list'); setPickerOpen(new Set()) }}
                        className={`flex items-center gap-1 rounded-[9px] px-2.5 py-1.5 text-[11px] font-bold transition-all ${runGrouping === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                      >
                        <List className="w-3 h-3" />List
                      </button>
                      <button
                        onClick={() => { setRunGrouping('area'); setPickerOpen(new Set()) }}
                        className={`flex items-center gap-1 rounded-[9px] px-2.5 py-1.5 text-[11px] font-bold transition-all ${runGrouping === 'area' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                      >
                        <MapPin className="w-3 h-3" />Area
                      </button>
                    </div>
                    <button
                      onClick={() => { setAssignModal(false); setPickerOpen(new Set()) }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-95 transition-all shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick actions */}
                {riders.length > 0 && (yesterdayAssignments.length > 0 || riders.length > 0) && (
                  <div className="flex items-center gap-2 px-5 pb-3 shrink-0">
                    {yesterdayAssignments.length > 0 && (
                      <button
                        onClick={reuseYesterday}
                        className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />Reuse Yesterday
                      </button>
                    )}
                    {yesterdayAssignments.length > 0 && runGrouping === 'area' && (
                      <button
                        onClick={autoAssign}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-50 border border-orange-100 px-3 py-1.5 text-[11px] font-bold text-orange-600 hover:bg-orange-100 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Zap className="w-3 h-3" />Auto Assign
                      </button>
                    )}
                  </div>
                )}

                <div className="h-px bg-gray-100 shrink-0" />

                {/* Dispatch rows */}
                <div className="overflow-y-auto overscroll-contain flex-1">
                  {riders.length === 0 ? (
                    <div className="px-5 py-6 space-y-4">
                      {/* Nudge */}
                      <div className="flex items-start gap-3 rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3.5">
                        <Bike className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-black text-gray-800">No riders added yet</p>
                          <p className="text-xs font-medium text-gray-500 mt-0.5">Add your first delivery rider below to start assigning routes.</p>
                        </div>
                      </div>

                      {/* Quick-add form */}
                      <div className="space-y-2.5">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Quick add rider</p>
                        <input
                          type="text"
                          value={quickRiderName}
                          onChange={e => { setQuickRiderName(e.target.value); setQuickRiderError('') }}
                          placeholder="Rider name"
                          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 placeholder:text-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                        />
                        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 overflow-hidden focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
                          <span className="text-sm font-bold text-gray-400 shrink-0 py-3">+91</span>
                          <div className="w-px h-4 bg-gray-200 shrink-0" />
                          <input
                            type="tel"
                            inputMode="numeric"
                            maxLength={10}
                            value={quickRiderPhone}
                            onChange={e => { setQuickRiderPhone(e.target.value.replace(/\D/g, '')); setQuickRiderError('') }}
                            placeholder="WhatsApp number"
                            className="flex-1 py-3 text-sm font-semibold text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
                          />
                        </div>
                        {quickRiderError && (
                          <p className="text-xs font-semibold text-red-500 px-1">{quickRiderError}</p>
                        )}
                        <button
                          onClick={quickAddRider}
                          disabled={quickRiderSaving || !quickRiderName.trim() || quickRiderPhone.replace(/\D/g,'').length < 10}
                          className="w-full rounded-2xl bg-orange-500 py-3 text-sm font-black text-white shadow-md shadow-orange-200 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                          {quickRiderSaving ? 'Adding…' : '+ Add Rider'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {dispatchRows.map(row => {
                        const assigned = getDraftRider(row.key)
                        const hint = getYdHint(row.areaKey)
                        // Empty set = fresh open = all rows expanded by default
                        const isOpen = pickerOpen.size === 0 ? true : pickerOpen.has(row.key)

                        const flashUnassigned = noAssignFlash && !assigned
                        return (
                          <div key={row.key}>
                            <div
                              className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${flashUnassigned ? 'bg-red-50/60 animate-pulse' : 'active:bg-gray-50'}`}
                              onClick={() => {
                                // Build explicit set from all row keys then toggle this one
                                const allKeys = new Set(dispatchRows.map(r => r.key))
                                if (pickerOpen.size === 0) {
                                  // Currently all-open (default) — close just this row
                                  allKeys.delete(row.key)
                                  setPickerOpen(allKeys)
                                } else {
                                  const next = new Set(pickerOpen)
                                  if (next.has(row.key)) next.delete(row.key)
                                  else next.add(row.key)
                                  setPickerOpen(next)
                                }
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-black text-gray-900 truncate">{row.label}</p>
                                <p className="text-[11px] font-semibold text-gray-400 mt-0.5">
                                  {row.count} deliver{row.count === 1 ? 'y' : 'ies'}
                                  {hint && !assigned && !flashUnassigned && (
                                    <span className="ml-1.5 text-gray-300">· Usually {hint.split(' ')[0]}</span>
                                  )}
                                  {flashUnassigned && (
                                    <span className="ml-1.5 text-red-400 font-bold">← tap to assign a rider</span>
                                  )}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {assigned ? (
                                  <>
                                    <span className="flex items-center gap-1.5 rounded-xl bg-orange-50 border border-orange-100 px-2.5 py-1">
                                      <Bike className="w-3 h-3 text-orange-500 shrink-0" />
                                      <span className="text-[11px] font-bold text-gray-800 max-w-[80px] truncate">
                                        {assigned.rider_name}
                                      </span>
                                    </span>
                                    {/* Quick per-area / per-row cancel — stop propagation so the row picker doesn't toggle */}
                                    <button
                                      onClick={e => { e.stopPropagation(); draftUnassignRow(row.scope, row.areaKey) }}
                                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 active:scale-90 transition-all shrink-0"
                                      title="Cancel assignment"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </>
                                ) : (
                                  <span className={`text-[11px] font-semibold rounded-xl border border-dashed px-2.5 py-1 ${flashUnassigned ? 'border-red-300 text-red-400 bg-red-50' : 'border-gray-200 text-gray-300'}`}>
                                    Unassigned
                                  </span>
                                )}
                                {isOpen
                                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                  : <ChevronDown className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                }
                              </div>
                            </div>

                            {/* Inline rider picker */}
                            {isOpen && (
                              <div className="px-5 pb-3 bg-gray-50/60">
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {riders.map(rider => {
                                    const isAssigned = assigned?.rider_id === rider.id
                                    const wasYesterday = hint === rider.name && !isAssigned
                                    return (
                                      <button
                                        key={rider.id}
                                        onClick={() => isAssigned
                                          ? draftUnassignRow(row.scope, row.areaKey)
                                          : draftAssignRow(row.scope, row.areaKey, rider.id)
                                        }
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                                          isAssigned
                                            ? 'bg-orange-500 text-white'
                                            : wasYesterday
                                              ? 'bg-orange-50 border border-orange-200 text-orange-700'
                                              : 'bg-white border border-gray-200 text-gray-700 hover:border-orange-200 hover:text-orange-600'
                                        }`}
                                      >
                                        {isAssigned && <Check className="w-3 h-3" />}
                                        {rider.name.split(' ')[0]}
                                        {wasYesterday && !isAssigned && <span className="text-orange-400 font-semibold text-[10px]">yday</span>}
                                      </button>
                                    )
                                  })}
                                  {assigned && (
                                    <button
                                      onClick={() => draftUnassignRow(row.scope, row.areaKey)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-gray-400 border border-gray-200 bg-white hover:border-red-200 hover:text-red-500 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                      <X className="w-3 h-3" />Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {riders.length > 0 && (() => {
                  // Dirty check: has the user changed anything vs committed assignments?
                  const hasDraftChanges =
                    assignments.some(a => !draftAssignments.some(d => d.rider_id === a.rider_id && d.scope === a.scope && d.area_name === a.area_name)) ||
                    draftAssignments.some(d => !assignments.some(a => a.rider_id === d.rider_id && a.scope === d.scope && a.area_name === d.area_name))
                  return (
                  <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
                    {noAssignFlash && draftAssignments.length === 0 && (
                      <p className="text-center text-xs font-bold text-red-500 animate-pulse">
                        Assign a rider to each row first ↑
                      </p>
                    )}
                    {runIsActive ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr' }} className="gap-2">
                        <button
                          onClick={stopRun}
                          className="rounded-2xl border border-red-200 bg-red-50 py-3.5 text-sm font-black text-red-600 active:scale-[0.98] transition-all hover:bg-red-100"
                        >
                          Cancel All
                        </button>
                        <button
                          onClick={() => commitRun()}
                          disabled={!hasDraftChanges}
                          className="rounded-2xl bg-green-500 py-3.5 text-sm font-black text-white shadow-lg shadow-green-500/25 active:scale-[0.98] transition-all disabled:opacity-40 disabled:shadow-none disabled:cursor-default"
                        >
                          ✓ Update Assignment
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          // Auto-assign single rider if nothing staged yet
                          if (draftAssignments.length === 0 && riders.length === 1) {
                            const rider = riders[0]
                            commitRun([{ id: `draft-${rider.id}-full-null`, rider_id: rider.id, rider_name: rider.name, scope: 'full', area_name: null }])
                            return
                          }
                          commitRun()
                        }}
                        className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                  )
                })()}

              </div>
            </div>
          </div>
        )
      })()}

      </div>{/* end scrollable content */}

      <BottomNav />

      {/* ── View Extras modal ───────────────────────────────────────────── */}
      {extrasViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Pending Extras</p>
                <h2 className="text-lg font-black text-gray-900 leading-tight mt-0.5">{extrasViewModal.customer.name}</h2>
              </div>
              <button onClick={() => setExtrasViewModal(null)} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Extras list */}
            <div className="px-6 pt-4 pb-2 max-h-[50vh] overflow-y-auto">
              {extrasViewModal.extras.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No extras added yet.</p>
              ) : (
                <div className="space-y-2">
                  {extrasViewModal.extras.map((extra, i) => (
                    <div key={extra.id ?? i} className="flex items-start gap-3 rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{extra.item}</p>
                        {extra.note && <p className="text-xs font-medium text-gray-400 mt-0.5">{extra.note}</p>}
                      </div>
                      {extra.amount > 0 && (
                        <span className="text-sm font-black text-orange-600 shrink-0">₹{extra.amount}</span>
                      )}
                    </div>
                  ))}
                  {/* Total */}
                  {extrasViewModal.extras.some(e => e.amount > 0) && (
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total</span>
                      <span className="text-base font-black text-orange-600">
                        ₹{extrasViewModal.extras.reduce((s, e) => s + (e.amount || 0), 0)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-6 pt-2 pb-6">
              <button
                type="button"
                onClick={() => {
                  const c = extrasViewModal.customer
                  setExtrasViewModal(null)
                  openExtraModal(c)
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-orange-200 bg-orange-50 py-3.5 text-sm font-bold text-orange-600 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" /> Add more
              </button>
              <button
                type="button"
                onClick={() => setExtrasViewModal(null)}
                className="flex-1 rounded-2xl border border-gray-200 py-3.5 text-sm font-bold text-gray-500 active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Extra bottom sheet ───────────────────────────────────────── */}
      {extraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">Add Extra</p>
                <h2 className="text-lg font-black text-gray-900 leading-tight mt-0.5">{extraModal.name}</h2>
              </div>
              <button onClick={() => setExtraModal(null)} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitExtra} className="px-6 pb-6 space-y-4">
              {/* Preset chips */}
              {extraPresets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extraPresets.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setExtraItem(preset.name)
                        setExtraAmount(String(preset.amount || ''))
                      }}
                      className={`rounded-2xl border px-3 py-1.5 text-xs font-bold transition-all ${
                        extraItem === preset.name
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300'
                      }`}
                    >
                      {preset.name}{preset.amount ? ` · ₹${preset.amount}` : ''}
                    </button>
                  ))}
                </div>
              )}

              {/* Item name */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Item *</label>
                <input
                  required
                  value={extraItem}
                  onChange={e => setExtraItem(e.target.value)}
                  placeholder="e.g. Extra Chapati, Paneer, Chicken…"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Amount (₹) — optional</label>
                <input
                  type="number"
                  min="0"
                  value={extraAmount}
                  onChange={e => setExtraAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {/* Note */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Note — optional</label>
                <input
                  value={extraNote}
                  onChange={e => setExtraNote(e.target.value)}
                  placeholder="e.g. customer requested"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {extraError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{extraError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setExtraModal(null)}
                  className="flex-1 rounded-2xl border border-gray-200 py-3.5 text-sm font-bold text-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={extraSaving || !extraItem.trim()}
                  className="flex-1 rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-sm disabled:opacity-50"
                >
                  {extraSaving ? 'Saving…' : 'Add Extra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── More / Help panel (mobile, slides in from left) ── */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${moreOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        {/* Scrim */}
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${moreOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMoreOpen(false)}
        />
        {/* Panel */}
        <div
          className={`absolute inset-y-0 left-0 w-[85vw] max-w-sm bg-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${moreOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4 border-b border-gray-100">
            <button
              onClick={() => setMoreOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 active:scale-95 transition-transform shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-base font-black text-gray-900 leading-none truncate">{providerName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Kitchen Admin</p>
            </div>
          </div>

          {/* Items */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <Link
              href="/help"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <HelpCircle className="w-5 h-5 text-blue-500" />
              </div>
              <span className="text-[15px] font-semibold text-gray-900">FAQs & Help</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
            </Link>

            <Link
              href="/settings#referral"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50">
                <Gift className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1 text-left">
                <span className="text-[15px] font-semibold text-gray-900 block">Refer a Friend</span>
                <span className="text-[11px] text-purple-500 font-semibold">You both get 15 days free 🎁</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </Link>

            <a
              href="mailto:rutvik.pansare@gmail.com"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50">
                <Phone className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-[15px] font-semibold text-gray-900">Contact Support</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
            </a>

            <Link
              href="/report"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <Flag className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-[15px] font-semibold text-gray-900">Report a Problem</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
            </Link>
          </nav>

          {/* Sign out */}
          <div className="px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 border-t border-gray-100">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-red-500 hover:bg-red-50 active:scale-[0.98] transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <LogOut className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-[15px] font-semibold">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
