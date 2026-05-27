'use client'

import { useState, useTransition } from 'react'
import {
  ArrowLeft, Leaf, Drumstick, CheckCircle2, PauseCircle, XCircle,
  AlertTriangle, MessageCircle, ChevronRight, Utensils,
  BadgeCheck, Clock, RotateCcw, MapPin, ChevronDown, ChevronUp,
  Package,
} from 'lucide-react'
import type { CustomerPortalData, MenuSlot, DayMenu, SlotDelivery, DayHistory } from '@/lib/customer-token'
import { MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL, PLAN_TYPE_LABEL } from '@/lib/meals'
import {
  cutoffMessage, formatDisplayDate, formatShortDate,
  formatDayLabel, formatDayNumber, getEffectiveChangeDate,
} from '@/lib/cutoff'
import { pauseSubscription, resumeSubscription, requestCancellation } from './actions'

// ── Types ──────────────────────────────────────────────────────────────────

type Screen = 'home' | 'pause' | 'cancel'

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function balanceColor(daysLeft: number) {
  if (daysLeft > 10) return 'text-green-600'
  if (daysLeft >= 4) return 'text-amber-600'
  return 'text-red-600'
}

function balanceBarColor(daysLeft: number) {
  if (daysLeft > 10) return 'bg-green-400'
  if (daysLeft >= 4) return 'bg-amber-400'
  return 'bg-red-400'
}

function statusLabel(status: string, activePause: boolean) {
  if (activePause) return { text: 'Paused', cls: 'bg-amber-100 text-amber-700', icon: <PauseCircle className="w-3.5 h-3.5" /> }
  if (status === 'active') return { text: 'Active', cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> }
  if (status === 'paused') return { text: 'Paused', cls: 'bg-amber-100 text-amber-700', icon: <PauseCircle className="w-3.5 h-3.5" /> }
  return { text: 'Cancelled', cls: 'bg-gray-100 text-gray-600', icon: <XCircle className="w-3.5 h-3.5" /> }
}

// ── Delivery status helpers ────────────────────────────────────────────────

