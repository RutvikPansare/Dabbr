'use client'

import { useRouter } from 'next/navigation'
import { Check, ArrowRight } from 'lucide-react'

interface Props {
  providerName: string
}

export default function OnboardingClient({ providerName }: Props) {
  const router = useRouter()

  function handleStart() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dabbr_onboarding_step', '1')
    }
    router.push('/settings')
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: 'linear-gradient(160deg, #FF6B1A 0%, #E8460A 100%)' }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
        {/* Logo */}
        <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-xl">
          <span className="text-4xl font-black text-orange-500">D</span>
        </div>

        {/* Headline */}
        <div className="space-y-3">
          <h1 className="text-3xl font-black text-white leading-tight">
            {providerName ? `Welcome, ${providerName}! 👋` : 'Welcome to Dabbr! 👋'}
          </h1>
          <p className="text-base font-medium text-orange-100 leading-relaxed">
            Let's get your tiffin business ready to go.<br />
            Takes less than <span className="font-bold text-white">2 minutes.</span>
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {[
            { icon: '🏪', label: 'Set up your brand' },
            { icon: '🍱', label: 'Create your first meal plan' },
            { icon: '🧑', label: 'Add your first customer' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3">
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm font-semibold text-white">{item.label}</span>
              <Check className="w-4 h-4 text-orange-200 ml-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <button
          onClick={handleStart}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-white py-5 text-base font-black text-orange-500 shadow-xl active:scale-[0.98] transition-all"
        >
          Let's go <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
