'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogIn, X, AlertCircle, Phone, RefreshCw } from 'lucide-react'

type Step = 'default' | 'phone' | 'otp'

export default function PortalLoginButton({ token }: { token: string }) {
  const [open, setOpen]           = useState(false)
  const [step, setStep]           = useState<Step>('default')
  const [phone, setPhone]         = useState('')
  const [normPhone, setNormPhone] = useState('')
  const [otp, setOtp]             = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const otpRef   = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (step === 'phone') setTimeout(() => phoneRef.current?.focus(), 50)
    if (step === 'otp')   otpRef.current?.focus()
  }, [step])

  function close() { setOpen(false); setStep('default'); setPhone(''); setOtp(''); setError(null) }

  // ── Google ──────────────────────────────────────────────────────────────────

  async function handleGoogle() {
    setLoading(true); setError(null)
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (isNative) {
      try {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        try { await GoogleAuth.signOut() } catch (_) {}
        const googleUser = await GoogleAuth.signIn()
        const idToken = googleUser.authentication?.idToken
        if (!idToken) { setError('No token returned — try again.'); setLoading(false); return }
        const { error: sbErr } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
        if (sbErr) { setError(sbErr.message); setLoading(false); return }
        window.location.reload()
      } catch (err: any) {
        const msg = err?.message ?? ''
        if (!msg.includes('12501') && !msg.includes('cancel') && !msg.includes('Cancel'))
          setError('Google sign-in failed. Try phone instead.')
        setLoading(false)
      }
    } else {
      // Web OAuth — callback redirects back to this portal page
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/c/${token}` },
      })
      // Page redirects; keep loading
    }
  }

  // ── Phone OTP ───────────────────────────────────────────────────────────────

  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null); setLoading(true)
    const digits = phone.replace(/\D/g, '')
    const formatted = digits.startsWith('91') ? `+${digits}` : `+91${digits}`
    const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: formatted })
    setLoading(false)
    if (otpErr) { setError(otpErr.message); return }
    setNormPhone(formatted)
    setStep('otp')
  }

  async function handleVerifyOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null); setLoading(true)
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      phone: normPhone, token: otp, type: 'sms',
    })
    setLoading(false)
    if (verifyErr) { setError(verifyErr.message); return }
    window.location.reload()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setStep('default') }}
        className="flex items-center gap-1.5 rounded-2xl bg-white/20 border border-white/30 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm hover:bg-white/30 active:scale-95 transition-all shrink-0"
      >
        <LogIn className="w-3.5 h-3.5" />
        Sign In
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) close() }}
        >
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden">

            {/* Handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-black text-gray-900">Sign In</p>
                <p className="text-xs text-gray-400 mt-0.5">Use the account your provider has on record</p>
              </div>
              <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-3">
              {step === 'otp' ? (
                /* ── OTP entry ── */
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <p className="text-xs font-semibold text-center text-gray-500">
                    Code sent to <span className="font-black text-gray-800">{normPhone}</span>
                  </p>
                  <input
                    ref={otpRef}
                    type="tel"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setError(null) }}
                    placeholder="——————"
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 py-4 text-center text-3xl font-black text-gray-900 tracking-[0.5em] outline-none placeholder:text-gray-200 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 transition-all"
                    autoComplete="one-time-code"
                    required
                  />
                  {error && (
                    <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors active:bg-orange-600"
                  >
                    {loading ? 'Verifying…' : 'Verify & Sign in →'}
                  </button>
                  <div className="flex items-center justify-between pt-1">
                    <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
                      className="text-xs font-semibold text-gray-400 hover:text-gray-600">
                      ← Different number
                    </button>
                    <button type="button" disabled={loading}
                      onClick={() => handleSendOtp()}
                      className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 disabled:opacity-40">
                      <RefreshCw className="w-3 h-3" /> Resend
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* ── Google (primary) ── */}
                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:shadow-xl active:scale-95 disabled:opacity-60"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white" fillOpacity="0.9" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.85" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="white" fillOpacity="0.8" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.95" />
                    </svg>
                    {loading ? 'Signing in…' : 'Continue with Google'}
                  </button>

                  {/* ── Divider ── */}
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>

                  {/* ── Phone (secondary) ── */}
                  {step === 'default' ? (
                    <button
                      type="button"
                      onClick={() => setStep('phone')}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-3.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 active:scale-95"
                    >
                      <Phone className="w-4 h-4 text-gray-400" />
                      Sign in with phone number
                    </button>
                  ) : (
                    <form onSubmit={handleSendOtp} className="space-y-3">
                      <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 overflow-hidden focus-within:border-orange-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-100 transition-all">
                        <span className="text-sm font-bold text-gray-400 shrink-0 py-3.5">+91</span>
                        <div className="w-px h-5 bg-gray-200 shrink-0" />
                        <input
                          ref={phoneRef}
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          value={phone}
                          onChange={e => { setPhone(e.target.value.replace(/\D/g,'')); setError(null) }}
                          placeholder="98765 43210"
                          className="flex-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none placeholder:text-gray-300 tracking-wider"
                          autoComplete="tel"
                          required
                        />
                      </div>
                      {error && (
                        <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={loading || phone.length < 10}
                        className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 active:scale-95 disabled:opacity-60"
                      >
                        {loading ? 'Sending code…' : 'Get OTP →'}
                      </button>
                    </form>
                  )}

                  {error && step !== 'phone' && (
                    <p className="text-center text-xs font-semibold text-red-500">{error}</p>
                  )}
                </>
              )}
            </div>

            <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
          </div>
        </div>
      )}
    </>
  )
}
