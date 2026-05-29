'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronDown, Play, HelpCircle } from 'lucide-react'
import BottomNav from '@/components/BottomNav'

// ── Types ──────────────────────────────────────────────────────────────────

interface FAQItem {
  question: string
  answer: string
  videoUrl?: string
}

interface FAQCategory {
  emoji: string
  title: string
  items: FAQItem[]
}

// ── FAQ Data ───────────────────────────────────────────────────────────────

const FAQ_DATA: FAQCategory[] = [
  {
    emoji: '🚀',
    title: 'Getting Started',
    items: [
      {
        question: 'How do I set up my tiffin business on Dabbr?',
        answer:
          'After signing in, go to Settings and fill in your Business Name and UPI ID — these appear on payment receipts. Next, create at least one Meal Plan (e.g. "Veg Lunch — ₹2500/month"). Once a plan exists, you can start adding customers. The app guides you through each step during onboarding.',
      },
      {
        question: 'How do I create a meal plan?',
        answer:
          'Go to Settings → Meal Plans → tap the + button. Choose the meal slots (Breakfast, Lunch, Dinner), plan type (Veg / Non-Veg), and set the monthly price. You can have multiple plans — for example a "Lunch only" plan and a "Full Day" plan at different prices.',
      },
      {
        question: 'How do I add my first customer?',
        answer:
          'Go to the Customers tab and tap the + button. Fill in the customer\'s name, WhatsApp number, address, and assign a meal plan. You can also choose their billing type — Prepaid or Monthly Settlement. On Android, you can import customers directly from your phone contacts.',
      },
    ],
  },
  {
    emoji: '💳',
    title: 'Billing & Payments',
    items: [
      {
        question: 'What is the difference between Prepaid and Monthly Settlement?',
        answer:
          'Both work through the same balance system — the difference is just when your customer pays.\n\nPrepaid: The customer pays in advance. Their balance starts positive and counts down each day as meals are delivered. Set the Overdue Limit to ₹0 so they must always keep their balance topped up.\n\nMonthly settlement: The customer pays at the end of the month. Set their Overdue Limit to a negative value (e.g. −₹3000) so the app allows up to one month\'s worth of deliveries before flagging them as overdue. You record payment when they settle.',
      },
      {
        question: 'How does the balance work?',
        answer:
          'Every customer has a rupee balance. When you record a payment, the amount is added to their balance. Each day a meal is delivered, the daily cost (monthly price ÷ 30) is deducted automatically.\n\nFor example: plan is ₹3000/month → daily cost ₹100. Customer pays ₹1500 → balance becomes ₹1500 → 15 days of credit.\n\nYou can see the current balance and days remaining on every customer card.',
      },
      {
        question: 'How do I record a payment?',
        answer:
          'Go to the Payments tab or tap a customer card and select "Record Payment". Enter the amount — quick-amount chips are shown for common values including their plan price. You\'ll see a live preview of the updated balance and days remaining before you confirm. A WhatsApp receipt can be sent immediately after.',
      },
      {
        question: 'What does "Overdue" mean?',
        answer:
          'A customer is Overdue when their balance has dropped to or below their Overdue Limit. By default the limit is ₹0, so any negative balance triggers overdue status. Their card turns red and they appear in the overdue count on the Summary page.\n\nYou can adjust a customer\'s Overdue Limit to give them a grace buffer — for example set it to −₹1500 if you\'re comfortable letting them owe up to half a month before acting.',
      },
      {
        question: 'What does "Due Soon" mean?',
        answer:
          'Due Soon means the customer\'s balance is still above their Overdue Limit, but they have 5 days or fewer of deliveries remaining before it runs out. Their card shows an amber warning. This is a good time to send a payment reminder — use the WhatsApp reminder button on their card.',
      },
      {
        question: 'What is the UPI ID for?',
        answer:
          'Your UPI ID is included in the WhatsApp payment receipt sent to customers after you record a payment. It makes it easy for customers to pay you directly via any UPI app. Set it in Settings → Branding.',
      },
    ],
  },
  {
    emoji: '🚴',
    title: 'Daily Delivery',
    items: [
      {
        question: 'How do I mark a delivery as done?',
        answer:
          'On the Home screen, your active customers are listed. You can mark deliveries at any time — no need to start a Run.\n\nSwipe a customer card to the right to mark as Delivered, or swipe left to mark as Skipped. You can also tap a card to see the same options as buttons.\n\nStart Run is completely optional — marking deliveries works the same way whether a Run is active or not.',
      },
      {
        question: 'What is the "Start Run" feature?',
        answer:
          'Start Run is used to assign today\'s deliveries to a rider. When you tap "Start Run" and assign it to a rider (or an area), the rider sees those customers in their own view and can mark them from their device.\n\nAs a provider, you can always mark any delivery yourself directly from the Home screen — a Run does not need to be active. Start Run is purely for delegating deliveries to your team.',
      },
      {
        question: 'How do I pause a customer\'s delivery?',
        answer:
          'Open the customer\'s detail page and tap "Pause Delivery". Set a start and end date (e.g. they\'re going on vacation). During the pause period, the customer won\'t appear in your delivery list and their balance won\'t be charged.',
      },
      {
        question: 'How do I mark a holiday or off day?',
        answer:
          'Go to Settings → Off Days. Tap a date to mark it as a holiday. On that day, no deliveries are expected and customers\' prepaid balances won\'t be charged.',
      },
    ],
  },
  {
    emoji: '👨‍🍳',
    title: 'Riders & Team',
    items: [
      {
        question: 'What is the rider feature?',
        answer:
          'If you have delivery staff, you can add them as Riders in Settings. On delivery days, you can assign all deliveries (or a specific area) to a rider. The rider gets a dedicated view where they can mark deliveries from their own device — no separate app needed.',
      },
      {
        question: 'How does a rider mark deliveries?',
        answer:
          'After you assign a run to a rider, they log into the Dabbr rider view using their email. They see only their assigned customers for the day and can mark each one as Delivered or Skipped. Updates sync to your dashboard in real time.',
      },
      {
        question: 'Can I assign deliveries by area?',
        answer:
          'Yes. If your customers have areas set (e.g. "Kothrud", "Baner"), you can assign a specific area to a rider from the Home screen. Other areas remain with you.',
      },
    ],
  },
  {
    emoji: '🍱',
    title: 'Menu Planning',
    items: [
      {
        question: 'How do I plan my weekly menu?',
        answer:
          'Go to the Menu tab. Select a day and a meal slot (Breakfast, Lunch, Dinner). Type in the dish name and tap Save. You can set different menus for Veg and Non-Veg customers, or one common menu for all.',
      },
      {
        question: 'What are Quick Tags?',
        answer:
          'Quick Tags are pre-saved dish names that appear as tappable chips when you\'re filling in the menu. Tap a chip to insert the dish name instantly. The chip colour shows how recently that dish was served — so you can avoid repeating dishes. Customise your tags in Settings → Menu Quick Tags.',
      },
      {
        question: 'Can I copy menus from a previous week?',
        answer:
          'Yes. On the Menu screen, use the "Copy Week" button to copy the previous week\'s menu onto the current week. You can also copy individual days or pick any historical week as a template using "Paste Week".',
      },
    ],
  },
  {
    emoji: '🌐',
    title: 'Customer Portal',
    items: [
      {
        question: 'What is the Customer Portal?',
        answer:
          'Each provider gets a unique link (e.g. dabbr.in/your-name). When customers visit this link, they can see today\'s menu, their current balance, and recent delivery history. It\'s a read-only view — customers can\'t make changes.',
      },
      {
        question: 'How do I share the portal with my customers?',
        answer:
          'Go to Settings → Customer Portal. You\'ll see your unique link and a "Copy Link" button. Share it with customers via WhatsApp. They can bookmark it on their phone for quick access.',
      },
      {
        question: 'Can customers log in to see their personal balance?',
        answer:
          'Yes. Customers can log into the portal using their registered phone number. Once logged in, they see their personal balance, their meal plan details, and a 30-day delivery history.',
      },
    ],
  },
  {
    emoji: '⚙️',
    title: 'Account & Subscription',
    items: [
      {
        question: 'What happens when my free trial ends?',
        answer:
          'After the trial period, you\'ll need to subscribe to a paid plan to continue using the app. Your data is safe and won\'t be deleted. You can upgrade anytime from Settings → Upgrade Plan.',
      },
      {
        question: 'How do I upgrade my plan?',
        answer:
          'Go to Settings and tap "Upgrade Plan", or tap the Upgrade button in the left sidebar on desktop. You\'ll see the available plans and can pay via Razorpay. Upgrades take effect immediately.',
      },
    ],
  },
]

