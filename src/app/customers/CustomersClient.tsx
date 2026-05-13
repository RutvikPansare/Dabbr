'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import {
  ArrowLeft, Search, Plus, UserPlus, UserPen, MapPin, MessageCircle,
  Pause, Play, CreditCard, Leaf, Drumstick, SearchX, Box, Smartphone,
  Edit2, ChevronRight, IndianRupee, AlertTriangle, Clock,
  CheckCircle2, XCircle, Sparkles,
} from 'lucide-react'
import type { PlanType, Frequency, CustomerStatus } from '@/types/database'

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
  meal_timing: 'lunch' | 'dinner' | 'both' | null
  price_per_month: number
  status: CustomerStatus
  balance_days: number
  pauses: Pause[]
  created_at: string
}

interface Payment {
  id: string
  amount: number
  recorded_at: string
  notes: string | null
}

type LedgerEventType =
  | 'payment'
  | 'pause_start'
  | 'pause_end'
  | 'balance_low'
  | 'delivery_delivered'
  | 'delivery_skipped'
  | 'customer_created'

interface LedgerEvent {
  id: string
  date: string          // ISO string — used for sorting & display
  type: LedgerEventType
  amount?: number       // payments only
  notes?: string | null // payments only
}

interface FormState {
  name: string
  whatsapp_number: string
  address: string
  area: string
  plan_type: PlanType
  frequency: Frequency
  meal_timing: 'lunch' | 'dinner' | 'both'
  price_per_month: string
  balance_days: string
}

interface Props {
  initialCustomers: Customer[]
  providerId: string
  initialShowAdd?: boolean
}

type Screen = 'list' | 'detail' | 'form' | 'pause' | 'payments'

// ── Constants ──────────────────────────────────────────────────────────────

const PLAN_EMOJI: Record<PlanType, React.ReactNode> = {
  veg: <Leaf className="w-3.5 h-3.5 text-emerald-500" />,
  nonveg: <Drumstick className="w-3.5 h-3.5 text-orange-500" />,
}
const PLAN_LABEL: Record<PlanType, string> = { veg: 'Veg', nonveg: 'Non-veg' }
const FREQ_LABEL: Record<Frequency, string> = { daily: 'Daily', alternate: 'Alternate' }

