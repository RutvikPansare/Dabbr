'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart2, Download, CalendarRange, Users, FileText,
  TrendingUp, Receipt, IndianRupee, Loader2, ChevronDown,
} from 'lucide-react'
import BottomNav from '@/components/BottomNav'

// ── Types ──────────────────────────────────────────────────────────────────────

type ReportId =
  | 'delivery-log'
  | 'daily-summary'
  | 'revenue'
  | 'customer-snapshot'
  | 'gst-summary'

interface ReportDef {
  id: ReportId
  icon: React.ElementType
  title: string
  description: string
  needsDateRange: boolean
  color: string
  badge?: string
}

// ── Report definitions ─────────────────────────────────────────────────────────

const REPORTS: ReportDef[] = [
  {
    id: 'delivery-log',
    icon: FileText,
    title: 'Delivery Log',
    description: 'Every delivery and skip event for each customer and meal slot in a date range. Great for resolving disputes or auditing delivery history.',
    needsDateRange: true,
    color: 'blue',
  },
  {
    id: 'daily-summary',
    icon: BarChart2,
    title: 'Daily Delivery Summary',
    description: 'Day-by-day totals — how many meals were delivered vs skipped. Useful for spotting trends and monthly reviews.',
    needsDateRange: true,
    color: 'orange',
  },
  {
    id: 'revenue',
    icon: IndianRupee,
    title: 'Revenue Report',
    description: 'All payments received (both prepaid and monthly settlement) in a date range, with customer names and notes.',
    needsDateRange: true,
    color: 'green',
  },
  {
    id: 'customer-snapshot',
    icon: Users,
    title: 'Customer Snapshot',
    description: 'Current state of all customers — billing type, plan, balance days (prepaid) or meals delivered (monthly settlement), and when they joined.',
    needsDateRange: false,
    color: 'purple',
  },
  {
    id: 'gst-summary',
    icon: Receipt,
    title: 'GST Revenue Summary',
    description: 'Monthly revenue breakdown for GST composition scheme filing (5% on food turnover). Splits prepaid collections from monthly settlements with GST estimates.',
    needsDateRange: true,
    color: 'red',
    badge: 'GST',
  },
]

// ── Preset ranges ──────────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const PRESETS = [
  {
    label: 'Last 30 days',
    range: () => {
      const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29)
      return { from: isoDate(from), to: isoDate(to) }
    },
  },
  {
    label: 'Last 3 months',
    range: () => {
      const to = new Date(); const from = new Date(); from.setMonth(from.getMonth() - 3)
      return { from: isoDate(from), to: isoDate(to) }
    },
  },
  {
    label: 'Last 6 months',
    range: () => {
      const to = new Date(); const from = new Date(); from.setMonth(from.getMonth() - 6)
      return { from: isoDate(from), to: isoDate(to) }
    },
  },
  {
    label: 'This year',
    range: () => {
      const to = new Date()
      const from = new Date(to.getFullYear(), 0, 1)
      return { from: isoDate(from), to: isoDate(to) }
    },
  },
  {
    label: 'Last year',
    range: () => {
      const y = new Date().getFullYear() - 1
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    },
  },
  { label: 'Custom', range: null },
]

// ── Color helpers ──────────────────────────────────────────────────────────────

