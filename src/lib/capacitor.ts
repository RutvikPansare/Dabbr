/**
 * Capacitor native bridge utilities.
 * All imports are dynamic so this never breaks on web where Capacitor isn't loaded.
 */

export async function initCapacitor() {
  // Only run inside the native Capacitor shell
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
  try {
    await SplashScreen.hide()
  } catch (_) {}

  // Android hardware back button — go back in history, or minimise if at root
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.minimizeApp()
    }
  })
}
