'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import {
  CreditCard, CheckCircle2, MessageCircle, Plus, Send,
  Phone, PartyPopper, ChevronDown, ChevronUp, IndianRupee,
  Check, Leaf, Drumstick, HandCoins,
} from 'lucide-react'
import type { Frequency, MealSlot, PlanType, SubscriptionStatus } from '@/types/database'
import { formatMealSlots } from '@/lib/meals'
import { computeMonthlyDue, DUE_COLORS, dueStateLabel, fmtRupees, type MonthlyDueSummary } from '@/lib/udhar'

// ── Types ──────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  name: string
  whatsapp_number: string
  area: string | null
  plan_type: PlanType
  price_per_month: number
  balance_days: number
  billing_type: 'prepaid' | 'monthly_settlement'
  meal_rate: number | null
  credit_limit: number | null
  meals_delivered: number
  status: string
  subscriptions?: {
    id: string
    status: SubscriptionStatus
    meal_plans?: {
      id: string
      name: string
      meal_slots: MealSlot[]
      plan_type: PlanType
      frequency: Frequency
      monthly_price: number
      status: 'active' | 'inactive'
    } | null
  }[]
}

interface MonthlyPayment {
  id: string
  customer_id: string
  amount: number
  note: string | null
  created_at: string
}

interface PaymentWithCustomer {
  id: string
  customer_id: string
  provider_id: string
  amount: number
  recorded_at: string
  notes: string | null
  customers: { id: string; name: string; whatsapp_number: string; area: string | null } | null
}

interface Provider {
  id: string
  name: string
  upi_id: string | null
  phone: string | null
  default_meal_rate: number | null
  default_credit_limit: number | null
}

interface Props {
  providerId: string
  provider: Provider | null
  initialCustomers: Customer[]
  initialPayments: PaymentWithCustomer[]
  initialMonthlyPayments: MonthlyPayment[]
}

// ── Message builders ───────────────────────────────────────────────────────

function upiDeepLink(upiId: string, name: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: String(amount),
    cu: 'INR',
    tn: note,
  })
  return `upi://pay?${params.toString()}`
}

function reminderMessage(customerName: string, balanceDays: number, monthlyPrice: number, provider: Provider | null): string {
  const providerName = provider?.name ?? 'Your tiffin provider'
  const lines: string[] = [
    `Hi ${customerName} 🙏`,
    balanceDays <= 0
      ? `Your tiffin balance has *expired*. Please renew to continue receiving meals.`
      : `Your tiffin balance is running low — only *${balanceDays} day${balanceDays !== 1 ? 's' : ''}* remaining.`,
  ]
  if (monthlyPrice > 0) {
    lines.push(`Renewal: *₹${monthlyPrice.toLocaleString('en-IN')}* for 30 days`)
  }
  if (provider?.upi_id) {
    lines.push(`Pay via UPI 👇\n*${provider.upi_id}*`)
    if (monthlyPrice > 0) {
      lines.push(upiDeepLink(provider.upi_id, providerName, monthlyPrice, 'Tiffin renewal'))
    }
  }
  lines.push(`— ${providerName}`)
  return lines.join('\n')
}

function receiptMessage(customerName: string, amount: number, newBalance: number, provider: Provider | null): string {
  return [
    `Hi ${customerName},`,
    `Payment received: ₹${amount} ✅`,
    `Your tiffin is active for ${Math.round(newBalance)} more days.`,
    provider?.upi_id ? `UPI: ${provider.upi_id}` : null,
    `Thank you! 🙏`,
    `— ${provider?.name ?? 'Your tiffin provider'}`,
  ].filter(Boolean).join('\n')
}

