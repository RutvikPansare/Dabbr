import GoogleSignInButton from '@/components/GoogleSignInButton'
import PhoneLoginForm from './PhoneLoginForm'
import Link from 'next/link'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tab?: string }>
}) {
  const { error, tab } = await searchParams
  const showPhone = tab === 'phone'

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#FF7B3F] via-[#F4622A] to-[#D94C14] px-4 overflow-hidden">

      {/* Decorative circles */}
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10" />
      <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-black/10" />
      <div className="absolute top-1/3 -left-16 h-48 w-48 rounded-full bg-white/5" />
      <div className="absolute top-16 right-10 h-6 w-6 rounded-full bg-white/30" />
      <div className="absolute top-28 right-24 h-3 w-3 rounded-full bg-white/20" />
      <div className="absolute bottom-40 right-8 h-5 w-5 rounded-full bg-white/20" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo + branding */}
        <div className="text-center flex flex-col items-center gap-4 pt-8">
          <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white shadow-2xl shadow-black/20 border border-white/50">
            <span className="text-5xl font-black bg-gradient-to-br from-[#FF7B3F] to-[#D94C14] bg-clip-text text-transparent">D</span>
          </div>
          <div>
            <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-sm">Dabbr</h1>
            <p className="mt-1.5 text-sm font-semibold text-white/70 tracking-widest uppercase">
              Tiffin service manager
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full rounded-[2rem] bg-white/95 backdrop-blur-sm shadow-2xl shadow-black/20 p-6 space-y-5">

          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              Sign in to your kitchen 🍱
            </h2>
            <p className="mt-1 text-sm font-medium text-gray-500 leading-relaxed">
              Manage customers, track deliveries, and record payments.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 flex items-start gap-2">
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
                !showPhone
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Google
            </a>
            <a
              href="/login?tab=phone"
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-center transition-all ${
                showPhone
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Phone OTP
            </a>
          </div>

          {/* Tab content */}
          {showPhone ? (
            <PhoneLoginForm />
          ) : (
            <GoogleSignInButton />
          )}
        </div>

        {/* Bottom links */}
        <div className="flex items-center gap-2 text-[11px] font-semibold text-white/60 pb-8">
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
        </div>

      </div>
    </main>
  )
}
