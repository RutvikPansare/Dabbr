'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BarChart2, CalendarDays, CreditCard, Home, LogOut, Settings, Users, ChevronDown, Sparkles } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home,        label: 'Home'      },
  { href: '/customers', icon: Users,       label: 'Customers' },
  { href: '/menu',      icon: CalendarDays, label: 'Menu'      },
  { href: '/payments',  icon: CreditCard,  label: 'Payments'  },
  { href: '/summary',   icon: BarChart2,   label: 'Summary'   },
  { href: '/settings',  icon: Settings,    label: 'Settings'  },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

export default function SideNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const [userName, setUserName]   = useState('')
  const [menuOpen, setMenuOpen]   = useState(false)
  const menuRef                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata
      const name =
        meta?.full_name ?? meta?.name ?? data.user?.email?.split('@')[0] ?? 'User'
      setUserName(name)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userName ? getInitials(userName) : '…'

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
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] shrink-0 bg-orange-500">
            <span className="text-white text-[15px] font-black leading-none">D</span>
          </div>
          <span className="text-[17px] font-black text-gray-900 tracking-tight leading-none">
            Dabbr
          </span>
        </Link>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto">
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

      {/* ── Upgrade button ───────────────────────────────────────────── */}
      <div className="px-3 pb-3">
        <Link
          href="/settings#billing"
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all"
        >
          <Sparkles size={15} strokeWidth={2.5} className="shrink-0 text-white" />
          <span className="text-[13.5px] font-black text-white leading-none">Upgrade plan</span>
        </Link>
      </div>

      {/* ── User profile footer ──────────────────────────────────────── */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all duration-150 group"
        >
          {/* Avatar */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[12px] font-black text-orange-600">
            {initials}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{userName || '…'}</p>
            <p className="text-[11px] font-medium text-gray-400 leading-none mt-0.5">Kitchen Admin</p>
          </div>

          <ChevronDown
            size={14}
            strokeWidth={2.5}
            className={`shrink-0 text-gray-400 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Sign out popover */}
        {menuOpen && (
          <div className="mt-1 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut size={14} strokeWidth={2} className="shrink-0" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
