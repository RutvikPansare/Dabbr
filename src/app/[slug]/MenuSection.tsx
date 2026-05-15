'use client'

import { useState } from 'react'
import { Utensils } from 'lucide-react'

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'] as const
const SLOT_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' }
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

interface Dish {
  dish_name: string
  plan_type: string | null
}

interface DayData {
  date: string       // YYYY-MM-DD
  label: string      // e.g. "Mon" or "Today"
  dayNum: string     // e.g. "12"
  slots: {
    slot: string
    dishes: Dish[]
  }[]
  isHoliday?: boolean
  holidayLabel?: string | null
}

interface Props {
  days: DayData[]
}

export default function MenuSection({ days }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const selected = days[selectedIdx]

  const title = selectedIdx === 0
    ? "Today's Menu"
    : new Date(selected.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'short',
      })

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Utensils className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">{title}</h2>
      </div>

      {/* Day pill strip */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
        {days.map((day, idx) => {
          const hasMenu = day.slots.some(s => s.dishes.length > 0)
          const sel = selectedIdx === idx
          const holiday = day.isHoliday ?? false

          if (holiday) {
            return (
              <button
                key={day.date}
                onClick={() => setSelectedIdx(idx)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all duration-200 shrink-0 min-w-[52px] ${
                  sel ? 'bg-gray-200 text-gray-600 shadow-sm' : 'bg-gray-50 border border-gray-100 text-gray-400'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{day.label}</span>
                <span className="text-base font-black leading-none">{day.dayNum}</span>
                <span className="text-[8px] font-black uppercase tracking-wider text-gray-400">Off</span>
              </button>
            )
          }

          return (
            <button
              key={day.date}
              onClick={() => setSelectedIdx(idx)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl transition-all duration-200 shrink-0 min-w-[52px] ${
                sel
                  ? 'text-white shadow-md'
                  : 'bg-white border border-gray-100 text-gray-700 hover:border-orange-200'
              }`}
              style={sel ? { backgroundColor: 'var(--accent)' } : {}}
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider ${sel ? 'text-orange-100' : 'text-gray-400'}`}>
                {day.label}
              </span>
              <span className="text-base font-black leading-none">{day.dayNum}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${hasMenu ? (sel ? 'bg-orange-200' : 'bg-orange-400') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>

      {/* Dishes for selected day */}
      {selected.isHoliday ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-8 text-center shadow-sm">
          <p className="text-3xl mb-2">🏖️</p>
          <p className="text-sm font-bold text-gray-600">
            {selected.holidayLabel ?? 'No delivery this day'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Provider is off — check back the next delivery day.</p>
        </div>
      ) : selected.slots.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 px-4 py-8 text-center shadow-sm">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-sm font-semibold text-gray-500">Menu not announced yet</p>
          <p className="text-xs text-gray-400 mt-1">Check back later or contact the provider.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selected.slots.map(({ slot, dishes }) => (
            <div key={slot} className="rounded-2xl bg-white border border-gray-100 px-4 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5">
                {SLOT_EMOJI[slot]} {SLOT_LABEL[slot]}
              </p>
              <ul className="space-y-1.5">
                {dishes.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                    <span className="mt-0.5 shrink-0 text-[10px]">
                      {d.plan_type === 'veg' ? '🥦' : d.plan_type === 'nonveg' ? '🍗' : '•'}
                    </span>
                    <span className="font-medium">{d.dish_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
