'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { requestProviderOtp, verifyProviderOtp } from './actions'

type Step = 'phone' | 'otp'

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return phone
}

export default function LoginForm() {
  const [step, setStep]                       = useState<Step>('phone')
  const [phone, setPhone]                     = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [otp, setOtp]                         = useState('')
  const [error, setError]                     = useState<string | null>(null)
  const [isPending, startTransition]          = useTransition()
  const [googleLoading, setGoogleLoading]     = useState(false)
  const [googleError, setGoogleError]         = useState<string | null>(null)
  const otpRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus()
  }, [step])

  // ── Phone OTP ──────────────────────────────────────────────────────────────

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
      window.location.href = res.magicLink!
    })
  }

  // ── Google Sign-In ─────────────────────────────────────────────────────────

  async function handleGoogle() {
    setGoogleLoading(true)
    setGoogleError(null)

    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()

    if (isNative) {
      try {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')

        // Sign out first so the account picker always appears (not just the
        // last-used account with only a Cancel button).
        try { await GoogleAuth.signOut() } catch (_) {}

        const googleUser = await GoogleAuth.signIn()
        const idToken = googleUser.authentication?.idToken

        if (!idToken) {
          setGoogleError('No token returned — please try again.')
          setGoogleLoading(false)
          return
        }

        const { error: sbError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        })

        if (sbError) { setGoogleError(sbError.message); setGoogleLoading(false); return }
        window.location.href = '/dashboard'
      } catch (err: any) {
        const msg = err?.message ?? ''
        // Error code 12501 = user cancelled, 10 = developer error (config),
        // "canceled" = user dismissed — don't show error for these
        const userCancelled = msg.includes('12501') || msg.includes('cancel') || msg.includes('Cancel')
        if (!userCancelled) {
          setGoogleError(msg || 'Google sign-in failed.')
        }
        setGoogleLoading(false)
      }
    } else {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className="space-y-3">
          {/* Phone input */}
          <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 overflow-hidden focus-within:border-[#F4622A] focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-100 transition-all">
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

          {/* OTP button */}
          <button
            type="submit"
            disabled={isPending || phone.length < 10}
            className="w-full rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:shadow-xl active:scale-95 disabled:opacity-60"
          >
            {isPending ? 'Sending code…' : 'Get OTP →'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-3">
          <div className="text-center">
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
            className="w-full rounded-2xl border border-gray-100 bg-gray-50 py-4 text-center text-3xl font-black text-gray-900 tracking-[0.5em] outline-none placeholder:text-gray-200 focus:border-[#F4622A] focus:bg-white focus:ring-2 focus:ring-orange-100 transition-all"
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

          <div className="flex items-center justify-between">
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
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Google Sign-In */}
      <div>
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-3.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-95 disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>
        {googleError && (
          <p className="mt-2 text-center text-xs font-semibold text-red-500">{googleError}</p>
        )}
      </div>

    </div>
  )
}
