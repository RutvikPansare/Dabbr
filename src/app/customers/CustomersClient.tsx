'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import {
  ArrowLeft, Search, Plus, UserPlus, UserPen, MapPin, MessageCircle,
  Pause, Play, CreditCard, Leaf, Drumstick, SearchX, Box, Smartphone,
  Edit2, ChevronRight, IndianRupee, AlertTriangle, Clock,
  CheckCircle2, XCircle, Sparkles, Tag, StickyNote, X as XIcon,
  Link2, Copy, RefreshCw, FileUp,
} from 'lucide-react'
import type { PlanType, Frequency, CustomerStatus, MealSlot, SubscriptionStatus, MealPlanStatus } from '@/types/database'
import { formatMealSlots, formatPlanSummary } from '@/lib/meals'
import { generateCustomerToken } from '@/lib/customer-token'
import CsvImport from './CsvImport'

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
  price_per_month: number
  status: CustomerStatus
  balance_days: number
  pauses: Pause[]
  subscriptions?: Subscription[]
  created_at: string
  notes: string | null
  tags: string[]
}

interface MealPlan {
  id: string
  provider_id: string
  name: string
  meal_slots: MealSlot[]
  plan_type: PlanType
  frequency: Frequency
  monthly_price: number
  active_days: number
  description: string | null
  status: MealPlanStatus
}

interface Subscription {
  id: string
  provider_id: string
  customer_id: string
  meal_plan_id: string
  status: SubscriptionStatus
  start_date: string
  paused_at?: string | null
  cancelled_at?: string | null
  meal_plans?: MealPlan | null
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
  notes: string
  tags: string[]
  meal_plan_id: string
  balance_days: string
}

interface Props {
  initialCustomers: Customer[]
  initialMealPlans: MealPlan[]
  providerId: string
  initialShowAdd?: boolean
  initialOpenId?: string | null
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
  notes: '',
  tags: [],
  meal_plan_id: '',
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

// ── Tag helpers ────────────────────────────────────────────────────────────

const TAG_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
]

function tagColor(tag: string): string {
  let hash = 0
  for (const ch of tag) hash = (hash * 31 + ch.charCodeAt(0)) & 0xff
  return TAG_COLORS[hash % TAG_COLORS.length]
}

function normalizeTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
    )
  )
}

const SUGGESTED_TAGS = [
  'VIP', 'Office', 'Student', 'Family', 'Gym',
  'Less Spicy', 'Less Oil', 'No Onion',
  'Late Payment', 'Cash Only', 'UPI Only',
  'Leave with Security', 'Call Before',
  'No Friday', 'No Saturday', 'No Sunday',
]

function activeSubscription(c: Customer): Subscription | null {
  return c.subscriptions?.find(s => s.status === 'active' || s.status === 'paused') ?? null
}

function customerPlan(c: Customer): MealPlan | null {
  return activeSubscription(c)?.meal_plans ?? null
}

