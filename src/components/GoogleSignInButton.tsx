'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Custom URL scheme registered in AndroidManifest — Capacitor intercepts this
// and fires the appUrlOpen event instead of opening an external browser.
const NATIVE_REDIRECT = 'in.dabbr.app://login'

export default function GoogleSignInButton() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSignIn() {
    setLoading(true)

    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()

    if (isNative) {
      // ── Native Android/iOS: open OAuth in an in-app browser ──────────────
      // skipBrowserRedirect: true → we get back the URL, open it ourselves
      // so the system browser never appears.
      const { Browser } = await import('@capacitor/browser')

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: NATIVE_REDIRECT,
          skipBrowserRedirect: true,
        },
      })

      if (error || !data.url) {
        setLoading(false)
        return
      }

      // Open Google consent in Capacitor's in-app browser
      await Browser.open({ url: data.url, windowName: '_self' })
      // Session is picked up by the appUrlOpen listener in CapacitorInit
    } else {
      // ── Web: normal redirect ──────────────────────────────────────────────
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      // Page will redirect; loading stays true intentionally
    }
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-3.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-95 disabled:opacity-60"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {loading ? 'Opening Google…' : 'Continue with Google'}
    </button>
  )
}
