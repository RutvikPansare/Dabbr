import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegistration from './ServiceWorkerRegistration'
import CapacitorInit from './CapacitorInit'
import NativeStatusBar from './NativeStatusBar'
import OnboardingGuide from '@/components/OnboardingGuide'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dabbr – Tiffin Manager',
  description: 'Manage your daily tiffin customers, deliveries, and payments',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dabbr',
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={outfit.className}>
        {children}
        <ServiceWorkerRegistration />
        <CapacitorInit />
        <NativeStatusBar />
        <OnboardingGuide />
      </body>
    </html>
  )
}