function waLink(phone: string, message: string): string {
  return `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

function daysFromAmount(amount: number, pricePerMonth: number): number {
  if (!pricePerMonth) return 0
  return Math.round((amount * 30) / pricePerMonth * 10) / 10
}

function activePlan(c: Customer) {
  return c.subscriptions?.find(s => s.status === 'active')?.meal_plans ?? null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const DUE_SOON_THRESHOLD = 5

// ── Component ──────────────────────────────────────────────────────────────

export default function PaymentsClient({ providerId, provider, initialCustomers, initialPayments, initialMonthlyPayments }: Props) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const defaultMealRate   = provider?.default_meal_rate   ?? 120
  const defaultCreditLimit = provider?.default_credit_limit ?? 3000

  const [customers, setCustomers]               = useState<Customer[]>(initialCustomers)
  const [payments, setPayments]                 = useState<PaymentWithCustomer[]>(initialPayments)
  const [monthlyPayments, setMonthlyPayments]   = useState<MonthlyPayment[]>(initialMonthlyPayments)

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reminder queue sheet
  const [reminderQueue, setReminderQueue] = useState<Customer[] | null>(null)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())

  // Record payment sheet
  const [showRecord, setShowRecord] = useState(false)
  const [selCustomerId, setSelCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordError, setRecordError] = useState('')

  // Post-payment receipt CTA
  const [receiptCTA, setReceiptCTA] = useState<{
    url: string; customerName: string; amount: number; newBalance: number; isMonthly?: boolean
  } | null>(null)

  // History toggle
  const [showHistory, setShowHistory] = useState(false)
  const [showMonthlyHistory, setShowMonthlyHistory] = useState(false)

  // ── Derived ────────────────────────────────────────────────────────────

  // Prepaid customers only
  const prepaidCustomers = customers.filter(c => (c.billing_type ?? 'prepaid') === 'prepaid')

  const overdue = prepaidCustomers
    .filter(c => c.status === 'active' && c.balance_days <= 0)
    .sort((a, b) => a.balance_days - b.balance_days)

  const dueSoon = prepaidCustomers
    .filter(c => c.status === 'active' && c.balance_days > 0 && c.balance_days <= DUE_SOON_THRESHOLD)
    .sort((a, b) => a.balance_days - b.balance_days)

  const urgentCustomers = [...overdue, ...dueSoon]

  // Monthly Settlement customers — compute outstanding per customer
  const monthlyPaidByCustomer = monthlyPayments.reduce<Record<string, number>>((acc, p) => {
    acc[p.customer_id] = (acc[p.customer_id] ?? 0) + p.amount
    return acc
  }, {})

  const monthlyCustomers = customers
    .filter(c => (c.billing_type ?? 'prepaid') === 'monthly_settlement' && c.status === 'active')
    .map(c => ({
      customer: c,
      due: computeMonthlyDue({
        mealsDelivered: c.meals_delivered ?? 0,
        totalPaid: monthlyPaidByCustomer[c.id] ?? 0,
        mealRate: c.meal_rate,
        creditLimit: c.credit_limit,
        defaultMealRate,
        defaultCreditLimit,
      }),
    }))
    .sort((a, b) => b.due.outstanding - a.due.outstanding)

  const monthlyCritical = monthlyCustomers.filter(x => x.due.state === 'critical')
  const monthlyDueSoon  = monthlyCustomers.filter(x => x.due.state === 'due_soon')

  const selectedCustomer   = customers.find(c => c.id === selCustomerId) ?? null
  const isSelectedMonthly  = (selectedCustomer?.billing_type ?? 'prepaid') === 'monthly_settlement'
  const selectedPrice      = selectedCustomer ? (activePlan(selectedCustomer)?.monthly_price ?? selectedCustomer.price_per_month) : 0
  const previewDays        = selectedCustomer && !isSelectedMonthly && amount
    ? daysFromAmount(Number(amount), selectedPrice)
    : null
  const selectedDue = selectedCustomer && isSelectedMonthly
    ? computeMonthlyDue({
        mealsDelivered: selectedCustomer.meals_delivered ?? 0,
        totalPaid: monthlyPaidByCustomer[selectedCustomer.id] ?? 0,
        mealRate: selectedCustomer.meal_rate,
        creditLimit: selectedCustomer.credit_limit,
        defaultMealRate,
        defaultCreditLimit,
      })
    : null

  // ── Actions ────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSectionSelect(ids: string[]) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => prev.has(id))
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  function openRecord(customerId?: string) {
    setSelCustomerId(customerId ?? '')
    if (customerId) {
      const c = customers.find(x => x.id === customerId)
      if (c) {
        if ((c.billing_type ?? 'prepaid') === 'monthly_settlement') {
          // For monthly settlement, pre-fill with the current outstanding amount
          const u = computeMonthlyDue({
            mealsDelivered: c.meals_delivered ?? 0,
            totalPaid: monthlyPaidByCustomer[c.id] ?? 0,
            mealRate: c.meal_rate,
            creditLimit: c.credit_limit,
            defaultMealRate,
            defaultCreditLimit,
          })
          setAmount(u.outstanding > 0 ? String(Math.round(u.outstanding)) : '')
        } else {
          setAmount(String(activePlan(c)?.monthly_price ?? c.price_per_month))
        }
      } else setAmount('')
    } else {
      setAmount('')
    }
    setNote('')
    setRecordError('')
    setReceiptCTA(null)
    setShowRecord(true)
  }

  function startReminderQueue(list: Customer[]) {
    setSentIds(new Set())
    setReminderQueue(list)
  }

  function markSent(id: string) {
    setSentIds(prev => new Set([...prev, id]))
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) return
    setRecording(true)
    setRecordError('')

    const amountNum = Number(amount)

    if (isSelectedMonthly) {
      // ── Monthly Settlement payment ─────────────────────────────────────
      const { data: newPay, error: payErr } = await db
        .from('monthly_payments')
        .insert({ customer_id: selectedCustomer.id, provider_id: providerId, amount: amountNum, note: note.trim() || null })
        .select()
        .single()

      if (payErr) { setRecordError(`Failed: ${payErr.message}`); setRecording(false); return }

      setMonthlyPayments(prev => [{ ...newPay }, ...prev])

      const newOutstanding = Math.max(0, (selectedDue?.outstanding ?? 0) - amountNum)
      const msg = `Hi ${selectedCustomer.name} 🙏\n₹${amountNum} received towards your monthly tab. Amount due: ₹${Math.round(newOutstanding)}.\nThank you! 🍱\n— ${provider?.name ?? 'Your tiffin provider'}`
      setReceiptCTA({ url: waLink(selectedCustomer.whatsapp_number, msg), customerName: selectedCustomer.name, amount: amountNum, newBalance: newOutstanding, isMonthly: true })
    } else {
      // ── Prepaid payment ────────────────────────────────────────────────
      const daysAdded = daysFromAmount(amountNum, activePlan(selectedCustomer)?.monthly_price ?? selectedCustomer.price_per_month)
      const newBalance = Math.round((selectedCustomer.balance_days + daysAdded) * 10) / 10

      const { data: newPayment, error: payErr } = await db
        .from('payments')
        .insert({ customer_id: selectedCustomer.id, provider_id: providerId, amount: amountNum, notes: note.trim() || null })
        .select()
        .single()

      if (payErr) { setRecordError(`Failed: ${payErr.message}`); setRecording(false); return }

      await db.from('customers').update({ balance_days: newBalance }).eq('id', selectedCustomer.id)

      setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, balance_days: newBalance } : c))
      setPayments(prev => [{
        ...newPayment,
        customers: { id: selectedCustomer.id, name: selectedCustomer.name, whatsapp_number: selectedCustomer.whatsapp_number, area: selectedCustomer.area },
      }, ...prev])

      const msg = receiptMessage(selectedCustomer.name, amountNum, newBalance, provider)
      setReceiptCTA({ url: waLink(selectedCustomer.whatsapp_number, msg), customerName: selectedCustomer.name, amount: amountNum, newBalance })
    }

    setShowRecord(false)
    setSelCustomerId(''); setAmount(''); setNote('')
    setRecording(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-5 pb-4 pt-8 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
        <div className="mx-auto max-w-2xl flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payment Center</h1>
            <p className="text-xs font-medium text-orange-600/80">
              {urgentCustomers.length === 0 && monthlyCritical.length === 0 && monthlyDueSoon.length === 0
                ? 'All customers up to date'
                : `${urgentCustomers.length + monthlyCritical.length + monthlyDueSoon.length} customer${urgentCustomers.length + monthlyCritical.length + monthlyDueSoon.length !== 1 ? 's' : ''} need attention`}
            </p>
          </div>
          {urgentCustomers.length > 0 && (
            <button
              onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()) }}
              className={`rounded-2xl px-4 py-2.5 text-xs font-bold transition-all mt-1 ${
                bulkMode
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-orange-50 text-orange-600 border border-orange-200'
              }`}
            >
              {bulkMode ? 'Done' : 'Select'}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-[104px] pb-6 space-y-5">

        {/* Summary strip */}
        {(overdue.length > 0 || dueSoon.length > 0) && (
          <div className="flex gap-2.5">
            {overdue.length > 0 && (
              <div className="flex-1 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                <p className="text-2xl font-black text-red-600 leading-none">{overdue.length}</p>
                <p className="text-[11px] font-bold text-red-400 uppercase tracking-wide mt-1">Overdue</p>
              </div>
            )}
            {dueSoon.length > 0 && (
              <div className="flex-1 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
                <p className="text-2xl font-black text-amber-600 leading-none">{dueSoon.length}</p>
                <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wide mt-1">Due Soon</p>
              </div>
            )}
            <div className="flex-1 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">
              <p className="text-2xl font-black text-gray-600 leading-none">
                {customers.filter(c => c.status === 'active' && c.balance_days > DUE_SOON_THRESHOLD).length}
              </p>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-1">Healthy</p>
            </div>
          </div>
        )}

        {/* Receipt CTA */}
        {receiptCTA && (
          <div className="flex items-center gap-3 rounded-2xl bg-green-50 border border-green-200 p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ₹{receiptCTA.amount} recorded for {receiptCTA.customerName}
              </p>
              {receiptCTA.isMonthly
                ? <p className="text-xs text-green-600 mt-0.5">Outstanding: ₹{Math.round(receiptCTA.newBalance)}</p>
                : <p className="text-xs text-green-600 mt-0.5">New balance: {receiptCTA.newBalance} days</p>
              }
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <a
                href={receiptCTA.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-green-500 px-3 py-2 text-xs font-bold text-white active:scale-95 transition-all"
              >
                <Send className="w-3.5 h-3.5" /> Send receipt
              </a>
              <button onClick={() => setReceiptCTA(null)} className="text-center text-xs text-green-600">Dismiss</button>
            </div>
          </div>
        )}

        {/* All-clear state */}
        {urgentCustomers.length === 0 && monthlyCritical.length === 0 && monthlyDueSoon.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center rounded-3xl py-16">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-50 text-green-500 shadow-inner border border-green-100/50">
              <PartyPopper className="w-10 h-10" strokeWidth={1.5} />
            </div>
            <p className="text-base font-black text-gray-800">You&apos;re all caught up!</p>
            <p className="mt-1 text-xs font-medium text-gray-400 text-center max-w-[200px]">
              No overdue or low-balance customers right now.
            </p>
          </div>
        )}

        {/* ── Overdue section ── */}
        {overdue.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-700">Overdue</h2>
                <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 border border-red-200">
                  {overdue.length}
                </span>
              </div>
              {bulkMode ? (
                <button
                  onClick={() => toggleSectionSelect(overdue.map(c => c.id))}
                  className="text-xs font-bold text-orange-500"
                >
                  {overdue.every(c => selectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
                </button>
              ) : (
                <button
                  onClick={() => startReminderQueue(overdue)}
                  className="flex items-center gap-1.5 rounded-xl bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 active:scale-95 transition-all"
                >
                  <MessageCircle className="w-3 h-3" /> Remind all
                </button>
              )}
            </div>
            <div className="rounded-[1.5rem] bg-white border border-red-100/60 shadow-sm overflow-hidden divide-y divide-gray-50">
              {overdue.map(c => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  provider={provider}
                  bulkMode={bulkMode}
                  selected={selectedIds.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onRecord={() => openRecord(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Due Soon section ── */}
        {dueSoon.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🟠</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-700">Due Soon</h2>
                <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-600 border border-amber-200">
                  {dueSoon.length}
                </span>
              </div>
              {bulkMode ? (
                <button
                  onClick={() => toggleSectionSelect(dueSoon.map(c => c.id))}
                  className="text-xs font-bold text-orange-500"
                >
                  {dueSoon.every(c => selectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
                </button>
              ) : (
                <button
                  onClick={() => startReminderQueue(dueSoon)}
                  className="flex items-center gap-1.5 rounded-xl bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 active:scale-95 transition-all"
                >
                  <MessageCircle className="w-3 h-3" /> Remind all
                </button>
              )}
            </div>
            <div className="rounded-[1.5rem] bg-white border border-amber-100/60 shadow-sm overflow-hidden divide-y divide-gray-50">
              {dueSoon.map(c => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  provider={provider}
                  bulkMode={bulkMode}
                  selected={selectedIds.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onRecord={() => openRecord(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Monthly: Limit Exceeded ── */}
        {monthlyCritical.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-red-500" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-700">Monthly · Limit Exceeded</h2>
                <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 border border-red-200">
                  {monthlyCritical.length}
                </span>
              </div>
            </div>
            <div className="rounded-[1.5rem] bg-white border border-red-100/60 shadow-sm overflow-hidden divide-y divide-gray-50">
              {monthlyCritical.map(({ customer: c, due: u }) => (
                <MonthlyRow
                  key={c.id}
                  customer={c}
                  due={u}
                  provider={provider}
                  onRecord={() => openRecord(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Monthly: Due Soon ── */}
        {monthlyDueSoon.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-amber-500" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-700">Monthly · Due Soon</h2>
                <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-600 border border-amber-200">
                  {monthlyDueSoon.length}
                </span>
              </div>
            </div>
            <div className="rounded-[1.5rem] bg-white border border-amber-100/60 shadow-sm overflow-hidden divide-y divide-gray-50">
              {monthlyDueSoon.map(({ customer: c, due: u }) => (
                <MonthlyRow
                  key={c.id}
                  customer={c}
                  due={u}
                  provider={provider}
                  onRecord={() => openRecord(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Monthly Settlement History (collapsible) ── */}
        {monthlyPayments.length > 0 && (
          <div>
            <button
              onClick={() => setShowMonthlyHistory(v => !v)}
              className="w-full flex items-center justify-between px-1 py-2"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <HandCoins className="w-3.5 h-3.5" /> Monthly Settlement History
              </span>
              {showMonthlyHistory
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showMonthlyHistory && (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                {monthlyPayments.slice(0, 25).map((p, i) => {
                  const cust = customers.find(c => c.id === p.customer_id)
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-4 px-5 py-4 ${i !== Math.min(monthlyPayments.length, 25) - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{cust?.name ?? '—'}</p>
                        {p.note && <p className="text-xs text-gray-400 truncate mt-0.5">{p.note}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(p.created_at)}</p>
                      </div>
                      <p className="text-sm font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-100 shrink-0">
                        ₹{p.amount}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Payment history (collapsible) ── */}
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="w-full flex items-center justify-between px-1 py-2"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Payment History</span>
            {showHistory
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showHistory && (
            payments.length === 0 ? (
              <div className="rounded-3xl bg-white border border-gray-100 px-5 py-8 flex flex-col items-center shadow-sm">
                <p className="text-sm font-semibold text-gray-400">No payments recorded yet</p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                {payments.slice(0, 25).map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 px-5 py-4 ${i !== Math.min(payments.length, 25) - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{p.customers?.name ?? '—'}</p>
                      {p.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{p.notes}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(p.recorded_at)}</p>
                    </div>
                    <p className="text-sm font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-100 shrink-0">
                      ₹{p.amount}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

      </main>

      {/* ── Bulk action bar ── */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] inset-x-0 z-40 px-4 pointer-events-none">
          <div className="mx-auto max-w-2xl pointer-events-auto">
            <div className="rounded-2xl bg-gray-900 text-white px-4 py-3 flex items-center gap-3 shadow-2xl">
              <p className="flex-1 text-sm font-bold">{selectedIds.size} selected</p>
              <button
                onClick={() => {
                  const selected = urgentCustomers.filter(c => selectedIds.has(c.id))
                  startReminderQueue(selected)
                  setBulkMode(false)
                  setSelectedIds(new Set())
                }}
                className="rounded-xl bg-green-500 px-4 py-2 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Remind selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        onClick={() => openRecord()}
        className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-[60px] w-[60px] items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] text-white shadow-[0_8px_30px_rgba(244,98,42,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20"
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} />
      </button>

      {/* ════════════════════════════════════════════════
          Reminder Queue Sheet
      ════════════════════════════════════════════════ */}
      {reminderQueue && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReminderQueue(null)} />
          <div className="relative z-10 rounded-t-3xl bg-white px-5 pb-10 pt-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-200 shrink-0" />
            <div className="shrink-0 mb-4">
              <h2 className="text-lg font-black text-gray-900">Send Reminders</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {reminderQueue.length} customer{reminderQueue.length !== 1 ? 's' : ''} · tap Send to open WhatsApp
              </p>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 pb-2">
              {reminderQueue.map(c => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 border transition-colors ${
                    sentIds.has(c.id) ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.balance_days <= 0 ? 'Expired' : `${c.balance_days}d left`}
                      {c.area ? ` · ${c.area}` : ''}
                    </p>
                  </div>
                  {sentIds.has(c.id) ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-green-600 shrink-0">
                      <CheckCircle2 className="w-4 h-4" /> Sent
                    </span>
                  ) : (
                    <a
                      href={waLink(c.whatsapp_number, reminderMessage(c.name, c.balance_days, activePlan(c)?.monthly_price ?? c.price_per_month, provider))}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markSent(c.id)}
                      className="flex items-center gap-1.5 rounded-xl bg-green-500 px-3 py-2 text-xs font-bold text-white active:scale-95 transition-all shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Send
                    </a>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setReminderQueue(null)}
              className="shrink-0 mt-4 w-full rounded-2xl border-2 border-gray-200 py-3.5 text-sm font-bold text-gray-500 active:scale-95 transition-all"
            >
              {sentIds.size === reminderQueue.length && reminderQueue.length > 0 ? 'All sent — Done' : 'Done'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          Record Payment Sheet
      ════════════════════════════════════════════════ */}
      {showRecord && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRecord(false)} />
          <div className="relative z-10 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-10 pt-4 shadow-2xl">
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-gray-200" />
            <h2 className="mb-5 text-lg font-black text-gray-900 flex items-center gap-2">
              {isSelectedMonthly
                ? <><HandCoins className="w-5 h-5 text-amber-500" /> Record Monthly Payment</>
                : <><CreditCard className="w-5 h-5 text-orange-500" /> Record Payment</>}
            </h2>

            <form onSubmit={handleRecord} className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Customer *</p>
                <select
                  required
                  value={selCustomerId}
                  onChange={(e) => {
                    setSelCustomerId(e.target.value)
                    const c = customers.find(x => x.id === e.target.value)
                    if (c) setAmount(String(activePlan(c)?.monthly_price ?? c.price_per_month))
                    else setAmount('')
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                >
                  <option value="">Select a customer…</option>
                  {customers.filter(c => c.status === 'active').map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.area ? ` — ${c.area}` : ''}</option>
                  ))}
                </select>
                {selectedCustomer && (
                  isSelectedMonthly && selectedDue ? (
                    <p className={`mt-1.5 text-xs font-semibold ${DUE_COLORS[selectedDue.state].text}`}>
                      Outstanding: {fmtRupees(selectedDue.outstanding)} · {dueStateLabel(selectedDue.state)}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-gray-400">
                      Current balance:{' '}
                      <span className={`font-semibold ${
                        selectedCustomer.balance_days > 7 ? 'text-green-600'
                          : selectedCustomer.balance_days >= 3 ? 'text-amber-600'
                            : 'text-red-600'
                      }`}>
                        {selectedCustomer.balance_days}d
                      </span>
                      {' · '}₹{activePlan(selectedCustomer)?.monthly_price ?? selectedCustomer.price_per_month}/mo
                    </p>
                  )
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Amount (₹) *</p>
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="e.g. 2500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                />
                {previewDays !== null && previewDays > 0 && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Adds{' '}
                    <span className="font-bold text-green-600">+{previewDays} days</span>
                    {' '}→ new balance:{' '}
                    <span className="font-bold text-gray-700">
                      {Math.round((selectedCustomer!.balance_days + previewDays) * 10) / 10}d
                    </span>
                  </p>
                )}
                {isSelectedMonthly && selectedDue && amount && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    After payment:{' '}
                    <span className="font-bold text-green-600">{fmtRupees(Math.max(0, selectedDue.outstanding - Number(amount)))}</span>
                    {' '}remaining
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Note (optional)</p>
                <input
                  type="text"
                  placeholder="e.g. Cash received, UPI ref…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {recordError && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{recordError}</p>
              )}

              <button
                type="submit"
                disabled={recording || !selCustomerId || !amount}
                className="w-full rounded-2xl bg-[#F4622A] py-3.5 text-sm font-bold text-white shadow transition hover:bg-orange-600 active:scale-95 disabled:opacity-60"
              >
                {recording ? 'Recording…' : 'Record Payment'}
              </button>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

// ── MonthlyRow ─────────────────────────────────────────────────────────────

interface MonthlyRowProps {
  customer: Customer
  due: MonthlyDueSummary
  provider: Provider | null
  onRecord: () => void
}

function MonthlyRow({ customer: c, due: u, provider, onRecord }: MonthlyRowProps) {
  const col = DUE_COLORS[u.state]
  const plan = activePlan(c)
  const reminderMsg = `Hi ${c.name} 🙏\nYour monthly tiffin tab has reached *${fmtRupees(u.outstanding)}* (${u.percentUsed}% of your ₹${u.effectiveLimit} limit).\nPlease settle soon to keep your deliveries going! 🍱\n— ${provider?.name ?? 'Your tiffin provider'}`

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-gray-900 truncate">{c.name}</p>
            <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black border ${col.bg} ${col.text}`}>
              {fmtRupees(u.outstanding)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {c.area && (
              <>
                <span className="text-xs text-gray-500">{c.area}</span>
                <span className="text-gray-300 text-xs">·</span>
              </>
            )}
            <span className={`text-xs font-semibold ${col.text}`}>{dueStateLabel(u.state)}</span>
            <span className="text-gray-300 text-xs">·</span>
            <span className="text-xs text-gray-400">{c.meals_delivered ?? 0} meals @ {fmtRupees(u.effectiveMealRate)}</span>
          </div>
          <div className="mt-2 w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full ${col.dot}`} style={{ width: `${Math.min(100, u.percentUsed)}%` }} />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <a
              href={waLink(c.whatsapp_number, reminderMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 flex-1 justify-center rounded-xl bg-green-50 border border-green-200 py-2 text-xs font-bold text-green-700 active:scale-95 transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Remind
            </a>
            <button
              onClick={onRecord}
              className="flex items-center gap-1.5 flex-1 justify-center rounded-xl bg-amber-50 border border-amber-200 py-2 text-xs font-bold text-amber-700 active:scale-95 transition-all"
            >
              <HandCoins className="w-3.5 h-3.5" /> Collect
            </button>
            <a
              href={`tel:${c.whatsapp_number}`}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 active:scale-95 transition-all shrink-0"
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CustomerRow ────────────────────────────────────────────────────────────

interface CustomerRowProps {
  customer: Customer
  provider: Provider | null
  bulkMode: boolean
  selected: boolean
  onToggle: () => void
  onRecord: () => void
}

function CustomerRow({ customer: c, provider, bulkMode, selected, onToggle, onRecord }: CustomerRowProps) {
  const isOverdue = c.balance_days <= 0
  const plan = activePlan(c)
  const planType = plan?.plan_type ?? c.plan_type

  return (
    <div
      className={`px-4 py-4 transition-colors ${selected ? 'bg-orange-50' : ''}`}
      onClick={bulkMode ? onToggle : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox in bulk mode */}
        {bulkMode && (
          <div className={`mt-0.5 w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
            selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'
          }`}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name + balance pill */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-gray-900 truncate">{c.name}</p>
            <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black border ${
              isOverdue
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {isOverdue ? 'Expired' : `${c.balance_days}d left`}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {c.area && (
              <>
                <span className="text-xs text-gray-500">{c.area}</span>
                <span className="text-gray-300 text-xs">·</span>
              </>
            )}
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              {planType === 'veg'
                ? <><Leaf className="w-3 h-3 text-emerald-500" /> Veg</>
                : <><Drumstick className="w-3 h-3 text-orange-400" /> Non-veg</>}
            </span>
            <span className="text-gray-300 text-xs">·</span>
            <span className="text-xs font-semibold text-gray-500">₹{plan?.monthly_price ?? c.price_per_month}/mo</span>
            {plan && (
              <>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-xs text-gray-400">{formatMealSlots(plan.meal_slots)}</span>
              </>
            )}
          </div>

          {/* Action buttons — hidden in bulk mode */}
          {!bulkMode && (
            <div className="flex items-center gap-2 mt-3">
              <a
                href={waLink(c.whatsapp_number, reminderMessage(c.name, c.balance_days, activePlan(c)?.monthly_price ?? c.price_per_month, provider))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 flex-1 justify-center rounded-xl bg-green-50 border border-green-200 py-2 text-xs font-bold text-green-700 active:scale-95 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Remind
              </a>
              <button
                onClick={onRecord}
                className="flex items-center gap-1.5 flex-1 justify-center rounded-xl bg-orange-50 border border-orange-200 py-2 text-xs font-bold text-orange-600 active:scale-95 transition-all"
              >
                <IndianRupee className="w-3.5 h-3.5" /> Record
              </button>
              <a
                href={`tel:${c.whatsapp_number}`}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 active:scale-95 transition-all shrink-0"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
