'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import {
  ArrowLeft, Search, Plus, UserPlus, UserPen, MapPin, MessageCircle,
  Pause, Play, CreditCard, Leaf, Drumstick, SearchX, Box, Smartphone,
  Edit2, ChevronRight, ChevronDown, IndianRupee, AlertTriangle, Clock,
  CheckCircle2, XCircle, Sparkles, Tag, StickyNote, X as XIcon,
  Link2, Copy, RefreshCw, FileUp, ClipboardList, BookUser, Check, ExternalLink,
  SlidersHorizontal, HandCoins,
} from 'lucide-react'
import type { PlanType, Frequency, CustomerStatus, MealSlot, SubscriptionStatus, MealPlanStatus } from '@/types/database'
import { formatMealSlots } from '@/lib/meals'
import { computeMonthlyDue, DUE_COLORS, dueStateLabel, fmtRupees, type BillingType } from '@/lib/udhar'
import { generateCustomerToken } from '@/lib/customer-token'
import CsvImport from './CsvImport'
import ContactsImport from './ContactsImport'

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
  billing_type: BillingType
  meal_rate: number | null
  credit_limit: number | null
  meals_delivered: number
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
  | 'monthly_payment'
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
  billing_type: BillingType
  meal_rate: string
  credit_limit: string
}

