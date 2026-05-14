import { getPortalData } from '@/lib/customer-token'
import CustomerPortalClient from './CustomerPortalClient'

interface Props {
  params: Promise<{ token: string }>
}

export default async function CustomerPortalPage({ params }: Props) {
  const { token } = await params
  const data = await getPortalData(token)

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

  return <CustomerPortalClient data={data} />
}

// No caching — portal data should always be fresh
export const dynamic = 'force-dynamic'
