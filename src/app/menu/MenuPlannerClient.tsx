'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ClipboardPaste,
  Copy,
  Eye,
  Lightbulb,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '@/components/BottomNav'
import type { MealSlot, PlanType } from '@/types/database'
import { MEAL_SLOT_EMOJI, MEAL_SLOT_LABEL, MEAL_SLOTS } from '@/lib/meals'
import { DEFAULT_MENU_QUICK_TAGS, MenuQuickTag, quickTagPlanType } from '@/lib/menu-quick-tags'
import { isProviderHoliday } from '@/lib/holidays'

interface DailyMenu {
  id: string
  provider_id: string
  menu_date: string
  meal_slot: MealSlot
  dish_name: string
  plan_type: PlanType | null
  notes: string | null
  quantities: Record<string, number> | null
}

interface Props {
  providerId: string
  initialMenus: DailyMenu[]
  initialHistoryMenus: DailyMenu[]
  initialQuickTags: MenuQuickTag[]
  initialWeekStart: string
  initialToday: string
  initialOffDays?: number[]
  initialHolidayMap?: Record<string, string | null>
}

type EntryKey = 'any' | PlanType
type SectionDraft = Record<EntryKey, string>
type SectionDrafts = Record<string, SectionDraft>
type ToastKind = 'success' | 'error' | 'info'

const ENTRY_TYPES: Array<{ key: EntryKey; label: string; hint: string; placeholder: string }> = [
  { key: 'any', label: 'Common', hint: 'Served to everyone', placeholder: 'Dal, rice, salad...' },
  { key: 'veg', label: 'Veg', hint: 'Veg-only item', placeholder: 'Paneer, sabzi, dal...' },
  { key: 'nonveg', label: 'Non-veg', hint: 'Non-veg item', placeholder: 'Chicken curry, egg bhurji...' },
]

const EMPTY_SECTION: SectionDraft = { any: '', veg: '', nonveg: '' }

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', options)
}

function labelDate(date: string) {
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })
}

function dayName(date: string) {
  return formatDate(date, { weekday: 'long' })
}

function dayNumber(date: string) {
  return formatDate(date, { day: 'numeric' })
}

function shortDay(date: string) {
  return formatDate(date, { weekday: 'short' })
}

function sectionKey(date: string, slot: MealSlot) {
  return `${date}:${slot}`
}

function entryPlanType(key: EntryKey): PlanType | null {
  return key === 'any' ? null : key
}

function emptySection(): SectionDraft {
  return { ...EMPTY_SECTION }
}

