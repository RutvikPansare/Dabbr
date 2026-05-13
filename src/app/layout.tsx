import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegistration from './ServiceWorkerRegistration'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dabbr – Tiffin Manager',
  description: 'Manage your daily tiffin customers, deliveries, and payments',
  manifest: '/manifest.json',
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
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={outfit.className}>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