const EMPTY_FORM: FormState = {
  name: '',
  whatsapp_number: '',
  address: '',
  area: '',
  plan_type: 'veg',
  frequency: 'daily',
  meal_timing: 'lunch',
  price_per_month: '',
  balance_days: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function balancePillClass(days: number) {
  if (days > 7) return 'text-green-700 bg-green-50 border border-green-200'
  if (days >= 3) return 'text-amber-700 bg-amber-50 border border-amber-200'
  return 'text-red-700 bg-red-50 border border-red-200'
}

function statusBadgeClass(status: CustomerStatus) {
  return {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-amber-100 text-amber-700',
    inactive: 'bg-gray-100 text-gray-500',
  }[status]
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function CustomersClient({ initialCustomers, providerId, initialShowAdd = false }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Navigation state (single source of truth) ──────────────────────────
  const [screen, setScreen] = useState<Screen>(initialShowAdd ? 'form' : 'list')

  // ── Data state ─────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all')

  // Form
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Selected customer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Pause
  const [pauseStart, setPauseStart] = useState(today())
  const [pauseEnd, setPauseEnd] = useState(today())
  const [pauseLoading, setPauseLoading] = useState(false)

  // Payments (payment history screen)
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  // Ledger (auto timeline on detail screen)
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.area ?? '').toLowerCase().includes(q) ||
      c.whatsapp_number.includes(q)
    const matchFilter = filter === 'all' || c.status === filter
    return matchSearch && matchFilter
  })

  const counts = {
    all: customers.length,
    active: customers.filter((c) => c.status === 'active').length,
    paused: customers.filter((c) => c.status === 'paused').length,
  }

  // ── Navigation helpers ─────────────────────────────────────────────────

  function openAdd() {
    setFormMode('add')
    setFormData(EMPTY_FORM)
    setFormError('')
    setScreen('form')
  }

  function openEdit(c: Customer) {
    setFormMode('edit')
    setFormData({
      name: c.name,
      whatsapp_number: c.whatsapp_number,
      address: c.address ?? '',
      area: c.area ?? '',
      plan_type: c.plan_type,
      frequency: c.frequency,
      meal_timing: c.meal_timing ?? 'lunch',
      price_per_month: String(c.price_per_month),
      balance_days: String(c.balance_days),
    })
    setFormError('')
    setScreen('form')
  }

  async function openDetail(c: Customer) {
    setSelectedCustomer(c)
    setLedgerEvents([])
    setLedgerLoading(true)
    setScreen('detail')

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    // Fetch payments + delivery logs in parallel
    const [{ data: payData }, { data: deliveryData }] = await Promise.all([
      supabase
        .from('payments')
        .select('id, amount, recorded_at, notes')
        .eq('customer_id', c.id)
        .order('recorded_at', { ascending: false }),
      db
        .from('delivery_logs')
        .select('id, date, status')
        .eq('customer_id', c.id)
        .gte('date', cutoff.toISOString().split('T')[0])
        .order('date', { ascending: false }),
    ])

    const events: LedgerEvent[] = []

    // Payment events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of ((payData ?? []) as any[])) {
      events.push({ id: `pay-${p.id}`, date: p.recorded_at, type: 'payment', amount: p.amount, notes: p.notes })
    }

    // Pause events — one entry per boundary (start + end if elapsed)
    const todayStr = today()
    for (const pause of c.pauses) {
      events.push({ id: `ps-${pause.id}`, date: `${pause.start_date}T08:00:00`, type: 'pause_start' })
      if (pause.end_date < todayStr) {
        events.push({ id: `pe-${pause.id}`, date: `${pause.end_date}T18:00:00`, type: 'pause_end' })
      }
    }

    // Delivery events from delivery_logs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of ((deliveryData ?? []) as any[])) {
      events.push({
        id: `dl-${d.id}`,
        date: `${d.date}T12:00:00`,
        type: d.status === 'delivered' ? 'delivery_delivered' : 'delivery_skipped',
      })
    }

    // Customer created event
    if (c.created_at) {
      events.push({ id: 'customer-created', date: c.created_at, type: 'customer_created' })
    }

    // Balance low synthetic event — shown only if currently low
    if (c.balance_days < 3) {
      events.push({ id: 'balance-low', date: new Date().toISOString(), type: 'balance_low' })
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setLedgerEvents(events)
    setLedgerLoading(false)
  }

  function openPause() {
    const t = today()
    setPauseStart(t)
    setPauseEnd(t)
    setScreen('pause')
  }

  async function openPayments() {
    if (!selectedCustomer) return
    setPaymentsLoading(true)
    setScreen('payments')
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', selectedCustomer.id)
      .order('recorded_at', { ascending: false })
    setPayments(data ?? [])
    setPaymentsLoading(false)
  }

  function goBack() {
    if (screen === 'detail') setScreen('list')
    else if (screen === 'form') setScreen(formMode === 'edit' ? 'detail' : 'list')
    else if (screen === 'pause') setScreen('detail')
    else if (screen === 'payments') setScreen('detail')
    else setScreen('list')
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)
    setFormError('')

    if (formMode === 'add') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        provider_id: providerId,
        name: formData.name.trim(),
        whatsapp_number: formData.whatsapp_number.trim(),
        address: formData.address.trim() || null,
        area: formData.area.trim() || null,
        plan_type: formData.plan_type,
        frequency: formData.frequency,
        meal_timing: formData.meal_timing,
        price_per_month: Number(formData.price_per_month),
        balance_days: Number(formData.balance_days),
        status: 'active',
      }
      const { data, error } = await db
        .from('customers')
        .insert(payload)
        .select('*, pauses(*)')
        .single()

      if (error) {
        setFormError(`Error: ${error.message ?? 'Failed to add customer'}`)
      } else if (data) {
        setCustomers((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setScreen('list')
        setFormData(EMPTY_FORM)
      }
    } else {
      if (!selectedCustomer) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: any = {
        name: formData.name.trim(),
        whatsapp_number: formData.whatsapp_number.trim(),
        address: formData.address.trim() || null,
        area: formData.area.trim() || null,
        plan_type: formData.plan_type,
        frequency: formData.frequency,
        meal_timing: formData.meal_timing,
        price_per_month: Number(formData.price_per_month),
        balance_days: Number(formData.balance_days),
      }
      const { data, error } = await db
        .from('customers')
        .update(updatePayload)
        .eq('id', selectedCustomer.id)
        .select('*, pauses(*)')
        .single()

      if (error) {
        setFormError('Failed to update customer. Please try again.')
      } else if (data) {
        setCustomers((prev) =>
          prev
            .map((c) => (c.id === data.id ? data : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        void openDetail(data) // refresh ledger + selected customer
      }
    }

    setFormLoading(false)
  }

  async function handleResume() {
    if (!selectedCustomer) return
    const t = today()
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

    await db
      .from('pauses')
      .update({ end_date: yesterday })
      .eq('customer_id', selectedCustomer.id)
      .gte('end_date', t)

    await db
      .from('customers')
      .update({ status: 'active' })
      .eq('id', selectedCustomer.id)

    const updated: Customer = { ...selectedCustomer, status: 'active' }
    setCustomers((prev) => prev.map((c) => (c.id === selectedCustomer.id ? updated : c)))
    void openDetail(updated) // refresh ledger + selected customer
  }

  async function handlePauseSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) return
    setPauseLoading(true)

    await db.from('pauses').insert({
      customer_id: selectedCustomer.id,
      start_date: pauseStart,
      end_date: pauseEnd,
    })

    await db
      .from('customers')
      .update({ status: 'paused' })
      .eq('id', selectedCustomer.id)

    const newPause: Pause = {
      id: crypto.randomUUID(),
      customer_id: selectedCustomer.id,
      start_date: pauseStart,
      end_date: pauseEnd,
      reason: null,
    }
    const updated: Customer = {
      ...selectedCustomer,
      status: 'paused',
      pauses: [...selectedCustomer.pauses, newPause],
    }
    setCustomers((prev) => prev.map((c) => (c.id === selectedCustomer.id ? updated : c)))
    setPauseLoading(false)
    void openDetail(updated) // refresh ledger + selected customer
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: LIST
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'list') {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all duration-300"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight">Customers</h1>
              <p className="text-xs font-semibold text-orange-600/80">{customers.length} total</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-6 pb-32 space-y-4">

          {/* Search */}
          <div className="relative group">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-orange-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="search"
              placeholder="Search by name or area…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-modern pl-10"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex rounded-2xl bg-white/50 p-1.5 shadow-inner border border-gray-200/50 backdrop-blur-sm gap-1">
            {(['all', 'active', 'paused'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                  filter === tab
                    ? 'bg-white text-orange-600 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-gray-100'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-white/40'
                }`}
              >
                {tab}
                <span
                  className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] ${
                    filter === tab ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {counts[tab]}
                </span>
              </button>
            ))}
          </div>

          {/* Empty state */}
          {customers.length === 0 && (
            <div className="glass-card flex flex-col items-center rounded-3xl px-6 py-14 text-center mt-8">
              <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-50 to-orange-100 shadow-inner border border-orange-200/50 text-orange-500">
                <Box className="w-10 h-10" strokeWidth={2} />
              </div>
              <p className="text-lg font-black text-gray-800 tracking-tight">No customers yet</p>
              <p className="mt-2 text-sm font-medium text-gray-500 max-w-[200px]">
                Tap the <span className="font-black text-orange-500">+</span> button below to add your first customer.
              </p>
            </div>
          )}

          {/* Search no results */}
          {customers.length > 0 && filtered.length === 0 && (
            <div className="glass-card flex flex-col items-center justify-center rounded-3xl py-12 text-gray-400">
              <SearchX className="mb-3 w-10 h-10 opacity-50" strokeWidth={1.5} />
              <p className="text-sm font-bold">No customers match your search</p>
            </div>
          )}

          {/* Customer list */}
          {filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openDetail(c)}
                  className="group relative w-full rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 text-left transition-all duration-300 hover:shadow-md hover:border-orange-200 active:scale-[0.98] overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-500 opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-900 text-base leading-tight group-hover:text-orange-600 transition-colors">
                          {c.name}
                        </span>
                        <span className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(c.status)}`}>
                          {c.status}
                        </span>
                      </div>
                      <p className="mt-1.5 flex items-center text-xs font-medium text-gray-500">
                        {c.area ? <span className="text-gray-600 mr-1.5">{c.area} •</span> : ''}
                        <span className="flex items-center gap-1">
                          {PLAN_EMOJI[c.plan_type]} {PLAN_LABEL[c.plan_type]} • {FREQ_LABEL[c.frequency]}
                        </span>
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-400 group-hover:text-gray-500">
                        <Smartphone className="w-3 h-3" /> {c.whatsapp_number}
                      </p>
                    </div>
                    <div className="shrink-0 text-right flex flex-col items-end gap-2">
                      <span className={`rounded-xl px-3 py-1.5 text-xs font-black shadow-sm ${balancePillClass(c.balance_days)}`}>
                        {c.balance_days}d left
                      </span>
                      <p className="text-xs font-bold text-gray-400 group-hover:text-gray-600">₹{c.price_per_month}/mo</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* FAB */}
        <button
          onClick={openAdd}
          className="fixed bottom-[88px] right-5 z-20 flex h-[60px] w-[60px] items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] text-white shadow-[0_8px_30px_rgba(244,98,42,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20"
          aria-label="Add customer"
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </button>

        <BottomNav />
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: DETAIL
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'detail' && selectedCustomer) {
    const c = selectedCustomer
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              onClick={goBack}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight truncate">{c.name}</h1>
              <p className="text-xs font-semibold text-orange-600/80 capitalize">{c.status}</p>
            </div>
            <button
              onClick={() => openEdit(c)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
              aria-label="Edit customer"
            >
              <Edit2 className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-6 pb-32 space-y-4">

          {/* Status + info header card */}
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${statusBadgeClass(c.status)}`}>
                {c.status}
              </span>
              <span className="text-xs text-gray-400">
                {PLAN_LABEL[c.plan_type]} • {FREQ_LABEL[c.frequency]}
                {c.meal_timing && c.meal_timing !== 'lunch' && ` • ${c.meal_timing === 'dinner' ? '🌙 Dinner' : '☀️🌙 Both'}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#FDF8F3] p-4">
                <p className="text-xs text-gray-400 mb-0.5">Balance</p>
                <p className={`text-3xl font-black ${
                  c.balance_days > 7 ? 'text-green-600' : c.balance_days >= 3 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {c.balance_days}<span className="text-base font-semibold ml-0.5">d</span>
                </p>
              </div>
              <div className="rounded-2xl bg-[#FDF8F3] p-4">
                <p className="text-xs text-gray-400 mb-0.5">Monthly</p>
                <p className="text-3xl font-black text-gray-800">
                  ₹{c.price_per_month}
                </p>
              </div>
            </div>
          </div>

          {/* Contact + address */}
          <div className="rounded-3xl bg-white shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            <a
              href={`https://wa.me/91${c.whatsapp_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-4 group hover:bg-green-50 transition-colors"
            >
              <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-green-100 text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">WhatsApp</p>
                <p className="text-sm font-bold text-gray-800">{c.whatsapp_number}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-500 transition-colors" />
            </a>

            {c.address && (
              <div className="flex items-start gap-3 px-5 py-4">
                <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 shrink-0 mt-0.5">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Address</p>
                  <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{c.address}</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Actions</h3>

            <button
              onClick={() => openEdit(c)}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border-2 border-[#F4622A]/30 px-5 py-4 text-left shadow-sm hover:border-[#F4622A] hover:bg-orange-50 active:scale-[0.98] transition-all"
            >
              <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 shrink-0">
                <Edit2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">Edit Details</p>
                <p className="text-xs text-gray-400">Update name, plan, price, etc.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>

            {c.status === 'active' ? (
              <button
                onClick={openPause}
                className="w-full flex items-center gap-3 rounded-2xl bg-white border-2 border-amber-300/50 px-5 py-4 text-left shadow-sm hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98] transition-all"
              >
                <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shrink-0">
                  <Pause className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">Pause Deliveries</p>
                  <p className="text-xs text-gray-400">Skip deliveries for a date range</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ) : c.status === 'paused' ? (
              <button
                onClick={handleResume}
                className="w-full flex items-center gap-3 rounded-2xl bg-white border-2 border-green-300/50 px-5 py-4 text-left shadow-sm hover:border-green-500 hover:bg-green-50 active:scale-[0.98] transition-all"
              >
                <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-green-100 text-green-600 shrink-0">
                  <Play className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">Resume Deliveries</p>
                  <p className="text-xs text-gray-400">End pause and resume immediately</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ) : null}

            <button
              onClick={openPayments}
              className="w-full flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-5 py-4 text-left shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">Payment History</p>
                <p className="text-xs text-gray-400">View all recorded payments</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          </div>

          {/* ── Auto Ledger ─────────────────────────────────────────── */}
          <div className="rounded-[2rem] border border-orange-100 bg-white shadow-sm overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-gray-50">
              <Clock className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-black text-gray-900 tracking-tight">Activity</h3>
            </div>

            <div className="overflow-y-auto max-h-[420px] px-4 py-4 space-y-3">
            {ledgerLoading ? (
              <div className="space-y-4 px-1 py-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-gray-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-32 rounded-full bg-gray-100 animate-pulse" />
                      <div className="h-2.5 w-20 rounded-full bg-gray-100 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : ledgerEvents.length === 0 ? (
              <div className="px-1 py-6 flex flex-col items-center text-center">
                <p className="text-sm font-semibold text-gray-400">No activity yet</p>
                <p className="text-xs text-gray-300 mt-0.5">Payments and deliveries will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupLedgerByDay(ledgerEvents).map(({ label, events: dayEvents }) => (
                  <div key={label}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1 mb-1.5">{label}</p>
                    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                      {dayEvents.map((event, idx) => (
                        <div
                          key={event.id}
                          className={`flex items-start gap-3 px-5 py-4 ${idx !== dayEvents.length - 1 ? 'border-b border-gray-50' : ''}`}
                        >
                          {/* Icon */}
                          <div className={`flex w-9 h-9 items-center justify-center rounded-2xl shrink-0 mt-0.5 ${
                            event.type === 'payment'            ? 'bg-green-100 text-green-600' :
                            event.type === 'pause_start'        ? 'bg-amber-100 text-amber-600' :
                            event.type === 'pause_end'          ? 'bg-blue-100 text-blue-600' :
                            event.type === 'delivery_delivered' ? 'bg-emerald-100 text-emerald-600' :
                            event.type === 'delivery_skipped'   ? 'bg-gray-100 text-gray-500' :
                            event.type === 'customer_created'   ? 'bg-purple-100 text-purple-600' :
                                                                   'bg-red-100 text-red-600'
                          }`}>
                            {event.type === 'payment'            && <IndianRupee className="w-4 h-4" />}
                            {event.type === 'pause_start'        && <Pause className="w-4 h-4" />}
                            {event.type === 'pause_end'          && <Play className="w-4 h-4" />}
                            {event.type === 'balance_low'        && <AlertTriangle className="w-4 h-4" />}
                            {event.type === 'delivery_delivered' && <CheckCircle2 className="w-4 h-4" />}
                            {event.type === 'delivery_skipped'   && <XCircle className="w-4 h-4" />}
                            {event.type === 'customer_created'   && <Sparkles className="w-4 h-4" />}
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 leading-snug">
                              {event.type === 'payment'            && <>Payment received {event.amount != null && <span className="text-green-600">₹{event.amount}</span>}</>}
                              {event.type === 'pause_start'        && 'Deliveries paused'}
                              {event.type === 'pause_end'          && 'Deliveries resumed'}
                              {event.type === 'balance_low'        && 'Balance running low'}
                              {event.type === 'delivery_delivered' && 'Meal delivered'}
                              {event.type === 'delivery_skipped'   && 'Skipped today'}
                              {event.type === 'customer_created'   && 'Customer added'}
                            </p>
                            {event.notes && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{event.notes}</p>
                            )}
                            {event.type === 'balance_low' && (
                              <p className="text-xs text-red-400 mt-0.5">{c.balance_days} days remaining — collect payment soon</p>
                            )}
                          </div>

                          {/* Time */}
                          <p className="text-[11px] font-semibold text-gray-300 shrink-0 pt-0.5">
                            {relativeTime(event.date)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

        </main>
        <BottomNav />
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: FORM (Add / Edit)
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'form') {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              onClick={goBack}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight">
                {formMode === 'add' ? 'Add Customer' : 'Edit Customer'}
              </h1>
              <p className="text-xs font-semibold text-orange-600/80">
                {formMode === 'add' ? 'Fill in the details below' : selectedCustomer?.name}
              </p>
            </div>
            {formMode === 'add' ? (
              <UserPlus className="w-5 h-5 text-orange-500" />
            ) : (
              <UserPen className="w-5 h-5 text-orange-500" />
            )}
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
          <form onSubmit={handleFormSubmit} className="space-y-4">

            {/* Name */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Basic Info</h3>

              <Field label="Full Name *">
                <input
                  required
                  placeholder="e.g. Priya Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                />
              </Field>

              <Field label="WhatsApp Number *">
                <input
                  required
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={formData.whatsapp_number}
                  onChange={(e) => setFormData((f) => ({ ...f, whatsapp_number: e.target.value }))}
                  className={inputClass}
                />
              </Field>

              <Field label="Area">
                <input
                  placeholder="e.g. Koregaon Park"
                  value={formData.area}
                  onChange={(e) => setFormData((f) => ({ ...f, area: e.target.value }))}
                  className={inputClass}
                />
              </Field>

              <Field label="Full Address">
                <textarea
                  placeholder="Building, street, landmark…"
                  value={formData.address}
                  onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </Field>
            </div>

            {/* Plan */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Plan Details</h3>

              <Field label="Plan Type">
                <div className="flex overflow-hidden rounded-2xl border border-gray-200">
                  {(['veg', 'nonveg'] as const).map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, plan_type: pt }))}
                      className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-semibold transition ${
                        formData.plan_type === pt ? 'bg-[#F4622A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {PLAN_EMOJI[pt]} {PLAN_LABEL[pt]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Frequency">
                <div className="flex overflow-hidden rounded-2xl border border-gray-200">
                  {(['daily', 'alternate'] as const).map((fr) => (
                    <button
                      key={fr}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, frequency: fr }))}
                      className={`flex-1 py-3 text-sm font-semibold transition ${
                        formData.frequency === fr ? 'bg-[#F4622A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {fr === 'daily' ? '📅 Daily' : '📆 Alternate'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Meal Timing">
                <div className="flex overflow-hidden rounded-2xl border border-gray-200">
                  {([
                    { value: 'lunch', label: '☀️ Lunch' },
                    { value: 'dinner', label: '🌙 Dinner' },
                    { value: 'both', label: '☀️🌙 Both' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, meal_timing: value }))}
                      className={`flex-1 py-3 text-sm font-semibold transition ${
                        formData.meal_timing === value ? 'bg-[#F4622A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Pricing */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Pricing & Balance</h3>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Price / Month (₹) *">
                  <input
                    required
                    type="number"
                    min="0"
                    placeholder="e.g. 2500"
                    value={formData.price_per_month}
                    onChange={(e) => setFormData((f) => ({ ...f, price_per_month: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Balance (days) *">
                  <input
                    required
                    type="number"
                    min="0"
                    placeholder="e.g. 30"
                    value={formData.balance_days}
                    onChange={(e) => setFormData((f) => ({ ...f, balance_days: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            {formError && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-100">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={formLoading}
              className="w-full rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-4 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:shadow-xl active:scale-95 disabled:opacity-60"
            >
              {formLoading
                ? formMode === 'add' ? 'Adding…' : 'Saving…'
                : formMode === 'add' ? 'Add Customer' : 'Save Changes'}
            </button>
          </form>
        </main>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: PAUSE
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'pause' && selectedCustomer) {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              onClick={goBack}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight">Pause Deliveries</h1>
              <p className="text-xs font-semibold text-amber-600/80">{selectedCustomer.name}</p>
            </div>
            <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-500">
              <Pause className="w-5 h-5" />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
          <div className="rounded-3xl bg-white px-5 py-6 shadow-sm border border-gray-100">
            <p className="mb-5 text-sm text-gray-500 leading-relaxed">
              Deliveries for <span className="font-bold text-gray-800">{selectedCustomer.name}</span> will be skipped between these dates.
            </p>
            <form onSubmit={handlePauseSubmit} className="space-y-4">
              <Field label="Start Date">
                <input
                  required
                  type="date"
                  value={pauseStart}
                  onChange={(e) => setPauseStart(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="End Date">
                <input
                  required
                  type="date"
                  value={pauseEnd}
                  min={pauseStart}
                  onChange={(e) => setPauseEnd(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex-1 rounded-2xl border border-gray-200 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pauseLoading}
                  className="flex-1 rounded-2xl bg-amber-500 py-3.5 text-sm font-bold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-60"
                >
                  {pauseLoading ? 'Pausing…' : 'Confirm Pause'}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: PAYMENTS
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'payments' && selectedCustomer) {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              onClick={goBack}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight">Payment History</h1>
              <p className="text-xs font-semibold text-orange-600/80">{selectedCustomer.name}</p>
            </div>
            <div className="flex w-10 h-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-white animate-pulse border border-gray-100" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl bg-white py-16 shadow-sm border border-gray-100">
              <span className="mb-3 text-5xl">📭</span>
              <p className="text-base font-bold text-gray-700">No payments yet</p>
              <p className="mt-1 text-sm text-gray-400">Payments will appear here once recorded.</p>
            </div>
          ) : (
            <div className="rounded-3xl bg-white shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-base font-black text-gray-900">₹{p.amount}</p>
                    {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                  </div>
                  <p className="text-xs font-semibold text-gray-400">
                    {new Date(p.recorded_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    )
  }

  // Fallback (shouldn't reach here)
  return null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function groupLedgerByDay(events: LedgerEvent[]): { label: string; events: LedgerEvent[] }[] {
  const groups = new Map<string, LedgerEvent[]>()
  for (const e of events) {
    const key = new Date(e.date).toISOString().split('T')[0]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  const todayStr = new Date().toISOString().split('T')[0]
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, evts]) => {
      let label: string
      if (key === todayStr) label = 'Today'
      else if (key === yesterdayStr) label = 'Yesterday'
      else {
        const d = new Date(key + 'T12:00:00')
        const sameYear = d.getFullYear() === new Date().getFullYear()
        label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(!sameYear && { year: 'numeric' }) })
      }
      return { label, events: evts }
    })
}

// ── Reusable bits ──────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100 bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {children}
    </div>
  )
}
