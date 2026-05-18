import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — Dabbr',
  description: 'Terms of service for Dabbr, the tiffin service manager.',
}

export default function TermsPage() {
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
        <h1 className="text-3xl font-black text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: May 2025</p>

        <div className="space-y-8 text-gray-700">

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">1. Acceptance of terms</h2>
            <p className="text-sm leading-relaxed">
              By accessing or using Dabbr ("the Service"), you agree to be bound by these Terms of Service.
              If you do not agree, please do not use Dabbr. These terms apply to all providers and customers
              who access the Service in any way.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">2. What Dabbr is</h2>
            <p className="text-sm leading-relaxed">
              Dabbr is a tiffin service management tool that helps home cooks and small food providers
              manage customers, track daily deliveries, and record payments. Dabbr is a software platform only —
              we are not a food delivery company and do not take responsibility for the food, deliveries,
              or payments made between providers and their customers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">3. Provider accounts</h2>
            <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
              <li>You must provide accurate information when creating your account</li>
              <li>You are responsible for maintaining the security of your account</li>
              <li>You are responsible for all activity that occurs under your account</li>
              <li>You must not share your login credentials with others</li>
              <li>You must be at least 18 years old to create a provider account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">4. Customer data</h2>
            <p className="text-sm leading-relaxed">
              As a provider, you are responsible for the customer data you enter into Dabbr. You must:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside mt-3">
              <li>Have the right to collect and store your customers' information</li>
              <li>Not enter false or misleading information about customers</li>
              <li>Handle your customers' data responsibly and in accordance with applicable laws</li>
              <li>Inform your customers that their information is managed through Dabbr</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">5. Acceptable use</h2>
            <p className="text-sm leading-relaxed">You agree not to:</p>
            <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside mt-3">
              <li>Use Dabbr for any unlawful purpose</li>
              <li>Attempt to gain unauthorised access to any part of the Service</li>
              <li>Interfere with or disrupt the Service or its servers</li>
              <li>Use the Service to send spam or unsolicited messages</li>
              <li>Reverse engineer or copy any part of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">6. Service availability</h2>
            <p className="text-sm leading-relaxed">
              We aim to keep Dabbr available at all times but do not guarantee uninterrupted access.
              We may occasionally take the Service offline for maintenance or updates.
              We are not liable for any losses resulting from downtime or service interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">7. Payments and billing</h2>
            <p className="text-sm leading-relaxed">
              Dabbr currently offers a free trial period. Pricing and subscription details will be
              communicated clearly before any charges are made. All payments are non-refundable unless
              required by applicable law. We reserve the right to change pricing with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">8. Intellectual property</h2>
            <p className="text-sm leading-relaxed">
              The Dabbr name, logo, and software are owned by Dabbr. You may not copy, modify,
              distribute, or create derivative works without our written permission.
              Your data remains yours — we claim no ownership over the content you enter.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">9. Limitation of liability</h2>
            <p className="text-sm leading-relaxed">
              Dabbr is provided "as is" without warranties of any kind. To the fullest extent permitted
              by law, we are not liable for any indirect, incidental, or consequential damages arising
              from your use of the Service, including but not limited to loss of data, loss of revenue,
              or business interruption.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">10. Termination</h2>
            <p className="text-sm leading-relaxed">
              You may stop using Dabbr at any time. We reserve the right to suspend or terminate accounts
              that violate these terms, with or without notice. Upon termination, your data may be deleted
              after a 30-day grace period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">11. Governing law</h2>
            <p className="text-sm leading-relaxed">
              These terms are governed by the laws of India. Any disputes shall be subject to the
              exclusive jurisdiction of the courts of Maharashtra, India.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">12. Changes to these terms</h2>
            <p className="text-sm leading-relaxed">
              We may update these terms from time to time. Continued use of Dabbr after changes
              are posted constitutes acceptance of the updated terms. We will notify providers of
              significant changes via email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">13. Contact</h2>
            <p className="text-sm leading-relaxed">
              For any questions about these terms, contact us at{' '}
              <a href="mailto:rutvik.pansare@gmail.com" className="text-orange-500 hover:underline">
                rutvik.pansare@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link href="/" className="text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors">
            ← Back to Dabbr
          </Link>
        </div>
      </main>
    </div>
  )
}
