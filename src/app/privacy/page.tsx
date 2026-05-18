import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — Dabbr',
  description: 'Privacy policy for Dabbr, the tiffin service manager.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FDF8F3]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <Link href="/login" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF7B3F] to-[#E04F18]">
              <span className="text-sm font-black text-white">D</span>
            </div>
            <span className="text-lg font-black text-gray-900 group-hover:text-orange-600 transition-colors">Dabbr</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-5 py-12 pb-24">
        <h1 className="text-3xl font-black text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: May 2025</p>

        <div className="space-y-8 text-gray-700">

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">1. Who we are</h2>
            <p className="text-sm leading-relaxed">
              Dabbr is a tiffin service management app designed for home cooks and small tiffin providers in India.
              It helps providers manage customers, track daily deliveries, and record payments.
              This privacy policy explains what data we collect, how we use it, and how we protect it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">2. Data we collect</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <p><strong>Provider accounts:</strong> When you sign in with Google, we receive your name, email address, and profile picture from Google. We store your name, email, and any business details you add in Settings (business name, phone number, UPI ID, logo).</p>
              <p><strong>Customer data:</strong> Providers enter customer information including names, WhatsApp numbers, addresses, meal preferences, and payment records. This data belongs to the provider and is stored securely.</p>
              <p><strong>Delivery logs:</strong> We store daily delivery statuses (delivered / skipped) to help providers track their service.</p>
              <p><strong>Payments:</strong> Payment amounts and dates recorded by providers. We do not store any credit card or banking information.</p>
              <p><strong>Phone numbers:</strong> If you use phone OTP login, we store your phone number to identify your account.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">3. How we use your data</h2>
            <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
              <li>To provide the Dabbr service — managing customers, deliveries, and payments</li>
              <li>To authenticate you securely via Google OAuth or phone OTP</li>
              <li>To send OTP verification codes via SMS when you log in</li>
              <li>To display your provider branding (name, logo, accent colour) on customer portals</li>
              <li>We do <strong>not</strong> sell your data to any third party</li>
              <li>We do <strong>not</strong> use your data for advertising</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">4. Data storage and security</h2>
            <p className="text-sm leading-relaxed">
              All data is stored in Supabase (hosted on AWS in the US) with row-level security policies
              ensuring each provider can only access their own data. Connections are encrypted with TLS.
              OTP codes are hashed using SHA-256 and expire after 10 minutes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">5. Third-party services</h2>
            <div className="text-sm leading-relaxed space-y-2">
              <p><strong>Google OAuth</strong> — used for provider sign-in. Subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Google's Privacy Policy</a>.</p>
              <p><strong>Supabase</strong> — database and authentication infrastructure. Subject to <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Supabase's Privacy Policy</a>.</p>
              <p><strong>2Factor.in</strong> — used to send OTP SMS messages. Only your phone number and a one-time code are shared.</p>
              <p><strong>Vercel</strong> — hosting provider. Request logs may be retained for up to 30 days.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">6. Customer portal data</h2>
            <p className="text-sm leading-relaxed">
              Customers who access their portal via a personal link can view their subscription details and daily menu.
              If they sign up for a customer account using their phone number, we store that number to link their subscriptions.
              Customers can request deletion of their account by contacting their provider or emailing us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">7. Your rights</h2>
            <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
              <li>You can delete your Dabbr account and all associated data by contacting us</li>
              <li>You can disconnect Google sign-in from your Google account settings at any time</li>
              <li>Providers can export or delete their customer data at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">8. Children's privacy</h2>
            <p className="text-sm leading-relaxed">
              Dabbr is not directed at children under 13. We do not knowingly collect data from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">9. Changes to this policy</h2>
            <p className="text-sm leading-relaxed">
              We may update this policy from time to time. We will notify providers via email for any significant changes.
              Continued use of Dabbr after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">10. Contact</h2>
            <p className="text-sm leading-relaxed">
              For any privacy-related questions or data deletion requests, email us at{' '}
              <a href="mailto:rutvik.pansare@gmail.com" className="text-orange-500 hover:underline">
                rutvik.pansare@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link href="/login" className="text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors">
            ← Back to Dabbr
          </Link>
        </div>
      </main>
    </div>
  )
}
