import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: provider }, { data: quickTags }, { data: holidays }] = await Promise.all([
    supabase
      .from('providers')
      .select('*')
      .eq('id', user.id)
      .single(),
    supabase
      .from('menu_quick_tags')
      .select('*')
      .eq('provider_id', user.id)
      .order('meal_slot')
      .order('plan_type')
      .order('sort_order'),
    supabase
      .from('provider_holidays')
      .select('id, date, label')
      .eq('provider_id', user.id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date'),
  ])

  return (
    <SettingsClient
      providerId={user.id}
      provider={provider}
      initialQuickTags={quickTags ?? []}
      initialHolidays={holidays ?? []}
    />
  )
}
