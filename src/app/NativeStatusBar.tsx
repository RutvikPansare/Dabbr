'use client'

/**
 * Syncs the native Android status bar colour to the current page header.
 *
 * Dashboard + Login  → orange  (#F4622A), white icons
 * All other pages    → white   (#FFFFFF), dark icons
 *
 * Mounted once in the root layout; re-runs whenever the pathname changes.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const ORANGE = '#FF730D'
const WHITE  = '#FFFFFF'

export default function NativeStatusBar() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    const isOrangePage = pathname === '/login' || pathname.startsWith('/dashboard')
    const color = isOrangePage ? ORANGE : WHITE

    ;(async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        await StatusBar.setBackgroundColor({ color })
        await StatusBar.setStyle({ style: isOrangePage ? Style.Dark : Style.Light })
      } catch (_) {}
    })()
  }, [pathname])

  return null
}
