'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  startDate: string        // YYYY-MM-DD
  endDate: string          // YYYY-MM-DD
  minDate: string          // earliest selectable date (YYYY-MM-DD)
  onChange: (start: string, end: string) => void
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function DateRangePicker({ startDate, endDate, minDate, onChange }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const initial = new Date(startDate + 'T00:00:00')
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  // 'start' = next click sets start, 'end' = next click sets end
  const [picking, setPicking] = useState<'start' | 'end'>('start')
  const [hovered, setHovered] = useState<string | null>(null)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function handleDay(dateStr: string) {
    if (dateStr < minDate) return
    if (picking === 'start') {
      // Reset: new start date, clear end if it's before new start
      const newEnd = endDate >= dateStr ? endDate : dateStr
      onChange(dateStr, newEnd)
      setPicking('end')
    } else {
      if (dateStr < startDate) {
        // Clicked before start → make it the new start
        onChange(dateStr, endDate)
        setPicking('end')
      } else {
        onChange(startDate, dateStr)
        setPicking('start')
      }
    }
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDate(viewYear, viewMonth, i + 1)),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  // Effective range end for highlight (use hovered if we're picking end)
  const rangeEnd = picking === 'end' && hovered && hovered > startDate ? hovered : endDate

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-black text-gray-900">
          {MONTHS[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-black text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />

          const disabled = dateStr < minDate
          const isStart = dateStr === startDate
          const isEnd = dateStr === endDate
          const inRange = dateStr > startDate && dateStr < rangeEnd
          const isToday = dateStr === today
          const isHovered = dateStr === hovered && picking === 'end'

          let cellClass = 'relative flex items-center justify-center h-9 text-xs font-bold transition-all cursor-pointer '

          if (disabled) {
            cellClass += 'text-gray-200 cursor-not-allowed '
          } else if (isStart || isEnd) {
            cellClass += 'text-white z-10 '
          } else if (inRange) {
            cellClass += 'text-orange-900 bg-orange-50 '
          } else if (isHovered) {
            cellClass += 'text-orange-600 bg-orange-50 rounded-xl '
          } else if (isToday) {
            cellClass += 'text-orange-500 font-black '
          } else {
            cellClass += 'text-gray-700 hover:bg-gray-100 rounded-xl '
          }

          // Range strip: extend bg for start/end caps
          const isStartInRange = isStart && endDate > startDate
          const isEndInRange = isEnd && endDate > startDate

          return (
            <div
              key={dateStr}
              className="relative"
              onMouseEnter={() => !disabled && setHovered(dateStr)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleDay(dateStr)}
            >
              {/* Range fill strip (behind the circle) */}
              {(isStartInRange || isEndInRange || inRange) && (
                <div className={`absolute inset-y-0.5 bg-orange-50 ${
                  isStart ? 'left-1/2 right-0' :
                  isEnd   ? 'left-0 right-1/2' :
                  'left-0 right-0'
                }`} />
              )}
              {/* Day circle */}
              <div className={`${cellClass} ${(isStart || isEnd) ? 'rounded-xl bg-orange-500 shadow-sm w-9 mx-auto' : 'w-full rounded-xl'}`}>
                {dateStr.split('-')[2].replace(/^0/, '')}
                {isToday && !isStart && !isEnd && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 pb-3 pt-1 border-t border-gray-50">
        <button
          type="button"
          onClick={() => setPicking('start')}
          className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${picking === 'start' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Selecting: {picking === 'start' ? '▶ Start' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => setPicking('end')}
          className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${picking === 'end' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}
        >
          {picking === 'end' ? '▶ End' : 'End'}
        </button>
      </div>
    </div>
  )
}
