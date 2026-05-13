'use client'

// Hardcode your Razorpay payment page link here.
// Replace with your actual Razorpay Payment Page URL after creating one.
const RAZORPAY_LINK = 'https://rzp.io/l/dabbr-subscription'

export default function Paywall() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FDF8F3] px-6 text-center">
      {/* Logo */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F4622A] shadow-xl">
        <span className="text-4xl font-black text-white">D</span>
      </div>

      <h1 className="text-2xl font-black text-gray-900">Your free trial has ended</h1>
      <p className="mt-2 max-w-xs text-sm text-gray-500">
        Subscribe to keep managing your tiffin business with Dabbr.
      </p>

      {/* Price card */}
      <div className="mt-8 w-full max-w-xs rounded-3xl bg-white p-6 shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Dabbr Pro
        </p>
        <div className="mt-2 flex items-end gap-1">
          <span className="text-4xl font-black text-gray-900">₹399</span>
          <span className="mb-1 text-sm text-gray-400">/ month</span>
        </div>
        <ul className="mt-4 space-y-2 text-left text-sm text-gray-600">
          {[
            '✅ Unlimited customers',
            '✅ Delivery tracking',
            '✅ Payment recording',
            '✅ WhatsApp reminders',
            '✅ Balance management',
          ].map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <a
        href={RAZORPAY_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 flex w-full max-w-xs items-center justify-center rounded-2xl bg-[#F4622A] py-4 text-base font-black text-white shadow-lg transition hover:bg-orange-600 active:scale-95"
      >
        Subscribe Now — ₹399/mo
      </a>

      <p className="mt-4 text-xs text-gray-400">
        Already paid?{' '}
        <a
          href="https://wa.me/919999999999?text=Hi%2C+I+subscribed+to+Dabbr+but+my+account+is+still+showing+trial+ended."
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#F4622A] underline"
        >
          Contact support
        </a>
      </p>
    </div>
  )
}