function cleanClipboardLine(line: string) {
  return line
    .replace(/^[\s\-*•\d.)]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseClipboardMenu(text: string): Partial<Record<MealSlot, SectionDraft>> {
  const parsed: Partial<Record<MealSlot, SectionDraft>> = {}
  let currentSlot: MealSlot | null = null
  let currentType: EntryKey = 'any'

  function ensure(slot: MealSlot) {
    if (!parsed[slot]) parsed[slot] = emptySection()
    return parsed[slot]
  }

  function append(slot: MealSlot, type: EntryKey, value: string) {
    if (!value) return
    const section = ensure(slot)
    section[type] = [section[type], value].filter(Boolean).join('\n')
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanClipboardLine(rawLine)
    if (!line) continue

    const lower = line.toLowerCase()
    const slot = MEAL_SLOTS.find(item => lower.includes(item))
    const hasNonVeg = lower.includes('non veg') || lower.includes('non-veg') || lower.includes('nonveg') || lower.includes('chicken') || lower.includes('egg') || lower.includes('fish') || lower.includes('mutton')
    const hasVeg = !hasNonVeg && /\bveg\b/.test(lower)
    const nextType: EntryKey = hasNonVeg ? 'nonveg' : hasVeg ? 'veg' : currentType

    if (slot) {
      currentSlot = slot
      currentType = hasNonVeg ? 'nonveg' : hasVeg ? 'veg' : 'any'
      const afterColon = line.includes(':') ? line.split(':').slice(1).join(':').trim() : ''
      const withoutSlot = line.replace(new RegExp(slot, 'i'), '').replace(/^[:\-–|]+/, '').trim()
      const content = afterColon || withoutSlot
      if (content && content.toLowerCase() !== slot) append(slot, currentType, content)
      continue
    }

    if (/^(common|all|everyone)\b/i.test(line)) {
      currentType = 'any'
      const content = line.replace(/^(common|all|everyone)\s*[:\-–]?\s*/i, '').trim()
      if (currentSlot && content) append(currentSlot, currentType, content)
      continue
    }

    if (/^(veg|vegetarian)\b/i.test(line)) {
      currentType = 'veg'
      const content = line.replace(/^(veg|vegetarian)\s*[:\-–]?\s*/i, '').trim()
      if (currentSlot && content) append(currentSlot, currentType, content)
      continue
    }

    if (/^(non\s?veg|non-veg|nonveg)\b/i.test(line)) {
      currentType = 'nonveg'
      const content = line.replace(/^(non\s?veg|non-veg|nonveg)\s*[:\-–]?\s*/i, '').trim()
      if (currentSlot && content) append(currentSlot, currentType, content)
      continue
    }

    append(currentSlot ?? 'lunch', nextType, line)
  }

  return parsed
}

function extractQuantitiesFromMenus(menus: DailyMenu[]): Record<string, Record<'any' | 'veg' | 'nonveg', Record<string, number>>> {
  const result: Record<string, Record<'any' | 'veg' | 'nonveg', Record<string, number>>> = {}
  for (const menu of menus) {
    if (!menu.quantities) continue
    const sk = sectionKey(menu.menu_date, menu.meal_slot)
    const entry: 'any' | 'veg' | 'nonveg' = menu.plan_type === null ? 'any' : (menu.plan_type as 'veg' | 'nonveg')
    if (!result[sk]) result[sk] = { any: {}, veg: {}, nonveg: {} }
    result[sk][entry] = { ...(result[sk][entry] ?? {}), ...menu.quantities }
  }
  return result
}

function serializeDayMenu(date: string, menus: DailyMenu[]) {
  const lines = [`${labelDate(date)} menu`]
  for (const slot of MEAL_SLOTS) {
    const section = menus.filter(item => item.meal_slot === slot)
    if (!section.length) continue
    lines.push('', MEAL_SLOT_LABEL[slot])
    for (const entry of section) {
      const label = entry.plan_type === 'nonveg' ? 'Non-veg' : entry.plan_type === 'veg' ? 'Veg' : 'Common'
      lines.push(`${label}: ${entry.dish_name}`)
    }
  }
  return lines.join('\n').trim()
}

export default function MenuPlannerClient({ providerId, initialMenus, initialHistoryMenus, initialQuickTags, initialWeekStart, initialToday, initialOffDays = [], initialHolidayMap = {} }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [weekStart, setWeekStart] = useState(initialWeekStart)
  const [selectedDate, setSelectedDate] = useState(
    initialToday >= initialWeekStart && initialToday <= addDays(initialWeekStart, 6) ? initialToday : initialWeekStart,
  )
  const [menus, setMenus] = useState<DailyMenu[]>(initialMenus)
  const [historyMenus, setHistoryMenus] = useState<DailyMenu[]>(initialHistoryMenus)
  const [drafts, setDrafts] = useState<SectionDrafts>({})
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null)
  const [savedSlot, setSavedSlot] = useState<MealSlot | null>(null)
  const [copyPickerOpen, setCopyPickerOpen] = useState(false)
  const [workingAction, setWorkingAction] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null)
  const [activeHelp, setActiveHelp] = useState<string | null>(null)
  const [weekCopyModalOpen, setWeekCopyModalOpen] = useState(false)
  const [weekCopying, setWeekCopying] = useState(false)
  const [goodWeekPickerOpen, setGoodWeekPickerOpen] = useState(false)
  const [stickyExpanded, setStickyExpanded] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [servedExpanded, setServedExpanded] = useState(false)
  const [quickTags, setQuickTags] = useState<MenuQuickTag[]>(initialQuickTags)
  const [customItemInputs, setCustomItemInputs] = useState<Record<string, string>>({})
  const seededTagsRef = useRef(false)

  // ── Item quantities — sectionKey → entryKey → itemName → servings per customer ──
  // Initialized from DB menus; updated live as user taps ± buttons.
  const [itemQuantities, setItemQuantities] = useState<Record<string, Record<EntryKey, Record<string, number>>>>(
    () => extractQuantitiesFromMenus(initialMenus)
  )

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const copyDates = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(selectedDate, -(i + 1))), [selectedDate])
  const thisWeekStart = useMemo(() => {
    const d = new Date(`${initialToday}T12:00:00`)
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    return d.toISOString().split('T')[0]
  }, [initialToday])

  // ── Quantity helpers ───────────────────────────────────────────────────────

  function getItemQty(date: string, slot: MealSlot, entry: EntryKey, item: string): number {
    return itemQuantities[sectionKey(date, slot)]?.[entry]?.[item] ?? 1
  }

  function setItemQty(date: string, slot: MealSlot, entry: EntryKey, item: string, qty: number) {
    const sk = sectionKey(date, slot)
    setItemQuantities(prev => {
      const existing = prev[sk] ?? { any: {}, veg: {}, nonveg: {} }
      return {
        ...prev,
        [sk]: {
          ...existing,
          [entry]: {
            ...(existing[entry] ?? {}),
            [item]: Math.max(1, qty),
          },
        },
      }
    })
  }

  function isDayOff(date: string): boolean {
    return isProviderHoliday(date, initialOffDays, Object.keys(initialHolidayMap))
  }

  function holidayLabel(date: string): string | null {
    return initialHolidayMap[date] ?? null
  }

  function showToast(kind: ToastKind, message: string) {
    setToast({ kind, message })
  }

  useEffect(() => {
    async function seedDefaultQuickTags() {
      if (seededTagsRef.current || quickTags.length > 0) return
      seededTagsRef.current = true
      const payload = DEFAULT_MENU_QUICK_TAGS.map(tag => ({
        provider_id: providerId,
        meal_slot: tag.meal_slot,
        plan_type: quickTagPlanType(tag.type),
        label: tag.label,
        sort_order: tag.sort_order,
      }))

      const { data, error } = await db.from('menu_quick_tags').insert(payload).select('*')
      if (!error && data) setQuickTags(data as MenuQuickTag[])
    }

    seedDefaultQuickTags()
  }, [db, providerId, quickTags.length])

  function HelpBubble({ id, text, className = '' }: { id: string; text: string; className?: string }) {
    const isOpen = activeHelp === id

    return (
      <div className={`absolute right-1.5 top-1.5 z-20 ${className}`}>
        <button
          type="button"
          aria-label="Show action help"
          onClick={(event) => {
            event.stopPropagation()
            setActiveHelp(current => (current === id ? null : id))
          }}
          className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors ${
            isOpen ? 'border-orange-300 bg-orange-500 text-white' : 'border-white/80 bg-white/90 text-gray-400'
          }`}
        >
          <Eye className="h-3 w-3" />
        </button>
        {isOpen && (
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-7 w-56 rounded-2xl border border-orange-100 bg-white p-3 text-left text-[11px] font-bold leading-snug text-gray-600 shadow-xl"
          >
            {text}
          </div>
        )}
      </div>
    )
  }

  function getMenu(date: string, slot: MealSlot, planType: PlanType | null) {
    return menus.find(item => item.menu_date === date && item.meal_slot === slot && item.plan_type === planType) ?? null
  }

  function getSectionDraft(date: string, slot: MealSlot): SectionDraft {
    const key = sectionKey(date, slot)
    if (drafts[key]) return drafts[key]
    return {
      any: getMenu(date, slot, null)?.dish_name ?? '',
      veg: getMenu(date, slot, 'veg')?.dish_name ?? '',
      nonveg: getMenu(date, slot, 'nonveg')?.dish_name ?? '',
    }
  }

  function updateDraft(date: string, slot: MealSlot, entry: EntryKey, value: string) {
    const key = sectionKey(date, slot)
    setDrafts(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? getSectionDraft(date, slot)),
        [entry]: value,
      },
    }))
  }

  function draftEntryKey(date: string, slot: MealSlot, entry: EntryKey) {
    return `${date}:${slot}:${entry}`
  }

  function menuItemsFromDraft(value: string) {
    return value
      .split(/[\n,;]+/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  function normalizeItem(value: string) {
    return value.trim().toLowerCase()
  }

  function menuContainsItem(menu: DailyMenu, item: string) {
    const needle = normalizeItem(item)
    return menuItemsFromDraft(menu.dish_name).some(dish => normalizeItem(dish) === needle)
  }

  function daysBetween(fromDate: string, toDate: string) {
    const from = new Date(`${fromDate}T12:00:00`).getTime()
    const to = new Date(`${toDate}T12:00:00`).getTime()
    return Math.round((to - from) / 86400000)
  }

  function lastServedInfo(item: string, beforeDate = selectedDate) {
    const last = historyMenus
      .filter(menu => menu.menu_date < beforeDate && menuContainsItem(menu, item))
      .sort((a, b) => b.menu_date.localeCompare(a.menu_date))[0]
    if (!last) return null

    const daysAgo = daysBetween(last.menu_date, beforeDate)
    const label = daysAgo <= 1
      ? 'Yesterday'
      : daysAgo < 7
        ? `${daysAgo}d ago`
        : daysAgo < 14
          ? 'Last week'
          : `${Math.floor(daysAgo / 7)}w ago`
    const tone = daysAgo <= 2 ? 'hot' : daysAgo <= 7 ? 'warm' : 'fresh'
    return { date: last.menu_date, daysAgo, label, tone }
  }

  function tagToneClasses(item: string) {
    const info = lastServedInfo(item)
    if (!info) return 'border-emerald-100 bg-emerald-50 text-emerald-700'
    if (info.tone === 'hot') return 'border-red-100 bg-red-50 text-red-600'
    if (info.tone === 'warm') return 'border-orange-100 bg-orange-50 text-orange-600'
    return 'border-emerald-100 bg-white text-emerald-700'
  }

  function allMenuItemsInRange(start: string, end: string) {
    const counts = new Map<string, { label: string; count: number; latest: string }>()
    for (const menu of historyMenus) {
      if (menu.menu_date < start || menu.menu_date > end) continue
      for (const item of menuItemsFromDraft(menu.dish_name)) {
        const key = normalizeItem(item)
        const existing = counts.get(key)
        counts.set(key, {
          label: existing?.label ?? item,
          count: (existing?.count ?? 0) + 1,
          latest: existing?.latest && existing.latest > menu.menu_date ? existing.latest : menu.menu_date,
        })
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.latest.localeCompare(a.latest) || a.label.localeCompare(b.label))
  }

  function pairingSuggestionsFor(item: string, slot: MealSlot) {
    const itemKey = normalizeItem(item)
    const pairCounts = new Map<string, { label: string; count: number }>()

    for (const menu of historyMenus) {
      if (menu.meal_slot !== slot) continue
      const items = menuItemsFromDraft(menu.dish_name)
      if (!items.some(current => normalizeItem(current) === itemKey)) continue
      for (const pair of items) {
        const pairKey = normalizeItem(pair)
        if (!pairKey || pairKey === itemKey) continue
        const existing = pairCounts.get(pairKey)
        pairCounts.set(pairKey, { label: existing?.label ?? pair, count: (existing?.count ?? 0) + 1 })
      }
    }

    return Array.from(pairCounts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 3)
  }

  function smartSuggestionsForWeek() {
    const weekItems = allMenuItemsInRange(weekStart, addDays(weekStart, 6))
    const weekCounts = new Map(weekItems.map(item => [normalizeItem(item.label), item]))
    const suggestions: string[] = []

    const repeated = weekItems.find(item => item.count >= 3)
    if (repeated) suggestions.push(`${repeated.label} has already been served ${repeated.count} times this week.`)

    const missedTag = quickTags.find(tag => !weekCounts.has(normalizeItem(tag.label)) && !lastServedInfo(tag.label, addDays(weekStart, 7)))
    if (missedTag) suggestions.push(`You have not served ${missedTag.label} recently.`)

    const yesterdayItems = allMenuItemsInRange(addDays(selectedDate, -1), addDays(selectedDate, -1)).slice(0, 2)
    if (yesterdayItems.length) suggestions.push(`Yesterday had ${yesterdayItems.map(item => item.label).join(' + ')}.`)

    return suggestions.slice(0, 3)
  }

  function previousWeekOptions() {
    const options = []
    for (let offset = -7; offset >= -84; offset -= 7) {
      const start = addDays(weekStart, offset)
      const end = addDays(start, 6)
      const items = allMenuItemsInRange(start, end)
      if (!items.length) continue
      options.push({
        start,
        end,
        itemCount: items.reduce((sum, item) => sum + item.count, 0),
        preview: items.slice(0, 5).map(item => item.label),
      })
    }
    return options.slice(0, 8)
  }

  function writeMenuItemsToDraft(date: string, slot: MealSlot, entry: EntryKey, items: string[]) {
    updateDraft(date, slot, entry, items.join(', '))
  }

  function addMenuItemToDraft(date: string, slot: MealSlot, entry: EntryKey, label: string, defaultQty = 1) {
    const item = label.trim()
    if (!item) return
    const section = getSectionDraft(date, slot)
    const items = menuItemsFromDraft(section[entry])
    const exists = items.some(current => current.toLowerCase() === item.toLowerCase())
    if (exists) return
    writeMenuItemsToDraft(date, slot, entry, [...items, item])
    if (defaultQty > 1) setItemQty(date, slot, entry, item, defaultQty)
  }

  function removeMenuItemFromDraft(date: string, slot: MealSlot, entry: EntryKey, itemIndex: number) {
    const section = getSectionDraft(date, slot)
    const items = menuItemsFromDraft(section[entry])
    const removedItem = items[itemIndex]
    const nextItems = items.filter((_, index) => index !== itemIndex)
    writeMenuItemsToDraft(date, slot, entry, nextItems)
    // Clean up stored quantity for the removed item
    if (removedItem) {
      const sk = sectionKey(date, slot)
      setItemQuantities(prev => {
        if (!prev[sk]?.[entry]) return prev
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [removedItem]: _removed, ...rest } = prev[sk][entry]
        return { ...prev, [sk]: { ...prev[sk], [entry]: rest } }
      })
    }
  }

  function addCustomMenuItem(date: string, slot: MealSlot, entry: EntryKey) {
    const key = draftEntryKey(date, slot, entry)
    const value = (customItemInputs[key] ?? '').trim()
    if (!value) return
    addMenuItemToDraft(date, slot, entry, value)
    setCustomItemInputs(prev => ({ ...prev, [key]: '' }))
  }

  function quickTagsFor(slot: MealSlot, entry: EntryKey) {
    return quickTags
      .filter(tag => tag.meal_slot === slot && tag.plan_type === entryPlanType(entry))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
      .slice(0, 6)
  }

  function applySectionDraft(date: string, slot: MealSlot, section: Partial<SectionDraft>) {
    const key = sectionKey(date, slot)
    setDrafts(prev => ({
      ...prev,
      [key]: {
        ...getSectionDraft(date, slot),
        ...section,
      },
    }))
  }

  function selectedMenusFor(date: string) {
    return menus
      .filter(item => item.menu_date === date)
      .sort((a, b) => MEAL_SLOTS.indexOf(a.meal_slot) - MEAL_SLOTS.indexOf(b.meal_slot))
  }

  async function fetchDayMenus(date: string) {
    const { data, error } = await db
      .from('daily_menus')
      .select('*')
      .eq('provider_id', providerId)
      .eq('menu_date', date)
      .order('meal_slot')

    if (error) throw error
    return (data ?? []) as DailyMenu[]
  }

  async function loadWeek(nextStart: string, nextSelectedDate?: string) {
    const end = addDays(nextStart, 6)
    const historyStart = addDays(nextStart, -90)
    const { data, error } = await db
      .from('daily_menus')
      .select('*')
      .eq('provider_id', providerId)
      .gte('menu_date', historyStart)
      .lte('menu_date', end)
      .order('menu_date')
      .order('meal_slot')

    if (error) {
      showToast('error', error.message)
      return
    }

    const weekMenus = (data ?? []).filter((menu: DailyMenu) => menu.menu_date >= nextStart && menu.menu_date <= end)
    setWeekStart(nextStart)
    setSelectedDate(nextSelectedDate ?? nextStart)
    setHistoryMenus(data ?? [])
    setMenus(weekMenus)
    setDrafts({})
    setItemQuantities(extractQuantitiesFromMenus(weekMenus))
    setCopyPickerOpen(false)
    setGoodWeekPickerOpen(false)
  }

  async function changeWeek(direction: -1 | 1) {
    const currentIndex = Math.max(0, days.indexOf(selectedDate))
    const nextStart = addDays(weekStart, direction * 7)
    await loadWeek(nextStart, addDays(nextStart, currentIndex))
  }

  async function navigateDay(delta: -1 | 1) {
    const next = addDays(selectedDate, delta)
    const weekEnd = addDays(weekStart, 6)
    if (next < weekStart) {
      await changeWeek(-1)
    } else if (next > weekEnd) {
      await changeWeek(1)
    } else {
      setSelectedDate(next)
      setCopyPickerOpen(false)
      setActionsOpen(false)
    }
  }

  async function saveSection(slot: MealSlot) {
    const section = getSectionDraft(selectedDate, slot)
    const existing = ENTRY_TYPES.map(({ key }) => ({ key, menu: getMenu(selectedDate, slot, entryPlanType(key)) }))
    // Build quantities map for each entry type
    function buildQtyMap(key: EntryKey): Record<string, number> {
      const items = menuItemsFromDraft(section[key])
      const map: Record<string, number> = {}
      for (const item of items) map[item] = getItemQty(selectedDate, slot, key, item)
      return map
    }

    const inserts = ENTRY_TYPES
      .filter(({ key }) => section[key].trim() && !existing.find(item => item.key === key)?.menu)
      .map(({ key }) => ({
        provider_id: providerId,
        menu_date: selectedDate,
        meal_slot: slot,
        plan_type: entryPlanType(key),
        dish_name: section[key].trim(),
        quantities: buildQtyMap(key),
        updated_at: new Date().toISOString(),
      }))

    setSavingSlot(slot)
    setToast(null)

    try {
      const updatedRows: DailyMenu[] = []
      const deletedIds: string[] = []

      for (const { key, menu } of existing) {
        const dish = section[key].trim()
        if (menu && dish) {
          const { data, error } = await db
            .from('daily_menus')
            .update({ dish_name: dish, quantities: buildQtyMap(key as EntryKey), updated_at: new Date().toISOString() })
            .eq('id', menu.id)
            .select('*')
            .single()
          if (error) throw error
          if (data) updatedRows.push(data)
        }

        if (menu && !dish) {
          const { error } = await db.from('daily_menus').delete().eq('id', menu.id)
          if (error) throw error
          deletedIds.push(menu.id)
        }
      }

      let insertedRows: DailyMenu[] = []
      if (inserts.length) {
        const { data, error } = await db.from('daily_menus').insert(inserts).select('*')
        if (error) throw error
        insertedRows = data ?? []
      }

      setMenus(prev => {
        const touchedIds = new Set([...deletedIds, ...updatedRows.map(item => item.id), ...insertedRows.map(item => item.id)])
        return [
          ...prev.filter(item => !touchedIds.has(item.id) && !(item.menu_date === selectedDate && item.meal_slot === slot && deletedIds.includes(item.id))),
          ...updatedRows,
          ...insertedRows,
        ]
      })
      setHistoryMenus(prev => {
        const touchedIds = new Set([...deletedIds, ...updatedRows.map(item => item.id), ...insertedRows.map(item => item.id)])
        return [
          ...prev.filter(item => !touchedIds.has(item.id) && !(item.menu_date === selectedDate && item.meal_slot === slot && deletedIds.includes(item.id))),
          ...updatedRows,
          ...insertedRows,
        ]
      })
      setDrafts(prev => {
        const next = { ...prev }
        delete next[sectionKey(selectedDate, slot)]
        return next
      })
      setSavedSlot(slot)
      setTimeout(() => setSavedSlot(current => (current === slot ? null : current)), 1500)
      showToast('success', `${MEAL_SLOT_LABEL[slot]} saved`)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Section save failed. Please try again.')
    } finally {
      setSavingSlot(null)
    }
  }

  async function replaceDayMenus(targetDate: string, sourceMenus: DailyMenu[], successMessage: string) {
    if (!sourceMenus.length) {
      showToast('info', 'No menu found to copy from that day.')
      return
    }

    const actionKey = `copy:${targetDate}`
    setWorkingAction(actionKey)
    setToast(null)

    try {
      const { error: deleteError } = await db
        .from('daily_menus')
        .delete()
        .eq('provider_id', providerId)
        .eq('menu_date', targetDate)
      if (deleteError) throw deleteError

      const payload = sourceMenus.map(item => ({
        provider_id: providerId,
        menu_date: targetDate,
        meal_slot: item.meal_slot,
        plan_type: item.plan_type,
        dish_name: item.dish_name,
        notes: item.notes,
        updated_at: new Date().toISOString(),
      }))
      const { data, error: insertError } = await db.from('daily_menus').insert(payload).select('*')
      if (insertError) throw insertError

      setMenus(prev => [
        ...prev.filter(item => item.menu_date !== targetDate),
        ...((data ?? []) as DailyMenu[]),
      ])
      setHistoryMenus(prev => [
        ...prev.filter(item => item.menu_date !== targetDate),
        ...((data ?? []) as DailyMenu[]),
      ])
      setDrafts(prev => {
        const next = { ...prev }
        for (const slot of MEAL_SLOTS) delete next[sectionKey(targetDate, slot)]
        return next
      })
      setCopyPickerOpen(false)
      showToast('success', successMessage)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Copy failed. Please try again.')
    } finally {
      setWorkingAction(null)
    }
  }

  async function copyFromDate(sourceDate: string, label: string) {
    try {
      const sourceMenus = await fetchDayMenus(sourceDate)
      await replaceDayMenus(selectedDate, sourceMenus, `Copied ${label}`)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not load that menu.')
    }
  }

  async function copyCurrentMenu() {
    const text = serializeDayMenu(selectedDate, selectedMenusFor(selectedDate))
    if (!text || text === `${labelDate(selectedDate)} menu`) {
      showToast('info', 'Add or save a menu before copying it.')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      showToast('success', 'Menu copied to clipboard')
    } catch {
      showToast('error', 'Clipboard permission was blocked by the browser.')
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        showToast('info', 'Clipboard is empty.')
        return
      }

      const parsed = parseClipboardMenu(text)
      const slots = Object.keys(parsed) as MealSlot[]
      if (!slots.length) {
        showToast('info', 'Could not read menu sections. Paste text with Breakfast, Lunch, or Dinner labels.')
        return
      }

      for (const slot of slots) {
        applySectionDraft(selectedDate, slot, parsed[slot] ?? emptySection())
      }
      showToast('success', 'Pasted into drafts. Review once, then save each section.')
    } catch {
      showToast('error', 'Clipboard permission was blocked by the browser.')
    }
  }

  async function copyWeekFrom(sourceWeekStart: string, successMessage: string) {
    const sourceWeekEnd = addDays(sourceWeekStart, 6)
    const currentWeekEnd = addDays(weekStart, 6)

    setWeekCopying(true)
    setToast(null)

    try {
      const { data: sourceMenus, error: sourceError } = await db
        .from('daily_menus')
        .select('*')
        .eq('provider_id', providerId)
        .gte('menu_date', sourceWeekStart)
        .lte('menu_date', sourceWeekEnd)
        .order('menu_date')
        .order('meal_slot')

      if (sourceError) throw sourceError

      if (!sourceMenus?.length) {
        setWeekCopyModalOpen(false)
        setGoodWeekPickerOpen(false)
        showToast('info', 'No menu found in the previous week.')
        return
      }

      const { error: deleteError } = await db
        .from('daily_menus')
        .delete()
        .eq('provider_id', providerId)
        .gte('menu_date', weekStart)
        .lte('menu_date', currentWeekEnd)

      if (deleteError) throw deleteError

      const payload = (sourceMenus as DailyMenu[]).map(item => ({
        provider_id: providerId,
        menu_date: addDays(item.menu_date, daysBetween(sourceWeekStart, weekStart)),
        meal_slot: item.meal_slot,
        plan_type: item.plan_type,
        dish_name: item.dish_name,
        notes: item.notes,
        updated_at: new Date().toISOString(),
      }))

      const { data, error: insertError } = await db.from('daily_menus').insert(payload).select('*')
      if (insertError) throw insertError

      setMenus((data ?? []) as DailyMenu[])
      setHistoryMenus(prev => [
        ...prev.filter(item => item.menu_date < weekStart || item.menu_date > currentWeekEnd),
        ...((data ?? []) as DailyMenu[]),
      ])
      setDrafts({})
      setCopyPickerOpen(false)
      setWeekCopyModalOpen(false)
      setGoodWeekPickerOpen(false)
      showToast('success', successMessage)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not copy that week.')
    } finally {
      setWeekCopying(false)
    }
  }

  async function copyEntirePreviousWeek() {
    await copyWeekFrom(addDays(weekStart, -7), 'Copied the entire previous week into this week.')
  }

  const selectedDayMenus = selectedMenusFor(selectedDate)
  const hasCurrentWeek = initialToday >= weekStart && initialToday <= addDays(weekStart, 6)
  const servedThisWeek = allMenuItemsInRange(weekStart, addDays(weekStart, 6))
  const smartSuggestions = smartSuggestionsForWeek()
  const goodWeekOptions = previousWeekOptions()

  return (
    <div onClick={() => setActiveHelp(null)} className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="fixed inset-x-0 top-0 z-40 bg-white backdrop-blur-xl border-b border-orange-100/50 py-3 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
        <div className="mx-auto flex max-w-2xl px-4 items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Menu Planner</h1>
            <p className="text-xs font-semibold text-orange-600/80">Reuse, paste, and save by meal slot</p>
          </div>
          <CalendarDays className="w-5 h-5 text-orange-500" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-20 space-y-3">
        <section className="sticky top-16 z-30 -mx-4 bg-[#FDF8F3] px-4 py-1.5 backdrop-blur-xl">
          {/* Week nav row — always visible */}
          <div className="flex items-center gap-2">
            <button onClick={() => changeWeek(-1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm border border-orange-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setStickyExpanded(open => !open)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white border border-orange-100 px-3 py-2 shadow-sm"
            >
              <div className="text-center">
                <p className="text-xs font-black text-gray-900 leading-none">Weekly menu</p>
                <p className="mt-0.5 text-[10px] font-semibold text-gray-400 leading-none">{labelDate(weekStart)} – {labelDate(addDays(weekStart, 6))}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-orange-500 transition-transform shrink-0 ${stickyExpanded ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => changeWeek(1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm border border-orange-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Collapsible: day pills + copy buttons */}
          {stickyExpanded && (
            <>
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {days.map(date => {
                  const isSelected = date === selectedDate
                  const isToday = date === initialToday
                  const count = selectedMenusFor(date).length
                  const off = isDayOff(date)
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDate(date)
                        setCopyPickerOpen(false)
                        setActiveHelp(null)
                      }}
                      className={`min-w-[4.8rem] rounded-2xl border px-3 py-3 text-left transition-all ${
                        off
                          ? isSelected
                            ? 'border-gray-300 bg-gray-200 text-gray-500 shadow-sm'
                            : 'border-gray-100 bg-gray-50 text-gray-400 shadow-sm'
                          : isSelected
                            ? 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                            : 'border-gray-100 bg-white text-gray-500 shadow-sm'
                      }`}
                    >
                      <span className={`block text-[11px] font-black uppercase tracking-wider ${
                        off ? 'text-gray-400' : isSelected ? 'text-white/80' : 'text-gray-400'
                      }`}>{shortDay(date)}</span>
                      <span className={`mt-1 block text-2xl font-black leading-none ${off ? 'text-gray-400' : ''}`}>{dayNumber(date)}</span>
                      <span className={`mt-2 flex items-center gap-1 text-[10px] font-black ${
                        off ? 'text-gray-400' : isSelected ? 'text-white/85' : 'text-gray-400'
                      }`}>
                        {off
                          ? '🏖️ Off'
                          : <>
                              {isToday && <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-orange-500'}`} />}
                              {count ? `${count} items` : isToday ? 'Today' : 'Plan'}
                            </>
                        }
                      </span>
                    </button>
                  )
                })}
              </div>

              {!hasCurrentWeek && (
                <button
                  onClick={() => loadWeek(thisWeekStart, initialToday)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-50 py-2 text-xs font-black text-orange-600"
                >
                  <RotateCcw className="w-4 h-4" />
                  Jump to current week
                </button>
              )}
            </>
          )}
        </section>

        {toast && (
          <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${
            toast.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-orange-200 bg-orange-50 text-orange-700'
          }`}>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-3 opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Smart nudges — hidden for now */}

        <section className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-orange-500">{dayName(selectedDate)}</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-900">{labelDate(selectedDate)}</h2>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                {selectedDayMenus.length ? `${selectedDayMenus.length} saved menu items` : 'No saved menu yet'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigateDay(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 active:scale-95 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => navigateDay(1)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 active:scale-95 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isDayOff(selectedDate) && (
            <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center gap-2.5">
              <span className="text-lg shrink-0">🏖️</span>
              <div>
                <p className="text-xs font-black text-amber-800">
                  Off day{holidayLabel(selectedDate) ? ` · ${holidayLabel(selectedDate)}` : ''}
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  No deliveries scheduled. You can still plan the menu — it won&apos;t be shown to customers.
                </p>
              </div>
            </div>
          )}

          {/* Copy + Paste — single row, always visible */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              onClick={() => setActionsOpen(o => !o)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 active:bg-gray-100 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="relative">
              <button
                onClick={pasteFromClipboard}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-orange-200 bg-[#FDF8F3] px-3 py-2.5 pr-8 text-xs font-bold text-orange-600 active:bg-orange-50 transition-colors"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Paste
              </button>
              <HelpBubble id="paste-menu" text="Reads copied text from WhatsApp or your clipboard, detects breakfast/lunch/dinner sections, and places it into drafts for review before saving." />
            </div>
          </div>

          {actionsOpen && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <button
                    onClick={() => copyFromDate(addDays(selectedDate, -1), "yesterday's menu")}
                    disabled={workingAction !== null}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-50 px-3 py-2.5 pr-8 text-xs font-black text-orange-600 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Copy yesterday's
                  </button>
                  <HelpBubble id="copy-yesterday" text="Copies yesterday's saved breakfast, lunch, and dinner into the selected day. It replaces this day's saved menu." />
                </div>
                <div className="relative">
                  <button
                    onClick={() => copyFromDate(addDays(selectedDate, -7), "last week's menu")}
                    disabled={workingAction !== null}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-50 px-3 py-2.5 pr-8 text-xs font-black text-orange-600 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Copy last week
                  </button>
                  <HelpBubble id="copy-last-week" text="Copies the same weekday from 7 days earlier. For example, this Monday copies last Monday's menu." />
                </div>
                <div className="relative">
                  <button
                    onClick={() => {
                      setCopyPickerOpen(open => !open)
                      setActiveHelp(null)
                    }}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 pr-8 text-xs font-black transition-colors ${
                      copyPickerOpen ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Choose day
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${copyPickerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <HelpBubble id="choose-day" text="Opens a list of previous dates so you can pick exactly which day to copy from." />
                </div>
                <div className="relative">
                  <button
                    onClick={copyCurrentMenu}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gray-50 px-3 py-2.5 pr-8 text-xs font-black text-gray-700"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    Copy menu
                  </button>
                  <HelpBubble id="copy-menu" text="Copies this selected day's saved menu text to your device clipboard, ready to paste elsewhere." />
                </div>
              </div>

              {/* Week-level copy options — inline style to force side-by-side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  onClick={() => { setActiveHelp(null); setWeekCopyModalOpen(true) }}
                  disabled={weekCopying}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 px-3 py-2.5 text-xs font-black text-white shadow-md shadow-orange-500/20 transition-colors disabled:bg-gray-300 disabled:shadow-none"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy week
                </button>
                <button
                  onClick={() => { setActiveHelp(null); setGoodWeekPickerOpen(open => !open) }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-orange-100 bg-white px-3 py-2.5 text-xs font-black text-orange-600 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Paste week
                  <ChevronDown className={`w-3 h-3 transition-transform ${goodWeekPickerOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              <div>
                {goodWeekPickerOpen && (
                  <div className="mt-2 rounded-3xl border border-orange-100 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500">Reusable weekly patterns</p>
                    <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                      {goodWeekOptions.map(option => (
                        <button
                          key={option.start}
                          onClick={() => copyWeekFrom(option.start, `Reused menu from ${labelDate(option.start)} to ${labelDate(option.end)}.`)}
                          disabled={weekCopying}
                          className="rounded-2xl bg-[#FDF8F3] px-3 py-3 text-left shadow-sm disabled:opacity-50"
                        >
                          <span className="block text-sm font-black text-gray-900">{labelDate(option.start)} to {labelDate(option.end)}</span>
                          <span className="mt-1 block text-[11px] font-bold text-gray-400">{option.itemCount} saved items</span>
                          <span className="mt-2 flex gap-1 overflow-hidden">
                            {option.preview.map(item => (
                              <span key={item} className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-orange-600">{item}</span>
                            ))}
                          </span>
                        </button>
                      ))}
                      {!goodWeekOptions.length && (
                        <p className="rounded-2xl bg-[#FDF8F3] px-3 py-3 text-xs font-bold text-gray-400">
                          No older planned weeks found yet. Once you save a few weeks, they will show up here.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => router.push('/settings#menu-quick-tags')}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-50 px-3 py-3 text-xs font-black text-gray-700"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Configure quick tags
          </button>

          {copyPickerOpen && (
            <div className="mt-3 rounded-3xl border border-orange-100 bg-[#FDF8F3] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">Copy a previous day</p>
                <button onClick={() => setCopyPickerOpen(false)} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1">
                {copyDates.map(date => (
                  <button
                    key={date}
                    onClick={() => copyFromDate(date, labelDate(date))}
                    disabled={workingAction !== null}
                    className="flex items-center justify-between rounded-2xl bg-white px-3 py-3 text-left text-sm font-bold text-gray-700 shadow-sm disabled:opacity-50"
                  >
                    <span>{labelDate(date)}</span>
                    <span className="text-xs text-orange-500">Copy</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setServedExpanded(v => !v)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 active:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-black text-gray-900">Served This Week</span>
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-600">{servedThisWeek.length} dishes</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${servedExpanded ? 'rotate-180' : ''}`} />
          </button>
          {servedExpanded && (
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-gray-400 mb-2.5">A quick memory of what is already planned</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {servedThisWeek.slice(0, 14).map(item => (
                  <span key={item.label} className="shrink-0 rounded-full bg-[#FDF8F3] px-3 py-1.5 text-[11px] font-black text-gray-600">
                    {item.label}{item.count > 1 ? ` ×${item.count}` : ''}
                  </span>
                ))}
                {!servedThisWeek.length && (
                  <span className="text-xs font-semibold text-gray-300">Nothing saved for this week yet.</span>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="space-y-3">
          {MEAL_SLOTS.map(slot => {
            const section = getSectionDraft(selectedDate, slot)
            const hasAnyDraft = ENTRY_TYPES.some(({ key }) => section[key].trim())
            const isSaving = savingSlot === slot
            const isSaved = savedSlot === slot

            return (
              <section key={slot} className="relative rounded-[1.75rem] border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-xl">{MEAL_SLOT_EMOJI[slot]}</span>
                    <div>
                      <h3 className="text-base font-black text-gray-900">{MEAL_SLOT_LABEL[slot]}</h3>
                      <p className="text-xs font-semibold text-gray-400">Edit the full section, then save once</p>
                    </div>
                  </div>
                  <div className="mr-5 shrink-0">
                    <button
                      onClick={() => saveSection(slot)}
                      disabled={isSaving || !hasAnyDraft}
                      className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-black text-white shadow-sm transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none ${
                        isSaved ? 'bg-emerald-500' : 'bg-orange-500'
                      }`}
                    >
                      {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {isSaving ? 'Saving' : isSaved ? 'Saved' : `Save ${MEAL_SLOT_LABEL[slot]}`}
                    </button>
                  </div>
                </div>
                <HelpBubble id={`save-${slot}`} text={`Saves only the ${MEAL_SLOT_LABEL[slot].toLowerCase()} section for this day, including common, veg, and non-veg items.`} className="right-3 top-3" />

                <div className="space-y-2">
                  {ENTRY_TYPES.map(entry => {
                    const selectedItems = menuItemsFromDraft(section[entry.key])
                    const inputKey = draftEntryKey(selectedDate, slot, entry.key)

                    return (
                      <div key={entry.key} className="block rounded-2xl bg-[#FDF8F3] p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-black uppercase tracking-wider text-gray-600">{entry.label}</span>
                          <span className="text-[10px] font-bold text-gray-400">{entry.hint}</span>
                        </div>
                        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {quickTagsFor(slot, entry.key).map(tag => {
                            const servedInfo = lastServedInfo(tag.label)
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => addMenuItemToDraft(selectedDate, slot, entry.key, tag.label, tag.default_quantity ?? 1)}
                                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black shadow-sm ${tagToneClasses(tag.label)}`}
                              >
                                + {tag.label}{(tag.default_quantity ?? 1) > 1 ? ` ×${tag.default_quantity}` : ''}
                              </button>
                            )
                          })}
                          {!quickTagsFor(slot, entry.key).length && (
                            <button
                              type="button"
                              onClick={() => router.push('/settings#menu-quick-tags')}
                              className="shrink-0 rounded-full border border-dashed border-gray-200 bg-white px-3 py-1.5 text-[11px] font-black text-gray-400"
                            >
                              Add tags
                            </button>
                          )}
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-2 focus-within:border-[#F4622A] focus-within:ring-2 focus-within:ring-orange-100">
                          <div className="flex min-h-10 flex-wrap gap-1.5">
                            {selectedItems.map((item, index) => {
                              const qty = getItemQty(selectedDate, slot, entry.key, item)
                              return (
                                <span key={`${item}-${index}`} className="inline-flex items-center gap-0.5 rounded-full border border-orange-100 bg-orange-50 pl-2.5 pr-1 py-1">
                                  <span className="text-[11px] font-black text-orange-700">{item}</span>
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(selectedDate, slot, entry.key, item, qty - 1)}
                                    disabled={qty <= 1}
                                    className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[12px] font-black leading-none text-orange-400 disabled:opacity-30 active:bg-orange-100 transition-colors"
                                    aria-label={`Decrease ${item} quantity`}
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[1.5ch] text-center text-[11px] font-black text-orange-600">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(selectedDate, slot, entry.key, item, qty + 1)}
                                    className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[12px] font-black leading-none text-orange-500 active:bg-orange-100 transition-colors"
                                    aria-label={`Increase ${item} quantity`}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeMenuItemFromDraft(selectedDate, slot, entry.key, index)}
                                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/80 text-orange-300 active:bg-orange-100 transition-colors"
                                    aria-label={`Remove ${item}`}
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              )
                            })}
                            {!selectedItems.length && (
                              <span className="px-1 py-2 text-xs font-semibold text-gray-300">{entry.placeholder}</span>
                            )}
                          </div>
                          {selectedItems.some(item => pairingSuggestionsFor(item, slot).length > 0) && (
                            <div className="mt-2 flex gap-1.5 overflow-x-auto border-t border-gray-100 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {selectedItems.flatMap(item => pairingSuggestionsFor(item, slot)).slice(0, 4).map(pair => (
                                <button
                                  key={pair.label}
                                  type="button"
                                  onClick={() => addMenuItemToDraft(selectedDate, slot, entry.key, pair.label)}
                                  className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700"
                                >
                                  Usually with {pair.label}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
                            <input
                              value={customItemInputs[inputKey] ?? ''}
                              onChange={(event) => setCustomItemInputs(prev => ({ ...prev, [inputKey]: event.target.value }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  addCustomMenuItem(selectedDate, slot, entry.key)
                                }
                              }}
                              placeholder="Type custom item"
                              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-300"
                            />
                            <button
                              type="button"
                              onClick={() => addCustomMenuItem(selectedDate, slot, entry.key)}
                              disabled={!(customItemInputs[inputKey] ?? '').trim()}
                              className="rounded-full bg-orange-500 px-3 py-1.5 text-[11px] font-black text-white disabled:bg-gray-200 disabled:text-gray-400"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </main>

      {weekCopyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/40 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
          onClick={() => {
            if (!weekCopying) setWeekCopyModalOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-week-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-[2rem] border border-orange-100 bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 id="copy-week-title" className="text-lg font-black tracking-tight text-gray-900">Copy entire previous week?</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-gray-500">
                  This will copy {labelDate(addDays(weekStart, -7))} to {labelDate(addDays(weekStart, -1))} into {labelDate(weekStart)} to {labelDate(addDays(weekStart, 6))}.
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-orange-50 px-4 py-3 text-xs font-bold leading-relaxed text-orange-700">
              Consequence: any saved menu already in this current week will be replaced by the previous week&apos;s breakfast, lunch, and dinner entries.
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setWeekCopyModalOpen(false)}
                disabled={weekCopying}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-600 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={copyEntirePreviousWeek}
                disabled={weekCopying}
                className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:bg-gray-300 disabled:shadow-none"
              >
                {weekCopying ? 'Copying...' : 'Yes, copy week'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
