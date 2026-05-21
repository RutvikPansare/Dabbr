import { Trash2 } from 'lucide-react'

export const metadata = {
  title: 'Delete Account – Dabbr',
}

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <p className="text-2xl font-black text-[#F4622A]">Dabbr</p>
          <p className="text-sm text-gray-500 mt-1">Tiffin management, simplified</p>
        </div>

        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mx-auto mb-5">
            <Trash2 className="w-7 h-7 text-red-500" />
          </div>

          <h1 className="text-center text-xl font-black text-gray-900 mb-2">
            Delete your account
          </h1>
          <p className="text-center text-sm text-gray-500 mb-6">
            You can delete your Dabbr account and all associated data directly from within the app.
          </p>

          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5 space-y-3 text-sm text-gray-700">
            <p className="font-bold text-gray-900">How to delete your account:</p>
            <ol className="space-y-2 list-none">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F4622A] text-white text-xs font-black flex items-center justify-center mt-0.5">1</span>
                Open the Dabbr app and sign in
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F4622A] text-white text-xs font-black flex items-center justify-center mt-0.5">2</span>
                Go to <strong>Settings</strong> (bottom navigation bar)
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F4622A] text-white text-xs font-black flex items-center justify-center mt-0.5">3</span>
                Scroll to the bottom and tap <strong>Delete account</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F4622A] text-white text-xs font-black flex items-center justify-center mt-0.5">4</span>
                Confirm deletion — your account and all data will be permanently removed
              </li>
            </ol>
          </div>

          <div className="mt-6 rounded-2xl bg-orange-50 border border-orange-100 p-4">
            <p className="text-xs text-orange-700 font-semibold">
              ⚠️ Deletion is permanent and cannot be undone. All customers, meal plans, menus, and payment history will be erased immediately.
            </p>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Need help? Email us at{' '}
            <a href="mailto:hello@dabbr.in" className="text-[#F4622A] font-semibold">
              hello@dabbr.in
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
