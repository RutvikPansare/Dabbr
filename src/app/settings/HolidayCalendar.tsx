'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { getIndianHolidays, getIndianHolidaysInMonth, type IndianHoliday } from '@/lib/indian-holidays'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderHoliday {
  id: string
  date: string        // YYYY-MM-DD
  label: string | null
}

interface Props {
  offDays: number[]           // 0=Sun … 6=Sat
  holidays: ProviderHoliday[]
  onClose: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SHORT_DAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDStr(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

// ── Dot badge for Indian holiday type ─────────────────────────────────────────

function typeDot(type: IndianHoliday['type']) {
  return type === 'national'
    ? 'bg-orange-500'
    : type === 'festival'
    ? 'bg-violet-500'
    : 'bg-teal-500'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HolidayCalendar({ offDays, holidays, onClose }: Props) {
  const nowUtc   = new Date()
  const todayStr = toDStr(nowUtc)

  const [year,   setYear]   = useState(nowUtc.getUTCFullYear())
  const [month,  setMonth]  = useState(nowUtc.getUTCMonth())
  const [picked, setPicked] = useState<string | null>(null)
  // Navigation
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Grid
  const firstDow    = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // Provider holiday lookup
  const providerMap = new Map(holidays.map(h => [h.date, h]))

  // Stats for this month
  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`
  const providerHolidayCount = holidays.filter(h => h.date.startsWith(yearMonth)).length
  const indianThisMonth = getIndianHolidaysInMonth(yearMonth)

  // Picked date details
  const pickedProvider = picked ? providerMap.get(picked) : null
  const pickedIndian   = picked ? getIndianHolidays(picked) : []
  const pickedIsOff    = picked
    ? offDays.includes(new Date(picked + 'T12:00:00Z').getUTCDay())
    : false
  const pickedFmt = picked
    ? new Date(picked + 'T12:00:00Z').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl sm:mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle (mobile only) */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-black text-gray-900">My Calendar</p>
            <p className="text-xs font-medium text-gray-400">Your off days, holidays &amp; Indian festivals</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 pb-6">

            {/* Month / Year navigation */}
            <div className="flex items-center justify-between py-4">
              <button
                onClick={prevMonth}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-gray-100 active:scale-90 transition-all text-gray-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="text-center">
                <p className="text-base font-black text-gray-900 tracking-tight">
                  {MONTH_NAMES[month]}
                </p>
                {/* Year +/- */}
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <button
                    onClick={() => setYear(y => y - 1)}
                    className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold text-gray-500 w-10 text-center">{year}</span>
                  <button
                    onClick={() => setYear(y => y + 1)}
                    className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Month summary pills */}
                <div className="flex items-center justify-center gap-2 mt-1.5">
                  {providerHolidayCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">
                      🏖️ {providerHolidayCount} holiday{providerHolidayCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {indianThisMonth.length > 0 && (
                    <span className="rounded-full bg-violet-50 border border-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-700">
                      🇮🇳 {indianThisMonth.length} Indian
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={nextMonth}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-gray-100 active:scale-90 transition-all text-gray-500"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-2">
              {SHORT_DAY.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-300 tracking-wider">{d}</div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} style={{ height: '3.5rem' }} />

                const dow      = (firstDow + day - 1) % 7
                const dateStr  = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const provider = providerMap.get(dateStr)
                const indian   = getIndianHolidays(dateStr)
                const isOff    = offDays.includes(dow)
                const isToday  = dateStr === todayStr
                const isSel    = picked === dateStr

                // Highest-priority indicator for the dot row
                const topIndian = indian[0]

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setPicked(prev => prev === dateStr ? null : dateStr)}
                    className={[
                      'relative flex flex-col items-center justify-center rounded-xl text-xs transition-all active:scale-90 select-none',
                      provider
                        ? 'bg-amber-100 text-amber-800'
                        : isOff
                        ? 'bg-gray-100 text-gray-400'
                        : isToday
                        ? 'text-orange-600'
                        : 'text-gray-700 hover:bg-gray-50',
                      isSel ? 'ring-2 ring-orange-400 ring-offset-1' : '',
                      isToday && !provider && !isOff ? 'ring-2 ring-orange-300' : '',
                    ].join(' ')}
                    style={{ height: '3.5rem' }}
                  >
                    {/* Day number */}
                    <span className="font-black leading-none text-[13px]">{day}</span>

                    {/* Row 1: provider status — fixed height so cells stay uniform */}
                    <span className="flex items-center justify-center mt-1" style={{ height: '14px' }}>
                      {provider && <span className="text-[11px] leading-none">🏖️</span>}
                      {isOff && !provider && <span className="text-[8px] font-bold text-gray-400 leading-none">Off</span>}
                    </span>

                    {/* Row 2: Indian holiday dot — fixed height */}
                    <span className="flex items-center justify-center gap-0.5 mt-0.5" style={{ height: '10px' }}>
                      {topIndian && (
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${typeDot(topIndian.type)}`} />
                      )}
                      {indian.length > 1 && (
                        <span className="text-[7px] font-black text-gray-400 leading-none">+{indian.length - 1}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Tapped-date detail card */}
            {picked && (
              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
                {/* Date title */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-xs font-black text-gray-800">{pickedFmt}</p>
                  {pickedProvider && (
                    <p className="text-[11px] font-semibold text-amber-700 mt-0.5">
                      🏖️ Your holiday{pickedProvider.label ? ` — ${pickedProvider.label}` : ''}
                    </p>
                  )}
                  {pickedIsOff && !pickedProvider && (
                    <p className="text-[11px] font-semibold text-gray-500 mt-0.5">🚫 Weekly off day</p>
                  )}
                  {!pickedProvider && !pickedIsOff && (
                    <p className="text-[11px] font-semibold text-green-600 mt-0.5">✅ Delivery day</p>
                  )}
                </div>

                {/* Indian holidays for this date */}
                {pickedIndian.length > 0 && (
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Indian Holidays</p>
                    {pickedIndian.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${typeDot(h.type)}`} />
                        <span className="text-xs font-bold text-gray-700">{h.emoji} {h.name}</span>
                        <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                          h.type === 'national' ? 'bg-orange-100 text-orange-700' :
                          h.type === 'festival' ? 'bg-violet-100 text-violet-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>
                          {h.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Indian holidays this month — collapsible list */}
            {indianThisMonth.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2 px-1">
                  🇮🇳 Indian Holidays this month
                </p>
                <div className="space-y-1.5">
                  {indianThisMonth.map((h, idx) => {
                    const day = parseInt(h.date.split('-')[2])
                    const dow = new Date(h.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short' })
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPicked(h.date)}
                        className="w-full flex items-center gap-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all px-3 py-2.5 text-left"
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${typeDot(h.type)}`} />
                        <span className="text-[11px] font-black text-gray-400 w-10 shrink-0">{dow} {day}</span>
                        <span className="text-xs font-bold text-gray-700 flex-1 truncate">{h.emoji} {h.name}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                          h.type === 'national' ? 'bg-orange-100 text-orange-700' :
                          h.type === 'festival' ? 'bg-violet-100 text-violet-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>
                          {h.type}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Legend</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-lg bg-amber-100 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-600">Your holiday</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-lg bg-gray-100 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-600">Weekly off</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-lg ring-2 ring-orange-300 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-600">Today</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 border-t border-gray-200">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-600">National holiday</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-600">Festival</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-600">Religious</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
