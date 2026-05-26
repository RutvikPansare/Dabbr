import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportsClient from './ReportsClient'

export const metadata = { title: 'Reports — Dabbr' }

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ReportsClient />
}
