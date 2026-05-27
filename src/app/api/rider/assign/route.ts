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

  // Notify the rider — one notification per assignment date (skip if already notified today)
  const { count: existing } = await db
    .from('rider_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', rider_id)
    .eq('type', 'assignment')
    .contains('payload', { assignment_date })

  if ((existing ?? 0) === 0) {
    const fmtDate = new Date(assignment_date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'short',
    })
    const scopeText = scope === 'full' ? 'all deliveries' : `${area_name ?? scope} area`
    await db.from('rider_notifications').insert({
      rider_id,
      type: 'assignment',
      title: 'New delivery assignment',
      message: `You've been assigned ${scopeText} on ${fmtDate}`,
      payload: { provider_id: user.id, assignment_date, scope, area_name: area_name ?? null },
    })
  }

  return NextResponse.json({ assignment: data })
}
