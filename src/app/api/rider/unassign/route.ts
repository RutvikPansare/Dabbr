import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { assignment_id, rider_id, assignment_date, scope, area_name } = body as Record<string, string | null | undefined>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Determine delete strategy:
  // • If assignment_id looks like a real DB UUID (not a draft-… client id), delete by id.
  // • Otherwise fall back to composite key (rider_id + date + scope + area_name).
  //   This handles the race condition where the client calls unassign before the
  //   assign API has responded with the real UUID.
  const isRealId = assignment_id && !assignment_id.startsWith('draft-')

  if (isRealId) {
    const { error } = await db
      .from('rider_assignments')
      .delete()
      .eq('id', assignment_id)
      .eq('provider_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Composite-key fallback
  if (!rider_id || !assignment_date || !scope) {
    return NextResponse.json({ error: 'Missing assignment_id or composite key fields (rider_id, assignment_date, scope)' }, { status: 400 })
  }

  let query = db
    .from('rider_assignments')
    .delete()
    .eq('rider_id', rider_id)
    .eq('assignment_date', assignment_date)
    .eq('scope', scope)
    .eq('provider_id', user.id)

  if (scope === 'area') {
    query = area_name ? query.eq('area_name', area_name) : query.is('area_name', null)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