const COLORS: Record<string, { icon: string; badge: string; ring: string; card: string; btn: string }> = {
  blue:   { icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700',   ring: 'ring-blue-200',   card: 'hover:border-blue-200',   btn: 'bg-blue-500 hover:bg-blue-600' },
  orange: { icon: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', ring: 'ring-orange-200', card: 'hover:border-orange-200', btn: 'bg-orange-500 hover:bg-orange-600' },
  green:  { icon: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200', card: 'hover:border-emerald-200', btn: 'bg-emerald-500 hover:bg-emerald-600' },
  purple: { icon: 'text-violet-500', badge: 'bg-violet-100 text-violet-700',  ring: 'ring-violet-200',  card: 'hover:border-violet-200',  btn: 'bg-violet-500 hover:bg-violet-600' },
  red:    { icon: 'text-red-500',    badge: 'bg-red-100 text-red-700',    ring: 'ring-red-200',    card: 'hover:border-red-200',    btn: 'bg-red-500 hover:bg-red-600' },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReportsClient() {
  const router = useRouter()

  // Block on native Capacitor
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    if (!!(window as any).Capacitor?.isNativePlatform?.()) {
      setIsNative(true)
    }
  }, [])

  const [selectedReport, setSelectedReport] = useState<ReportId | null>(null)
  const [presetLabel, setPresetLabel] = useState('Last 30 days')
  const [fromDate, setFromDate] = useState(isoDate((() => { const d = new Date(); d.setDate(d.getDate() - 29); return d })()))
  const [toDate, setToDate] = useState(isoDate(new Date()))
  const [downloading, setDownloading] = useState(false)
  const [lastDownloaded, setLastDownloaded] = useState<string | null>(null)

  function applyPreset(label: string) {
    setPresetLabel(label)
    const p = PRESETS.find(p => p.label === label)
    if (p?.range) {
      const { from, to } = p.range()
      setFromDate(from)
      setToDate(to)
    }
  }

  async function handleDownload() {
    if (!selectedReport) return
    const report = REPORTS.find(r => r.id === selectedReport)!
    setDownloading(true)
    try {
      const params = new URLSearchParams({ type: selectedReport })
      if (report.needsDateRange) { params.set('from', fromDate); params.set('to', toDate) }
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) { alert('Failed to generate report. Please try again.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? `${selectedReport}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setLastDownloaded(report.title)
    } finally {
      setDownloading(false)
    }
  }

  if (isNative) {
    return (
      <div className="min-h-screen bg-[#FDF8F3] flex flex-col items-center justify-center p-8 text-center">
        <BarChart2 className="w-12 h-12 text-orange-300 mb-4" />
        <h2 className="text-lg font-black text-gray-700 mb-2">Reports are web-only</h2>
        <p className="text-sm font-semibold text-gray-400">
          Open <span className="text-orange-500">dabbr.in</span> in a browser to download reports.
        </p>
      </div>
    )
  }

  const selected = REPORTS.find(r => r.id === selectedReport)
  const c = selected ? COLORS[selected.color] : null
  const isCustom = presetLabel === 'Custom'

  return (
    <div className="min-h-screen bg-[#FDF8F3]">

      {/* ── Header ── */}
      <header className="fixed inset-x-0 top-0 z-30 lg:left-[220px] bg-[#FDF8F3]/90 backdrop-blur-sm py-3">
        <div className="px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Reports</h1>
            <p className="text-xs font-semibold text-orange-600/80">Download CSV reports for your tiffin business</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-20 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-6">

        {/* ── Report picker ── */}
        <section>
          <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Choose a report</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REPORTS.map(report => {
              const cl = COLORS[report.color]
              const active = selectedReport === report.id
              const Icon = report.icon
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReport(report.id)}
                  className={`relative text-left rounded-3xl border bg-white p-4 transition-all active:scale-[0.98] ${
                    active
                      ? `border-transparent ring-2 ${cl.ring} shadow-sm`
                      : `border-gray-100 ${cl.card} shadow-sm`
                  }`}
                >
                  {report.badge && (
                    <span className={`absolute top-3 right-3 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cl.badge}`}>
                      {report.badge}
                    </span>
                  )}
                  <div className={`flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-50 mb-3 ${cl.icon}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-black text-gray-900 mb-1 pr-8">{report.title}</p>
                  <p className="text-xs font-medium text-gray-400 leading-relaxed line-clamp-3">{report.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Config panel (only when a report is selected) ── */}
        {selected && (
          <section className="rounded-3xl border border-gray-100 bg-white shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 ${c!.icon}`}>
                <selected.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-black text-gray-900">{selected.title}</p>
                <p className="text-xs font-medium text-gray-400">
                  {selected.needsDateRange ? 'Select a date range below' : 'No date range needed — snapshot of current data'}
                </p>
              </div>
            </div>

            {/* Date range */}
            {selected.needsDateRange && (
              <div className="space-y-3">
                {/* Preset chips */}
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.label)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        presetLabel === p.label
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom date inputs */}
                {isCustom && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wide block mb-1">From</label>
                      <input
                        type="date"
                        value={fromDate}
                        max={toDate}
                        onChange={e => setFromDate(e.target.value)}
                        className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                      />
                    </div>
                    <div className="text-gray-300 font-bold mt-5">→</div>
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wide block mb-1">To</label>
                      <input
                        type="date"
                        value={toDate}
                        min={fromDate}
                        max={isoDate(new Date())}
                        onChange={e => setToDate(e.target.value)}
                        className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100"
                      />
                    </div>
                  </div>
                )}

                {!isCustom && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-50 border border-gray-100">
                    <CalendarRange className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <p className="text-xs font-semibold text-gray-500">
                      {new Date(fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' — '}
                      {new Date(toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Download button */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-sm transition-all active:scale-95 disabled:opacity-60 ${c!.btn}`}
            >
              {downloading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Download className="w-4 h-4" /> Download CSV</>
              }
            </button>

            {lastDownloaded && (
              <p className="text-center text-xs font-semibold text-emerald-600">
                ✓ {lastDownloaded} downloaded
              </p>
            )}
          </section>
        )}

        {/* ── Help callout ── */}
        <div className="rounded-3xl border border-orange-100 bg-orange-50/50 px-5 py-4">
          <p className="text-xs font-black text-orange-700 mb-1">About these reports</p>
          <ul className="text-xs font-medium text-orange-600/80 space-y-1 list-disc list-inside">
            <li>All reports download as <strong>.csv</strong> — open in Excel, Google Sheets, or any spreadsheet app.</li>
            <li>Revenue figures are payment collections — actual cash received, not invoiced amounts.</li>
            <li>The GST summary uses the <strong>5% Composition Scheme</strong> rate for food services. Consult your CA for your specific filing.</li>
            <li>Customer Snapshot reflects the current state of your customer list.</li>
          </ul>
        </div>

      </main>

      <BottomNav />
    </div>
  )
}
