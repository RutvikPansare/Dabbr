import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedDashboardData } from '@/lib/queries'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const initialData = await getCachedDashboardData(user.id, today)

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialData={initialData}
    />
  )
}
