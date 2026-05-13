'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import { CreditCard, PartyPopper, CheckCircle2, MessageCircle, Plus, Send } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  name: string
  whatsapp_number: string
  area: string | null
  plan_type: string
  price_per_month: number
  balance_days: number
  status: string
}

interface PaymentWithCustomer {
  id: string
  customer_id: string
  provider_id: string
  amount: number
  recorded_at: string
  notes: string | null
  customers: {
    id: string
    name: string
    whatsapp_number: string
    area: string | null
  } | null
}

interface Provider {
  id: string
  name: string
  upi_id: string | null
  phone: string | null
}

interface Props {
  providerId: string
  provider: Provider | null
  initialCustomers: Customer[]
  initialPayments: PaymentWithCustomer[]
}

// ── Message builders ───────────────────────────────────────────────────────

function receiptMessage(
  customerName: string,
  amount: number,
  newBalance: number,
  provider: Provider | null
): string {
  return [
    `Hi ${customerName},`,
    `Payment received: ₹${amount} ✅`,
    `Your tiffin is active for ${Math.round(newBalance)} more days.`,
    provider?.upi_id ? `UPI: ${provider.upi_id}` : null,
    `Thank you! 🙏`,
    `— ${provider?.name ?? 'Your tiffin provider'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function reminderMessage(
  customerName: string,
  balanceDays: number,
  provider: Provider | null
): string {
  return [
    `Hi ${customerName},`,
    `Your tiffin balance is running low (${balanceDays} days remaining).`,
    `Please renew to continue uninterrupted service.`,
    provider?.upi_id ? `Pay via UPI: ${provider.upi_id}` : null,
    `— ${provider?.name ?? 'Your tiffin provider'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function waLink(phone: string, message: string): string {
  return `https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

// ── Balance calculation ────────────────────────────────────────────────────
// days_added = amount / (price_per_month / 30)  →  amount × 30 / price_per_month
function daysFromAmount(amount: number, pricePerMonth: number): number {
  if (!pricePerMonth) return 0
  return Math.round((amount * 30) / pricePerMonth * 10) / 10
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function balancePill(days: number) {
  if (days > 7) return 'bg-green-50 text-green-700 border border-green-200'
  if (days >= 3) return 'bg-amber-50 text-amber-700 border border-amber-200'
  return 'bg-red-50 text-red-700 border border-red-200'
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PaymentsClient({
  providerId,
  provider,
  initialCustomers,
  initialPayments,
}: Props) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── State ──────────────────────────────────────────────────────────────

  const [tab, setTab] = useState<'recent' | 'overdue'>('recent')
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [payments, setPayments] = useState<PaymentWithCustomer[]>(initialPayments)

  // Record sheet
  const [showRecord, setShowRecord] = useState(false)
  const [selCustomerId, setSelCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordError, setRecordError] = useState('')

  // Post-payment WhatsApp CTA
  const [receiptCTA, setReceiptCTA] = useState<{
    url: string
    customerName: string
    amount: number
    newBalance: number
  } | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────

  const overdueCustomers = customers
    .filter((c) => c.status === 'active' && c.balance_days < 3)
    .sort((a, b) => a.balance_days - b.balance_days)

  const selectedCustomer = customers.find((c) => c.id === selCustomerId) ?? null
  const previewDays = selectedCustomer && amount
    ? daysFromAmount(Number(amount), selectedCustomer.price_per_month)
    : null

  // ── Record payment ──────────────────────────────────────────────────────

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) return
    setRecording(true)
    setRecordError('')

    const amountNum = Number(amount)
    const daysAdded = daysFromAmount(amountNum, selectedCustomer.price_per_month)
    const newBalance = Math.round((selectedCustomer.balance_days + daysAdded) * 10) / 10

    // 1. Insert payment
    const { data: newPayment, error: payErr } = await db
      .from('payments')
      .insert({
        customer_id: selectedCustomer.id,
        provider_id: providerId,
        amount: amountNum,
        notes: note.trim() || null,
      })
      .select()
      .single()

    if (payErr) {
      setRecordError(`Failed: ${payErr.message}`)
      setRecording(false)
      return
    }

    // 2. Update customer balance
    await db
      .from('customers')
      .update({ balance_days: newBalance })
      .eq('id', selectedCustomer.id)

    // 3. Update local state
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === selectedCustomer.id ? { ...c, balance_days: newBalance } : c
      )
    )
    setPayments((prev) => [
      {
        ...newPayment,
        customers: {
          id: selectedCustomer.id,
          name: selectedCustomer.name,
          whatsapp_number: selectedCustomer.whatsapp_number,
          area: selectedCustomer.area,
        },
      },
      ...prev,
    ])

    // 4. Build receipt CTA
    const msg = receiptMessage(selectedCustomer.name, amountNum, newBalance, provider)
    setReceiptCTA({
      url: waLink(selectedCustomer.whatsapp_number, msg),
      customerName: selectedCustomer.name,
      amount: amountNum,
      newBalance,
    })

    // 5. Reset
    setShowRecord(false)
    setSelCustomerId('')
    setAmount('')
    setNote('')
    setRecording(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-20">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-5 pb-4 pt-8 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payments</h1>
          <p className="text-xs font-medium text-orange-600/80">Record and track payments</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="flex rounded-2xl bg-white/50 p-1.5 shadow-inner border border-gray-200/50 backdrop-blur-sm gap-1">
          {(['recent', 'overdue'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                tab === t
                  ? 'bg-white text-orange-600 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-gray-100'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-white/40'
              }`}
            >
              {t === 'overdue' ? (
                <span className="flex items-center justify-center gap-1.5">
                  Overdue
                  {overdueCustomers.length > 0 && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${tab === 'overdue' ? 'bg-orange-100 text-orange-700' : 'bg-red-500 text-white shadow-sm'}`}>
                      {overdueCustomers.length}
                    </span>
                  )}
                </span>
              ) : 'Recent'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Post-payment receipt CTA ── */}
      {receiptCTA && (
        <div className="mx-auto mt-4 max-w-2xl px-4">
          <div className="flex items-center gap-3 rounded-2xl bg-green-50 border border-green-200 p-4">
            <div className="flex-1">
              <p className="text-sm font-bold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                ₹{receiptCTA.amount} recorded for {receiptCTA.customerName}
              </p>
              <p className="text-xs text-green-600">
                New balance: {receiptCTA.newBalance} days
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <a
                href={receiptCTA.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-green-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-green-600 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" /> Send receipt
              </a>
              <button
                onClick={() => setReceiptCTA(null)}
                className="text-center text-xs text-green-600 hover:text-green-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="mx-auto mt-4 max-w-2xl space-y-3 px-4">

        {/* ── Recent tab ── */}
        {tab === 'recent' && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <div className="glass-card flex flex-col items-center justify-center rounded-3xl py-16">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-50 text-green-500 shadow-inner border border-green-100/50">
                  <CreditCard className="w-10 h-10" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-bold text-gray-800">No payments recorded yet</p>
                <p className="mt-1 text-xs font-medium text-gray-400">Tap the + button below to record one</p>
              </div>
            ) : (
              <div className="glass-card overflow-hidden rounded-3xl">
                {payments.map((p, i) => (
                  <div
                    key={p.id}
                    className={`group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50/50 ${
                      i !== payments.length - 1 ? 'border-b border-gray-100/50' : ''
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600 shadow-sm border border-green-100 group-hover:scale-105 transition-transform">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                        {p.customers?.name ?? '—'}
                      </p>
                      {p.notes && (
                        <p className="truncate text-xs font-medium text-gray-500 mt-0.5">{p.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">{fmtDate(p.recorded_at)}</p>
                    </div>
                    <p className="shrink-0 text-base font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-100/50 shadow-sm">
                      ₹{p.amount}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Overdue tab ── */}
        {tab === 'overdue' && (
          <div className="space-y-3">
            {overdueCustomers.length === 0 ? (
              <div className="glass-card flex flex-col items-center justify-center rounded-3xl py-16">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-50 text-orange-400 shadow-inner border border-orange-100/50">
                  <PartyPopper className="w-10 h-10" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-bold text-gray-800">No overdue customers!</p>
                <p className="mt-1 text-xs font-medium text-gray-400">Everyone has ≥3 days balance</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overdueCustomers.map((c) => (
                  <div
                    key={c.id}
                    className="glass-card group flex items-center justify-between rounded-[1.5rem] p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 border border-red-100/50 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-8 bg-red-500/5 rounded-bl-full" />
                    <div className="relative z-10 min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 group-hover:text-red-700 transition-colors">{c.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold shadow-sm ${balancePill(c.balance_days)}`}>
                          {c.balance_days}d left
                        </span>
                        {c.area && (
                          <span className="text-xs font-medium text-gray-500">{c.area}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={waLink(
                        c.whatsapp_number,
                        reminderMessage(c.name, c.balance_days, provider)
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500 text-white shadow-[0_4px_15px_rgba(34,197,94,0.3)] transition-all duration-300 hover:bg-green-600 hover:scale-110 active:scale-95 group/btn"
                    >
                      <MessageCircle className="w-4 h-4 group-hover/btn:-translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Record Payment FAB ── */}
      <button
        onClick={() => { setShowRecord(true); setReceiptCTA(null) }}
        className="fixed bottom-[88px] right-5 z-20 flex h-[60px] w-[60px] items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] text-white shadow-[0_8px_30px_rgba(244,98,42,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20"
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} />
      </button>

      {/* ════════════════════════════════════════════════
          Record Payment Sheet
      ════════════════════════════════════════════════ */}
      {showRecord && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowRecord(false)}
          />
          <div className="relative z-10 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-10 pt-4 shadow-2xl">
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-gray-200" />
            <h2 className="mb-5 text-lg font-black text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-orange-500" /> Record Payment
            </h2>

            <form onSubmit={handleRecord} className="space-y-4">
              {/* Customer selector */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Customer *
                </p>
                <select
                  required
                  value={selCustomerId}
                  onChange={(e) => setSelCustomerId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                >
                  <option value="">Select a customer…</option>
                  {customers
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.area ? ` — ${c.area}` : ''}
                      </option>
                    ))}
                </select>
                {selectedCustomer && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Current balance:{' '}
                    <span className={`font-semibold ${
                      selectedCustomer.balance_days > 7 ? 'text-green-600'
                      : selectedCustomer.balance_days >= 3 ? 'text-amber-600'
                      : 'text-red-600'
                    }`}>
                      {selectedCustomer.balance_days}d
                    </span>
                    {' · '}₹{selectedCustomer.price_per_month}/mo
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Amount (₹) *
                </p>
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
                    This adds{' '}
                    <span className="font-bold text-green-600">+{previewDays} days</span>
                    {' '}→ new balance:{' '}
                    <span className="font-bold text-gray-700">
                      {Math.round((selectedCustomer!.balance_days + previewDays) * 10) / 10}d
                    </span>
                  </p>
                )}
              </div>

              {/* Note */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Note (optional)
                </p>
                <input
                  type="text"
                  placeholder="e.g. Cash received, UPI ref…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {recordError && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {recordError}
                </p>
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
