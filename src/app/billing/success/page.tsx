import Link from 'next/link'

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] px-5 py-16">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500 text-4xl font-black text-white shadow-xl">
          ✓
        </div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">Payment received</h1>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500">
          Razorpay has received your payment. Your Dabbr subscription will update automatically once the webhook is processed.
        </p>
        <div className="mt-8 grid w-full gap-3">
          <Link
            href="/dashboard"
            className="rounded-2xl bg-[#F4622A] px-5 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/settings"
            className="rounded-2xl border border-orange-100 bg-white px-5 py-4 text-sm font-black text-orange-600"
          >
            View Billing Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
