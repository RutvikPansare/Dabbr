'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User, MessageCircle, AlertTriangle, CheckCircle2, ClipboardList, Check, Palette, Upload, Utensils, Plus, Trash2, CalendarOff } from 'lucide-react'
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
}

interface ProviderHoliday {
  id: string
  date: string
  label: string | null
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
}

const MENU_TAG_TYPES: Array<{ key: MenuQuickTagType; label: string; hint: string }> = [
  { key: 'any', label: 'Common', hint: 'Used for everyone' },
  { key: 'veg', label: PLAN_TYPE_LABEL.veg, hint: 'Veg suggestions' },
  { key: 'nonveg', label: PLAN_TYPE_LABEL.nonveg, hint: 'Non-veg suggestions' },
]

function quickTagInputKey(slot: string, type: string) {
  return `${slot}:${type}`
}

export default function SettingsClient({ providerId, provider, initialQuickTags, initialHolidays }: Props) {
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

  // Branding state
  const [slug, setSlug] = useState(provider?.slug ?? '')
  const [slugError, setSlugError] = useState('')
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
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayLabel, setNewHolidayLabel] = useState('')
  const [holidaySaving, setHolidaySaving] = useState(false)
  const [holidayError, setHolidayError] = useState('')

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
    if (!newHolidayDate) return
    setHolidaySaving(true)
    setHolidayError('')
    const { data, error: addErr } = await db
      .from('provider_holidays')
      .insert({ provider_id: providerId, date: newHolidayDate, label: newHolidayLabel.trim() || null })
      .select('id, date, label')
      .single()
    setHolidaySaving(false)
    if (addErr) {
      setHolidayError(addErr.message.includes('unique') ? 'That date is already marked as a holiday.' : addErr.message)
      return
    }
    if (data) setHolidays(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
    setNewHolidayDate('')
    setNewHolidayLabel('')
  }

  async function handleDeleteHoliday(id: string) {
    setHolidayError('')
    await db.from('provider_holidays').delete().eq('id', id)
    setHolidays(prev => prev.filter(h => h.id !== id))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 px-5 pb-4 pt-8 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Settings</h1>
          <p className="text-xs font-medium text-orange-600/80">Your kitchen profile</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-[104px]">

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
          </div>

          {/* Preview of UPI message snippet */}
          {upiId && (
            <div className="rounded-[1.5rem] bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/50 px-5 py-4 shadow-sm">
              <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Message preview (receipt)
              </p>
              <pre className="whitespace-pre-wrap text-xs text-green-800/90 font-sans leading-relaxed">
                {`Hi [Customer],\nPayment received: ₹2500 ✅\nYour tiffin is active for 30 more days.\nUPI: ${upiId}\nThank you! 🙏\n— ${name || 'Your name'}`}
              </pre>
            </div>
          )}

          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className={`w-full rounded-2xl py-4 text-sm font-bold shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 ${
              saved ? 'bg-green-500 text-white shadow-green-500/20' : 'btn-primary'
            }`}
          >
            {saving ? 'Saving…' : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : 'Save changes'}
          </button>
        </form>

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
          <h2 className="mb-1 text-sm font-black text-gray-900 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
              <CalendarOff className="w-4 h-4 text-orange-500" />
            </span>
            Delivery Days & Holidays
          </h2>
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

            {holidayError && (
              <p className="mb-3 rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{holidayError}</p>
            )}

            {/* Existing holidays */}
            {holidays.length > 0 && (
              <div className="mb-3 space-y-2">
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-2.5">
                    <span className="text-sm shrink-0">🏖️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-800">
                        {new Date(h.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {h.label && <p className="text-[11px] text-amber-700 font-semibold">{h.label}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-xl bg-white border border-amber-200 text-amber-500 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new holiday */}
            <div className="rounded-2xl border border-dashed border-gray-200 p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Date *</p>
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={e => { setNewHolidayDate(e.target.value); setHolidayError('') }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Label (optional)</p>
                  <input
                    type="text"
                    placeholder="e.g. Diwali"
                    value={newHolidayLabel}
                    onChange={e => setNewHolidayLabel(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddHoliday() }}}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddHoliday}
                disabled={!newHolidayDate || holidaySaving}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-xs font-bold text-white disabled:opacity-40 active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                {holidaySaving ? 'Adding…' : 'Add Holiday'}
              </button>
            </div>
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

          <div className="space-y-4">
            {MEAL_SLOTS.map(slot => (
              <section key={slot} className="rounded-3xl border border-orange-100 bg-[#FDF8F3] p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-gray-900">
                  <span className="text-lg">{MEAL_SLOT_EMOJI[slot]}</span>
                  {MEAL_SLOT_LABEL[slot]}
                </h3>

                <div className="space-y-3">
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
                                className="w-24 bg-transparent text-[11px] font-black text-orange-700 outline-none disabled:opacity-60"
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
              </section>
            ))}
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
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Your portal: <span className="text-orange-600 font-semibold">{origin}/{slug.trim().toLowerCase()}</span>
              </p>
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
          Dabbr · Week 1 build
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
