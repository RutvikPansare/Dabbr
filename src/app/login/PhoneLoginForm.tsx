'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { requestProviderOtp, verifyProviderOtp } from './actions'

type Step = 'phone' | 'otp'

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return phone
}

export default function PhoneLoginForm() {
  const [step, setStep]                       = useState<Step>('phone')
  const [phone, setPhone]                     = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [otp, setOtp]                         = useState('')
  const [error, setError]                     = useState<string | null>(null)
  const [isPending, startTransition]          = useTransition()
  const otpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus()
  }, [step])

  function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await requestProviderOtp(phone)
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
      const res = await verifyProviderOtp(normalizedPhone, otp)
      if (!res.ok) { setError(res.error ?? 'Verification failed.'); return }
      // Magic link opens a real Supabase session — navigate in browser
      window.location.href = res.magicLink!
    })
  }

  const inputClass =
    'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100 transition-all'

  if (step === 'phone') {
    return (
      <form onSubmit={handleSendOtp} className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 overflow-hidden focus-within:border-[#F4622A] focus-within:ring-2 focus-within:ring-orange-100 transition-all">
          <span className="text-sm font-bold text-gray-400 shrink-0 py-3.5">+91</span>
          <div className="w-px h-5 bg-gray-200 shrink-0" />
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(null) }}
            placeholder="98765 43210"
            className="flex-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none placeholder:text-gray-300 tracking-wider"
            autoComplete="tel"
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || phone.length < 10}
          className="w-full rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:shadow-xl active:scale-95 disabled:opacity-60"
        >
          {isPending ? 'Sending code…' : 'Send OTP →'}
        </button>

        <p className="text-center text-[11px] text-gray-400 pt-1">
          Your phone number must be saved in Dabbr Settings.
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={handleVerify} className="space-y-3">
      <div className="text-center pb-1">
        <p className="text-xs font-semibold text-gray-500">
          Code sent to <span className="font-black text-gray-800">{formatPhone(normalizedPhone)}</span>
        </p>
      </div>

      <input
        ref={otpRef}
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(null) }}
        placeholder="——————"
        className="w-full rounded-2xl border border-gray-200 bg-white py-4 text-center text-3xl font-black text-gray-900 tracking-[0.5em] outline-none placeholder:text-gray-200 focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100 transition-all"
        autoComplete="one-time-code"
        required
      />

      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || otp.length !== 6}
        className="w-full rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:shadow-xl active:scale-95 disabled:opacity-60"
      >
        {isPending ? 'Verifying…' : 'Verify & Sign in →'}
      </button>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
          className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Different number
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSendOtp({ preventDefault: () => {} } as React.FormEvent)}
          className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Resend
        </button>
      </div>
    </form>
  )
}
