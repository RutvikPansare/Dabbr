'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User, MessageCircle, AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react'
import BottomNav from '@/components/BottomNav'

interface Provider {
  id: string
  name: string
  phone: string | null
  upi_id: string | null
  enable_delivery_tracking: boolean
}

interface Props {
  providerId: string
  provider: Provider | null
}

export default function SettingsClient({ providerId, provider }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [name, setName] = useState(provider?.name ?? '')
  const [phone, setPhone] = useState(provider?.phone ?? '')
  const [upiId, setUpiId] = useState(provider?.upi_id ?? '')
  const [deliveryTracking, setDeliveryTracking] = useState(provider?.enable_delivery_tracking ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')

    const { error: err } = await db
      .from('providers')
      .update({
        name: name.trim(),
        phone: phone.trim() || null,
        upi_id: upiId.trim() || null,
        enable_delivery_tracking: deliveryTracking,
      })
      .eq('id', providerId)

    if (err) {
      setError(`Failed to save: ${err.message}`)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-20">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-orange-100/50 px-5 pb-4 pt-8 shadow-[0_4px_30px_rgba(244,98,42,0.05)]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Settings</h1>
          <p className="text-xs font-medium text-orange-600/80">Your kitchen profile</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">

        {/* Profile form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="glass-card rounded-[2rem] p-6 shadow-sm">
            <h2 className="mb-5 text-sm font-black text-gray-900 flex items-center gap-2">
              <span className="flex items-center justify-center p-1.5 bg-gray-100 rounded-xl">
                <User className="w-4 h-4 text-gray-600" />
              </span>
              Provider Details
            </h2>

            {/* Name */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                Your name *
              </p>
              <input
                required
                placeholder="e.g. Meena Tai"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-modern"
              />
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Shown in WhatsApp messages as &quot;— {name || 'Your name'}&quot;
              </p>
            </div>

            {/* Phone */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                WhatsApp / Phone
              </p>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-modern"
              />
            </div>

            {/* UPI ID */}
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                UPI ID
              </p>
              <input
                placeholder="e.g. meena@upi or 9876543210@paytm"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="input-modern"
              />
              <p className="mt-1.5 text-xs font-medium text-gray-400">
                Included in payment receipts and renewal reminders
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="glass-card rounded-[2rem] p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-black text-gray-900 flex items-center gap-2">
              <span className="flex items-center justify-center p-1.5 bg-orange-50 rounded-xl">
                <ClipboardList className="w-4 h-4 text-orange-500" />
              </span>
              Features
            </h2>

            <button
              type="button"
              onClick={() => setDeliveryTracking(v => !v)}
              className="w-full flex items-center justify-between gap-4 py-1"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Delivery Tracking</p>
                <p className="text-xs font-medium text-gray-400 mt-0.5">
                  Mark delivered or skipped per day. Only delivered customers use a balance day.
                </p>
              </div>
              {/* Toggle pill */}
              <div
                className="relative shrink-0 h-7 w-12 rounded-full transition-colors duration-200"
                style={{ backgroundColor: deliveryTracking ? '#f97316' : '#e5e7eb' }}
              >
                <span
                  className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200"
                  style={{ transform: deliveryTracking ? 'translateX(1.25rem)' : 'translateX(0.125rem)' }}
                />
              </div>
            </button>
          </div>

          {/* Preview of UPI message snippet */}
          {upiId && (
            <div className="rounded-[1.5rem] bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/50 px-5 py-4 shadow-sm">
              <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Message preview (receipt)
              </p>
              <pre className="whitespace-pre-wrap text-xs text-green-800/90 font-sans leading-relaxed">
                {`Hi [Customer],\nPayment received: ₹2500 ✅\nYour tiffin is active for 30 more days.\nUPI: ${upiId}\nThank you! 🙏\n— ${name || 'Your name'}`}
              </pre>
            </div>
          )}

          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className={`w-full rounded-2xl py-4 text-sm font-bold shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 ${
              saved ? 'bg-green-500 text-white shadow-green-500/20' : 'btn-primary'
            }`}
          >
            {saving ? 'Saving…' : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved successfully!</> : 'Save changes'}
          </button>
        </form>

        {/* Danger zone */}
        <div className="glass-card rounded-[2rem] p-6 shadow-sm mt-6">
          <h2 className="mb-4 text-sm font-black text-red-600 flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 bg-red-50 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </span>
            Account
          </h2>
          <button
            onClick={handleSignOut}
            className="w-full rounded-2xl border-2 border-red-200 py-3.5 text-sm font-bold text-red-500 transition-all hover:bg-red-50 hover:border-red-300 active:scale-95"
          >
            Sign out
          </button>
        </div>

        {/* App version */}
        <p className="pb-4 text-center text-xs text-gray-400">
          Dabbr · Week 1 build
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
