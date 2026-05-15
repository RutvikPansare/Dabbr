import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { MessageCircle, Phone, Leaf, Drumstick, IndianRupee } from 'lucide-react'
import MenuSection from './MenuSection'
import { isProviderHoliday } from '@/lib/holidays'

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'] as const
const SLOT_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' }
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function getWeekDates(n: number): string[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now)
    d.setUTCDate(now.getUTCDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export default async function ProviderLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: p } = await db
    .from('providers')
    .select('id, name, tagline, logo_url, accent_color, phone, support_whatsapp, business_description, off_days')
    .eq('slug', slug)
    .single()
  if (!p) notFound()

  const weekDates = getWeekDates(7)

  // Fetch active meal plans, menu, and holidays in parallel
  const [{ data: mealPlans }, { data: menuRows }, { data: holidayRows }] = await Promise.all([
    db
      .from('meal_plans')
      .select('id, name, meal_slots, plan_type, frequency, monthly_price, description')
      .eq('provider_id', p.id)
      .eq('status', 'active')
      .order('monthly_price'),
    db
      .from('daily_menus')
      .select('menu_date, meal_slot, dish_name, plan_type, notes')
      .eq('provider_id', p.id)
      .gte('menu_date', weekDates[0])
      .lte('menu_date', weekDates[weekDates.length - 1])
      .order('menu_date')
      .order('meal_slot'),
    db
      .from('provider_holidays')
      .select('date, label')
      .eq('provider_id', p.id)
      .gte('date', weekDates[0])
      .lte('date', weekDates[weekDates.length - 1]),
  ])

  // Holiday lookup
  const offDays: number[] = p.off_days ?? []
  const holidayMap: Record<string, string | null> = {}
  for (const h of (holidayRows ?? [])) holidayMap[h.date] = h.label ?? null

  // Group by date → slot → dishes
  const menuMap: Record<string, Record<string, { dish_name: string; plan_type: string | null }[]>> = {}
  for (const row of (menuRows ?? [])) {
    if (!menuMap[row.menu_date]) menuMap[row.menu_date] = {}
    if (!menuMap[row.menu_date][row.meal_slot]) menuMap[row.menu_date][row.meal_slot] = []
    menuMap[row.menu_date][row.meal_slot].push({ dish_name: row.dish_name, plan_type: row.plan_type })
  }

  const waNumber = p.support_whatsapp || p.phone

  // Build structured days array for the interactive menu section
  const days = weekDates.map((date, i) => {
    const dayMap = menuMap[date] ?? {}
    const slotsWithDishes = SLOT_ORDER
      .filter(slot => (dayMap[slot]?.length ?? 0) > 0)
      .map(slot => ({ slot, dishes: dayMap[slot] }))
    const d = new Date(date + 'T12:00:00Z')
    const holiday = isProviderHoliday(date, offDays, Object.keys(holidayMap))
    return {
      date,
      label: i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
      dayNum: String(d.getUTCDate()),
      slots: slotsWithDishes,
      isHoliday: holiday,
      holidayLabel: holiday ? (holidayMap[date] ?? null) : null,
    }
  })

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-12">

      {/* ── Branded header ── */}
      <div
        className="px-5 pt-12 pb-10 text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
      >
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 bottom-0 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="relative">
          {p.logo_url ? (
            <img
              src={p.logo_url}
              alt={p.name}
              className="w-20 h-20 rounded-3xl object-cover mx-auto mb-4 shadow-xl border-4 border-white/25"
            />
          ) : (
            <div className="w-20 h-20 rounded-3xl mx-auto mb-4 shadow-xl border-4 border-white/25 flex items-center justify-center bg-white/20 text-white text-3xl font-black">
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-black text-white">{p.name}</h1>
          {p.tagline && (
            <p className="mt-1.5 text-sm text-white/75 font-medium">{p.tagline}</p>
          )}
          {p.business_description && (
            <p className="mt-3 text-xs text-white/60 max-w-xs mx-auto leading-relaxed">
              {p.business_description}
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 pt-6 space-y-6">

        {/* ── Menu (interactive day picker) ── */}
        <MenuSection days={days} />

        {/* ── Meal plans ── */}
        {mealPlans && mealPlans.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <IndianRupee className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Our Plans</h2>
            </div>
            <div className="space-y-3">
              {mealPlans.map((plan: any) => (
                <div key={plan.id} className="rounded-2xl bg-white border border-gray-100 px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {plan.plan_type === 'veg'
                          ? <Leaf className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          : <Drumstick className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        }
                        <p className="text-sm font-black text-gray-900">{plan.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">
                        {plan.meal_slots.map((s: string) => `${SLOT_EMOJI[s]} ${SLOT_LABEL[s]}`).join(' + ')}
                        <span className="mx-1.5 text-gray-300">·</span>
                        {plan.frequency === 'daily' ? 'Daily' : 'Alternate days'}
                      </p>
                      {plan.description && (
                        <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">{plan.description}</p>
                      )}
                    </div>
                    {plan.monthly_price > 0 && (
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-gray-900">
                          ₹{plan.monthly_price.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">per month</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {waNumber && (
              <p className="mt-3 text-xs text-gray-400 text-center">
                Interested? <a
                  href={`https://wa.me/91${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${p.name}, I'd like to subscribe to a tiffin plan.`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-2"
                  style={{ color: 'var(--accent)' }}
                >Contact us on WhatsApp</a> to subscribe.
              </p>
            )}
          </div>
        )}


        {/* ── Contact ── */}
        <div className="rounded-2xl bg-white border border-gray-100 px-5 py-5 shadow-sm">
          <h2 className="text-sm font-black text-gray-900 mb-4">Contact Us</h2>
          <div className="space-y-3">
            {waNumber && (
              <a
                href={`https://wa.me/91${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${p.name}, I'd like to know more about your tiffin subscription.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl bg-green-50 border border-green-100 px-4 py-3.5 hover:bg-green-100 transition-colors"
              >
                <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-green-500 shrink-0">
                  <MessageCircle className="w-5 h-5 text-white" fill="white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">WhatsApp</p>
                  <p className="text-xs text-gray-500">{waNumber}</p>
                </div>
              </a>
            )}
            {p.phone && p.phone !== waNumber && (
              <a
                href={`tel:${p.phone.replace(/\D/g, '')}`}
                className="flex items-center gap-3 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3.5 hover:bg-gray-100 transition-colors"
              >
                <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-200 shrink-0">
                  <Phone className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Call</p>
                  <p className="text-xs text-gray-500">{p.phone}</p>
                </div>
              </a>
            )}
          </div>
          <p className="mt-4 text-xs text-gray-400 leading-relaxed">
            Already a customer? Use the personal link we sent you on WhatsApp to access your subscription.
          </p>
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-xs text-gray-300 pb-4">Powered by Dabbr 🍱</p>

      </main>
    </div>
  )
}

export const dynamic = 'force-dynamic'
