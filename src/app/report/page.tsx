import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportClient from './ReportClient'

export default async function ReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ReportClient />
}
