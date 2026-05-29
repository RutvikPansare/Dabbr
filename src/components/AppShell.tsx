'use client'

import { usePathname } from 'next/navigation'
import SideNav from './SideNav'

// Pages that belong to the authenticated app shell (show sidebar + content offset)
const APP_PREFIXES = [
  '/dashboard',
  '/customers',
  '/menu',
  '/payments',
  '/settings',
  '/summary',
  '/meal-plans',
  '/reports',
  '/help',
  '/report',
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isApp = APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )

  if (!isApp) return <>{children}</>

  return (
    <>
      <SideNav />
      <div className="lg:ml-[220px]">{children}</div>
    </>
  )
}
