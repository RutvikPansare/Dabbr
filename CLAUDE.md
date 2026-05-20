# Dabbr — Claude Project Memory

## What is Dabbr?
A tiffin (home-cooked meal delivery) management app for Indian food providers. Providers manage customers, daily menus, payments, and delivery schedules. Customers get a portal to view their menu and balance. The app runs as both a **web app** (dabbr.in) and an **Android app** (via Capacitor WebView pointing to the live Vercel deployment).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Styling | Tailwind CSS + Outfit font (Google) |
| Icons | lucide-react (always use this, never heroicons etc.) |
| Database | Supabase (Postgres + Auth) |
| Deployment | Vercel |
| Native Android | Capacitor 8 — WebView loads `https://dabbr.in/login` |
| PWA | next-pwa |
| Auth | Supabase Auth (Google SSO + OTP) |

---

## Project Structure

```
src/
  app/
    layout.tsx              ← Root layout; includes OnboardingGuide + BottomNav
    dashboard/              ← Home screen (deliveries, summary)
    customers/              ← Customer list + add/edit + contacts import
    menu/                   ← Menu Planner (weekly, per-slot)
    payments/               ← Payment Center (prepaid + monthly settlement)
    settings/               ← Branding, meal plans, riders, quick tags, portal
    meal-plans/             ← Meal plan CRUD
    onboarding/             ← First-run onboarding welcome screen
    [slug]/                 ← Customer-facing portal (public)
    auth/                   ← Auth callback
    login/                  ← Login page
  components/
    BottomNav.tsx           ← Fixed bottom nav (5 tabs)
    OnboardingGuide.tsx     ← Persistent floating onboarding card (root layout)
    Paywall.tsx
    BackButton.tsx
    GoogleSignInButton.tsx
  lib/
    queries.ts              ← All server-side cached data fetching (unstable_cache)
    revalidate.ts           ← Cache tag invalidation helpers
    udhar.ts                ← Monthly billing / outstanding calc
    meals.ts                ← Meal slot helpers (breakfast/lunch/dinner)
    menu-quick-tags.ts      ← Quick tag types + defaults
    holidays.ts             ← Off-day / holiday detection
    branding.ts
    supabase/               ← client.ts, server.ts, admin.ts
```

---

## Supabase Cache Pattern

**Always use `unstable_cache` for server-side fetches.** Cache tags follow this pattern:

```ts
providerTag(uid)    → `provider-data-${uid}`   // broad, clears everything
customersTag(uid)   → `customers-${uid}`
mealPlansTag(uid)   → `meal-plans-${uid}`
paymentsTag(uid)    → `payments-${uid}`
dashboardTag(uid)   → `dashboard-${uid}`
settingsTag(uid)    → `settings-${uid}`
```

**After any mutation (insert/update/delete):** call `router.refresh()` on the client to bust the Next.js server cache so navigation back shows fresh data. This is critical — stale cache was a bug that caused customer counts to show wrong after adding a customer.

**Server components** use `createAdminClient()` for cached queries (no cookies needed).  
**Client components** use `createClient()` from `@/lib/supabase/client`.

---

## Key Data Models

### Customer
- `billing_type`: `'prepaid'` | `'monthly_settlement'`
- **Prepaid**: tracked via `balance_days` — payments add days based on monthly price
- **Monthly settlement**: tracked via `meals_delivered` + payments in `monthly_payments` table; outstanding computed by `computeMonthlyDue()` in `lib/udhar.ts`
- Has subscriptions → meal_plans

### Meal Plans
- `meal_slots`: array of `'breakfast' | 'lunch' | 'dinner'`
- `plan_type`: `'veg' | 'nonveg'`
- `frequency`: `'daily'`
- `monthly_price`: base price for prepaid balance calculation

### Daily Menus
- Per `menu_date` + `meal_slot` + `plan_type` (null = common, 'veg', 'nonveg')
- Saved per slot — user edits then taps "Save Breakfast/Lunch/Dinner"

### Payments
- `payments` table: prepaid payments (adds balance_days)
- `monthly_payments` table: monthly settlement payments

---

## UI / Design System

