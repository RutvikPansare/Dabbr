import { NextRequest, NextResponse } from 'next/server'

/**
 * Sets a persistent view-preference cookie so a user who is both a provider
 * AND a rider can choose which dashboard to land on.
 *
 * Usage:
 *   GET /api/set-view?view=provider  → sets cookie, redirects to /dashboard
 *   GET /api/set-view?view=rider     → sets cookie, redirects to /rider
 */
export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get('view') === 'rider' ? 'rider' : 'provider'
  const dest = view === 'rider' ? '/rider' : '/dashboard'

  const res = NextResponse.redirect(new URL(dest, req.url))
  res.cookies.set('dabbr_view', view, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  })
  return res
}
