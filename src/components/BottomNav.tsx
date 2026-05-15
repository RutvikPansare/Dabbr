'use client'

import { usePathname, useRouter } from 'next/navigation'
import { CalendarDays, CreditCard, Home, Settings, TrendingUp, Users } from 'lucide-react'

const TABS = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/customers', icon: Users, label: 'Customers' },
  { href: '/menu', icon: CalendarDays, label: 'Menu' },
  { href: '/summary', icon: TrendingUp, label: 'Summary' },
  { href: '/payments', icon: CreditCard, label: 'Payments' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] pt-2 glass-nav">
      <div className="mx-auto flex max-w-2xl px-2 pb-2 pt-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href
            || pathname.startsWith(tab.href + '/')
            || (tab.href === '/customers' && pathname.startsWith('/meal-plans'))
          const Icon = tab.icon
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`group flex flex-1 flex-col items-center gap-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all duration-300 active:scale-90 ${
                active ? 'text-[#F4622A]' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-300 ${active ? 'bg-orange-50 shadow-inner' : 'group-hover:bg-gray-50'}`}>
                <Icon className={`h-[18px] w-[18px] transition-transform duration-300 ${active ? 'scale-110 text-orange-600' : 'group-hover:scale-110 text-gray-400'}`} strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className={`transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
