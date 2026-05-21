'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CalendarDays, CreditCard, Home, LogOut, Settings, Users } from 'lucide-react'
import SideNavStats from './SideNavStats'

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home,         label: 'Home'      },
  { href: '/customers', icon: Users,        label: 'Customers' },
  { href: '/menu',      icon: CalendarDays, label: 'Menu'      },
  { href: '/payments',  icon: CreditCard,   label: 'Payments'  },
  { href: '/settings',  icon: Settings,     label: 'Settings'  },
]

export default function SideNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="hidden lg:flex flex-col fixed left-0 top-0 h-screen z-40 select-none"
      style={{
        width: '220px',
        background: '#FFFFFF',
        borderRight: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-[18px]" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2.5">
          {/* Lettermark — matches the brand gradient */}
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px] shrink-0 bg-orange-500"
          >
            <span className="text-white text-[15px] font-black leading-none">D</span>
          </div>
          <span className="text-[17px] font-black text-gray-900 tracking-tight leading-none">
            Dabbr
          </span>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + '/') ||
            (item.href === '/customers' && pathname.startsWith('/meal-plans'))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150 group ${
                active
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-500 hover:bg-gray-50/80 hover:text-gray-800'
              }`}
            >
              {/* Active accent bar */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-orange-500"
                  aria-hidden
                />
              )}

              <Icon
                size={16}
                strokeWidth={active ? 2.5 : 2}
                className={`shrink-0 transition-colors ${active ? 'text-orange-500' : 'text-gray-400 group-hover:text-gray-600'}`}
              />

              <span className="leading-none">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Monthly summary ──────────────────────────────────────────── */}
      <SideNavStats />

      {/* ── Sign out ─────────────────────────────────────────────────── */}
      <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-all duration-150 group"
        >
          <LogOut size={16} strokeWidth={2} className="shrink-0 group-hover:text-gray-500" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
