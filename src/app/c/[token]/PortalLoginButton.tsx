'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogIn, X, Loader2, Phone, Mail, ArrowRight, CheckCircle2 } from 'lucide-react'

type Mode = 'phone' | 'email'
type Stage = 'input' | 'otp' | 'verifying'

export default function PortalLoginButton() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('phone')
  const [stage, setStage] = useState<Stage>('input')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() { setStage('input'); setOtp(''); setError(''); setLoading(false); setPhone(''); setEmail('') }
  function close() { setOpen(false); reset() }

  async function sendOtp() {
    setError(''); setLoading(true)
    const supabase = createClient()
    try {
      if (mode === 'phone') {
        const digits = phone.replace(/\D/g, '')
        const formatted = digits.startsWith('91') ? `+${digits}` : `+91${digits}`
        const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: false },
        })
        if (error) throw error
      }
      setStage('otp')
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Could not send OTP. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    setError(''); setLoading(true); setStage('verifying')
    const supabase = createClient()
    try {
      if (mode === 'phone') {
        const digits = phone.replace(/\D/g, '')
        const formatted = digits.startsWith('91') ? `+${digits}` : `+91${digits}`
        const { error } = await supabase.auth.verifyOtp({ phone: formatted, token: otp, type: 'sms' })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(), token: otp, type: 'email',
        })
        if (error) throw error
      }
      // Reload so the server re-renders with isLoggedIn=true and links the account
      window.location.reload()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Wrong OTP. Please try again.')
      setStage('otp')
      setLoading(false)
    }
  }

  const canSend = mode === 'phone' ? phone.replace(/\D/g, '').length >= 10 : email.includes('@')

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); reset() }}
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

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-black text-gray-900">Sign In</p>
                <p className="text-xs text-gray-400 mt-0.5">Use the phone/email your provider has on record</p>
              </div>
              <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {stage === 'verifying' ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  <p className="text-sm font-semibold text-gray-500">Signing you in…</p>
                </div>
              ) : stage === 'input' ? (
                <>
                  {/* Mode toggle */}
                  <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
                    {(['phone', 'email'] as Mode[]).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setMode(m); setError('') }}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                          mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        {m === 'phone' ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                        {m === 'phone' ? 'Phone OTP' : 'Email OTP'}
                      </button>
                    ))}
                  </div>

                  {mode === 'phone' ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 overflow-hidden focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
                      <span className="text-sm font-semibold text-gray-500 shrink-0">+91</span>
                      <div className="w-px h-5 bg-gray-200" />
                      <input
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && canSend && sendOtp()}
                        maxLength={10}
                        className="flex-1 py-3 text-sm font-semibold text-gray-900 placeholder-gray-400 outline-none bg-transparent"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && canSend && sendOtp()}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 placeholder-gray-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      autoFocus
                    />
                  )}

                  {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={loading || !canSend}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors active:bg-orange-600"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    {loading ? 'Sending…' : 'Send OTP'}
                  </button>
                </>
              ) : (
                /* OTP entry */
                <>
                  <div className="flex items-center gap-2 rounded-2xl bg-green-50 border border-green-100 px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <p className="text-xs font-semibold text-green-700">
                      OTP sent to {mode === 'phone' ? `+91 ${phone}` : email}
                    </p>
                  </div>

                  <input
                    type="number"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && otp.length >= 4 && verifyOtp()}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-xl font-black text-gray-900 text-center tracking-widest placeholder-gray-300 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    autoFocus
                  />

                  {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={loading || otp.length < 4}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors active:bg-orange-600"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading ? 'Verifying…' : 'Verify →'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStage('input'); setOtp(''); setError('') }}
                    className="w-full text-center text-xs font-semibold text-gray-400 active:text-gray-600"
                  >
                    ← Change {mode === 'phone' ? 'number' : 'email'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