interface Props {
  initialCustomers: Customer[]
  initialMealPlans: MealPlan[]
  providerId: string
  providerDefaultMealRate: number
  providerDefaultCreditLimit: number
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
  billing_type: 'prepaid',
  meal_rate: '',
  credit_limit: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function balancePillClass(days: number) {
  if (days > 7) return 'text-green-700 bg-green-50 border border-green-200'
  if (days >= 3) return 'text-amber-700 bg-amber-50 border border-amber-200'
  return 'text-red-700 bg-red-50 border border-red-200'
}

function statusBadgeClass(status: CustomerStatus) {
  return {
    active:   'bg-green-50 text-green-700 border-green-200',
    paused:   'bg-amber-50 text-amber-700 border-amber-200',
    inactive: 'bg-gray-50  text-gray-500  border-gray-200',
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

export default function CustomersClient({ initialCustomers, initialMealPlans, providerId, providerDefaultMealRate, providerDefaultCreditLimit, initialShowAdd = false, initialOpenId = null }: Props) {
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

  // Advanced filter panel
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterAreas, setFilterAreas] = useState<string[]>([])
  const [filterPlanIds, setFilterPlanIds] = useState<string[]>([])
  const [filterBalances, setFilterBalances] = useState<Array<'critical' | 'low' | 'good'>>([])
  const [filterTags, setFilterTags] = useState<string[]>([])

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
  const [monthlyTotalPaid, setMonthlyTotalPaid] = useState(0)

  // Portal link
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [portalLinkLoading, setPortalLinkLoading] = useState(false)
  const [portalLinkCopied, setPortalLinkCopied] = useState(false)

  // CSV import
  const [showImport, setShowImport] = useState(false)

  // Contacts import
  const [showContactsImport, setShowContactsImport] = useState(false)
  const [contactImportQueue, setContactImportQueue] = useState<{ name: string; phone: string }[]>([])

  // Import dropdown
  const [showImportMenu, setShowImportMenu] = useState(false)

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
  const allAreas = Array.from(new Set(customers.map(c => c.area).filter(Boolean) as string[])).sort()

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.area ?? '').toLowerCase().includes(q) ||
      c.whatsapp_number.includes(q)
    const matchStatus = filter === 'all' || c.status === filter
    const matchArea = filterAreas.length === 0 || filterAreas.includes(c.area ?? '')
    const matchPlan = filterPlanIds.length === 0 || filterPlanIds.includes(activeSubscription(c)?.meal_plan_id ?? '')
    const matchBalance = filterBalances.length === 0 || filterBalances.some(b =>
      b === 'critical' ? c.balance_days < 3 :
      b === 'low'      ? c.balance_days >= 3 && c.balance_days <= 7 :
      /* good */         c.balance_days > 7
    )
    const matchTags = filterTags.length === 0 || filterTags.every(t => (c.tags ?? []).includes(t))
    return matchSearch && matchStatus && matchArea && matchPlan && matchBalance && matchTags
  })

  const advancedFilterCount =
    filterAreas.length + filterPlanIds.length + filterBalances.length + filterTags.length

  function clearAllFilters() {
    setFilterAreas([])
    setFilterPlanIds([])
    setFilterBalances([])
    setFilterTags([])
  }

  function toggleItem<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item]
  }

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
      billing_type: c.billing_type ?? 'prepaid',
      meal_rate: c.meal_rate != null ? String(c.meal_rate) : '',
      credit_limit: c.credit_limit != null ? String(c.credit_limit) : '',
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
    setMonthlyTotalPaid(0)
    setScreen('detail')

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    // Fetch payments + delivery logs + monthly payments in parallel
    const [{ data: payData }, { data: deliveryData }, { data: monthlyPayData }] = await Promise.all([
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
      db
        .from('monthly_payments')
        .select('id, amount, note, created_at')
        .eq('customer_id', c.id)
        .order('created_at', { ascending: false }),
    ])

    const events: LedgerEvent[] = []

    // Payment events (prepaid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of ((payData ?? []) as any[])) {
      events.push({ id: `pay-${p.id}`, date: p.recorded_at, type: 'payment', amount: p.amount, notes: p.notes })
    }

    // Monthly settlement payment events + total paid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthlyPayments = (monthlyPayData ?? []) as any[]
    const totalPaid = monthlyPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0)
    setMonthlyTotalPaid(totalPaid)
    for (const p of monthlyPayments) {
      events.push({ id: `mp-${p.id}`, date: p.created_at, type: 'monthly_payment', amount: p.amount, notes: p.note })
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
        balance_days: formData.billing_type === 'monthly_settlement' ? 0 : Number(formData.balance_days || selectedPlan.active_days),
        billing_type: formData.billing_type,
        meal_rate: formData.meal_rate ? Number(formData.meal_rate) : null,
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
        meals_delivered: 0,
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
        router.refresh() // bust server cache so count stays correct on re-visit
        // If there are more contacts queued from a one-by-one import, open
        // the next form; otherwise go back to the list as normal.
        if (contactImportQueue.length > 0) {
          advanceContactImportQueue()
        } else {
          setScreen('list')
          setFormData({ ...EMPTY_FORM, meal_plan_id: activeMealPlans[0]?.id ?? mealPlans[0]?.id ?? '' })
        }
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
        balance_days: formData.billing_type === 'monthly_settlement' ? 0 : Number(formData.balance_days),
        billing_type: formData.billing_type,
        meal_rate: formData.meal_rate ? Number(formData.meal_rate) : null,
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
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

  // ── Contacts import ────────────────────────────────────────────────────

  async function handleContactsImport(
    entries: { name: string; phone: string }[],
    mode: 'one-by-one' | 'bulk'
  ) {
    if (!entries.length) return

    if (mode === 'one-by-one') {
      // Queue all contacts; open the add form for the first one.
      // After each save the queue is advanced automatically.
      const [first, ...rest] = entries
      setContactImportQueue(rest)
      setFormMode('add')
      setFormData({
        ...EMPTY_FORM,
        name: first.name.trim(),
        whatsapp_number: first.phone,
        meal_plan_id: activeMealPlans[0]?.id ?? mealPlans[0]?.id ?? '',
      })
      setFormError('')
      setScreen('form')
      return
    }

    // ── Bulk mode: insert all directly ────────────────────────────────────
    const defaultPlan = activeMealPlans[0] ?? mealPlans[0]
    if (!defaultPlan) return

    const startDate = today()

    const customerRows = entries.map(e => ({
      provider_id: providerId,
      name: e.name.trim(),
      whatsapp_number: e.phone,
      plan_type: defaultPlan.plan_type,
      frequency: defaultPlan.frequency,
      meal_slots: defaultPlan.meal_slots,
      price_per_month: Number(defaultPlan.monthly_price),
      balance_days: Number(defaultPlan.active_days),
      status: 'active' as const,
      address: null,
      area: null,
      notes: null,
      tags: [] as string[],
    }))

    const { data: inserted, error } = await db
      .from('customers')
      .insert(customerRows)
      .select('id')

    if (error || !inserted?.length) return

    const subRows = inserted.map((c: { id: string }) => ({
      provider_id: providerId,
      customer_id: c.id,
      meal_plan_id: defaultPlan.id,
      status: 'active',
      start_date: startDate,
    }))

    await db.from('subscriptions').insert(subRows)

    const { data: fresh } = await db
      .from('customers')
      .select('*, pauses(*), subscriptions(*)')
      .eq('provider_id', providerId)
      .order('name')

    if (fresh) {
      setCustomers(fresh.map((c: any) => enrichSubscriptions(c, mealPlans)))
      router.refresh() // bust server cache so count is correct on re-visit
    }
  }

  // Called after a successful add-form save to advance the one-by-one queue
  function advanceContactImportQueue() {
    setContactImportQueue(prev => {
      if (!prev.length) return prev
      const [next, ...rest] = prev
      setFormMode('add')
      setFormData({
        ...EMPTY_FORM,
        name: next.name.trim(),
        whatsapp_number: next.phone,
        meal_plan_id: activeMealPlans[0]?.id ?? mealPlans[0]?.id ?? '',
      })
      setFormError('')
      setScreen('form')
      return rest
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCREEN: LIST
  // ══════════════════════════════════════════════════════════════════════

  if (screen === 'list') {
    return (
      <div className="min-h-screen bg-[#FDF8F3]">

        {/* Header */}
        <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
          <div className="mx-auto flex max-w-2xl lg:max-w-none px-4 lg:px-8 items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-black text-gray-900 tracking-tight">Customers</h1>
              <p className="text-xs font-semibold text-orange-600/80">{customers.length} total</p>
            </div>

            {/* Import dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowImportMenu(v => !v)}
                className="flex items-center gap-2 rounded-xl bg-orange-500 border-2 border-orange-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-600 hover:border-orange-600 active:scale-95 transition-all"
              >
                <FileUp className="w-3.5 h-3.5" />
                Import
                <ChevronDown className={`w-3 h-3 transition-transform ${showImportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showImportMenu && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowImportMenu(false)} />
                  {/* Menu */}
                  <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-2xl bg-white border border-gray-100 shadow-xl overflow-hidden">
                    <button
                      onClick={() => { setShowImportMenu(false); setShowContactsImport(true) }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-50 transition-colors border-b border-gray-50"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600 shrink-0">
                        <BookUser className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">From Contacts</p>
                        <p className="text-[10px] text-gray-400 font-medium">Pick from your phone</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowImportMenu(false); setShowImport(true) }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-50 transition-colors"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-600 shrink-0">
                        <FileUp className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">From CSV</p>
                        <p className="text-[10px] text-gray-400 font-medium">Upload a spreadsheet</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-40 lg:pb-12 space-y-4">

          {/* Search + Filter button */}
          <div className="flex gap-2">
            <div className="relative group flex-1">
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
            <button
              onClick={() => setShowFilterPanel(true)}
              className={`relative flex items-center gap-1.5 rounded-2xl border-2 px-3.5 py-2.5 text-xs font-bold transition-all active:scale-95 ${
                advancedFilterCount > 0
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {advancedFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-orange-500 text-[10px] font-black">
                  {advancedFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Meal Plans shortcut */}
          <button
            onClick={() => router.push('/meal-plans')}
            className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-2.5 shadow-sm active:scale-[0.98] transition-transform"
          >
            <ClipboardList className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="flex-1 text-left text-xs font-bold text-gray-700">Meal Plans</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          </button>

          {/* Status tabs */}
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
                <span className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] ${
                  filter === tab ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {counts[tab]}
                </span>
              </button>
            ))}
          </div>

          {/* Active filter chips strip */}
          {advancedFilterCount > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar items-center">
              {filterBalances.map(b => (
                <span key={b} className="shrink-0 flex items-center gap-1.5 rounded-full bg-orange-100 border border-orange-200 px-3 py-1.5 text-xs font-bold text-orange-700">
                  {{ critical: 'Critical <3d', low: 'Low 3–7d', good: 'Healthy 7d+' }[b]}
                  <button onClick={() => setFilterBalances(prev => prev.filter(x => x !== b))}><XIcon className="w-3 h-3" /></button>
                </span>
              ))}
              {filterAreas.map(a => (
                <span key={a} className="shrink-0 flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700">
                  <MapPin className="w-3 h-3" />{a}
                  <button onClick={() => setFilterAreas(prev => prev.filter(x => x !== a))}><XIcon className="w-3 h-3" /></button>
                </span>
              ))}
              {filterPlanIds.map(id => {
                const p = mealPlans.find(m => m.id === id)
                return p ? (
                  <span key={id} className="shrink-0 flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700">
                    <ClipboardList className="w-3 h-3" />{p.name}
                    <button onClick={() => setFilterPlanIds(prev => prev.filter(x => x !== id))}><XIcon className="w-3 h-3" /></button>
                  </span>
                ) : null
              })}
              {filterTags.map(t => (
                <span key={t} className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${tagColor(t)}`}>
                  {t}
                  <button onClick={() => setFilterTags(prev => prev.filter(x => x !== t))}><XIcon className="w-3 h-3" /></button>
                </span>
              ))}
              <button
                onClick={clearAllFilters}
                className="shrink-0 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors ml-1"
              >
                Clear all
              </button>
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
                    className="group relative w-full rounded-2xl bg-white px-4 py-4 shadow-sm border border-gray-100 text-left transition-all duration-200 hover:shadow-md hover:border-orange-200 active:scale-[0.99] overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">

                      {/* ── Left: name + meta ── */}
                      <div className="min-w-0 flex-1">

                        {/* Row 1: name + status */}
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-900 text-base leading-tight truncate group-hover:text-orange-600 transition-colors">
                            {c.name}
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${statusBadgeClass(c.status)}`}>
                            {c.status}
                          </span>
                        </div>

                        {/* Row 2: area */}
                        {c.area && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-gray-400">
                            <MapPin className="w-3 h-3 shrink-0" />{c.area}
                          </p>
                        )}

                        {/* Row 3: plan + slots as uniform chips */}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                            {PLAN_EMOJI[plan?.plan_type ?? c.plan_type]}
                            {plan?.name ?? PLAN_LABEL[c.plan_type]}
                          </span>
                          <span className="rounded-full bg-gray-50 border border-gray-200 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                            {formatMealSlots(plan?.meal_slots ?? c.meal_slots)}
                          </span>
                        </div>

                        {/* Row 4: phone */}
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                          <Smartphone className="w-3 h-3 shrink-0" /> {c.whatsapp_number}
                        </p>

                        {/* Row 5: tags */}
                        {(c.tags ?? []).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {c.tags.map(tag => (
                              <span key={tag} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${tagColor(tag)}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Notes */}
                        {c.notes && (
                          <p className="mt-1.5 text-[11px] text-gray-400 truncate max-w-[200px]">
                            <StickyNote className="inline w-3 h-3 mr-1 opacity-60" />{c.notes}
                          </p>
                        )}
                      </div>

                      {/* ── Right: balance / due ── */}
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        {(c.billing_type ?? 'prepaid') === 'monthly_settlement' ? (() => {
                          const u = computeMonthlyDue({
                            mealsDelivered: c.meals_delivered ?? 0,
                            totalPaid: 0,
                            mealRate: c.meal_rate,
                            creditLimit: c.credit_limit,
                            defaultMealRate: providerDefaultMealRate,
                            defaultCreditLimit: providerDefaultCreditLimit,
                          })
                          const col = DUE_COLORS[u.state]
                          return (
                            <>
                              <span className={`rounded-full px-3 py-1 text-xs font-bold border ${col.bg} ${col.text}`}>
                                {fmtRupees(u.outstanding)} due
                              </span>
                              <span className={`flex items-center gap-1 text-[11px] font-semibold ${col.text}`}>
                                <HandCoins className="w-3 h-3" /> Monthly
                              </span>
                            </>
                          )
                        })() : (
                          <>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold border ${balancePillClass(c.balance_days)}`}>
                              {c.balance_days}d left
                            </span>
                            <p className="text-[11px] font-semibold text-gray-400">₹{plan?.monthly_price ?? c.price_per_month}/mo</p>
                          </>
                        )}
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

        {/* Contacts Import modal */}
        {showContactsImport && (
          <ContactsImport
            providerId={providerId}
            mealPlanId={activeMealPlans[0]?.id ?? mealPlans[0]?.id ?? ''}
            onImport={handleContactsImport}
            onClose={() => setShowContactsImport(false)}
          />
        )}

        {/* ── Filter panel ──────────────────────────────────────────────── */}
        {showFilterPanel && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilterPanel(false)} />
            <div
              className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl sm:mx-4 flex flex-col overflow-hidden"
              style={{ maxHeight: '85vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden shrink-0" />

              {/* Header */}
              <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b border-gray-100 shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100">
                  <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-gray-900">Filters</p>
                  {advancedFilterCount > 0 && (
                    <p className="text-xs font-medium text-orange-500">{advancedFilterCount} active</p>
                  )}
                </div>
                {advancedFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs font-bold text-red-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-xl hover:bg-red-50"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setShowFilterPanel(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-4 space-y-6">

                  {/* Balance / Days Left */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Days Left</p>
                    <div className="space-y-1.5">
                      {([
                        { key: 'critical', label: 'Critical',  sub: 'Less than 3 days',  dot: 'bg-red-400' },
                        { key: 'low',      label: 'Low',       sub: '3 – 7 days',        dot: 'bg-amber-400' },
                        { key: 'good',     label: 'Healthy',   sub: 'More than 7 days',  dot: 'bg-green-400' },
                      ] as const).map(opt => {
                        const selected = filterBalances.includes(opt.key)
                        return (
                          <button
                            key={opt.key}
                            onClick={() => setFilterBalances(prev => toggleItem(prev, opt.key))}
                            className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.98] ${
                              selected ? 'border-orange-300 bg-orange-50' : 'border-gray-100 bg-white hover:border-orange-200'
                            }`}
                          >
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dot}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-bold ${selected ? 'text-orange-700' : 'text-gray-700'}`}>{opt.label}</p>
                              <p className="text-[10px] font-medium text-gray-400 mt-0.5">{opt.sub}</p>
                            </div>
                            <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all shrink-0 ${
                              selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                            }`}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Area */}
                  {allAreas.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Area</p>
                      <div className="space-y-1.5">
                        {allAreas.map(area => {
                          const selected = filterAreas.includes(area)
                          return (
                            <button
                              key={area}
                              onClick={() => setFilterAreas(prev => toggleItem(prev, area))}
                              className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.98] ${
                                selected ? 'border-orange-300 bg-orange-50' : 'border-gray-100 bg-white hover:border-orange-200'
                              }`}
                            >
                              <MapPin className={`w-4 h-4 shrink-0 ${selected ? 'text-orange-500' : 'text-gray-400'}`} />
                              <span className={`flex-1 text-sm font-bold ${selected ? 'text-orange-700' : 'text-gray-700'}`}>{area}</span>
                              <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                                selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                              }`}>
                                {selected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Meal Plan */}
                  {mealPlans.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Meal Plan</p>
                      <div className="space-y-1.5">
                        {mealPlans.map(plan => {
                          const selected = filterPlanIds.includes(plan.id)
                          return (
                            <button
                              key={plan.id}
                              onClick={() => setFilterPlanIds(prev => toggleItem(prev, plan.id))}
                              className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.98] ${
                                selected ? 'border-orange-300 bg-orange-50' : 'border-gray-100 bg-white hover:border-orange-200'
                              }`}
                            >
                              <div className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${
                                plan.plan_type === 'veg' ? 'bg-emerald-100' : 'bg-orange-100'
                              }`}>
                                {PLAN_EMOJI[plan.plan_type]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold truncate ${selected ? 'text-orange-700' : 'text-gray-800'}`}>{plan.name}</p>
                                <p className="text-[10px] font-medium text-gray-400 mt-0.5">{formatMealSlots(plan.meal_slots)} · {FREQ_LABEL[plan.frequency]}</p>
                              </div>
                              <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                                selected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                              }`}>
                                {selected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {allTags.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Tags</p>
                      <div className="flex flex-wrap gap-2">
                        {allTags.map(tag => {
                          const selected = filterTags.includes(tag)
                          return (
                            <button
                              key={tag}
                              onClick={() => setFilterTags(prev => toggleItem(prev, tag))}
                              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-all active:scale-95 ${
                                selected
                                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border-2 transition-all shrink-0 ${
                                selected ? 'bg-white border-white' : 'border-gray-300'
                              }`}>
                                {selected && <Check className="w-2.5 h-2.5 text-orange-500" />}
                              </div>
                              {tag}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={() => setShowFilterPanel(false)}
                  className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white active:scale-95 transition-all"
                >
                  {filtered.length === 0
                    ? 'No customers match'
                    : `Show ${filtered.length} customer${filtered.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
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
        <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
          <div className="mx-auto flex max-w-2xl lg:max-w-none px-4 lg:px-8 items-center gap-3">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32 lg:pb-12 space-y-4">

          {/* Status + plan + balance card */}
          <div className="rounded-3xl bg-white shadow-sm border border-gray-100 overflow-hidden">

            {/* Status row */}
            <div className="flex items-center gap-2 px-5 pt-5 pb-4">
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${statusBadgeClass(c.status)}`}>
                {c.status}
              </span>
              {c.area && (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
                  <MapPin className="w-3 h-3 shrink-0" />{c.area}
                </span>
              )}
            </div>

            {/* Meal plan row */}
            <button
              type="button"
              onClick={() => router.push('/meal-plans')}
              className="w-full flex items-center gap-3 px-5 py-4 border-t border-orange-50 bg-orange-50/60 hover:bg-orange-100/60 active:bg-orange-100 transition-colors text-left group"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                (plan?.plan_type ?? c.plan_type) === 'veg' ? 'bg-emerald-100' : 'bg-orange-100'
              }`}>
                {PLAN_EMOJI[plan?.plan_type ?? c.plan_type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1">
                  <ClipboardList className="w-3 h-3" /> Meal Plan
                </p>
                <p className="text-sm font-black text-gray-900 mt-0.5">
                  {plan?.name ?? PLAN_LABEL[c.plan_type]}
                </p>
                <p className="text-xs font-medium text-gray-500 mt-0.5">
                  {formatMealSlots(plan?.meal_slots ?? c.meal_slots)} · {FREQ_LABEL[plan?.frequency ?? c.frequency]} · ₹{plan?.monthly_price ?? c.price_per_month}/mo
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-orange-500 group-hover:text-orange-600 shrink-0">
                View
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* Balance / Monthly grid */}
            {(c.billing_type ?? 'prepaid') === 'monthly_settlement' ? (() => {
              const u = computeMonthlyDue({
                mealsDelivered: c.meals_delivered ?? 0,
                totalPaid: monthlyTotalPaid,
                mealRate: c.meal_rate,
                creditLimit: c.credit_limit,
                defaultMealRate: providerDefaultMealRate,
                defaultCreditLimit: providerDefaultCreditLimit,
              })
              const col = DUE_COLORS[u.state]
              return (
                <div className={`px-5 py-4 border-t border-gray-50 space-y-3 ${col.bg} border`}>
                  <div className="flex items-center gap-2">
                    <HandCoins className={`w-4 h-4 ${col.text}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${col.text}`}>Monthly Settlement</span>
                    <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold ${col.pill}`}>{dueStateLabel(u.state)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/70 p-4">
                      <p className="text-xs text-gray-400 mb-0.5">Outstanding</p>
                      <p className={`text-2xl font-black ${col.text}`}>{fmtRupees(u.outstanding)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 p-4">
                      <p className="text-xs text-gray-400 mb-0.5">Meals Delivered</p>
                      <p className="text-2xl font-black text-gray-800">{c.meals_delivered ?? 0}</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 p-4">
                      <p className="text-xs text-gray-400 mb-0.5">Total Billed</p>
                      <p className="text-xl font-black text-gray-700">{fmtRupees((c.meals_delivered ?? 0) * u.effectiveMealRate)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 p-4">
                      <p className="text-xs text-gray-400 mb-0.5">Total Paid</p>
                      <p className="text-xl font-black text-green-600">{fmtRupees(monthlyTotalPaid)}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-medium text-gray-500 mb-1">
                      <span>{u.percentUsed}% of {fmtRupees(u.effectiveLimit)} limit</span>
                      <span>@{fmtRupees(u.effectiveMealRate)}/meal</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${col.dot}`}
                        style={{ width: `${Math.min(100, u.percentUsed)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })() : (
              <div className="grid grid-cols-2 gap-3 px-5 py-4 border-t border-gray-50">
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
            )}

            {/* Billing type info row */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-50 bg-gray-50/40">
              {(c.billing_type ?? 'prepaid') === 'monthly_settlement' ? (
                <>
                  <div className="flex w-8 h-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0">
                    <HandCoins className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Monthly Settlement</p>
                    <p className="text-xs font-semibold text-gray-500 mt-0.5">
                      ₹{c.meal_rate ?? providerDefaultMealRate}/meal
                      {c.meal_rate == null && <span className="text-gray-400 font-normal"> (default)</span>}
                      <span className="mx-1.5 text-gray-300">·</span>
                      ₹{(c.credit_limit ?? providerDefaultCreditLimit).toLocaleString('en-IN')} limit
                      {c.credit_limit == null && <span className="text-gray-400 font-normal"> (default)</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => openEdit(c)}
                    className="shrink-0 text-[10px] font-bold text-orange-500 hover:text-orange-700 transition-colors"
                  >
                    Edit
                  </button>
                </>
              ) : (
                <>
                  <div className="flex w-8 h-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Prepaid</p>
                    <p className="text-xs font-semibold text-gray-500 mt-0.5">
                      ₹{plan?.monthly_price ?? c.price_per_month}/mo · top up to add days
                    </p>
                  </div>
                  <button
                    onClick={() => openEdit(c)}
                    className="shrink-0 text-[10px] font-bold text-orange-500 hover:text-orange-700 transition-colors"
                  >
                    Edit
                  </button>
                </>
              )}
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
                            event.type === 'monthly_payment'    ? 'bg-amber-100 text-amber-600' :
                            event.type === 'pause_start'        ? 'bg-amber-100 text-amber-600' :
                            event.type === 'pause_end'          ? 'bg-blue-100 text-blue-600' :
                            event.type === 'delivery_delivered' ? 'bg-emerald-100 text-emerald-600' :
                            event.type === 'delivery_skipped'   ? 'bg-gray-100 text-gray-500' :
                            event.type === 'customer_created'   ? 'bg-purple-100 text-purple-600' :
                                                                   'bg-red-100 text-red-600'
                          }`}>
                            {event.type === 'payment'            && <IndianRupee className="w-4 h-4" />}
                            {event.type === 'monthly_payment'    && <HandCoins className="w-4 h-4" />}
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
                              {event.type === 'monthly_payment'    && <>Monthly payment collected {event.amount != null && <span className="text-amber-600">₹{event.amount}</span>}</>}
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
        <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
          <div className="mx-auto flex max-w-2xl lg:max-w-none px-4 lg:px-8 items-center gap-3">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32 lg:pb-12">
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
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Meal Plan</h3>
                  <p className="text-[10px] font-medium text-gray-400 mt-0.5">Tap a plan to select it</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/meal-plans')}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-50 border border-orange-100 px-3 py-1.5 text-xs font-bold text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
                >
                  <ExternalLink className="w-3 h-3" />
                  Manage plans
                </button>
              </div>

              {mealPlans.length === 0 ? (
                <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                  <p className="text-xs font-medium text-red-600">
                    No meal plans found. Create one first before adding a customer.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mealPlans.map(plan => {
                    const isSelected = formData.meal_plan_id === plan.id
                    const isInactive = plan.status !== 'active'
                    return (
                      <div key={plan.id} className="relative">
                        <button
                          type="button"
                          disabled={isInactive}
                          onClick={() => !isInactive && setFormData(f => ({
                            ...f,
                            meal_plan_id: plan.id,
                            balance_days: f.balance_days || String(plan.active_days ?? ''),
                          }))}
                          className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
                            isSelected
                              ? 'border-orange-400 bg-orange-50 shadow-sm'
                              : isInactive
                              ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                              : 'border-gray-100 bg-white hover:border-orange-200 hover:bg-orange-50/40'
                          }`}
                        >
                          {/* Type icon */}
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                            plan.plan_type === 'veg' ? 'bg-emerald-100' : 'bg-orange-100'
                          }`}>
                            {PLAN_EMOJI[plan.plan_type]}
                          </div>

                          {/* Plan details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-black text-gray-900">{plan.name}</p>
                              {isInactive && (
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-gray-400 mt-0.5">
                              {formatMealSlots(plan.meal_slots)} · {FREQ_LABEL[plan.frequency]} · ₹{plan.monthly_price}/mo
                            </p>
                          </div>

                          {/* Selected indicator */}
                          <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 transition-all ${
                            isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>

                        {/* View plan link — only on selected */}
                        {isSelected && (
                          <button
                            type="button"
                            onClick={() => router.push('/meal-plans')}
                            className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-orange-500 hover:text-orange-700 transition-colors"
                          >
                            View
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {!formData.meal_plan_id && (
                <p className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Please select a meal plan to continue
                </p>
              )}
            </div>

            {/* Billing Type */}
            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Billing Type</h3>

              {/* Toggle */}
              <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
                {(['prepaid', 'monthly_settlement'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, billing_type: type }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all ${
                      formData.billing_type === type
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {type === 'prepaid' ? (
                      <><CreditCard className="w-3.5 h-3.5" /> Prepaid</>
                    ) : (
                      <><HandCoins className="w-3.5 h-3.5" /> Monthly Settlement</>
                    )}
                  </button>
                ))}
              </div>

              {formData.billing_type === 'prepaid' ? (
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
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
                    <p className="text-xs font-medium text-amber-700 leading-relaxed">
                      <strong>Monthly Settlement:</strong> Deliveries are tracked and billed at month-end. Amount due = meals delivered × meal rate.
                    </p>
                  </div>
                  <Field label={`Meal Rate (₹/delivery) — leave blank for default (₹${providerDefaultMealRate})`}>
                    <input
                      type="number"
                      min="0"
                      placeholder={`Default: ₹${providerDefaultMealRate}`}
                      value={formData.meal_rate}
                      onChange={(e) => setFormData((f) => ({ ...f, meal_rate: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={`Credit Limit (₹) — leave blank for default (₹${providerDefaultCreditLimit})`}>
                    <input
                      type="number"
                      min="0"
                      placeholder={`Default: ₹${providerDefaultCreditLimit}`}
                      value={formData.credit_limit}
                      onChange={(e) => setFormData((f) => ({ ...f, credit_limit: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}
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
        <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
          <div className="mx-auto flex max-w-2xl lg:max-w-none px-4 lg:px-8 items-center gap-3">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32 lg:pb-12">
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
        <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
          <div className="mx-auto flex max-w-2xl lg:max-w-none px-4 lg:px-8 items-center gap-3">
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

        <main className="mx-auto max-w-2xl px-4 pt-24 pb-32 lg:pb-12">
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
