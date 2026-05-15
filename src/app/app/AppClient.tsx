'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { ChevronRight, LogOut, Phone, RefreshCw, CheckCircle2, AlertCircle, Utensils } from 'lucide-react'
import { requestOtp, verifyAndLogin, logoutCustomer } from './actions'
import type { LinkedSubscription } from './page'
import type { CustomerSession } from '@/lib/customer-auth'

// ── Types ─────────────────────────────────────────────────────────────────────

type LoginStep = 'phone' | 'otp'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  // +919876543210 → +91 98765 43210
  const d = phone.replace(/\D/g, '')
  if (d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return phone
}

function statusBadge(status: string | null) {
  if (status === 'active') return { label: 'Active', cls: 'bg-green-100 text-green-700' }
  if (status === 'paused') return { label: 'Paused', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Inactive', cls: 'bg-gray-100 text-gray-500' }
}

function balanceColor(days: number) {
  if (days > 10) return 'text-green-600'
  if (days >= 4) return 'text-amber-600'
  return 'text-red-500'
}

// ── Login flow ────────────────────────────────────────────────────────────────

function LoginFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<LoginStep>('phone')
  const [phone, setPhone] = useState('')         // raw user input
  const [normalizedPhone, setNormalizedPhone] = useState('') // E.164 after send
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const otpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus()
  }, [step])

  function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await requestOtp(phone)
      if (!res.ok) { setError(res.error ?? 'Failed to send code.'); return }
      setNormalizedPhone(res.phone!)
      setStep('otp')
    })
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6) { setError('Enter the 6-digit code.'); return }
    setError(null)
    startTransition(async () => {
      const res = await verifyAndLogin(normalizedPhone, otp)
      if (!res.ok) { setError(res.error ?? 'Verification failed.'); return }
      onDone()
    })
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#FDF8F3]">
      {/* Header */}
      <div className="px-6 pt-16 pb-10 text-center">
        <div className="w-16 h-16 rounded-3xl bg-orange-500 flex items-center justify-center mx-auto mb-5 shadow-lg">
          <Utensils className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Dabbr</h1>
        <p className="mt-1.5 text-sm text-gray-500 font-medium">
          {step === 'phone' ? 'Your tiffin, anywhere.' : 'Enter the verification code'}
        </p>
      </div>

      <div className="flex-1 px-6">
        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Mobile number</p>
              </div>
              <div className="flex items-center px-5 py-4 gap-3">
                <span className="text-base font-bold text-gray-400 shrink-0">+91</span>
                <div className="w-px h-6 bg-gray-200 shrink-0" />
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(null) }}
                  placeholder="98765 43210"
                  className="flex-1 text-lg font-semibold text-gray-900 bg-transparent outline-none placeholder:text-gray-300 tracking-wider"
                  autoComplete="tel"
                  autoFocus
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || phone.length < 10}
              className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isPending ? 'Sending…' : 'Send OTP →'}
            </button>

            <p className="text-center text-xs text-gray-400 pt-1">
              We&apos;ll send a one-time code to verify your number.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Code sent to {formatPhone(normalizedPhone)}
                </p>
              </div>
              <div className="px-5 py-5">
                <input
                  ref={otpRef}
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(null) }}
                  placeholder="——————"
                  className="w-full text-center text-3xl font-black text-gray-900 bg-transparent outline-none tracking-[0.5em] placeholder:text-gray-200"
                  autoComplete="one-time-code"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || otp.length !== 6}
              className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isPending ? 'Verifying…' : 'Verify & Continue →'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
              className="w-full py-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Use a different number
            </button>

            <button
              type="button"
              onClick={() => handleSendOtp({ preventDefault: () => {} } as React.FormEvent)}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-orange-500 hover:text-orange-600 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Resend code
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-gray-300 py-6">Powered by Dabbr 🍱</p>
    </div>
  )
}

// ── Subscription card ─────────────────────────────────────────────────────────

