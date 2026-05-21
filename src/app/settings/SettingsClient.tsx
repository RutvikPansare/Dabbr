'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User, MessageCircle, AlertTriangle, CheckCircle2, ClipboardList, Check, Copy, ExternalLink, Palette, Upload, Utensils, Plus, Trash2, CalendarOff, Bike, ChevronDown, CalendarRange, X as XIcon, CalendarSearch, HandCoins, ChevronRight } from 'lucide-react'
import BottomNav from '@/components/BottomNav'
import { validateSlug } from '@/lib/branding'
import { MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL, MEAL_SLOTS, PLAN_TYPE_LABEL } from '@/lib/meals'
import {
  DEFAULT_MENU_QUICK_TAGS,
  MenuQuickTag,
  MenuQuickTagType,
  quickTagPlanType,
} from '@/lib/menu-quick-tags'
import { DAY_NAMES } from '@/lib/holidays'
import CalendarPicker from './CalendarPicker'
import HolidayCalendar from './HolidayCalendar'

interface Provider {
  id: string
  name: string
  phone: string | null
  upi_id: string | null
  enable_delivery_tracking: boolean
  slug: string | null
  logo_url: string | null
  accent_color: string
  tagline: string | null
  support_whatsapp: string | null
  off_days: number[]
  default_credit_limit: number
  default_meal_rate: number
}

interface ProviderHoliday {
  id: string
  date: string
  label: string | null
}

interface DeliveryRider {
  id: string
  name: string
  whatsapp_number: string
}

function darkenForPreview(hex: string, by: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r - by, g - by, b - by].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
}

interface Props {
  providerId: string
  provider: Provider | null
  initialQuickTags: MenuQuickTag[]
  initialHolidays: ProviderHoliday[]
  initialRiders: DeliveryRider[]
}

const MENU_TAG_TYPES: Array<{ key: MenuQuickTagType; label: string; hint: string }> = [
  { key: 'any', label: 'Common', hint: 'Used for everyone' },
  { key: 'veg', label: PLAN_TYPE_LABEL.veg, hint: 'Veg suggestions' },
  { key: 'nonveg', label: PLAN_TYPE_LABEL.nonveg, hint: 'Non-veg suggestions' },
]

function quickTagInputKey(slot: string, type: string) {
  return `${slot}:${type}`
}

// ── Holiday range grouping ─────────────────────────────────────────────────────

interface HolidayGroup {
  ids: string[]
  dates: string[]       // sorted YYYY-MM-DD
  label: string | null  // label of first in group
  isRange: boolean
}

