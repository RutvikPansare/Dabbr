import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedProvider, getCachedSettingsData } from '@/lib/queries'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const [provider, { quickTags, holidays, riders }] = await Promise.all([
    getCachedProvider(user.id),
    getCachedSettingsData(user.id, today),
  ])

  return (
    <SettingsClient
      providerId={user.id}
      provider={provider}
      initialQuickTags={quickTags}
      initialHolidays={holidays}
      initialRiders={riders}
    />
  )
}
