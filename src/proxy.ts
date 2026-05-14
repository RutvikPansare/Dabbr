import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // /c/* routes are the customer portal — no auth required, token-based access
  if (pathname.startsWith('/c/')) {
    return supabaseResponse
  }

  // Unauthenticated user trying to access a protected route
  if (
    !user &&
    (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/customers') ||
      pathname.startsWith('/meal-plans') ||
      pathname.startsWith('/menu') ||
      pathname.startsWith('/payments') ||
      pathname.startsWith('/settings')
    )
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user visiting login — send to dashboard. Keep root public so
  // the landing page remains visible at localhost:3000.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/customers/:path*',
    '/meal-plans/:path*',
    '/menu/:path*',
    '/payments/:path*',
    '/settings/:path*',
    '/login',
    '/c/:path*',  // customer portal — passes through unauthenticated
  ],
}
