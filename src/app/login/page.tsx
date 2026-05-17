import GoogleSignInButton from '@/components/GoogleSignInButton'
import PhoneLoginForm from './PhoneLoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tab?: string }>
}) {
  const { error, tab } = await searchParams
  const showPhone = tab === 'phone'

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#FDF8F3] px-4 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 -left-10 h-72 w-72 rounded-full bg-gradient-to-br from-orange-400/20 to-rose-400/20 blur-3xl" />
      <div className="absolute bottom-0 -right-10 h-80 w-80 rounded-full bg-gradient-to-br from-orange-500/10 to-yellow-400/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center group">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-[#FF7B3F] to-[#E04F18] shadow-[0_8px_30px_rgba(244,98,42,0.3)] transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3 border border-white/20">
            <span className="text-4xl font-black text-white drop-shadow-sm">D</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-gray-900">Dabbr</h1>
          <p className="mt-2 text-sm font-medium text-gray-500 tracking-wide uppercase">
            Tiffin service manager
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-[2rem] p-8 space-y-6">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">
              Sign in to your kitchen
            </h2>
            <p className="mt-1 text-sm font-medium text-gray-500 leading-relaxed">
              Manage customers, track deliveries, and record payments.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 shadow-sm flex items-start gap-2">
              <span className="text-red-500 mt-0.5">⚠️</span>
              <p className="text-sm font-semibold text-red-700 leading-tight">
                Sign-in failed. Please try again.
              </p>
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
            <a
              href="/login"
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-center transition-all ${
                !showPhone ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Google
            </a>
            <a
              href="/login?tab=phone"
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-center transition-all ${
                showPhone ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Phone OTP
            </a>
          </div>

          {/* Tab content */}
          {showPhone ? (
            <PhoneLoginForm />
          ) : (
            <div className="hover:-translate-y-1 transition-transform duration-300">
              <GoogleSignInButton />
            </div>
          )}
        </div>

        <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
          By signing in you agree to our terms.
        </p>
      </div>
    </main>
  )
}
