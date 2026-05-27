/**
 * /c  — Session-based customer portal
 *
 * For logged-in customers. Uses the Supabase auth session (user_id) to find
 * the customer record directly — no token required. Falls back to asking
 * the user to sign in if not authenticated.
 *
 * The /c/[token] route still works for unauthenticated sharing links.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPortalData } from '@/lib/customer-token'
import { getThemeVars } from '@/lib/branding'
import CustomerPortalClient from './[token]/CustomerPortalClient'

export const dynamic = 'force-dynamic'

export default async function CustomerPortalSessionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Not logged in — send to main login; they'll be redirected back here after auth
    redirect('/login')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Find their customer record by user_id
  const { data: customerRow } = await db
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!customerRow) {
    // Logged in but no customer record linked yet — show helpful message
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#FDF8F3] p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">🍱</div>
          <h1 className="text-lg font-black text-gray-900">No subscription found</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your account isn&apos;t linked to any tiffin subscription yet. Ask your provider to share your personal portal link — opening it once will link your account automatically.
          </p>
        </div>
      </main>
    )
  }

  // Get their active portal token (reuses all existing getPortalData logic)
  const { data: tokenRow } = await db
    .from('customer_access_tokens')
    .select('token')
    .eq('customer_id', customerRow.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRow) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#FDF8F3] p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">🔗</div>
          <h1 className="text-lg font-black text-gray-900">Portal not set up yet</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your provider hasn&apos;t generated a portal link for your account yet. Ask them to share it with you.
          </p>
        </div>
      </main>
    )
  }

  const data = await getPortalData(tokenRow.token)

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#FDF8F3] p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-lg font-black text-gray-900">Could not load portal</h1>
          <p className="text-sm text-gray-500">Please try refreshing the page.</p>
        </div>
      </main>
    )
  }

  const themeVars = getThemeVars(data.provider.accent_color)

  return (
    <div style={themeVars as React.CSSProperties}>
      <CustomerPortalClient data={data} isLoggedIn={true} />
    </div>
  )
}
