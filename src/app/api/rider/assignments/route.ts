import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data, error } = await db
    .from('rider_assignments')
    .select('id, rider_id, scope, area_name, delivery_riders(name)')
    .eq('provider_id', user.id)
    .eq('assignment_date', date)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const assignments = (data ?? []).map((a: any) => ({
    id: a.id,
    rider_id: a.rider_id,
    rider_name: a.delivery_riders?.name ?? '',
    scope: a.scope,
    area_name: a.area_name,
  }))

  return NextResponse.json(assignments)
}
