'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, CreditCard, Home, Settings, Users } from 'lucide-react'

// Reports is desktop-only — accessible via the side nav, never in the bottom nav
const TABS = [
  { href: '/dashboard', icon: Home,        label: 'Home'      },
  { href: '/customers', icon: Users,       label: 'Customers' },
  { href: '/menu',      icon: CalendarDays, label: 'Menu'      },
  { href: '/payments',  icon: CreditCard,  label: 'Payments'  },
  { href: '/settings',  icon: Settings,    label: 'Settings'  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    /* Outer container — sits on top of safe-area, provides spacing from screen edge */
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-xl">
        {/* Floating card — all-rounded, elevated off the screen */}
        <div
          className="flex items-center bg-white/95 backdrop-blur-2xl rounded-[22px] px-2 py-1.5 border border-black/[0.06]"
          style={{ boxShadow: '0 4px 28px rgba(0,0,0,0.10), 0 1px 6px rgba(0,0,0,0.05)' }}
        >
          {TABS.map((tab) => {
            const active =
              pathname === tab.href ||
              pathname.startsWith(tab.href + '/') ||
              (tab.href === '/customers' && pathname.startsWith('/meal-plans'))
            const Icon = tab.icon

            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch
                className="flex flex-1 flex-col items-center gap-0.5 py-1 transition-transform duration-150 active:scale-90"
              >
                {/* Icon pill — filled orange when active */}
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-[14px] transition-all duration-200 ${
                    active
                      ? 'bg-orange-500'
                      : 'bg-transparent'
                  }`}
                  style={active ? { boxShadow: '0 2px 10px rgba(244,98,42,0.32)' } : undefined}
                >
                  <Icon
                    className={`transition-colors duration-200 ${active ? 'text-white' : 'text-gray-400'}`}
                    size={18}
                    strokeWidth={active ? 2.5 : 2}
                  />
                </div>

                {/* Label — sentence case, not uppercase */}
                <span
                  className={`text-[10.5px] font-semibold leading-none transition-colors duration-200 ${
                    active ? 'text-orange-500' : 'text-gray-400'
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
