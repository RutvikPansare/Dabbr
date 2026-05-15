import { getPortalData } from '@/lib/customer-token'
import { getThemeVars } from '@/lib/branding'
import { getCustomerSession } from '@/lib/customer-auth'
import { linkSubscriptionToAccount } from '@/app/app/actions'
import CustomerPortalClient from './CustomerPortalClient'

interface Props {
  params: Promise<{ token: string }>
}

export default async function CustomerPortalPage({ params }: Props) {
  const { token } = await params

  const [data, session] = await Promise.all([
    getPortalData(token),
    getCustomerSession(),
  ])

  // ── Invalid / revoked token ──────────────────────────────────────────────
  if (!data) {
    return (
      <div className="min-h-screen bg-[#FDF8F3] flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 text-6xl">🔗</div>
        <h1 className="text-2xl font-black text-gray-900 mb-3">Link not found</h1>
        <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
          This portal link is invalid or has been revoked. Please ask your tiffin provider for a new link.
        </p>
        <div className="mt-8 rounded-2xl bg-orange-50 border border-orange-100 px-5 py-4 text-sm text-orange-700 font-medium max-w-xs">
          💡 Contact your provider on WhatsApp to get a fresh link.
        </div>
      </div>
    )
  }

  // ── Auto-link if customer is signed in ───────────────────────────────────
  // The magic link IS the auth — holding a valid token is sufficient to link.
  if (session) {
    await linkSubscriptionToAccount(token, session.accountId)
  }

  const themeVars = getThemeVars(data.provider.accent_color)

  return (
    <div style={themeVars as React.CSSProperties}>
      <CustomerPortalClient data={data} isLoggedIn={!!session} />
    </div>
  )
}

// No caching — portal data should always be fresh
export const dynamic = 'force-dynamic'
