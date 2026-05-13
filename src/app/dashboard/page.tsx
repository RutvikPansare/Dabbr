import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Pass only identity — client fetches its own data to avoid SSR hydration mismatches
  return <DashboardClient userId={user.id} userEmail={user.email ?? ''} />
}
