import GoogleSignInButton from '@/components/GoogleSignInButton'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#FDF8F3] px-4 overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 -left-10 h-72 w-72 rounded-full bg-gradient-to-br from-orange-400/20 to-rose-400/20 blur-3xl" />
      <div className="absolute bottom-0 -right-10 h-80 w-80 rounded-full bg-gradient-to-br from-orange-500/10 to-yellow-400/10 blur-3xl" />
      
      <div className="relative z-10 w-full max-w-sm space-y-8">
        {/* Logo / Brand */}
        <div className="text-center group">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] shadow-[0_8px_30px_rgba(244,98,42,0.3)] transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3 border border-white/20">
            <span className="text-4xl font-black text-white drop-shadow-sm">D</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-gray-900">
            Dabbr
          </h1>
          <p className="mt-2 text-sm font-medium text-gray-500 tracking-wide uppercase">
            Tiffin service manager
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-[2rem] p-8">
          <h2 className="mb-2 text-xl font-black text-gray-800 tracking-tight">
            Sign in to your kitchen
          </h2>
          <p className="mb-8 text-sm font-medium text-gray-500 leading-relaxed">
            Manage your customers, track daily deliveries, and record payments easily.
          </p>

          {error && (
            <div className="mb-6 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 shadow-sm flex items-start gap-2">
              <span className="text-red-500 mt-0.5">⚠️</span>
              <p className="text-sm font-semibold text-red-700 leading-tight">
                Sign-in failed. Please try again.
              </p>
            </div>
          )}

          <div className="relative hover:-translate-y-1 transition-transform duration-300">
            <GoogleSignInButton />
          </div>
        </div>

        <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
          By signing in you agree to our terms.
        </p>
      </div>
    </main>
  )
}
