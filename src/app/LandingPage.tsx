'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { BILLING_PLANS, BillingPlanId } from '@/lib/billing'
import { useBillingCheckout } from '@/lib/use-billing-checkout'

// ── Google Icon ───────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ── Sign-in hook ──────────────────────────────────────────────────────────────
function useSignIn() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function signIn() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return { signIn, loading }
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { signIn, loading } = useSignIn()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-[#FDF8F3]/95 backdrop-blur-xl shadow-sm border-b border-orange-100'
        : 'bg-transparent'
    }`}>
      <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-[#FF730D] to-[#E85800] shadow-md">
            <span className="text-base font-black text-white">D</span>
          </div>
          <span className={`text-xl font-black tracking-tight transition-colors ${scrolled ? 'text-gray-900' : 'text-white'}`}>
            Dabbr
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {['#features', '#how-it-works', '#pricing'].map((href, i) => (
            <a
              key={href}
              href={href}
              className={`text-sm font-semibold transition-colors hover:text-[#F4622A] ${
                scrolled ? 'text-gray-600' : 'text-white/80'
              }`}
            >
              {['Features', 'How it Works', 'Pricing'][i]}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all"
            >
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <button
                onClick={signIn}
                disabled={loading}
                className={`text-sm font-semibold transition-colors hover:text-[#F4622A] disabled:opacity-60 ${
                  scrolled ? 'text-gray-600' : 'text-white/80'
                }`}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <button
                onClick={signIn}
                disabled={loading}
                className="rounded-full bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Get Started Free'}
              </button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className={`md:hidden text-2xl transition-colors ${scrolled ? 'text-gray-800' : 'text-white'}`}
          onClick={() => setMobileOpen(o => !o)}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-[#FDF8F3]/98 backdrop-blur-xl border-t border-orange-100 px-5 py-5 flex flex-col gap-4">
          {[['#features', 'Features'], ['#how-it-works', 'How it Works'], ['#pricing', 'Pricing']].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-gray-700 hover:text-[#F4622A]">
              {label}
            </a>
          ))}
          <div className="pt-3 border-t border-orange-100">
            {isLoggedIn ? (
              <Link href="/dashboard" className="block w-full text-center rounded-2xl bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] py-3 text-sm font-bold text-white">
                Go to Dashboard →
              </Link>
            ) : (
              <button onClick={signIn} disabled={loading} className="w-full rounded-2xl bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] py-3 text-sm font-bold text-white disabled:opacity-60">
                {loading ? 'Signing in…' : 'Get Started Free with Google'}
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { signIn, loading } = useSignIn()

  return (
    <section className="relative min-h-screen bg-[#160800] flex flex-col items-center justify-center overflow-hidden px-5 pt-24 pb-20">
      {/* Glow blobs */}
      <div className="absolute top-[-15%] left-[-10%] h-[600px] w-[600px] rounded-full bg-[#F4622A]/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-[#FF7B3F]/15 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[800px] rounded-full bg-[#F4622A]/8 blur-[80px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-orange-300">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
          Free Forever — No Credit Card Needed
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.05]">
          Run your tiffin{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF7B3F] to-[#FFB347]">
            business like a pro
          </span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-orange-100/60 leading-relaxed sm:text-xl">
          Track customers, manage daily deliveries, record payments, and send WhatsApp reminders — all from your phone. Built for tiffin providers across India.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] px-8 py-4 text-base font-bold text-white shadow-xl shadow-orange-900/40 hover:-translate-y-0.5 hover:shadow-orange-900/60 transition-all"
            >
              Go to Dashboard
              <span>→</span>
            </Link>
          ) : (
            <button
              onClick={signIn}
              disabled={loading}
              className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] px-8 py-4 text-base font-bold text-white shadow-xl shadow-orange-900/40 hover:-translate-y-0.5 hover:shadow-orange-900/60 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <GoogleIcon />
              {loading ? 'Signing in…' : 'Start Free with Google'}
            </button>
          )}
          <a
            href="#how-it-works"
            className="flex items-center gap-2 rounded-2xl border border-white/15 px-8 py-4 text-base font-semibold text-white/70 hover:border-white/30 hover:text-white transition-all"
          >
            See how it works
          </a>
        </div>

        <p className="mt-4 text-xs text-orange-200/40 font-medium">
          Free plan available. Paid plans start at ₹200/month. Cancel anytime.
        </p>

        {/* Dashboard mockup */}
        <div className="relative mx-auto mt-16 max-w-sm">
          {/* Phone frame */}
          <div className="relative rounded-[2.5rem] bg-[#1E0C00] border-4 border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.6)] overflow-hidden aspect-[9/16] max-h-[480px]">
            {/* Status bar */}
            <div className="flex items-center justify-between px-5 pt-3 pb-1">
              <span className="text-[10px] text-white/50 font-semibold">9:41</span>
              <div className="flex gap-1">
                <div className="h-2 w-5 rounded-full bg-white/20" />
                <div className="h-2 w-3 rounded-full bg-white/20" />
              </div>
            </div>
            {/* App content */}
            <div className="bg-gradient-to-br from-[#F4622A] to-orange-400 px-4 pt-4 pb-8">
              <p className="text-[9px] text-orange-100/70 font-semibold">Good morning ☀️</p>
              <p className="text-sm font-black text-white">Hello, Priya!</p>
            </div>
            <div className="flex gap-2 mx-3 -mt-4">
              <div className="flex-1 rounded-2xl bg-green-500 p-3 shadow-lg">
                <p className="text-[9px] text-white/70">Cook today</p>
                <p className="text-2xl font-black text-white leading-none">12</p>
                <p className="text-[10px] text-white font-semibold">🥦 Veg</p>
              </div>
              <div className="flex-1 rounded-2xl bg-[#F4622A] p-3 shadow-lg">
                <p className="text-[9px] text-white/70">Cook today</p>
                <p className="text-2xl font-black text-white leading-none">8</p>
                <p className="text-[10px] text-white font-semibold">🍗 Non-veg</p>
              </div>
            </div>
            <div className="mx-3 mt-3 space-y-1.5">
              <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-gray-800">💸 Payment alerts</p>
                  <p className="text-[9px] text-gray-500">3 customers low on balance</p>
                </div>
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">3</span>
              </div>
              {[
                { name: 'Rahul Sharma', area: 'Koramangala', type: '🥦' },
                { name: 'Sneha Patel', area: 'Indiranagar', type: '🍗' },
                { name: 'Amit Kumar', area: 'HSR Layout', type: '🥦' },
              ].map((c, i) => (
                <div key={i} className="rounded-xl bg-white/80 px-3 py-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[8px] font-bold text-gray-500">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-gray-900">{c.name}</p>
                    <p className="text-[9px] text-gray-400">{c.area}</p>
                  </div>
                  <span className="text-sm">{c.type}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Glow under phone */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 h-12 w-48 bg-[#F4622A]/30 blur-2xl rounded-full" />
        </div>
      </div>
    </section>
  )
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function Stats() {
  const items = [
    { value: 'Free', unit: '', label: 'Plan available, no card' },
    { value: '1-tap', unit: '', label: 'WhatsApp reminders' },
    { value: '₹200', unit: '/mo', label: 'Starter plan' },
    { value: '100%', unit: '', label: 'Mobile-first design' },
  ]
  return (
    <section className="bg-[#FDF8F3] py-16 border-b border-orange-100">
      <div className="mx-auto max-w-5xl px-5">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-orange-400 mb-10">
          Built for tiffin providers across India
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {items.map(({ value, unit, label }) => (
            <div key={label} className="text-center">
              <p className="text-4xl font-black text-gray-900">
                {value}
                <span className="text-xl font-bold text-[#F4622A]">{unit}</span>
              </p>
              <p className="mt-1.5 text-sm font-medium text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────
function Features() {
  const features = [
    { emoji: '👥', title: 'Customer Management', body: 'Add customers with their name, area, plan type, and meal frequency. Edit, pause, or deactivate any time.' },
    { emoji: '📦', title: 'Daily Delivery List', body: 'See exactly who gets tiffin today — veg and non-veg counts calculated automatically, with alternate-day support.' },
    { emoji: '💳', title: 'Payment Tracking', body: 'Record payments and watch balance days update automatically. Never lose track of who has paid.' },
    { emoji: '💬', title: 'WhatsApp Reminders', body: 'Send pre-filled payment reminder messages to customers with low balance in one tap — no typing needed.' },
    { emoji: '⏸️', title: 'Pause Management', body: 'Customers travelling? Pause their service for a date range. Deliveries and billing stop automatically.' },
    { emoji: '📋', title: 'Copy Delivery List', body: 'Copy today\'s full delivery list to your clipboard in one tap. Share it with your delivery staff instantly.' },
  ]
  return (
    <section id="features" className="bg-white py-24 px-5">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4622A] mb-3">Features</p>
          <h2 className="text-3xl font-black text-gray-900 sm:text-4xl lg:text-5xl tracking-tight">
            Everything you need to run your kitchen business
          </h2>
          <p className="mt-4 text-gray-500 max-w-xl mx-auto">
            No spreadsheets. No WhatsApp chaos. One app that handles everything.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ emoji, title, body }) => (
            <div
              key={title}
              className="group rounded-3xl border border-orange-100 bg-[#FDF8F3] p-7 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-100 transition-all duration-300"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 text-2xl group-hover:scale-110 transition-transform">
                {emoji}
              </div>
              <h3 className="mb-2 text-base font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it Works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '1', emoji: '✍️', title: 'Add your customers', body: 'Enter each customer\'s name, WhatsApp number, area, plan type, and price per month. Takes 2 minutes.' },
    { n: '2', emoji: '🍱', title: 'Track daily deliveries', body: 'Open the app each morning. See your veg and non-veg counts, plus a full sorted delivery list to share.' },
    { n: '3', emoji: '💰', title: 'Get paid on time', body: 'Record payments as they come in. Get alerts for low-balance customers and send WhatsApp reminders in one tap.' },
  ]
  return (
    <section id="how-it-works" className="bg-[#FDF8F3] py-24 px-5">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4622A] mb-3">How it Works</p>
          <h2 className="text-3xl font-black text-gray-900 sm:text-4xl lg:text-5xl tracking-tight">
            Up and running in minutes
          </h2>
        </div>
        <div className="relative flex flex-col md:flex-row gap-10">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-8 left-[calc(16.6%)] right-[calc(16.6%)] h-0.5 bg-gradient-to-r from-orange-200 via-[#F4622A] to-orange-200" />
          {steps.map(({ n, emoji, title, body }) => (
            <div key={n} className="flex-1 relative z-10 flex flex-col items-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#F4622A] bg-white shadow-lg shadow-orange-100 text-2xl">
                {emoji}
              </div>
              <div className="absolute -top-1 -right-1 md:right-auto md:-top-1 md:left-1/2 md:-translate-x-1/2 w-6 h-6 rounded-full bg-[#F4622A] flex items-center justify-center text-white text-xs font-black">
                {n}
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function Pricing({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { signIn, loading } = useSignIn()
  const { startCheckout, loadingPlan, error } = useBillingCheckout()
  const trialFeatures = [
    'Up to 15 customers',
    'Daily delivery tracking',
    'Payment recording',
    'WhatsApp reminders',
    'Pause management',
    'Copy delivery list',
  ]
  const paidPlans: Array<{
    id: BillingPlanId
    badge: string
    features: string[]
    featured?: boolean
    cta: string
  }> = [
    {
      id: 'starter',
      badge: 'Starter',
      features: ['Up to 50 customers', 'Daily delivery tracking', 'Payments and reminders', 'Menu planner'],
      cta: 'Get Starter Plan',
    },
    {
      id: 'pro',
      badge: 'Best for growing kitchens',
      features: ['Everything in Starter', 'Unlimited customers', 'Meal plans and subscriptions', 'Priority support'],
      featured: true,
      cta: 'Get Pro Plan',
    },
  ]
  return (
    <section id="pricing" className="relative bg-[#160800] py-24 px-5 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[700px] rounded-full bg-[#F4622A]/10 blur-[100px] pointer-events-none" />
      <div className="mx-auto max-w-5xl relative z-10">
        <div className="text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4622A] mb-3">Pricing</p>
          <h2 className="text-3xl font-black text-white sm:text-4xl lg:text-5xl tracking-tight">
            Simple, honest pricing
          </h2>
          <p className="mt-4 text-orange-200/50 max-w-xl mx-auto">
            Start free. Stay only if you love it.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Trial */}
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 flex flex-col">
            <h3 className="text-xl font-bold text-white mb-1">Free Plan</h3>
            <div className="flex items-end gap-1 mb-6">
              <span className="text-5xl font-black text-white">₹0</span>
              <span className="text-orange-200/50 mb-2">/ forever</span>
            </div>
            <ul className="flex-1 space-y-3 mb-8">
              {trialFeatures.map(f => (
                <li key={f} className="flex items-center gap-3 text-orange-100/70 text-sm">
                  <span className="text-green-400 text-base">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {isLoggedIn ? (
              <Link href="/dashboard" className="block w-full text-center py-3.5 rounded-2xl font-bold text-white border border-white/20 hover:bg-white/10 transition-colors">
                Go to Dashboard →
              </Link>
            ) : (
              <button onClick={signIn} disabled={loading} className="w-full py-3.5 rounded-2xl font-bold text-white border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-60">
                {loading ? 'Signing in…' : 'Get Started Free'}
              </button>
            )}
          </div>

          {paidPlans.map(planConfig => {
            const plan = BILLING_PLANS[planConfig.id]
            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-8 flex flex-col ${
                  planConfig.featured
                    ? 'border border-[#F4622A]/50 bg-gradient-to-br from-[#F4622A]/20 to-orange-900/20 shadow-[0_0_40px_rgba(244,98,42,0.15)]'
                    : 'border border-white/10 bg-white/5 backdrop-blur-sm'
                }`}
              >
                <div className="absolute -top-3 right-6 bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                  {planConfig.badge}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Dabbr {plan.name}</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF7B3F] to-[#FFB347]">₹{plan.amount}</span>
                  <span className="text-orange-200/50 mb-2">/ month</span>
                </div>
                <ul className="flex-1 space-y-3 mb-8">
                  {planConfig.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-orange-100/70 text-sm">
                      <span className="text-orange-400 text-base">✦</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => startCheckout(plan.id, 'landing')}
                  disabled={loadingPlan !== null}
                  className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-[#FF7B3F] to-[#E04F18] hover:-translate-y-0.5 transition-all shadow-lg shadow-orange-900/40 disabled:opacity-60"
                >
                  {loadingPlan === plan.id ? 'Opening Razorpay…' : planConfig.cta}
                </button>
              </div>
            )
          })}
        </div>
        {error && (
          <p className="mx-auto mt-5 max-w-lg rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm font-semibold text-red-100">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { signIn, loading } = useSignIn()
  return (
    <section className="relative bg-gradient-to-br from-[#FF7B3F] to-[#C43D0A] py-28 px-5 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] pointer-events-none" />
      <div className="mx-auto max-w-3xl text-center relative z-10">
        <p className="text-5xl mb-4">🍱</p>
        <h2 className="text-4xl font-black text-white sm:text-5xl tracking-tight mb-4">
          Ready to grow your tiffin business?
        </h2>
        <p className="text-orange-100/70 text-lg mb-10 max-w-xl mx-auto">
          Join tiffin providers who manage their kitchen business with Dabbr. Get started free today.
        </p>
        {isLoggedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2.5 rounded-2xl bg-white px-10 py-4 text-base font-black text-[#F4622A] shadow-xl hover:-translate-y-0.5 hover:shadow-2xl transition-all"
          >
            Go to Dashboard →
          </Link>
        ) : (
          <button
            onClick={signIn}
            disabled={loading}
            className="inline-flex items-center gap-2.5 rounded-2xl bg-white px-10 py-4 text-base font-black text-[#F4622A] shadow-xl hover:-translate-y-0.5 hover:shadow-2xl transition-all disabled:opacity-60"
          >
            <GoogleIcon />
            {loading ? 'Signing in…' : 'Start Free with Google'}
          </button>
        )}
        <p className="mt-4 text-xs text-orange-100/50 font-medium">
          No credit card. Free plan available. Cancel anytime.
        </p>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-[#160800] border-t border-white/5 py-12 px-5">
      <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-[#FF730D] to-[#E85800]">
            <span className="text-sm font-black text-white">D</span>
          </div>
          <span className="text-lg font-black text-white">Dabbr</span>
          <span className="text-orange-200/30 text-sm ml-2">Tiffin management for India's food providers</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/privacy" className="text-orange-200/40 hover:text-orange-200/70 text-xs transition-colors">
            Privacy Policy
          </a>
          <span className="text-orange-200/20 text-xs">·</span>
          <a href="/terms" className="text-orange-200/40 hover:text-orange-200/70 text-xs transition-colors">
            Terms of Service
          </a>
          <span className="text-orange-200/20 text-xs">·</span>
          <p className="text-orange-200/30 text-xs">
            © {new Date().getFullYear()} Dabbr. Made with ❤️ for tiffin providers across India.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage({
  isLoggedIn,
  userEmail,
}: {
  isLoggedIn: boolean
  userEmail: string | null
}) {
  const [clientLoggedIn, setClientLoggedIn] = useState(isLoggedIn)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      setClientLoggedIn(!!data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setClientLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <div className="min-h-screen">
      <Navbar isLoggedIn={clientLoggedIn} />
      <Hero isLoggedIn={clientLoggedIn} />
      <Stats />
      <Features />
      <HowItWorks />
      <Pricing isLoggedIn={clientLoggedIn} />
      <CTA isLoggedIn={clientLoggedIn} />
      <Footer />
    </div>
  )
}
