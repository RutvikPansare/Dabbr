import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rider_id, assignment_date, scope, area_name } = await req.json()
  if (!rider_id || !assignment_date || !scope) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Verify the rider belongs to this provider
  const { data: rider, error: riderErr } = await db
    .from('delivery_riders')
    .select('id')
    .eq('id', rider_id)
    .eq('provider_id', user.id)
    .maybeSingle()

  if (riderErr || !rider) {
    return NextResponse.json({ error: 'Rider not found' }, { status: 404 })
  }

  const { data, error } = await db
    .from('rider_assignments')
    .upsert(
      {
        provider_id: user.id,
        rider_id,
        assignment_date,
        scope,
        area_name: area_name ?? null,
      },
      { onConflict: 'rider_id,assignment_date,scope,area_name' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: data })
}