function groupHolidays(holidays: ProviderHoliday[]): HolidayGroup[] {
  const groups: HolidayGroup[] = []
  let i = 0
  while (i < holidays.length) {
    let j = i + 1
    while (j < holidays.length) {
      const prev = new Date(holidays[j - 1].date + 'T12:00:00Z')
      prev.setUTCDate(prev.getUTCDate() + 1)
      const nextDay = prev.toISOString().split('T')[0]
      if (nextDay === holidays[j].date) j++
      else break
    }
    const slice = holidays.slice(i, j)
    groups.push({
      ids: slice.map(h => h.id),
      dates: slice.map(h => h.date),
      label: slice[0].label,
      isRange: slice.length > 1,
    })
    i = j
  }
  return groups
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsClient({ providerId, provider, initialQuickTags, initialHolidays, initialRiders }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [name, setName] = useState(provider?.name ?? '')
  const [phone, setPhone] = useState(provider?.phone ?? '')
  const [upiId, setUpiId] = useState(provider?.upi_id ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [menuQuickTags, setMenuQuickTags] = useState<MenuQuickTag[]>(initialQuickTags)
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [tagSaving, setTagSaving] = useState<string | null>(null)
  const [tagError, setTagError] = useState('')
  const seededTagsRef = useRef(false)

  // Use actual domain (localhost in dev, real domain in prod)
  const [origin, setOrigin] = useState('dabbr.in')
  useEffect(() => { setOrigin(window.location.origin.replace(/^https?:\/\//, '')) }, [])

  useEffect(() => {
    async function seedDefaultQuickTags() {
      if (seededTagsRef.current || menuQuickTags.length > 0) return
      seededTagsRef.current = true
      const payload = DEFAULT_MENU_QUICK_TAGS.map(tag => ({
        provider_id: providerId,
        meal_slot: tag.meal_slot,
        plan_type: quickTagPlanType(tag.type),
        label: tag.label,
        sort_order: tag.sort_order,
        default_quantity: tag.default_quantity,
      }))
      const { data, error: seedError } = await db.from('menu_quick_tags').insert(payload).select('*')
      if (seedError) {
        setTagError(seedError.message)
        return
      }
      setMenuQuickTags(data ?? [])
    }

    seedDefaultQuickTags()
  }, [db, providerId, menuQuickTags.length])

  // Collapsed meal slot sections — all start collapsed to save space
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(
    () => new Set(MEAL_SLOTS)
  )
  function toggleSlot(slot: string) {
    setCollapsedSlots(prev => {
      const next = new Set(prev)
      next.has(slot) ? next.delete(slot) : next.add(slot)
      return next
    })
  }

  // Branding state
  const [slug, setSlug] = useState(provider?.slug ?? '')
  const [slugError, setSlugError] = useState('')
  const [copiedSlug, setCopiedSlug] = useState(false)
  const [accentColor, setAccentColor] = useState(provider?.accent_color ?? '#F4622A')
  const [tagline, setTagline] = useState(provider?.tagline ?? '')
  const [supportWhatsapp, setSupportWhatsapp] = useState(provider?.support_whatsapp ?? '')
  const [logoUrl, setLogoUrl] = useState(provider?.logo_url ?? '')
  const [logoUploading, setLogoUploading] = useState(false)
  const [brandingSaving, setBrandingSaving] = useState(false)
  const [brandingSaved, setBrandingSaved] = useState(false)
  const [brandingError, setBrandingError] = useState('')

  // Delivery tracking saves instantly on toggle
  const [deliveryTracking, setDeliveryTracking] = useState(provider?.enable_delivery_tracking ?? false)
  const [trackingSaving, setTrackingSaving] = useState(false)
  const [trackingSaved, setTrackingSaved] = useState(false)
  const [trackingError, setTrackingError] = useState('')

  // Holidays & off-days
  const [offDays, setOffDays] = useState<number[]>(provider?.off_days ?? [])
  const [offDaySaving, setOffDaySaving] = useState(false)
  const [holidays, setHolidays] = useState<ProviderHoliday[]>(initialHolidays)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [holidayLabel, setHolidayLabel] = useState('')
  const [holidaySaving, setHolidaySaving] = useState(false)
  const [holidayError, setHolidayError] = useState('')
  const [showHolidayPicker, setShowHolidayPicker] = useState(false)
  const [showHolidayCalendar, setShowHolidayCalendar] = useState(false)

  // Monthly Settlement defaults
  const [defaultCreditLimit, setDefaultCreditLimit] = useState(provider?.default_credit_limit ?? 3000)
  const [defaultMealRate,    setDefaultMealRate]    = useState(provider?.default_meal_rate    ?? 120)
  const [msSaving,           setMsSaving]           = useState(false)
  const [msSaved,            setMsSaved]            = useState(false)
  const [msError,            setMsError]            = useState('')

  // Delivery riders
  const [riders, setRiders] = useState<DeliveryRider[]>(initialRiders)
  const [newRiderName, setNewRiderName] = useState('')
  const [newRiderPhone, setNewRiderPhone] = useState('')
  const [riderSaving, setRiderSaving] = useState(false)
  const [riderError, setRiderError] = useState('')

  async function handleToggleTracking() {
    const next = !deliveryTracking
    setDeliveryTracking(next)
    setTrackingSaving(true)
    setTrackingSaved(false)
    setTrackingError('')

    const { error: err } = await db
      .from('providers')
      .update({ enable_delivery_tracking: next })
      .eq('id', providerId)

    setTrackingSaving(false)
    if (err) {
      setDeliveryTracking(!next) // revert
      setTrackingError(err.message)
    } else {
      setTrackingSaved(true)
      router.refresh()
      setTimeout(() => setTrackingSaved(false), 2000)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setBrandingError('Logo must be under 2MB'); return }
    setLogoUploading(true)
    setBrandingError('')
    const ext = file.name.split('.').pop()
    const path = `${providerId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('provider-logos').upload(path, file, { upsert: true })
    if (error) { setBrandingError('Logo upload failed: ' + error.message); setLogoUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('provider-logos').getPublicUrl(data.path)
    setLogoUrl(publicUrl)
    setLogoUploading(false)
  }

  async function handleBrandingSave() {
    const trimmedSlug = slug.trim().toLowerCase()
    const err = trimmedSlug ? validateSlug(trimmedSlug) : null
    if (err) { setSlugError(err); return }
    setSlugError('')
    setBrandingSaving(true)
    setBrandingError('')
    const { error: saveErr } = await db.from('providers').update({
      slug: trimmedSlug || null,
      accent_color: accentColor,
      tagline: tagline.trim() || null,
      logo_url: logoUrl || null,
      support_whatsapp: supportWhatsapp.trim() || null,
    }).eq('id', providerId)
    setBrandingSaving(false)
    if (saveErr) {
      setBrandingError(saveErr.message.includes('unique') ? 'This slug is already taken. Try a different one.' : saveErr.message)
    } else {
      setBrandingSaved(true)
      router.refresh()
      setTimeout(() => setBrandingSaved(false), 3000)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')

    const { error: err } = await db
      .from('providers')
      .update({
        name: name.trim(),
        phone: phone.trim() || null,
        upi_id: upiId.trim() || null,
      })
      .eq('id', providerId)

    if (err) {
      setError(`Failed to save: ${err.message}`)
    } else {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  function quickTagsFor(slot: string, type: MenuQuickTagType) {
    return menuQuickTags
      .filter(tag => tag.meal_slot === slot && tag.plan_type === quickTagPlanType(type))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
  }

  async function addQuickTag(slot: string, type: MenuQuickTagType) {
    const key = quickTagInputKey(slot, type)
    const label = (tagInputs[key] ?? '').trim()
    if (!label) return

    const currentTags = quickTagsFor(slot, type)
    const sortOrder = currentTags.length ? Math.max(...currentTags.map(tag => tag.sort_order)) + 1 : 0
    setTagSaving(key)
    setTagError('')

    const { data, error: addError } = await db
      .from('menu_quick_tags')
      .insert({
        provider_id: providerId,
        meal_slot: slot,
        plan_type: quickTagPlanType(type),
        label,
        sort_order: sortOrder,
        default_quantity: 1,
      })
      .select('*')
      .single()

    setTagSaving(null)
    if (addError) {
      setTagError(addError.message.includes('duplicate') ? 'That quick tag already exists for this section.' : addError.message)
      return
    }

    if (data) setMenuQuickTags(prev => [...prev, data])
    setTagInputs(prev => ({ ...prev, [key]: '' }))
  }

  async function updateQuickTag(tag: MenuQuickTag, nextLabel: string) {
    const label = nextLabel.trim()
    if (!label) {
      await deleteQuickTag(tag.id)
      return
    }

    setTagSaving(tag.id)
    setTagError('')
    const { data, error: updateError } = await db
      .from('menu_quick_tags')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('id', tag.id)
      .select('*')
      .single()
    setTagSaving(null)

    if (updateError) {
      setTagError(updateError.message.includes('duplicate') ? 'That quick tag already exists for this section.' : updateError.message)
      return
    }

    if (data) setMenuQuickTags(prev => prev.map(item => item.id === tag.id ? data : item))
  }

  async function updateQuickTagQty(tag: MenuQuickTag, qty: number) {
    const safeQty = Math.max(1, Math.min(99, isNaN(qty) ? 1 : qty))
    setMenuQuickTags(prev => prev.map(t => t.id === tag.id ? { ...t, default_quantity: safeQty } : t))
    await db.from('menu_quick_tags').update({ default_quantity: safeQty }).eq('id', tag.id)
  }

  async function deleteQuickTag(id: string) {
    setTagSaving(id)
    setTagError('')
    const { error: deleteError } = await db.from('menu_quick_tags').delete().eq('id', id)
    setTagSaving(null)
    if (deleteError) {
      setTagError(deleteError.message)
      return
    }
    setMenuQuickTags(prev => prev.filter(tag => tag.id !== id))
  }

  async function handleToggleOffDay(dow: number) {
    const next = offDays.includes(dow)
      ? offDays.filter(d => d !== dow)
      : [...offDays, dow].sort()
    setOffDays(next)
    setOffDaySaving(true)
    await db.from('providers').update({ off_days: next }).eq('id', providerId)
    setOffDaySaving(false)
  }

  async function handleAddHoliday() {
    if (!rangeStart) return
    // If no end selected, or end same as start → single date
    const effectiveEnd = (rangeEnd && rangeEnd >= rangeStart) ? rangeEnd : rangeStart

    setHolidaySaving(true)
    setHolidayError('')

    // Expand to every date in the span, skip already-saved ones
    const toAdd: string[] = []
    const cur = new Date(rangeStart + 'T12:00:00Z')
    const end = new Date(effectiveEnd + 'T12:00:00Z')
    while (cur <= end) {
      const d = cur.toISOString().split('T')[0]
      if (!holidays.some(h => h.date === d)) toAdd.push(d)
      cur.setUTCDate(cur.getUTCDate() + 1)
    }

    if (toAdd.length === 0) {
      setHolidayError('All selected dates are already marked as holidays.')
      setHolidaySaving(false)
      return
    }

    const payload = toAdd.map(date => ({
      provider_id: providerId,
      date,
      label: holidayLabel.trim() || null,
    }))

    const { data, error: err } = await db
      .from('provider_holidays')
      .insert(payload)
      .select('id, date, label')

    setHolidaySaving(false)
    if (err) { setHolidayError(err.message); return }
    if (data) setHolidays(prev => [...prev, ...data].sort((a, b) => a.date.localeCompare(b.date)))
    setRangeStart('')
    setRangeEnd('')
    setHolidayLabel('')
    setShowHolidayPicker(false)
  }

  async function handleDeleteHoliday(id: string) {
    setHolidayError('')
    await db.from('provider_holidays').delete().eq('id', id)
    setHolidays(prev => prev.filter(h => h.id !== id))
  }

  async function handleDeleteHolidayGroup(ids: string[]) {
    setHolidayError('')
    await db.from('provider_holidays').delete().in('id', ids)
    setHolidays(prev => prev.filter(h => !ids.includes(h.id)))
  }

  async function handleSaveMonthlyDefaults() {
    if (defaultMealRate <= 0 || defaultCreditLimit <= 0) {
      setMsError('Both values must be greater than zero.')
      return
    }
    setMsSaving(true)
    setMsError('')
    const { error: err } = await db.from('providers').update({
      default_meal_rate:   defaultMealRate,
      default_credit_limit: defaultCreditLimit,
    }).eq('id', providerId)
    setMsSaving(false)
    if (err) { setMsError(err.message); return }
    setMsSaved(true)
    setTimeout(() => setMsSaved(false), 3000)
  }

  async function handleAddRider() {
    const name = newRiderName.trim()
    const phone = newRiderPhone.trim().replace(/\D/g, '').replace(/^(91|0)(\d{10})$/, '$2')
    if (!name || phone.length < 10) {
      setRiderError('Enter a valid name and 10-digit WhatsApp number.')
      return
    }
    setRiderSaving(true)
    setRiderError('')
    const { data, error: addErr } = await db
      .from('delivery_riders')
      .insert({ provider_id: providerId, name, whatsapp_number: phone })
      .select('id, name, whatsapp_number')
      .single()
    setRiderSaving(false)
    if (addErr) { setRiderError(addErr.message); return }
    if (data) setRiders(prev => [...prev, data])
    setNewRiderName('')
    setNewRiderPhone('')
  }

  async function handleDeleteRider(id: string) {
    setRiderError('')
    await db.from('delivery_riders').delete().eq('id', id)
    setRiders(prev => prev.filter(r => r.id !== id))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Settings</h1>
            <p className="text-xs font-semibold text-orange-600/80">Your kitchen profile</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-24">

        {/* Profile form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="glass-card rounded-[2rem] p-6 shadow-sm">
            <h2 className="mb-5 text-sm font-black text-gray-900 flex items-center gap-2">
              <span className="flex items-center justify-center p-1.5 bg-gray-100 rounded-xl">
                <User className="w-4 h-4 text-gray-600" />
              </span>
              Provider Details
            </h2>

            {/* Name */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                Your name *
              </p>
              <input
                required
                placeholder="e.g. Meena Tai"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-modern"
              />
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Shown in WhatsApp messages as &quot;— {name || 'Your name'}&quot;
              </p>
            </div>

            {/* Phone */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                WhatsApp / Phone
              </p>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-modern"
              />
            </div>

            {/* UPI ID */}
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                UPI ID
              </p>
              <input
                placeholder="e.g. meena@upi or 9876543210@paytm"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="input-modern"
              />
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Included in payment receipts and renewal reminders
              </p>
            </div>

            {/* Preview of UPI message snippet */}
            {upiId && (
              <div className="mt-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/50 px-4 py-3.5">
                <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5" /> Message preview (receipt)
                </p>
                <pre className="whitespace-pre-wrap text-xs text-green-800/90 font-sans leading-relaxed">
                  {`Hi [Customer],\nPayment received: ₹2500 ✅\nYour tiffin is active for 30 more days.\nUPI: ${upiId}\nThank you! 🙏\n— ${name || 'Your name'}`}
                </pre>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className={`mt-5 w-full rounded-2xl py-4 text-sm font-bold shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 ${
                saved ? 'bg-green-500 text-white shadow-green-500/20' : 'btn-primary'
              }`}
            >
              {saving ? 'Saving…' : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : 'Save changes'}
            </button>
          </div>
        </form>

        {/* Meal Plans shortcut */}
        <button
          type="button"
          onClick={() => router.push('/meal-plans')}
          className="glass-card w-full rounded-[2rem] p-5 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center justify-center p-2.5 bg-orange-50 rounded-xl shrink-0">
            <ClipboardList className="w-5 h-5 text-orange-500" />
          </span>
          <div className="flex-1 text-left">
            <p className="text-sm font-black text-gray-900">Meal Plans</p>
            <p className="text-xs font-medium text-gray-400 mt-0.5">Manage plans, pricing and customer subscriptions</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </button>

        {/* Features — separate from profile form, saves instantly */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-black text-gray-900 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
              <ClipboardList className="w-4 h-4 text-orange-500" />
            </span>
            Features
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Delivery Tracking</p>
              <p className="text-xs font-medium text-gray-400 mt-0.5">
                Swipe to mark delivered or skipped. Only delivered customers use a balance day.
              </p>
              {trackingError && (
                <p className="text-xs font-medium text-red-500 mt-1">{trackingError}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Inline saved indicator */}
              {trackingSaved && (
                <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
              {trackingSaving && (
                <span className="text-xs font-medium text-gray-400">Saving…</span>
              )}

              {/* Toggle — uses inline styles + a stable structure so CSS can't override */}
              <button
                type="button"
                disabled={trackingSaving}
                onClick={handleToggleTracking}
                aria-pressed={deliveryTracking}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  padding: 3,
                  backgroundColor: deliveryTracking ? '#f97316' : '#d1d5db',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: deliveryTracking ? 'flex-end' : 'flex-start',
                  transition: 'background-color 0.2s, opacity 0.2s',
                  opacity: trackingSaving ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                <span style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  display: 'block',
                  transition: 'transform 0.2s',
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Holidays & off-days */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
              <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
                <CalendarOff className="w-4 h-4 text-orange-500" />
              </span>
              Delivery Days & Holidays
            </h2>
            <button
              type="button"
              onClick={() => setShowHolidayCalendar(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-orange-50 border border-orange-100 px-3 text-[11px] font-bold text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
            >
              <CalendarSearch className="w-3.5 h-3.5" />
              My Calendar
            </button>
          </div>
          <p className="mb-5 text-xs font-semibold text-gray-400 leading-relaxed">
            Days marked here won&apos;t show deliveries on the dashboard, and customers will see a &quot;no delivery&quot; notice on their portal.
          </p>

          {/* Weekly off-days */}
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
              Weekly off-days {offDaySaving && <span className="text-gray-400 font-medium ml-1">Saving…</span>}
            </p>
            <div className="flex gap-2 flex-wrap">
              {DAY_NAMES.map((name, dow) => {
                const active = offDays.includes(dow)
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => handleToggleOffDay(dow)}
                    disabled={offDaySaving}
                    className={`rounded-2xl px-3.5 py-2 text-xs font-black transition-all active:scale-95 disabled:opacity-50 ${
                      active
                        ? 'bg-gray-800 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              {offDays.length === 0
                ? 'No weekly off-days set — deliveries every day.'
                : `Off every ${offDays.map(d => DAY_NAMES[d]).join(', ')}.`}
            </p>
          </div>

          {/* Specific holiday dates */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">Holiday Dates</p>

            {/* Existing holidays — grouped into consecutive ranges */}
            {holidays.length > 0 && (() => {
              const groups = groupHolidays(holidays)
              return (
                <div className="mb-3 space-y-2">
                  {groups.map(g => {
                    const fmt = (s: string) => new Date(s + 'T12:00:00Z')
                      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

                    const label = g.isRange
                      ? `${fmt(g.dates[0])} – ${fmt(g.dates[g.dates.length - 1])}`
                      : new Date(g.dates[0] + 'T12:00:00Z').toLocaleDateString('en-IN', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                        })

                    return (
                      <div key={g.ids[0]} className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-2.5">
                        <span className="text-sm shrink-0">🏖️</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-gray-800">{label}</p>
                          {g.isRange && (
                            <p className="text-[11px] font-bold text-amber-500 mt-0.5">
                              {g.dates.length} days
                            </p>
                          )}
                          {g.label && <p className="text-[11px] text-amber-700 font-semibold">{g.label}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteHolidayGroup(g.ids)}
                          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-xl bg-white border border-amber-200 text-amber-500 hover:text-red-500 hover:border-red-200 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Toggle button */}
            {!showHolidayPicker ? (
              <button
                type="button"
                onClick={() => { setShowHolidayPicker(true); setHolidayError('') }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 py-3 text-xs font-bold text-orange-500 hover:bg-orange-50 hover:border-orange-300 active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Holiday
              </button>
            ) : (
              <div className="rounded-2xl border border-orange-100 bg-orange-50/30 p-3 space-y-3">

                {/* Header row */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-gray-700">Add Holiday</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHolidayPicker(false)
                      setHolidayError('')
                      setRangeStart('')
                      setRangeEnd('')
                      setHolidayLabel('')
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] font-semibold text-gray-400 -mt-1">
                  Tap a date for a single holiday, or drag across dates to mark a range.
                </p>

                {holidayError && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{holidayError}</p>
                )}

                {/* Unified picker — range mode handles both single and multi-day */}
                <CalendarPicker
                  mode="range"
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  onRangeChange={(s, e) => { setRangeStart(s); setRangeEnd(e); setHolidayError('') }}
                  disabledDates={holidays.map(h => h.date)}
                  offDays={offDays}
                />

                <input
                  type="text"
                  placeholder="Label (optional) — e.g. Diwali"
                  value={holidayLabel}
                  onChange={e => setHolidayLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddHoliday() } }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                />

                {/* Day count hint when a range is selected */}
                {rangeStart && rangeEnd && rangeStart < rangeEnd && (() => {
                  let count = 0
                  const cur = new Date(rangeStart + 'T12:00:00Z')
                  const end = new Date(rangeEnd + 'T12:00:00Z')
                  while (cur <= end) {
                    if (!holidays.some(h => h.date === cur.toISOString().split('T')[0])) count++
                    cur.setUTCDate(cur.getUTCDate() + 1)
                  }
                  return count > 0 ? (
                    <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1.5">
                      <CalendarRange className="w-3.5 h-3.5 shrink-0" />
                      {count} day{count !== 1 ? 's' : ''} will be marked as holidays
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold text-gray-400">All dates in this range are already holidays.</p>
                  )
                })()}

                <button
                  type="button"
                  onClick={handleAddHoliday}
                  disabled={!rangeStart || holidaySaving}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-xs font-bold text-white disabled:opacity-40 active:scale-95 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {(() => {
                    if (holidaySaving) return 'Adding…'
                    if (!rangeStart) return 'Select a date above'
                    const fmt = (s: string) => new Date(s + 'T12:00:00Z')
                      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    if (rangeEnd && rangeEnd > rangeStart)
                      return `Mark ${fmt(rangeStart)} – ${fmt(rangeEnd)} as Holiday`
                    return `Mark ${fmt(rangeStart)} as Holiday`
                  })()}
                </button>

              </div>
            )}
          </div>
        </div>

        {/* Menu quick tags */}
        <div id="menu-quick-tags" className="glass-card rounded-[2rem] p-6 shadow-sm scroll-mt-28">
          <h2 className="mb-2 text-sm font-black text-gray-900 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
              <Utensils className="w-4 h-4 text-orange-500" />
            </span>
            Menu Quick Tags
          </h2>
          <p className="mb-5 text-xs font-semibold leading-relaxed text-gray-400">
            These chips appear above each menu field so you can tap common dishes instead of typing them every day.
          </p>

          {tagError && (
            <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {tagError}
            </p>
          )}

          <div className="space-y-2">
            {MEAL_SLOTS.map(slot => {
              const isCollapsed = collapsedSlots.has(slot)
              const totalTags = MENU_TAG_TYPES.reduce((sum, type) => sum + quickTagsFor(slot, type.key).length, 0)
              return (
                <section key={slot} className="rounded-3xl border border-orange-100 bg-[#FDF8F3] overflow-hidden">

                  {/* Collapsible header */}
                  <button
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-100/40 transition-colors"
                  >
                    <span className="text-lg leading-none">{MEAL_SLOT_EMOJI[slot]}</span>
                    <span className="flex-1 text-sm font-black text-gray-900">{MEAL_SLOT_LABEL[slot]}</span>
                    <span className="text-[10px] font-bold text-orange-400 mr-1">{totalTags} tags</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>

                  {/* Expandable content */}
                  {!isCollapsed && (
                    <div className="px-4 pb-4 space-y-3 border-t border-orange-100">
                      <div className="pt-3 space-y-3">
                        {MENU_TAG_TYPES.map(type => {
                          const key = quickTagInputKey(slot, type.key)
                          const tags = quickTagsFor(slot, type.key)
                          return (
                            <div key={key} className="rounded-2xl bg-white p-3 shadow-sm">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wider text-gray-600">{type.label}</p>
                                  <p className="text-[10px] font-bold text-gray-400">{type.hint}</p>
                                </div>
                                <span className="text-[10px] font-black text-orange-500">{tags.length} tags</span>
                              </div>

                              <div className="mb-2 flex flex-wrap gap-2">
                                {tags.map(tag => (
                                  <div key={tag.id} className="flex items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2 py-1">
                                    <input
                                      value={tag.label}
                                      onChange={(event) => {
                                        const label = event.target.value
                                        setMenuQuickTags(prev => prev.map(item => item.id === tag.id ? { ...item, label } : item))
                                      }}
                                      onBlur={(event) => updateQuickTag(tag, event.target.value)}
                                      disabled={tagSaving === tag.id}
                                      className="w-20 bg-transparent text-[11px] font-black text-orange-700 outline-none disabled:opacity-60"
                                    />
                                    <span className="text-orange-300 text-[10px] font-black">×</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="99"
                                      value={tag.default_quantity ?? 1}
                                      onChange={(event) => {
                                        const qty = parseInt(event.target.value) || 1
                                        setMenuQuickTags(prev => prev.map(t => t.id === tag.id ? { ...t, default_quantity: qty } : t))
                                      }}
                                      onBlur={(event) => updateQuickTagQty(tag, parseInt(event.target.value) || 1)}
                                      disabled={tagSaving === tag.id}
                                      className="w-7 text-center bg-transparent text-[11px] font-black text-orange-500 outline-none disabled:opacity-60"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => deleteQuickTag(tag.id)}
                                      disabled={tagSaving === tag.id}
                                      className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-orange-400 disabled:opacity-50"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="flex gap-2">
                                <input
                                  value={tagInputs[key] ?? ''}
                                  onChange={(event) => setTagInputs(prev => ({ ...prev, [key]: event.target.value }))}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      addQuickTag(slot, type.key)
                                    }
                                  }}
                                  placeholder={`Add ${type.label.toLowerCase()} dish`}
                                  className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => addQuickTag(slot, type.key)}
                                  disabled={tagSaving === key || !(tagInputs[key] ?? '').trim()}
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm disabled:bg-gray-200"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>

        {/* Branding */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-black text-gray-900 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
              <Palette className="w-4 h-4 text-orange-500" />
            </span>
            Branding
          </h2>

          {/* Mini portal header preview */}
          <div
            className="rounded-2xl px-4 pt-5 pb-4 mb-5 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${darkenForPreview(accentColor, 22)} 100%)` }}
          >
            <div className="flex items-center gap-3">
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover border-2 border-white/20" />
                : <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-sm">{(name || 'B').charAt(0)}</div>
              }
              <div>
                <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider">🍱 {name || 'Business Name'}</p>
                <p className="text-sm font-black text-white leading-tight">Namaste, Customer 🙏</p>
              </div>
            </div>
          </div>

          {/* Logo upload */}
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Logo</p>
            {logoUrl && (
              <div className="mb-2 flex items-center gap-3">
                <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  className="text-xs font-semibold text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-colors w-full">
                <Upload className="w-4 h-4 shrink-0" />
                <span>{logoUploading ? 'Uploading…' : 'Upload logo (PNG, JPG, WebP — max 2MB)'}</span>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                disabled={logoUploading}
                className="sr-only"
              />
            </label>
          </div>

          {/* Accent color */}
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Brand Color</p>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="color"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer p-1 bg-white"
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={accentColor}
                  onChange={e => {
                    const v = e.target.value
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setAccentColor(v)
                  }}
                  className="input-modern font-mono text-sm"
                  placeholder="#F4622A"
                />
              </div>
            </div>
          </div>

          {/* Slug */}
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Portal Slug</p>
            <input
              type="text"
              placeholder="e.g. meenas-tiffin"
              value={slug}
              onChange={e => {
                setSlug(e.target.value)
                setSlugError('')
              }}
              className={`input-modern ${slugError ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
            />
            {slugError && (
              <p className="mt-1 text-xs font-semibold text-red-500">{slugError}</p>
            )}
            {slug && !slugError && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-orange-100 bg-orange-50 pl-4 pr-2 py-2.5">
                <p className="flex-1 text-xs font-semibold text-orange-700 truncate">
                  {origin}/{slug.trim().toLowerCase()}
                </p>
                <a
                  href={`https://${origin}/${slug.trim().toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white border border-orange-200 px-3 py-1.5 text-xs font-bold text-orange-600 transition-all active:scale-95"
                >
                  <ExternalLink className="w-3 h-3" /> Visit
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://${origin}/${slug.trim().toLowerCase()}`)
                    setCopiedSlug(true)
                    setTimeout(() => setCopiedSlug(false), 2000)
                  }}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                    copiedSlug
                      ? 'bg-green-500 text-white'
                      : 'bg-orange-500 text-white'
                  }`}
                >
                  {copiedSlug
                    ? <><Check className="w-3 h-3" /> Copied!</>
                    : <><Copy className="w-3 h-3" /> Copy</>
                  }
                </button>
              </div>
            )}
            {!slug && (
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Customers can visit <span className="font-semibold">{origin}/your-slug</span> to find you
              </p>
            )}
          </div>

          {/* Tagline */}
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Tagline</p>
            <input
              type="text"
              placeholder="e.g. Fresh homemade food, delivered with love"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              maxLength={100}
              className="input-modern"
            />
            <p className="mt-1.5 text-xs font-medium text-gray-400">Shown on your landing page and customer portal</p>
          </div>

          {/* Support WhatsApp */}
          <div className="mb-5">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Support WhatsApp (optional)</p>
            <input
              type="tel"
              placeholder="e.g. 9876543210 (if different from main phone)"
              value={supportWhatsapp}
              onChange={e => setSupportWhatsapp(e.target.value)}
              className="input-modern"
            />
            <p className="mt-1.5 text-xs font-medium text-gray-400">Used for the Contact Provider button in the customer portal</p>
          </div>

          {brandingError && (
            <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {brandingError}
            </p>
          )}

          <button
            type="button"
            onClick={handleBrandingSave}
            disabled={brandingSaving || logoUploading}
            className={`w-full rounded-2xl py-4 text-sm font-bold shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 ${
              brandingSaved ? 'bg-green-500 text-white shadow-green-500/20' : 'btn-primary'
            }`}
          >
            {brandingSaving ? 'Saving…' : brandingSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : 'Save Branding'}
          </button>
        </div>

        {/* Monthly Settlement defaults */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-black text-gray-900 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
              <HandCoins className="w-4 h-4 text-orange-500" />
            </span>
            Monthly Settlement
          </h2>
          <p className="mb-5 text-xs font-semibold text-gray-400 leading-relaxed">
            Defaults for customers who pay at month-end. You can override these per customer.
          </p>

          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                Meal Rate (₹ per delivery)
              </p>
              <input
                type="number"
                min="1"
                placeholder="e.g. 120"
                value={defaultMealRate}
                onChange={e => { setDefaultMealRate(Number(e.target.value)); setMsError('') }}
                className="input-modern"
              />
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Charged each time a delivery is marked as Delivered
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                Default Credit Limit (₹)
              </p>
              <input
                type="number"
                min="1"
                placeholder="e.g. 3000"
                value={defaultCreditLimit}
                onChange={e => { setDefaultCreditLimit(Number(e.target.value)); setMsError('') }}
                className="input-modern"
              />
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Soft warning threshold — you&apos;ll see alerts when a customer nears this
              </p>
            </div>
          </div>

          {msError && (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {msError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSaveMonthlyDefaults}
            disabled={msSaving}
            className={`mt-5 w-full rounded-2xl py-4 text-sm font-bold shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 ${
              msSaved ? 'bg-green-500 text-white shadow-green-500/20' : 'btn-primary'
            }`}
          >
            {msSaving ? 'Saving…' : msSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : 'Save Defaults'}
          </button>
        </div>

        {/* Delivery Riders */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-black text-gray-900 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
              <Bike className="w-4 h-4 text-orange-500" />
            </span>
            Delivery Riders
          </h2>
          <p className="mb-5 text-xs font-semibold text-gray-400 leading-relaxed">
            Add your delivery riders so you can send area-wise lists directly to their WhatsApp from the home page.
          </p>

          {/* Existing riders */}
          {riders.length > 0 && (
            <div className="mb-4 space-y-2">
              {riders.map(rider => (
                <div key={rider.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{rider.name}</p>
                    <p className="text-xs font-medium text-gray-400">{rider.whatsapp_number}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRider(rider.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add rider */}
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Rider name (e.g. Raju)"
              value={newRiderName}
              onChange={e => { setNewRiderName(e.target.value); setRiderError('') }}
              className="input-modern"
            />
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="WhatsApp number"
                value={newRiderPhone}
                onChange={e => { setNewRiderPhone(e.target.value); setRiderError('') }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRider() } }}
                className="input-modern flex-1"
              />
              <button
                type="button"
                onClick={handleAddRider}
                disabled={riderSaving || !newRiderName.trim() || !newRiderPhone.trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm disabled:bg-gray-200 transition-colors"
              >
                {riderSaving ? <span className="text-xs">…</span> : <Plus className="w-4 h-4" />}
              </button>
            </div>
            {riderError && (
              <p className="text-xs font-semibold text-red-500">{riderError}</p>
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm mt-6">
          <h2 className="mb-4 text-sm font-black text-red-600 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-red-50 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </span>
            Account
          </h2>
          <button
            onClick={handleSignOut}
            className="w-full rounded-2xl border-2 border-red-200 py-3.5 text-sm font-bold text-red-500 transition-all hover:bg-red-50 hover:border-red-300 active:scale-95"
          >
            Sign out
          </button>
        </div>

        {/* App version */}
        <p className="pb-4 text-center text-xs text-gray-400">
          Dabbr
        </p>
      </main>

      <BottomNav />

      {/* Holiday calendar overview modal */}
      {showHolidayCalendar && (
        <HolidayCalendar
          offDays={offDays}
          holidays={holidays}
          onClose={() => setShowHolidayCalendar(false)}
        />
      )}
    </div>
  )
}