### Colour Palette
- Primary orange: `#F4622A` / `bg-orange-500` / `text-orange-600`
- Warm background: `#FDF8F3`
- Borders: `border-orange-100`, `border-gray-100`
- Success: green-500/50
- Error: red-500/50

### Component Patterns
- **Cards**: `rounded-[2rem]` or `rounded-3xl` with `border border-gray-100 bg-white shadow-sm`
- **Buttons (primary)**: `rounded-2xl bg-orange-500 text-white font-black`
- **Buttons (secondary)**: `rounded-2xl border border-gray-200 bg-white text-gray-700 font-bold`
- **Modals**: centered with backdrop blur — `fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm` — inner div `w-full max-w-md rounded-3xl bg-white shadow-2xl`
- **Bottom sheets** (reminders, bulk actions): `fixed inset-0 flex flex-col justify-end` with `rounded-t-3xl`
- **FAB**: `fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] right-5 z-40 rounded-[1.5rem]`
- **Form inputs**: `rounded-2xl border border-gray-200 px-4 py-3 focus:border-[#F4622A] focus:ring-2 focus:ring-orange-100`

### Typography
- Headings: `font-black` (Outfit 900)
- Sub-labels: `text-xs font-semibold uppercase tracking-wide text-gray-500`
- Body: `font-semibold` or `font-bold`
- Smallest labels: `text-[10px]` or `text-[11px]`

### Layout
- `pb-[calc(7rem+env(safe-area-inset-bottom))]` on main content — accounts for BottomNav + safe area
- BottomNav is `fixed` at bottom, always present
- OnboardingGuide floats above BottomNav: `bottom: calc(4.75rem + env(safe-area-inset-bottom))`
- Max content width: `max-w-2xl mx-auto px-4`
- Sticky headers: `fixed inset-x-0 top-0 z-40` with `border-b border-orange-100/50 shadow-[0_4px_30px_rgba(244,98,42,0.05)]`

### Spacing preferences (learned)
- Prefer tighter padding on small UI elements — user consistently asked to reduce padding
- `py-1.5` not `py-3` on week selector bars
- Prefer `rounded-2xl` for most things, `rounded-3xl` for large cards/modals
- Remove decorative border lines that don't add information

---

## Android / Capacitor Notes

- **WebView points to live Vercel URL** (`https://dabbr.in/login`) — there is NO local build served on Android. Changes only appear after `git push` + Vercel deploy.
- `window.confirm()` does NOT work reliably in Capacitor Android WebView — always use inline UI confirmation instead.
- Contacts plugin: `@capacitor-community/contacts` — access via `window.Capacitor.Plugins.Contacts` directly (bridge is always injected, no dynamic import needed)
- Required AndroidManifest permissions for contacts: `READ_CONTACTS` + `WRITE_CONTACTS` (already added)
- App ID: `in.dabbr.app`
- Google Auth clientId: `482381661790-e3fgcl44fph6cdidrsq1lq412sf98tt5.apps.googleusercontent.com`
- Status bar: dark style, `#F4622A` background
- Build type: APK (not AAB) for sideloading

---

## Onboarding Flow

1. New user → redirected to `/onboarding` if no meal plans exist (checked in `dashboard/page.tsx`)
2. `/onboarding` welcome screen → tapping "Let's go" sets `localStorage.dabbr_onboarding_step = '1'` and pushes to `/settings`
3. `OnboardingGuide` component (in root layout) reads localStorage and shows floating guide card:
   - Step 1: `/settings` — fill Business Name + UPI ID → verify against `providers` table
   - Step 2: `/meal-plans` — create meal plan → verify against `meal_plans` table
   - Step 3: `/customers` — add first customer → verify against `customers` table
4. Each step verified against DB before advancing ("I've done it →" button)
5. Completion/skip sets `dabbr_onboarding_step = 'done'` → guide disappears
6. Test onboarding by visiting `/onboarding?preview=1`

**Key implementation detail**: `lastAutoNavStep` ref prevents re-triggering auto-navigation. `pendingNav` ref stores target URL to avoid stale closures when navigating after the 900ms celebration animation.

---

## Payment System

