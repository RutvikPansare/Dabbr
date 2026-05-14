import { notFound } from 'next/navigation'
import { getPortalData } from '@/lib/customer-token'
import { createAdminClient } from '@/lib/supabase/admin'
import CustomerPortalClient from '@/app/c/[token]/CustomerPortalClient'

interface Props {
  params: Promise<{ slug: string; token: string }>
}

export default async function BrandedPortalPage({ params }: Props) {
  const { slug, token } = await params

  // Get portal data (validates token)
  const data = await getPortalData(token)
  if (!data) {
    // Verify slug exists to give a better error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    await db.from('providers').select('name').eq('slug', slug).single()
    notFound()
  }

  // Verify token belongs to this slug's provider
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: p } = await db.from('providers').select('slug').eq('id', data.provider.id).single()
  if (!p || p.slug !== slug) notFound()

  return <CustomerPortalClient data={data} />
}

export const dynamic = 'force-dynamic'
