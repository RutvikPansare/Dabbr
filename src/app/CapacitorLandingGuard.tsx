'use client'

/**
 * Mounted on the landing page (/).
 * If running inside the native Android/iOS app, skip the marketing page
 * entirely and send the user straight to /login.
 */
import { useEffect } from 'react'

export default function CapacitorLandingGuard() {
  useEffect(() => {
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      window.location.replace('/login')
    }
  }, [])

  return null
}