const SLOT_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' }
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function SlotStatusPill({ slot, status }: { slot: string; status: string }) {
  const base = 'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold'
  if (status === 'delivered') {
    return (
      <div className={`${base} bg-green-50 border border-green-200`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
        <span className="text-green-700">{SLOT_EMOJI[slot]} {SLOT_LABEL[slot]}</span>
        <span className="text-green-500 ml-0.5">✓</span>
      </div>
    )
  }
  if (status === 'skipped') {
    return (
      <div className={`${base} bg-amber-50 border border-amber-200`}>
        <XCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-amber-700">{SLOT_EMOJI[slot]} {SLOT_LABEL[slot]}</span>
        <span className="text-amber-500 ml-0.5 text-[10px] font-black">SKIP</span>
      </div>
    )
  }
  return (
    <div className={`${base} bg-gray-50 border border-gray-200`}>
      <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <span className="text-gray-500">{SLOT_EMOJI[slot]} {SLOT_LABEL[slot]}</span>
    </div>
  )
}

function TodayDeliveries({ slots }: { slots: SlotDelivery[] }) {
  const allDone = slots.every(s => s.status === 'delivered')
  const allPending = slots.every(s => s.status === 'pending')

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Today&apos;s Deliveries</p>
        {allDone && (
          <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full">All delivered 🎉</span>
        )}
        {allPending && (
          <span className="text-[10px] font-semibold text-gray-400">Not yet delivered</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map(s => (
          <SlotStatusPill key={s.slot} slot={s.slot} status={s.status} />
        ))}
      </div>
    </div>
  )
}

function HistoryRow({ day }: { day: DayHistory }) {
  const date = new Date(day.date + 'T00:00:00')
  const label = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const allDelivered = day.slots.every(s => s.status === 'delivered')

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-10 text-center shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase">{date.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
        <p className="text-sm font-black text-gray-800">{date.getDate()}</p>
        <p className="text-[10px] font-semibold text-gray-400">{date.toLocaleDateString('en-IN', { month: 'short' })}</p>
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5">
        {day.slots.map(s => (
          <span
            key={s.slot}
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              s.status === 'delivered' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {SLOT_EMOJI[s.slot]} {s.status === 'delivered' ? '✓' : '✗'}
          </span>
        ))}
      </div>
      {allDelivered && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
    </div>
  )
}

// ── Menu slot display ──────────────────────────────────────────────────────

function MenuSlotCard({ slot }: { slot: MenuSlot }) {
  const emoji = MEAL_SLOT_EMOJI[slot.slot]
  const label = MEAL_SLOT_LABEL[slot.slot]

  return (
    <div className="rounded-2xl bg-white border border-gray-100 px-4 py-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
        {emoji} {label}
      </p>
      {slot.dishes.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Menu not planned yet</p>
      ) : (
        <ul className="space-y-1.5">
          {slot.dishes.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
              <span className="mt-0.5 shrink-0 text-[10px] font-bold">
                {d.plan_type === 'veg' ? '🥦' : d.plan_type === 'nonveg' ? '🍗' : '•'}
              </span>
              <span className="font-medium">{d.dish_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Week day pill ──────────────────────────────────────────────────────────

function DayPill({ day, selected, onClick }: { day: DayMenu; selected: boolean; onClick: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const isToday = day.date === today
  const hasMenu = day.slots.some(s => s.dishes.length > 0)

  if (day.isHoliday) {
    return (
      <button
        onClick={onClick}
        className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all duration-200 shrink-0 min-w-[52px] ${
          selected
            ? 'bg-gray-200 text-gray-600 shadow-sm'
            : 'bg-gray-50 border border-gray-100 text-gray-400'
        }`}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {isToday ? 'Today' : formatDayLabel(day.date)}
        </span>
        <span className="text-base font-black leading-none">{formatDayNumber(day.date)}</span>
        <span className="text-[8px] font-black uppercase tracking-wider text-gray-400">Off</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all duration-200 shrink-0 min-w-[52px] ${
        selected
          ? 'text-white shadow-md'
          : 'bg-white border border-gray-100 text-gray-700 hover:border-orange-200'
      }`}
      style={selected ? { backgroundColor: 'var(--accent)' } : {}}
    >
      <span className={`text-[10px] font-bold uppercase tracking-wider ${selected ? 'text-orange-100' : 'text-gray-400'}`}>
        {isToday ? 'Today' : formatDayLabel(day.date)}
      </span>
      <span className="text-base font-black leading-none">{formatDayNumber(day.date)}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${hasMenu ? (selected ? 'bg-orange-200' : 'bg-orange-400') : 'bg-transparent'}`} />
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function CustomerPortalClient({
  data,
  isLoggedIn = false,
}: {
  data: CustomerPortalData
  isLoggedIn?: boolean
}) {
  const { customer, provider, subscription, weekMenu, token, todayDeliveries, deliveryHistory } = data
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedDayIdx, setSelectedDayIdx] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [ctaDismissed, setCtaDismissed] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Pause form state
  const effectiveStart = getEffectiveChangeDate(provider.cutoff_hour, provider.cutoff_tz)
  const minEndDate = addDays(effectiveStart, 0)
  const [pauseEnd, setPauseEnd] = useState(addDays(effectiveStart, 6))
  const [pauseReason, setPauseReason] = useState('')
  const [pauseResult, setPauseResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // Cancel form state
  const [cancelReason, setCancelReason] = useState('')
  const [cancelResult, setCancelResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [resumeResult, setResumeResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const isCurrentlyPaused = !!(subscription?.active_pause)
  const canPause = subscription?.status === 'active' && !isCurrentlyPaused && !subscription.pending_cancel
  const canResume = subscription && (subscription.status === 'paused' || isCurrentlyPaused)
  const canCancel = !!subscription && !subscription.pending_cancel

  function handleResume() {
    if (!canResume) return
    startTransition(async () => {
      const result = await resumeSubscription(token)
      setResumeResult(result)
    })
  }

  function handlePauseSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await pauseSubscription(token, pauseEnd, pauseReason)
      setPauseResult(result)
    })
  }

  function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await requestCancellation(token, cancelReason)
      setCancelResult(result)
    })
  }

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN: HOME
  // ════════════════════════════════════════════════════════════════════════

  if (screen === 'home') {
    const plan = subscription?.meal_plan
    const sub = subscription
    const badge = statusLabel(sub?.status ?? 'inactive', isCurrentlyPaused)
    const today = new Date().toISOString().split('T')[0]
    const todayIsHoliday = weekMenu[0]?.isHoliday ?? false
    const todayHolidayLabel = weekMenu[0]?.holidayLabel ?? null

    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* ── Header ── */}
        <div
          className="px-5 pt-10 pb-8 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
        >
          <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative mx-auto max-w-md">
            {provider.logo_url && (
              <img
                src={provider.logo_url}
                alt={provider.name}
                className="w-10 h-10 rounded-2xl object-cover mb-2 border-2 border-white/20"
              />
            )}
            <p className="text-xs font-bold text-orange-100/70 tracking-widest uppercase mb-1">
              {!provider.logo_url && '🍱 '}{provider.name}
            </p>
            <h1 className="text-2xl font-black text-white leading-tight">
              Namaste, {customer.name.split(' ')[0]} 🙏
            </h1>
            {sub && (
              <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border border-white/20 ${
                isCurrentlyPaused ? 'bg-amber-400/25 text-amber-100' :
                sub.status === 'active' ? 'bg-green-400/25 text-green-100' :
                'bg-gray-400/25 text-gray-100'
              }`}>
                {badge.icon} {badge.text}
                {sub.pending_cancel && <span className="ml-1 opacity-70">· Cancellation pending</span>}
              </div>
            )}
          </div>
        </div>

        <main className="mx-auto max-w-md px-4 pt-5 pb-20 space-y-5">

          {/* ── Resume result toast ── */}
          {resumeResult && (
            <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${resumeResult.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {resumeResult.ok ? '✅ Your subscription will resume shortly.' : resumeResult.error}
            </div>
          )}

          {/* ── Holiday banner (today is a holiday) ── */}
          {todayIsHoliday && (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center gap-3">
              <span className="text-xl shrink-0">🏖️</span>
              <div>
                <p className="text-sm font-black text-amber-800">
                  No delivery today{todayHolidayLabel ? ` · ${todayHolidayLabel}` : ''}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Your provider is off today. Deliveries resume tomorrow.</p>
              </div>
            </div>
          )}

          {/* ── No subscription state ── */}
          {!sub && (
            <div className="rounded-3xl bg-white border border-gray-100 px-5 py-8 text-center shadow-sm">
              <div className="text-4xl mb-3">🍱</div>
              <p className="font-bold text-gray-800">No active subscription</p>
              <p className="text-sm text-gray-500 mt-1">Contact your provider to get started.</p>
              {provider.phone && (
                <a
                  href={`https://wa.me/91${provider.phone.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-green-500 text-white px-5 py-3 text-sm font-bold"
                >
                  <MessageCircle className="w-4 h-4" fill="currentColor" /> WhatsApp Provider
                </a>
              )}
            </div>
          )}

          {/* ── Subscription card ── */}
          {sub && plan && (
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Your Plan</p>
                    <h2 className="text-lg font-black text-gray-900 leading-tight">{plan.name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
                      {plan.plan_type === 'veg'
                        ? <><Leaf className="w-3.5 h-3.5 text-emerald-500" /> Veg</>
                        : <><Drumstick className="w-3.5 h-3.5 text-orange-500" /> Non-veg</>
                      }
                      <span className="text-gray-300">·</span>
                      {plan.meal_slots.map(s => `${MEAL_SLOT_EMOJI[s]} ${MEAL_SLOT_LABEL[s]}`).join(' + ')}
                      <span className="text-gray-300">·</span>
                      {plan.frequency === 'daily' ? 'Daily' : 'Alternate days'}
                    </p>
                  </div>
                  <span className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${badge.cls}`}>
                    {badge.icon} {badge.text}
                  </span>
                </div>

                {/* Active pause banner */}
                {isCurrentlyPaused && sub.active_pause && (
                  <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center gap-2">
                    <PauseCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-700 font-medium">
                      Paused until <span className="font-black">{formatShortDate(sub.active_pause.end_date)}</span>
                    </p>
                  </div>
                )}

                {/* Pending cancel banner */}
                {sub.pending_cancel && (
                  <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                    <p className="text-sm text-gray-600 font-medium">Cancellation request pending — your provider will confirm.</p>
                  </div>
                )}
              </div>

              {/* Balance + price strip */}
              <div className="border-t border-gray-50 px-5 py-4 grid grid-cols-2 gap-4">
                {(() => {
                  const monthlyPrice = plan.monthly_price || customer.price_per_month || 0
                  const perDay   = monthlyPrice > 0 ? monthlyPrice / 30 : 0
                  const daysLeft = perDay > 0 ? Math.floor(customer.balance / perDay) : 0
                  return (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Balance</p>
                  <p className={`text-2xl font-black ${balanceColor(daysLeft)}`}>
                    {daysLeft <= 0 ? '0' : daysLeft}<span className="text-sm font-semibold"> days</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">₹{Math.round(Math.max(0, customer.balance))} remaining</p>
                  {daysLeft < 5 && (
                    <p className="text-xs text-red-500 font-semibold mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Running low
                    </p>
                  )}
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${balanceBarColor(daysLeft)}`}
                      style={{ width: `${Math.min((daysLeft / 30) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                  )
                })()}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Monthly</p>
                  <p className="text-2xl font-black text-gray-800">₹{plan.monthly_price.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-gray-400 mt-1">Since {new Date(sub.start_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Today's Deliveries ── */}
          {todayDeliveries.length > 0 && (
            <TodayDeliveries slots={todayDeliveries} />
          )}

          {/* ── Delivery History ── */}
          {deliveryHistory.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between gap-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-black text-gray-900 uppercase tracking-wide">Delivery History</span>
                </div>
                {showHistory
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />
                }
              </button>
              {showHistory && (
                <div className="mt-3 rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                  {deliveryHistory.slice(0, 30).map(day => (
                    <HistoryRow key={day.date} day={day} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Menu (unified day picker + dishes) ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Utensils className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                {selectedDayIdx === 0 ? "Today's Menu" : weekMenu[selectedDayIdx]
                  ? new Date(weekMenu[selectedDayIdx].date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
                  : 'Menu'}
              </h3>
            </div>

            {/* Day strip */}
            <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
              {weekMenu.map((day, idx) => (
                <DayPill
                  key={day.date}
                  day={day}
                  selected={selectedDayIdx === idx}
                  onClick={() => setSelectedDayIdx(idx)}
                />
              ))}
            </div>

            {/* Selected day dishes */}
            {weekMenu[selectedDayIdx]?.isHoliday ? (
              <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-6 text-center">
                <p className="text-3xl mb-2">🏖️</p>
                <p className="text-sm font-bold text-gray-600">
                  {weekMenu[selectedDayIdx].holidayLabel ?? 'No delivery'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Your provider is off this day.</p>
              </div>
            ) : (weekMenu[selectedDayIdx]?.slots ?? []).length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 px-4 py-5 text-center">
                <p className="text-2xl mb-1">📋</p>
                <p className="text-sm font-semibold text-gray-500">Menu not announced yet</p>
                <p className="text-xs text-gray-400 mt-0.5">Check back later or contact your provider.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {weekMenu[selectedDayIdx].slots.map(slot => (
                  <MenuSlotCard key={slot.slot} slot={slot} />
                ))}
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          {sub && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3 px-1">Actions</h3>
              <div className="space-y-2.5">

                {/* Pause */}
                {canPause && (
                  <button
                    onClick={() => { setPauseResult(null); setScreen('pause') }}
                    className="w-full flex items-center gap-3 rounded-2xl bg-white border border-amber-200 px-5 py-4 text-left hover:bg-amber-50 active:scale-[0.98] transition-all shadow-sm"
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shrink-0">
                      <PauseCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Pause Deliveries</p>
                      <p className="text-xs text-gray-400">Going on a trip or holiday?</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                )}

                {/* Resume */}
                {canResume && (
                  <button
                    onClick={handleResume}
                    disabled={isPending}
                    className="w-full flex items-center gap-3 rounded-2xl bg-white border border-green-200 px-5 py-4 text-left hover:bg-green-50 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60"
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-green-100 text-green-600 shrink-0">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Resume Deliveries</p>
                      <p className="text-xs text-gray-400">
                        Effective: {formatShortDate(getEffectiveChangeDate(provider.cutoff_hour, provider.cutoff_tz))}
                      </p>
                    </div>
                    {isPending ? (
                      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    )}
                  </button>
                )}

                {/* WhatsApp provider */}
                {(provider.support_whatsapp || provider.phone) && (
                  <a
                    href={`https://wa.me/91${(provider.support_whatsapp || provider.phone)!.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi! This is ${customer.name}. I have a query about my tiffin subscription.`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 rounded-2xl bg-white border border-green-200 px-5 py-4 text-left hover:bg-green-50 active:scale-[0.98] transition-all shadow-sm"
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-green-100 text-green-600 shrink-0">
                      <MessageCircle className="w-5 h-5" fill="currentColor" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Contact Provider</p>
                      <p className="text-xs text-gray-400">Message on WhatsApp</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </a>
                )}

                {/* Provider address */}
                {provider.address && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(provider.address)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-5 py-4 text-left hover:bg-gray-50 active:scale-[0.98] transition-all shadow-sm"
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-500 shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">View Location</p>
                      <p className="text-xs text-gray-400 truncate">{provider.address}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </a>
                )}

                {/* Cancel */}
                {canCancel && (
                  <button
                    onClick={() => { setCancelResult(null); setScreen('cancel') }}
                    className="w-full flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-5 py-4 text-left hover:bg-gray-50 active:scale-[0.98] transition-all shadow-sm"
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-gray-100 text-gray-500 shrink-0">
                      <XCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-600">Request Cancellation</p>
                      <p className="text-xs text-gray-400">Provider will confirm before cancelling</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Account CTA (non-blocking, dismissible) ── */}
          {!isLoggedIn && !ctaDismissed && (
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0 text-lg">🔐</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-gray-800">Access from any device</p>
                <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                  Create a free account to see all your tiffins in one place.
                </p>
                <a
                  href="/app"
                  className="inline-block mt-1.5 text-[11px] font-bold text-orange-500 hover:text-orange-600"
                >
                  Create account →
                </a>
              </div>
              <button
                onClick={() => setCtaDismissed(true)}
                className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="text-center pt-2 pb-4 space-y-1">
            {provider.tagline && (
              <p className="text-xs text-gray-500 font-medium">{provider.tagline}</p>
            )}
            <p className="text-xs text-gray-300 font-medium">Powered by Dabbr 🍱</p>
          </div>

        </main>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN: PAUSE
  // ════════════════════════════════════════════════════════════════════════

  if (screen === 'pause') {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-sm">
          <div className="mx-auto max-w-md flex items-center gap-3">
            <button
              onClick={() => setScreen('home')}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-black text-gray-900">Pause Deliveries</h1>
              <p className="text-xs text-orange-600/80">{provider.name}</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-md px-4 pt-6 pb-20">

          {/* Success state */}
          {pauseResult?.ok ? (
            <div className="flex flex-col items-center text-center py-12">
              <div className="w-20 h-20 rounded-3xl bg-amber-100 flex items-center justify-center text-3xl mb-5">⏸️</div>
              <h2 className="text-xl font-black text-gray-900 mb-2">Pause Confirmed</h2>
              <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                Your deliveries will pause from <strong>{formatDisplayDate(effectiveStart)}</strong> until <strong>{formatDisplayDate(pauseEnd)}</strong>.
              </p>
              <button
                onClick={() => setScreen('home')}
                className="mt-8 w-full rounded-2xl py-4 text-sm font-bold text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
              >
                Back to Home
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cutoff info */}
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  {cutoffMessage(provider.cutoff_hour, provider.cutoff_tz)}
                </p>
              </div>

              <form onSubmit={handlePauseSubmit} className="space-y-4">
                <div className="rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-5 space-y-4">

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Pause starts from</p>
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3">
                      <p className="text-sm font-black text-gray-800">{formatDisplayDate(effectiveStart)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Calculated automatically based on cutoff time</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">
                      Resume deliveries from *
                    </label>
                    <input
                      type="date"
                      required
                      min={minEndDate}
                      value={pauseEnd}
                      onChange={e => setPauseEnd(e.target.value)}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100 bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">
                      Reason (optional)
                    </label>
                    <textarea
                      placeholder="e.g. Going on vacation, medical leave…"
                      value={pauseReason}
                      onChange={e => setPauseReason(e.target.value)}
                      rows={2}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100 bg-white resize-none"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3">
                  <p className="text-sm text-orange-800 font-semibold">
                    📅 Pause: <strong>{formatShortDate(effectiveStart)}</strong> → <strong>{formatShortDate(pauseEnd)}</strong>
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">Your deliveries will automatically resume on {formatShortDate(pauseEnd)}.</p>
                </div>

                {pauseResult?.error && (
                  <p className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                    {pauseResult.error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setScreen('home')}
                    className="flex-1 rounded-2xl border border-gray-200 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 rounded-2xl bg-amber-500 py-3.5 text-sm font-bold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-60"
                  >
                    {isPending ? 'Confirming…' : 'Confirm Pause'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // SCREEN: CANCEL
  // ════════════════════════════════════════════════════════════════════════

  if (screen === 'cancel') {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-sm">
          <div className="mx-auto max-w-md flex items-center gap-3">
            <button
              onClick={() => setScreen('home')}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-black text-gray-900">Request Cancellation</h1>
              <p className="text-xs text-orange-600/80">{provider.name}</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-md px-4 pt-6 pb-20">

          {cancelResult?.ok ? (
            <div className="flex flex-col items-center text-center py-12">
              <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center text-3xl mb-5">📨</div>
              <h2 className="text-xl font-black text-gray-900 mb-2">Request Sent</h2>
              <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                Your provider has been notified. Your subscription remains active until they confirm the cancellation.
              </p>
              <button
                onClick={() => setScreen('home')}
                className="mt-8 w-full rounded-2xl py-4 text-sm font-bold text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
              >
                Back to Home
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Explanation */}
              <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-start gap-2">
                <BadgeCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                  Your subscription stays <strong>active</strong> until your provider confirms the cancellation. You can still use it in the meantime.
                </p>
              </div>

              <form onSubmit={handleCancelSubmit} className="space-y-4">
                <div className="rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">
                    Reason for cancelling (optional)
                  </label>
                  <textarea
                    placeholder="e.g. Moving to a different city, changing diet, financial reasons…"
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100 bg-white resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-2">Your feedback helps the provider improve their service.</p>
                </div>

                {cancelResult?.error && (
                  <p className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                    {cancelResult.error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setScreen('home')}
                  className="w-full rounded-2xl border-2 border-[#F4622A] py-4 text-sm font-bold text-[#F4622A] hover:bg-orange-50 active:scale-95 transition-all"
                >
                  Keep My Subscription
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-2xl bg-gray-800 py-4 text-sm font-bold text-white hover:bg-gray-900 active:scale-95 disabled:opacity-60"
                >
                  {isPending ? 'Sending…' : 'Request Cancellation'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    )
  }

  return null
}
