'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Flag, CheckCircle2 } from 'lucide-react'
import BottomNav from '@/components/BottomNav'

const CATEGORIES = [
  { value: 'bug',      label: '🐛  Something is broken' },
  { value: 'billing',  label: '💳  Billing or payment issue' },
  { value: 'delivery', label: '🚴  Delivery tracking issue' },
  { value: 'feature',  label: '💡  Feature request or suggestion' },
  { value: 'other',    label: '💬  Something else' },
]

export default function ReportClient() {
  const router = useRouter()
  const [category, setCategory] = useState('bug')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (description.trim().length < 10) {
      setError('Please describe the problem in at least 10 characters.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/report-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description: description.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as any).error ?? 'Something went wrong. Please try again.')
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm border-b border-orange-100/40">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-500" />
            <h1 className="text-base font-black text-gray-900">Report a Problem</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl lg:max-w-xl px-4 lg:px-8 pt-20">

        {done ? (
          /* Success state */
          <div className="mt-8 rounded-3xl bg-white border border-gray-100 shadow-sm px-6 py-10 flex flex-col items-center text-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-black text-gray-900">Report submitted</p>
              <p className="text-sm text-gray-500 mt-1">
                Thanks for the feedback. We'll look into it and get back to you if needed.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="mt-2 rounded-2xl bg-orange-500 px-6 py-3 text-sm font-black text-white shadow-sm active:scale-95 transition-transform"
            >
              Back to Home
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">

            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-5 space-y-4">

              {/* Category */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">
                  What kind of issue is it?
                </label>
                <div className="space-y-2">
                  {CATEGORIES.map(c => (
                    <label
                      key={c.value}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                        category === c.value
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={c.value}
                        checked={category === c.value}
                        onChange={() => setCategory(c.value)}
                        className="accent-orange-500"
                      />
                      <span className={`text-[13.5px] font-semibold ${category === c.value ? 'text-orange-700' : 'text-gray-700'}`}>
                        {c.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-2">
                  Describe the problem
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Tell us what happened, what you expected, and any steps to reproduce the issue…"
                  rows={5}
                  maxLength={2000}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none leading-relaxed"
                />
                <p className="text-[11px] text-gray-400 mt-1 text-right">
                  {description.length}/2000
                </p>
              </div>

            </div>

            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                <p className="text-sm font-semibold text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || description.trim().length < 10}
              className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {saving ? 'Sending…' : 'Submit Report'}
            </button>

            <p className="text-center text-xs text-gray-400 pb-2">
              Your report is sent directly to the Dabbr team. We'll follow up if needed.
            </p>

          </form>
        )}

      </main>

      <BottomNav />
    </div>
  )
}
