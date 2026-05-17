'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getIndianHolidays, getIndianHolidaysInMonth, type IndianHoliday } from '@/lib/indian-holidays'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SingleProps {
  mode: 'single'
  value?: string
  onChange: (date: string) => void
  rangeStart?: never
  rangeEnd?: never
  onRangeChange?: never
  disabledDates?: string[]   // already-added holidays — shown amber, not selectable
  offDays?: number[]         // weekly off days 0=Sun…6=Sat — shown gray
}

interface RangeProps {
  mode: 'range'
  value?: never
  onChange?: never
  rangeStart?: string
  rangeEnd?: string
  onRangeChange: (start: string, end: string) => void
  disabledDates?: string[]
  offDays?: number[]
}

type Props = SingleProps | RangeProps

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
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

function typeDot(type: IndianHoliday['type'], onDark = false) {
  if (onDark) return 'bg-white/80'
  return type === 'national' ? 'bg-orange-500'
       : type === 'festival' ? 'bg-violet-500'
       : 'bg-teal-500'
}

function typeBadge(type: IndianHoliday['type']) {
  return type === 'national' ? 'bg-orange-100 text-orange-700'
       : type === 'festival' ? 'bg-violet-100 text-violet-700'
       : 'bg-teal-100 text-teal-700'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CalendarPicker({
  mode, value, onChange, rangeStart, rangeEnd, onRangeChange,
  disabledDates = [], offDays = [],
}: Props) {
  const todayStr = toDStr(new Date())

  // Month view
  const initStr = (mode === 'single' ? value : rangeStart) || todayStr
  const initD   = new Date(initStr + 'T12:00:00Z')
  const [year, setYear]   = useState(initD.getUTCFullYear())
  const [month, setMonth] = useState(initD.getUTCMonth())

  // Collapsible bottom sections — start collapsed to save space
  const [showIndianList, setShowIndianList] = useState(false)
  const [showLegend, setShowLegend]         = useState(false)

  // Hover date for range preview
  const [hoverDate, setHoverDate]     = useState<string | null>(null)
  // Cell being hovered — drives the Indian holiday info strip
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  // Drag tracking via refs (no stale-closure risk)
  const pressAnchorRef = useRef<string | null>(null)
  const hasMovedRef    = useRef(false)
  const [dragging, setDragging] = useState(false)

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // ── Grid ───────────────────────────────────────────────────────────────────

  const firstDow    = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function cellDate(day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // ── Effective range ─────────────────────────────────────────────────────────

  const awaitingEnd  = mode === 'range' && !!rangeStart && !rangeEnd
  const effectiveEnd = dragging || awaitingEnd ? (hoverDate ?? rangeEnd ?? undefined) : (rangeEnd || undefined)

  const lo = rangeStart && effectiveEnd ? [rangeStart, effectiveEnd].sort()[0] : rangeStart ?? undefined
  const hi = rangeStart && effectiveEnd ? [rangeStart, effectiveEnd].sort()[1] : effectiveEnd

  // ── Indian holiday info strip ───────────────────────────────────────────────

  const infoDateStr: string | null =
    hoveredCell ??
    (mode === 'single' ? (value ?? null) : (rangeStart ?? null))
  const infoIndian = infoDateStr ? getIndianHolidays(infoDateStr) : []
  const infoFmt = infoDateStr
    ? new Date(infoDateStr + 'T12:00:00Z').toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
    : ''

  // ── Click-selection ─────────────────────────────────────────────────────────

  function commitSelect(dateStr: string) {
    if (mode === 'single') { onChange(dateStr); return }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      onRangeChange(dateStr, '')
      setHoverDate(null)
    } else {
      const [s, e] = [rangeStart, dateStr].sort()
      onRangeChange(s, e)
      setHoverDate(null)
    }
  }

  // ── Mouse interaction ──────────────────────────────────────────────────────

  function handlePointerDown(e: React.MouseEvent, dateStr: string) {
    if (disabledDates.includes(dateStr)) return
    if (e.button !== 0) return
    e.preventDefault()
    pressAnchorRef.current = dateStr
    hasMovedRef.current    = false
    if (mode === 'range') { setDragging(false); setHoverDate(dateStr) }
  }

  function handlePointerEnter(dateStr: string) {
    setHoveredCell(dateStr)
    if (mode === 'range') setHoverDate(dateStr)
    if (pressAnchorRef.current && dateStr !== pressAnchorRef.current) {
      hasMovedRef.current = true
      if (mode === 'range') setDragging(true)
    }
  }

  function handlePointerUp(dateStr: string) {
    const anchor = pressAnchorRef.current
    if (!anchor) return
    pressAnchorRef.current = null
    if (hasMovedRef.current) {
      if (mode === 'range') {
        const [s, e] = [anchor, dateStr].sort()
        onRangeChange(s, e)
        setDragging(false)
        setHoverDate(null)
      }
    } else {
      commitSelect(anchor)
    }
    hasMovedRef.current = false
  }

  const cancelDrag = useCallback(() => {
    if (!pressAnchorRef.current) return
    const anchor = pressAnchorRef.current
    pressAnchorRef.current = null
    if (mode === 'range' && hasMovedRef.current) {
      const end = hoverDate ?? anchor
      const [s, e] = [anchor, end].sort()
      onRangeChange(s, e)
    }
    hasMovedRef.current = false
    setDragging(false)
  }, [hoverDate, mode, onRangeChange])

  useEffect(() => {
    window.addEventListener('mouseup', cancelDrag)
    return () => window.removeEventListener('mouseup', cancelDrag)
  }, [cancelDrag])

  // ── Touch interaction ──────────────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent, dateStr: string) {
    if (mode !== 'range' || disabledDates.includes(dateStr)) return
    e.preventDefault()
    pressAnchorRef.current = dateStr
    hasMovedRef.current    = false
    setHoverDate(dateStr)
    setHoveredCell(dateStr)
    setDragging(false)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!pressAnchorRef.current) return
    e.preventDefault()
    const t  = e.touches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)
    const d  = el?.getAttribute('data-date')
    if (d && d !== pressAnchorRef.current) {
      hasMovedRef.current = true
      setDragging(true)
      setHoverDate(d)
      setHoveredCell(d)
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const anchor = pressAnchorRef.current
    if (!anchor) return
    pressAnchorRef.current = null
    e.preventDefault()
    if (hasMovedRef.current) {
      const t   = e.changedTouches[0]
      const el  = document.elementFromPoint(t.clientX, t.clientY)
      const end = el?.getAttribute('data-date') ?? hoverDate ?? anchor
      const [s, en] = [anchor, end].sort()
      onRangeChange?.(s, en)
      setDragging(false)
      setHoverDate(null)
    } else {
      commitSelect(anchor)
    }
    hasMovedRef.current = false
    setHoveredCell(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="select-none rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden"
      onMouseLeave={() => {
        if (!pressAnchorRef.current) setHoverDate(null)
        setHoveredCell(null)
      }}
    >
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <button type="button" onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-gray-100 active:scale-90 transition-all text-gray-400 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-black text-gray-900 tracking-tight">{MONTH_NAMES[month]} {year}</p>
        <button type="button" onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-gray-100 active:scale-90 transition-all text-gray-400 hover:text-gray-700">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 px-2 pt-3 pb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-300 tracking-wider">{d}</div>
        ))}
      </div>

      {/* Date grid */}
      <div
        className="grid grid-cols-7 gap-1 px-2 pb-2"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="h-14" />

          const dateStr  = cellDate(day)
          const disabled = disabledDates.includes(dateStr)
          const dow      = (firstDow + day - 1) % 7
          const isOff    = offDays.includes(dow)
          const isToday  = dateStr === todayStr

          // Selection state
          const isSelected = mode === 'single' && value === dateStr
          const isStart    = !!lo && dateStr === lo
          const isEnd      = !!hi && !!lo && hi !== lo && dateStr === hi
          const isInRange  = !!lo && !!hi && lo !== hi && dateStr > lo && dateStr < hi
          const isEdge     = isStart || isEnd

          // Row position for range strip rounding
          const col        = dow
          const isRowStart = col === 0
          const isRowEnd   = col === 6

          // Indian holidays
          const indian    = getIndianHolidays(dateStr)
          const topIndian = indian[0]
          const onDark    = isSelected || isEdge

          // ── Button background / text colour ──────────────────────────────
          const cellStyle =
            isSelected || isEdge  ? 'bg-orange-500 text-white shadow-sm'
            : disabled            ? 'bg-amber-100 text-amber-800'
            : isOff && isInRange  ? 'bg-gray-100 text-gray-400'
            : isOff               ? 'bg-gray-100 text-gray-400'
            : isInRange           ? 'bg-transparent text-orange-800'
            : isToday             ? 'text-orange-600 ring-2 ring-orange-300'
            : 'text-gray-700'

          const hoverStyle =
            disabled                      ? 'cursor-not-allowed'
            : isEdge || isSelected        ? ''
            : isInRange                   ? 'hover:bg-orange-200 cursor-pointer'
            : 'hover:bg-gray-100 cursor-pointer'

          return (
            <div key={dateStr} className="relative h-14">

              {/* ── Range fill strips — sit behind the cell button ─────── */}
              {isInRange && (
                <div className={[
                  'absolute top-1 bottom-1 inset-x-0 bg-orange-100',
                  isRowStart ? 'rounded-l-xl' : '',
                  isRowEnd   ? 'rounded-r-xl'  : '',
                ].join(' ')} />
              )}
              {isStart && hi && lo !== hi && (
                <div className={[
                  'absolute top-1 bottom-1 left-1/2 right-0 bg-orange-100',
                  isRowEnd ? 'rounded-r-xl' : '',
                ].join(' ')} />
              )}
              {isEnd && lo && lo !== hi && (
                <div className={[
                  'absolute top-1 bottom-1 left-0 right-1/2 bg-orange-100',
                  isRowStart ? 'rounded-l-xl' : '',
                ].join(' ')} />
              )}

              {/* ── Cell button — fills the cell, sits above fills ──────── */}
              <button
                type="button"
                data-date={dateStr}
                disabled={disabled}
                onMouseDown={e => !disabled && handlePointerDown(e, dateStr)}
                onMouseEnter={() => handlePointerEnter(dateStr)}
                onMouseUp={() => !disabled && handlePointerUp(dateStr)}
                onTouchStart={e => !disabled && handleTouchStart(e, dateStr)}
                className={[
                  'absolute inset-y-1 inset-x-0 z-10 flex flex-col items-center justify-center rounded-xl transition-all duration-100 active:scale-95',
                  cellStyle,
                  hoverStyle,
                ].join(' ')}
              >
                {/* Day number */}
                <span className="font-black text-[13px] leading-none">{day}</span>

                {/* Row 1 — provider status: 🏖️ for holidays, Off for off-days */}
                <span className="flex items-center justify-center mt-0.5" style={{ height: '13px' }}>
                  {disabled && <span className="text-[10px] leading-none">🏖️</span>}
                  {!disabled && isOff && (
                    <span className={`text-[8px] font-bold leading-none ${onDark ? 'text-white/80' : 'text-gray-400'}`}>
                      Off
                    </span>
                  )}
                </span>

                {/* Row 2 — Indian holiday dot */}
                <span className="flex items-center justify-center gap-0.5" style={{ height: '9px' }}>
                  {topIndian && (
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${typeDot(topIndian.type, onDark)}`} />
                  )}
                  {indian.length > 1 && (
                    <span className={`text-[7px] font-black leading-none ${onDark ? 'text-white/70' : 'text-gray-400'}`}>
                      +{indian.length - 1}
                    </span>
                  )}
                </span>
              </button>

            </div>
          )
        })}
      </div>

      {/* Indian holiday info strip */}
      {infoIndian.length > 0 && (
        <div className="mx-2 mb-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{infoFmt}</p>
          {infoIndian.map((h, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeDot(h.type)}`} />
              <span className="text-[11px] font-bold text-gray-700 flex-1">{h.emoji} {h.name}</span>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${typeBadge(h.type)}`}>
                {h.type}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Range status hint */}
      {mode === 'range' && (
        <div className="px-2 pb-1">
          <p className="text-[11px] font-semibold text-gray-300 text-center">
            {!rangeStart
              ? 'Tap a date or drag across dates'
              : !rangeEnd
              ? 'Tap end date, or drag to extend'
              : (() => {
                  const fmt = (s: string) => new Date(s + 'T12:00:00Z')
                    .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  return `${fmt(rangeStart)} → ${fmt(rangeEnd)}`
                })()
            }
          </p>
        </div>
      )}

      {/* Indian holidays this month — collapsible */}
      {(() => {
        const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`
        const monthHolidays = getIndianHolidaysInMonth(yearMonth)
        if (!monthHolidays.length) return null
        return (
          <div className="mx-2 mb-1 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowIndianList(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100 transition-colors"
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                🇮🇳 Indian Holidays this month
                <span className="ml-1.5 font-bold text-gray-300 normal-case tracking-normal">({monthHolidays.length})</span>
              </span>
              <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showIndianList ? 'rotate-90' : ''}`} />
            </button>
            {showIndianList && (
              <div className="px-3 pb-2.5 space-y-1.5 border-t border-gray-100">
                <div className="pt-2 space-y-1.5">
                  {monthHolidays.map((h, idx) => {
                    const day = parseInt(h.date.split('-')[2])
                    const dow = new Date(h.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short' })
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeDot(h.type)}`} />
                        <span className="text-[10px] font-black text-gray-400 w-10 shrink-0">{dow} {day}</span>
                        <span className="text-[11px] font-bold text-gray-700 flex-1 truncate">{h.emoji} {h.name}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${typeBadge(h.type)}`}>
                          {h.type}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Legend — collapsible */}
      <div className="mx-2 mb-2 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLegend(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100 transition-colors"
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Legend</span>
          <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showLegend ? 'rotate-90' : ''}`} />
        </button>
        {showLegend && (
          <div className="px-3 pb-2.5 border-t border-gray-100 space-y-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-lg bg-orange-500 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-lg bg-amber-100 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">Holiday 🏖️</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-lg bg-gray-100 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">Weekly off</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-lg ring-2 ring-orange-300 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">Today</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1.5 border-t border-gray-200">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">National</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">Festival</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                <span className="text-[10px] font-bold text-gray-500">Religious</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