### Prepaid
- `balance_days` tracks remaining days
- Payment amount → days added = `(amount * 30) / monthly_price`
- WhatsApp receipt sent after recording

### Monthly Settlement
- `meals_delivered` counter + `monthly_payments` for payments made
- `computeMonthlyDue()` in `lib/udhar.ts` calculates outstanding
- States: `'ok'` | `'due_soon'` | `'critical'`
- `DUE_COLORS`, `dueStateLabel`, `fmtRupees` from `lib/udhar.ts`

### Record Payment Modal
- Centered modal (not bottom sheet)
- Quick-amount chips: ₹500, ₹1000, ₹2000, ₹3000 + customer's plan price (auto-added if different)
- Active chip highlights orange; plan-price chip has subtle orange border
- Shows balance preview (days added for prepaid, remaining outstanding for monthly)

---

## Menu Planner

- Weekly view with per-day selection
- Per meal slot (breakfast/lunch/dinner), per plan type (common/veg/non-veg)
- "Save [Slot]" saves only that slot for the selected day
- Quick tags: chip-style dish suggestions, colour-coded by how recently served
- Copy options (collapsed by default): Copy yesterday's / Copy last week / Choose day / Copy menu text
- Week-level: "Copy week" (copies previous week) + "Paste week" (pick a historical week pattern) — side by side in one row
- "Served This Week" section: collapsed by default, expand to see dishes served
- Paste from clipboard: parses WhatsApp-style text into draft fields

### Tailwind grid pitfall (IMPORTANT)
`col-span-2` inside a `grid grid-cols-2` parent does NOT reliably force buttons side-by-side on mobile/WebView. **Always use a separate `grid grid-cols-2` or `style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}` wrapper** for each independent row of buttons.

---

## Customer Features

### Contacts Import
- Modal (not bottom sheet): `fixed inset-0 flex items-center justify-center p-4`
- Multi-select with "Select all" checkbox
- After selecting: choose "one by one" (pre-fills form one at a time) or "save all" (bulk insert)
- Bulk import calls `router.refresh()` after save

### Customer Form
- `contactImportQueue` state: array of `{name, phone}` to process one by one
- After each successful add: checks queue → advances to next OR returns to list

---

## Settings Page Sections
1. **Branding** — business name, UPI ID (used in WhatsApp receipts), logo
2. **Customer Portal** — slug for public portal link; Copy + Visit buttons
3. **Meal Plans** — list/add plans with slots, price, veg/nonveg
4. **Menu Quick Tags** — configurable chip suggestions per slot/type
5. **Riders** — delivery rider list for "Send to rider" feature on dashboard
6. **Off Days / Holidays** — mark days with no delivery

---

## Common Gotchas

1. **Stale cache after mutations**: Always call `router.refresh()` after any Supabase insert/update/delete on the client side.
2. **`window.confirm()` broken on Android**: Use inline confirm UI (e.g., two buttons: "Keep going" / "Yes, exit").
3. **Tailwind `flex-1` in grid sometimes ignored**: Use explicit `style` or a fresh `grid grid-cols-N` div rather than `col-span`.
4. **Capacitor serves live URL**: No local build — all code changes need to be pushed and Vercel-deployed before Android picks them up. Hard refresh in browser or reinstall app to clear JS bundle cache.
5. **`useEffect` stale closures**: Use `useRef` for values that need to survive across renders (e.g., `pendingNav.current`, `lastAutoNavStep.current`).
6. **`unstable_cache` + `revalidateTag`**: Server cache has ~60s TTL. `router.refresh()` on client triggers revalidation.

---

## Git / Deployment

- Repo: `github.com/RutvikPansare/Dabbr`
- Branch: `main` → auto-deploys to Vercel → live at `dabbr.in`
- After every push, wait ~30s for Vercel to deploy, then hard-refresh (`Cmd+Shift+R`) in browser
- Android picks up changes automatically on next app open (it loads the live URL)
- Commit format: `type(scope): description` (e.g., `feat(payments): add quick-amount chips`)

---

## Owner
Rutvik — software developer building Dabbr to serve the tiffin provider community. Prefers tight, minimal UI with strong typography. Wants things to "just work" on both web and Android without extra steps.
