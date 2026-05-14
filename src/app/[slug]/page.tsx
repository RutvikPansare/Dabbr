import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function ProviderLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: p } = await db
    .from('providers')
    .select('name, tagline, logo_url, accent_color, phone, support_whatsapp')
    .eq('slug', slug)
    .single()
  if (!p) notFound()

  const waNumber = p.support_whatsapp || p.phone

  return (
    <div className="min-h-screen bg-[#FDF8F3] flex flex-col items-center justify-center px-6 text-center">
      {p.logo_url && (
        <img src={p.logo_url} alt={p.name} className="w-20 h-20 rounded-3xl object-cover mb-5 shadow-lg" />
      )}
      {!p.logo_url && (
        <div
          className="w-20 h-20 rounded-3xl mb-5 shadow-lg flex items-center justify-center text-white text-3xl font-black"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {p.name.charAt(0).toUpperCase()}
        </div>
      )}
      <h1 className="text-3xl font-black text-gray-900">{p.name}</h1>
      {p.tagline && <p className="mt-2 text-gray-500 text-sm font-medium">{p.tagline}</p>}
      <p className="mt-6 text-sm text-gray-400 max-w-xs leading-relaxed">
        This is the customer portal for {p.name}. If you have a tiffin subscription, use the link sent to you by your provider.
      </p>
      {waNumber && (
        <a
          href={`https://wa.me/91${waNumber.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-green-500 text-white px-6 py-3 text-sm font-bold shadow-lg"
        >
          💬 Contact on WhatsApp
        </a>
      )}
      <p className="mt-10 text-xs text-gray-300">Powered by Dabbr 🍱</p>
    </div>
  )
}

export const dynamic = 'force-dynamic'