// ── Video placeholder ──────────────────────────────────────────────────────

function VideoEmbed({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)

  const videoId = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/
  )?.[1]

  if (!videoId) return null

  if (playing) {
    return (
      <div className="mt-3 rounded-2xl overflow-hidden aspect-video bg-black">
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="Help video"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="mt-3 relative w-full rounded-2xl overflow-hidden aspect-video bg-gray-900 group"
      aria-label="Play video"
    >
      <img
        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
        alt="Video thumbnail"
        className="w-full h-full object-cover opacity-80 group-hover:opacity-70 transition-opacity"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg group-hover:scale-105 transition-transform">
          <Play className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" />
        </div>
      </div>
      <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2 py-1">
        <span className="text-[11px] font-bold text-white">Watch video</span>
      </div>
    </button>
  )
}

// ── Accordion item ─────────────────────────────────────────────────────────

function FAQRow({ item, defaultOpen = false }: { item: FAQItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 py-4 text-left"
      >
        <span className="text-[14.5px] font-semibold text-gray-900 leading-snug flex-1">
          {item.question}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="pb-4">
          <p className="text-[13.5px] text-gray-600 leading-relaxed whitespace-pre-line">
            {item.answer}
          </p>
          {item.videoUrl && <VideoEmbed url={item.videoUrl} />}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function HelpClient() {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? FAQ_DATA.map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.question.toLowerCase().includes(search.toLowerCase()) ||
            item.answer.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : FAQ_DATA

  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm border-b border-orange-100/40">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-orange-500" />
            <h1 className="text-base font-black text-gray-900">FAQs & Help</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl lg:max-w-3xl px-4 lg:px-8 pt-20 space-y-4">

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search questions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 pl-10 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 placeholder:text-gray-400"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* No results */}
        {filtered.length === 0 && (
          <div className="rounded-2xl bg-white border border-gray-100 px-5 py-8 text-center">
            <p className="text-sm font-bold text-gray-500">No results for "{search}"</p>
            <p className="text-xs text-gray-400 mt-1">Try different keywords</p>
          </div>
        )}

        {/* FAQ categories */}
        {filtered.map(cat => (
          <div key={cat.title} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="text-lg leading-none">{cat.emoji}</span>
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-500">{cat.title}</h2>
            </div>
            <div className="px-5">
              {cat.items.map((item, i) => (
                <FAQRow key={i} item={item} defaultOpen={search.trim().length > 0} />
              ))}
            </div>
          </div>
        ))}

        {/* Help footer */}
        <div className="rounded-2xl bg-orange-50 border border-orange-100 px-5 py-4 flex items-start gap-3">
          <span className="text-xl leading-none shrink-0">💬</span>
          <div>
            <p className="text-sm font-bold text-orange-800">Still stuck?</p>
            <p className="text-xs text-orange-700 mt-0.5">
              Email us at{' '}
              <a
                href="mailto:rutvik.pansare@gmail.com"
                className="underline font-semibold"
              >
                rutvik.pansare@gmail.com
              </a>{' '}
              and we'll help you out.
            </p>
          </div>
        </div>

      </main>

      <BottomNav />
    </div>
  )
}
