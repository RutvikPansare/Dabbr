import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getThemeVars } from '@/lib/branding'
import type { Metadata } from 'next'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: p } = await db
    .from('providers')
    .select('name, tagline, accent_color')
    .eq('slug', slug)
    .single()
  if (!p) return { title: 'Not Found' }
  return {
    title: p.name,
    description: p.tagline ?? `${p.name} — powered by Dabbr`,
    openGraph: {
      title: p.name,
      description: p.tagline ?? `${p.name} — powered by Dabbr`,
    },
  }
}

export default async function SlugLayout({ children, params }: Props) {
  const { slug } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: provider } = await db
    .from('providers')
    .select('id, name, slug, accent_color')
    .eq('slug', slug)
    .single()
  if (!provider) notFound()
  const themeVars = getThemeVars(provider.accent_color)
  return (
    <div style={themeVars as React.CSSProperties}>
      {children}
    </div>
  )
}