function SubCard({ sub }: { sub: LinkedSubscription }) {
  const badge = statusBadge(sub.subscriptionStatus)
  const portalUrl = sub.token ? `/c/${sub.token}` : null

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      {/* Provider header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, ${sub.provider?.accentColor ?? '#F4622A'} 0%, ${darken(sub.provider?.accentColor ?? '#F4622A')} 100%)` }}
      >
        {sub.provider?.logoUrl ? (
          <img
            src={sub.provider.logoUrl}
            alt={sub.provider.name}
            className="w-9 h-9 rounded-2xl object-cover border-2 border-white/30 shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">
              {sub.provider?.name.charAt(0).toUpperCase() ?? '?'}
            </span>
          </div>
        )}
        <p className="text-sm font-black text-white flex-1 truncate">
          {sub.provider?.name ?? 'Unknown Provider'}
        </p>
      </div>

      {/* Details */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{sub.customerName}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.label}
              </span>
              {sub.balanceDays > 0 && (
                <span className={`text-xs font-semibold ${balanceColor(sub.balanceDays)}`}>
                  {Math.floor(sub.balanceDays)} days left
                </span>
              )}
            </div>
          </div>

          {portalUrl ? (
            <a
              href={portalUrl}
              className="shrink-0 flex items-center gap-1 rounded-2xl bg-orange-50 border border-orange-100 px-3 py-2 text-xs font-bold text-orange-600 hover:bg-orange-100 active:scale-95 transition-all"
            >
              Open <ChevronRight className="w-3.5 h-3.5" />
            </a>
          ) : (
            <span className="shrink-0 text-xs text-gray-400 font-medium">No link</span>
          )}
        </div>
      </div>
    </div>
  )
}

// rough darkening for gradient — no import needed
function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, (n >> 16) - 30)
  const g = Math.max(0, ((n >> 8) & 0xff) - 30)
  const b = Math.max(0, (n & 0xff) - 30)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// ── Customer home ─────────────────────────────────────────────────────────────

function CustomerHome({
  session,
  subscriptions,
}: {
  session: CustomerSession
  subscriptions: LinkedSubscription[]
}) {
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(() => logoutCustomer())
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3]">
      {/* Header */}
      <div className="px-5 pt-14 pb-8 bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-0.5">
              Signed in as
            </p>
            <p className="text-lg font-black text-gray-900">{formatPhone(session.phone)}</p>
            {session.displayName && (
              <p className="text-sm text-gray-500 mt-0.5">{session.displayName}</p>
            )}
          </div>
          <button
            onClick={handleLogout}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-2xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors shrink-0 mt-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            {isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 pt-6 pb-16 space-y-6">
        {/* Subscriptions */}
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3 px-1">
            Your Subscriptions
          </h2>

          {subscriptions.length === 0 ? (
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-10 text-center">
              <div className="text-4xl mb-3">🍱</div>
              <p className="font-bold text-gray-800">No subscriptions found</p>
              <p className="text-sm text-gray-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
                Open the personal link your provider sent on WhatsApp — it will automatically link to this account.
              </p>
              <div className="mt-5 rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3 text-xs text-orange-700 font-medium text-left">
                <p className="font-black mb-1">💡 Tip</p>
                <p>Search for &quot;Dabbr&quot; or your provider&apos;s name in WhatsApp to find your link.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map(sub => (
                <SubCard key={sub.customerId} sub={sub} />
              ))}
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="rounded-3xl bg-white border border-gray-100 px-5 py-5 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-gray-700 mb-0.5">Account linked</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Open any personal link from your provider and it will automatically appear here.
                Your magic links from WhatsApp still work independently.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function AppClient({
  session,
  subscriptions,
}: {
  session: CustomerSession | null
  subscriptions: LinkedSubscription[]
}) {
  // After login, reload the page to get fresh server data
  function handleLoginDone() {
    window.location.reload()
  }

  if (!session) {
    return <LoginFlow onDone={handleLoginDone} />
  }

  return <CustomerHome session={session} subscriptions={subscriptions} />
}
