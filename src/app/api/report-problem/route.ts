import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_CATEGORIES = new Set(['bug', 'billing', 'delivery', 'feature', 'other'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { category, description } = body as Record<string, unknown>

  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category))
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  if (typeof description !== 'string' || description.trim().length < 10)
    return NextResponse.json({ error: 'Description must be at least 10 characters' }, { status: 400 })
  if (description.length > 2000)
    return NextResponse.json({ error: 'Description too long' }, { status: 400 })

  const db = createAdminClient() as ReturnType<typeof createAdminClient>
  const { error } = await (db as any)
    .from('problem_reports')
    .insert({ provider_id: user.id, category, description: description.trim() })

  if (error) {
    console.error('report-problem insert error:', error)
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
