/**
 * Capacitor native bridge utilities.
 * All imports are dynamic so this never breaks on web where Capacitor isn't loaded.
 */

export async function initCapacitor() {
  if (typeof window === 'undefined') return
  if (!(window as any).Capacitor) return

  const { App } = await import('@capacitor/app')
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  const { SplashScreen } = await import('@capacitor/splash-screen')

  // Style the status bar to match brand colour
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#F4622A' })
  } catch (_) { /* desktop / unsupported */ }

  // Hide splash once the app shell is ready
  try { await SplashScreen.hide() } catch (_) {}

  // ── OAuth deep-link callback ───────────────────────────────────────────────
  // After Google sign-in, the in-app browser redirects to in.dabbr.app://login
  // with ?code=... (PKCE) or #access_token=... (implicit) appended.
  // We close the browser and hand the URL to Supabase to create a session.
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith('in.dabbr.app://')) return

    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.close()
    } catch (_) {}

    // Build a full URL Supabase can parse (it needs query + hash from the callback)
    const parsed = new URL(url)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    // PKCE flow: url has ?code= → exchange for session
    const code = parsed.searchParams.get('code')
    if (code) {
      await supabase.auth.exchangeCodeForSession(code)
      window.location.href = '/dashboard'
      return
    }

    // Implicit flow: tokens are in the hash fragment
    if (parsed.hash) {
      // Supabase reads window.location automatically when detecting hash tokens
      // Redirect to auth/callback with the hash so the existing handler picks it up
      window.location.href = `/auth/callback${parsed.search}${parsed.hash}`
      return
    }
  })

  // ── Android hardware back button ──────────────────────────────────────────
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.minimizeApp()
    }
  })
}