/** Merge meal plan objects into a customer's subscriptions (avoids embedded join schema cache dependency) */
function enrichSubscriptions(customer: any, mealPlansList: MealPlan[]): Customer {
  const mpMap: Record<string, MealPlan> = {}
  for (const mp of mealPlansList) mpMap[mp.id] = mp
  return {
    ...customer,
    subscriptions: (customer.subscriptions ?? []).map((s: any) => ({
      ...s,
      meal_plans: mpMap[s.meal_plan_id] ?? null,
    })),
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function CustomersClient({ initialCustomers, initialMealPlans, providerId, initialShowAdd = false, initialOpenId = null }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Navigation state (single source of truth) ──────────────────────────
  const [screen, setScreen] = useState<Screen>(initialShowAdd ? 'form' : 'list')

  // ── Data state ─────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(initialMealPlans)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // Form
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [formData, setFormData] = useState<FormState>({
    ...EMPTY_FORM,
    meal_plan_id: initialMealPlans.find(plan => plan.status === 'active')?.id ?? initialMealPlans[0]?.id ?? '',
  })
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

  // Notes & Tags
  const [notesValue, setNotesValue] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput] = useState('')

  // Ledger (auto timeline on detail screen)
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Portal link
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [portalLinkLoading, setPortalLinkLoading] = useState(false)
  const [portalLinkCopied, setPortalLinkCopied] = useState(false)

  // CSV import
  const [showImport, setShowImport] = useState(false)

  // ── Auto-open customer from URL param ─────────────────────────────────
  useEffect(() => {
    if (!initialOpenId) return
    const customer = initialCustomers.find(c => c.id === initialOpenId)
    if (customer) {
      void openDetail(customer)
    }
  // openDetail is stable (no deps change after mount); initialOpenId/initialCustomers are props
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────

  const activeMealPlans = mealPlans.filter(plan => plan.status === 'active')
  const allTags = Array.from(new Set(customers.flatMap(c => c.tags ?? []))).sort()

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.area ?? '').toLowerCase().includes(q) ||
      c.whatsapp_number.includes(q)
    const matchFilter = filter === 'all' || c.status === filter
    const matchTag = !tagFilter || (c.tags ?? []).includes(tagFilter)
    return matchSearch && matchFilter && matchTag
  })

  const counts = {
    all: customers.length,
    active: customers.filter((c) => c.status === 'active').length,
    paused: customers.filter((c) => c.status === 'paused').length,
  }

  // ── Navigation helpers ─────────────────────────────────────────────────

  function openAdd() {
    setFormMode('add')
    setFormData({ ...EMPTY_FORM, meal_plan_id: activeMealPlans[0]?.id ?? mealPlans[0]?.id ?? '' })
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
      notes: c.notes ?? '',
      tags: c.tags ?? [],
      meal_plan_id: activeSubscription(c)?.meal_plan_id ?? '',
      balance_days: String(c.balance_days),
    })
    setFormError('')
    setScreen('form')
  }

  async function openDetail(c: Customer) {
    setSelectedCustomer(c)
    setNotesValue(c.notes ?? '')
    setNotesSaved(false)
    setShowTagInput(false)
    setTagInput('')
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

    // Fetch existing portal token for this customer
    setPortalToken(null)
    setPortalLinkLoading(true)
    const { data: tokenRow } = await db
      .from('customer_access_tokens')
      .select('token')
      .eq('customer_id', c.id)
      .eq('is_active', true)
      .maybeSingle()
    setPortalToken(tokenRow?.token ?? null)
    setPortalLinkLoading(false)
  }

  async function generatePortalLink() {
    if (!selectedCustomer) return
    setPortalLinkLoading(true)
    const newToken = generateCustomerToken()
    // Deactivate any existing token first
    await db.from('customer_access_tokens').update({ is_active: false }).eq('customer_id', selectedCustomer.id)
    // Insert new token
    await db.from('customer_access_tokens').insert({
      customer_id: selectedCustomer.id,
      provider_id: providerId,
      token: newToken,
    })
    setPortalToken(newToken)
    setPortalLinkLoading(false)
  }

  function copyPortalLink() {
    if (!portalToken) return
    const url = `${window.location.origin}/c/${portalToken}`
    navigator.clipboard.writeText(url).then(() => {
      setPortalLinkCopied(true)
      setTimeout(() => setPortalLinkCopied(false), 2500)
    })
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

  async function saveNotes() {
    if (!selectedCustomer) return
    setNotesSaving(true)
    await db.from('customers').update({ notes: notesValue || null }).eq('id', selectedCustomer.id)
    const updated = { ...selectedCustomer, notes: notesValue || null }
    setSelectedCustomer(updated)
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
    setNotesSaving(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function addTag(tag: string) {
    if (!selectedCustomer) return
    const trimmed = tag.trim()
    if (!trimmed || selectedCustomer.tags.includes(trimmed)) return
    const newTags = [...selectedCustomer.tags, trimmed]
    await db.from('customers').update({ tags: newTags }).eq('id', selectedCustomer.id)
    const updated = { ...selectedCustomer, tags: newTags }
    setSelectedCustomer(updated)
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  async function removeTag(tag: string) {
    if (!selectedCustomer) return
    const newTags = selectedCustomer.tags.filter(t => t !== tag)
    await db.from('customers').update({ tags: newTags }).eq('id', selectedCustomer.id)
    const updated = { ...selectedCustomer, tags: newTags }
    setSelectedCustomer(updated)
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
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

    const selectedPlan = mealPlans.find(plan => plan.id === formData.meal_plan_id)
    if (!selectedPlan) {
      setFormError('Please choose an active meal plan before saving this customer.')
      setFormLoading(false)
      return
    }

    if (formMode === 'add') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        provider_id: providerId,
        name: formData.name.trim(),
        whatsapp_number: formData.whatsapp_number.trim(),
        address: formData.address.trim() || null,
        area: formData.area.trim() || null,
        notes: formData.notes.trim() || null,
        tags: formData.tags,
        plan_type: selectedPlan.plan_type,
        frequency: selectedPlan.frequency,
        meal_slots: selectedPlan.meal_slots,
        price_per_month: Number(selectedPlan.monthly_price),
        balance_days: Number(formData.balance_days || selectedPlan.active_days),
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
        const { error: subError } = await db.from('subscriptions').insert({
          provider_id: providerId,
          customer_id: data.id,
          meal_plan_id: selectedPlan.id,
          status: 'active',
          start_date: today(),
        })
        if (subError) {
          setFormError(`Customer was added, but subscription assignment failed: ${subError.message}`)
          setFormLoading(false)
          return
        }

        const { data: hydratedRaw } = await db
          .from('customers')
          .select('*, pauses(*), subscriptions(*)')
          .eq('id', data.id)
          .single()
        const hydrated = hydratedRaw ? enrichSubscriptions(hydratedRaw, mealPlans) : data

        setCustomers((prev) =>
          [...prev, hydrated].sort((a, b) => a.name.localeCompare(b.name))
        )
        setScreen('list')
        setFormData({ ...EMPTY_FORM, meal_plan_id: activeMealPlans[0]?.id ?? mealPlans[0]?.id ?? '' })
      }
    } else {
      if (!selectedCustomer) {
        setFormLoading(false)
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: any = {
        name: formData.name.trim(),
        whatsapp_number: formData.whatsapp_number.trim(),
        address: formData.address.trim() || null,
        area: formData.area.trim() || null,
        notes: formData.notes.trim() || null,
        tags: formData.tags,
        plan_type: selectedPlan.plan_type,
        frequency: selectedPlan.frequency,
        meal_slots: selectedPlan.meal_slots,
        price_per_month: Number(selectedPlan.monthly_price),
        balance_days: Number(formData.balance_days),
      }
      const { data, error } = await db
        .from('customers')
        .update(updatePayload)
        .eq('id', selectedCustomer.id)
        .select('*, pauses(*), subscriptions(*)')
        .single()

      if (error) {
        setFormError('Failed to update customer. Please try again.')
      } else if (data) {
        const existing = activeSubscription(selectedCustomer)
        const { error: subError } = existing
          ? await db
              .from('subscriptions')
              .update({ meal_plan_id: selectedPlan.id, status: 'active', cancelled_at: null })
              .eq('id', existing.id)
          : await db.from('subscriptions').insert({
              provider_id: providerId,
              customer_id: selectedCustomer.id,
              meal_plan_id: selectedPlan.id,
              status: 'active',
              start_date: today(),
            })

        if (subError) {
          setFormError(`Customer was updated, but subscription assignment failed: ${subError.message}`)
          setFormLoading(false)
          return
        }

        const { data: hydratedRaw } = await db
          .from('customers')
          .select('*, pauses(*), subscriptions(*)')
          .eq('id', selectedCustomer.id)
          .single()
        const hydrated = hydratedRaw ? enrichSubscriptions(hydratedRaw, mealPlans) : data

        setCustomers((prev) =>
          prev
            .map((c) => (c.id === data.id ? hydrated : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        void openDetail(hydrated) // refresh ledger + selected customer
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

    const subscription = activeSubscription(selectedCustomer)
    if (subscription) {
      await db
        .from('subscriptions')
        .update({ status: 'active', paused_at: null })
        .eq('id', subscription.id)
    }

    const updated: Customer = {
      ...selectedCustomer,
      status: 'active',
      subscriptions: selectedCustomer.subscriptions?.map(s =>
        s.id === subscription?.id ? { ...s, status: 'active', paused_at: null } : s
      ),
    }
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

    const subscription = activeSubscription(selectedCustomer)
    if (subscription) {
      await db
        .from('subscriptions')
        .update({ status: 'paused', paused_at: new Date().toISOString() })
        .eq('id', subscription.id)
    }

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
      subscriptions: selectedCustomer.subscriptions?.map(s =>
        s.id === subscription?.id ? { ...s, status: 'paused', paused_at: new Date().toISOString() } : s
      ),
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
        <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
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
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-2xl bg-orange-50 border border-orange-100 px-3 py-2 text-xs font-bold text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
            >
              <FileUp className="w-3.5 h-3.5" />
              Import
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-40 space-y-4">

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

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border transition-all ${
                    tagFilter === tag
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : `${tagColor(tag)} border`
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

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
              {filtered.map((c) => {
                const plan = customerPlan(c)
                return (
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
                            {PLAN_EMOJI[plan?.plan_type ?? c.plan_type]} {plan?.name ?? PLAN_LABEL[c.plan_type]} • {formatMealSlots(plan?.meal_slots ?? c.meal_slots)}
                          </span>
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-400 group-hover:text-gray-500">
                          <Smartphone className="w-3 h-3" /> {c.whatsapp_number}
                        </p>
                        {c.notes && (
                          <p className="mt-1.5 text-xs text-gray-400 truncate max-w-[200px]">
                            <StickyNote className="inline w-3 h-3 mr-1 opacity-60" />{c.notes}
                          </p>
                        )}
                        {(c.tags ?? []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.tags.map(tag => (
                              <span key={tag} className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${tagColor(tag)}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right flex flex-col items-end gap-2">
                        <span className={`rounded-xl px-3 py-1.5 text-xs font-black shadow-sm ${balancePillClass(c.balance_days)}`}>
                          {c.balance_days}d left
                        </span>
                        <p className="text-xs font-bold text-gray-400 group-hover:text-gray-600">₹{plan?.monthly_price ?? c.price_per_month}/mo</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </main>

        {/* FAB */}
        <button
          onClick={openAdd}
          className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-[60px] w-[60px] items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] text-white shadow-[0_8px_30px_rgba(244,98,42,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20"
          aria-label="Add customer"
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </button>

        <BottomNav />

        {/* CSV Import modal */}
        {showImport && (
          <CsvImport
            providerId={providerId}
            onClose={() => setShowImport(false)}
            onImported={() => router.refresh()}
          />
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: DETAIL
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'detail' && selectedCustomer) {
    const c = selectedCustomer
    const plan = customerPlan(c)
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32 space-y-4">

          {/* Status + info header card */}
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${statusBadgeClass(c.status)}`}>
                {c.status}
              </span>
              <span className="text-xs text-gray-400">
                {plan ? formatPlanSummary(plan) : `${PLAN_LABEL[c.plan_type]} • ${FREQ_LABEL[c.frequency]} • ${formatMealSlots(c.meal_slots)}`}
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
                  ₹{plan?.monthly_price ?? c.price_per_month}
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

          {/* ── Portal Link ─────────────────────────────────────────── */}
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-gray-50">
              <Link2 className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-black text-gray-900 tracking-tight">Customer Portal</h3>
              <span className="ml-auto rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5">NEW</span>
            </div>

            <div className="px-5 py-4">
              {portalLinkLoading ? (
                <div className="h-10 rounded-2xl bg-gray-100 animate-pulse" />
              ) : portalToken ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-2xl bg-gray-50 border border-gray-200 px-3 py-2.5 overflow-hidden">
                    <span className="text-xs text-gray-500 truncate flex-1 font-mono">
                      {typeof window !== 'undefined' ? `${window.location.origin}/c/${portalToken}` : `/c/${portalToken}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyPortalLink}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition-all active:scale-95 ${
                        portalLinkCopied
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-orange-500 text-white shadow-sm hover:bg-orange-600'
                      }`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {portalLinkCopied ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button
                      onClick={generatePortalLink}
                      disabled={portalLinkLoading}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border border-gray-200 px-3 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                      title="Revoke and generate a new link"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Share this link with the customer via WhatsApp. They can view their subscription, menu, and pause/resume deliveries. Regenerating will revoke the old link.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Generate a private portal link to share with this customer. They can view their subscription, today&apos;s menu, and manage pauses — no login required.
                  </p>
                  <button
                    onClick={generatePortalLink}
                    disabled={portalLinkLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-3 text-sm font-bold text-white shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Link2 className="w-4 h-4" />
                    Generate Portal Link
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Notes & Tags ────────────────────────────────────────── */}
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-gray-50">
              <Tag className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-black text-gray-900 tracking-tight">Notes & Tags</h3>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Tags */}
              <div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(c.tags ?? []).map(tag => (
                    <span key={tag} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border ${tagColor(tag)}`}>
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${tag}`}
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {(c.tags ?? []).length === 0 && !showTagInput && (
                    <p className="text-xs text-gray-400">No tags yet</p>
                  )}
                </div>

                {showTagInput ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            addTag(tagInput)
                            setTagInput('')
                            setShowTagInput(false)
                          } else if (e.key === 'Escape') {
                            setShowTagInput(false)
                            setTagInput('')
                          }
                        }}
                        placeholder="Type tag + Enter"
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                      />
                      <button
                        onClick={() => { addTag(tagInput); setTagInput(''); setShowTagInput(false) }}
                        className="rounded-xl bg-orange-500 text-white px-4 py-2 text-xs font-bold hover:bg-orange-600 transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setShowTagInput(false); setTagInput('') }}
                        className="rounded-xl bg-gray-100 text-gray-500 px-3 py-2 text-xs font-bold hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {/* Suggestions */}
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ...SUGGESTED_TAGS,
                        ...allTags.filter(t => !SUGGESTED_TAGS.includes(t)),
                      ]
                        .filter(t => !(c.tags ?? []).includes(t))
                        .slice(0, 12)
                        .map(t => (
                          <button
                            key={t}
                            onClick={() => { addTag(t); setShowTagInput(false); setTagInput('') }}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-all hover:scale-105 ${tagColor(t)}`}
                          >
                            + {t}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-orange-500 hover:text-orange-700 transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5" /> Add tag
                  </button>
                )}
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Notes</p>
                <div className="relative">
                  <textarea
                    value={notesValue}
                    onChange={e => setNotesValue(e.target.value)}
                    onBlur={saveNotes}
                    placeholder="Delivery instructions, food preferences, payment notes…"
                    rows={3}
                    className="w-full rounded-2xl border border-gray-200 bg-[#FDF8F3] px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 transition-colors"
                  />
                  {(notesSaving || notesSaved) && (
                    <span className={`absolute bottom-3 right-3 text-[10px] font-semibold transition-opacity ${notesSaved ? 'text-green-500' : 'text-gray-400'}`}>
                      {notesSaving ? 'Saving…' : 'Saved ✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
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
        <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32">
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

            {/* Notes & Tags */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Notes & Tags</h3>

              <Field label="Customer Note">
                <textarea
                  placeholder="Delivery instructions, food preferences, payment notes…"
                  value={formData.notes}
                  onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </Field>

              <Field label="Tags">
                <div className="space-y-3">
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map(tag => (
                        <span key={tag} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border ${tagColor(tag)}`}>
                          {tag}
                          <button
                            type="button"
                            onClick={() => setFormData((f) => ({ ...f, tags: f.tags.filter(t => t !== tag) }))}
                            className="rounded-full p-0.5 hover:bg-black/5"
                            aria-label={`Remove ${tag}`}
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <input
                    placeholder="Add tags separated by commas"
                    value={formData.tags.join(', ')}
                    onChange={(e) => setFormData((f) => ({ ...f, tags: normalizeTags(e.target.value) }))}
                    className={inputClass}
                  />

                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_TAGS
                      .filter(tag => !formData.tags.includes(tag))
                      .slice(0, 10)
                      .map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setFormData((f) => ({ ...f, tags: [...f.tags, tag] }))}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-all hover:scale-105 ${tagColor(tag)}`}
                        >
                          + {tag}
                        </button>
                      ))}
                  </div>
                </div>
              </Field>
            </div>

            {/* Subscription */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Subscription</h3>
                <button
                  type="button"
                  onClick={() => router.push('/meal-plans')}
                  className="text-xs font-bold text-orange-500"
                >
                  Manage plans
                </button>
              </div>

              <Field label="Meal Plan *">
                <select
                  required
                  value={formData.meal_plan_id}
                  onChange={(e) => {
                    const plan = mealPlans.find(p => p.id === e.target.value)
                    setFormData((f) => ({
                      ...f,
                      meal_plan_id: e.target.value,
                      balance_days: f.balance_days || String(plan?.active_days ?? ''),
                    }))
                  }}
                  className={inputClass}
                >
                  <option value="">Choose a meal plan…</option>
                  {mealPlans.map(plan => (
                    <option key={plan.id} value={plan.id} disabled={plan.status !== 'active'}>
                      {formatPlanSummary(plan)}{plan.status !== 'active' ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
                {mealPlans.length === 0 && (
                  <p className="mt-2 text-xs font-medium text-red-500">
                    Create a meal plan first, then assign it to this customer.
                  </p>
                )}
              </Field>
            </div>

            {/* Pricing */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Balance</h3>

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
        <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32">
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
        <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-4 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32">
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
