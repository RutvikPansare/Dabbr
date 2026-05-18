'use client'

import { useEffect, useState } from 'react'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import PhoneLoginForm from './PhoneLoginForm'

type Tab = 'google' | 'phone'

export default function LoginTabs({ defaultTab }: { defaultTab: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  // No forced tab switch — native Google Sign-In now works without a browser.
  // Both tabs work on web and native.
  useEffect(() => {}, [])

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
        <button
          onClick={() => setTab('google')}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-center transition-all ${
            tab === 'google'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Google
        </button>
        <button
          onClick={() => setTab('phone')}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-center transition-all ${
            tab === 'phone'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Phone OTP
        </button>
      </div>

      {/* Tab content */}
      {tab === 'phone' ? <PhoneLoginForm /> : <GoogleSignInButton />}
    </div>
  )
}
