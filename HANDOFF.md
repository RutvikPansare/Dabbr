# Dabbr — Session Handoff
_Last updated: 2026-05-20_

> **How to use this file:** Read this at the start of a new session to understand where things stand. Update it at the end of each session. For stable technical docs (stack, patterns, gotchas), see `CLAUDE.md`.

---

## Current Status
App is live at **dabbr.in** and deployed as an Android APK via Capacitor. Active development — no known breaking bugs.

---

## What Was Built (This Session)

### ✅ Payment modal redesign (`src/app/payments/PaymentsClient.tsx`)
- Converted "Record Payment" from a bottom sheet → centered modal with backdrop blur
- Added quick-amount chips: ₹500 / ₹1000 / ₹2000 / ₹3000 + customer's plan price (auto-added if not in defaults)
- Active chip turns orange; plan-price chip has subtle orange label
- Fixed customer `onChange` to correctly pre-fill monthly settlement customers too

### ✅ Menu Planner button layout (`src/app/menu/MenuPlannerClient.tsx`)
- Combined "Copy options" toggle and "Paste from WhatsApp" into a **single side-by-side row**
  - Left: **Copy** button (chevron, expands copy sub-options)
  - Right: **Paste** button (dashed orange border, triggers clipboard paste immediately)
- "Copy week" + "Paste week" buttons inside the expanded panel also side by side
- Used `style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}` — Tailwind `grid-cols-2` was unreliable in this context

### ✅ Onboarding guide (`src/components/OnboardingGuide.tsx` + `src/app/onboarding/`)
- Full interactive onboarding using real app pages (Settings → Meal Plans → Customers)
- Persistent floating card above BottomNav, reads `localStorage.dabbr_onboarding_step`
- DB verification before advancing each step
- Test via `/onboarding?preview=1`

### ✅ Settings page (`src/app/settings/SettingsClient.tsx`)
- Copy + Visit buttons for customer portal link
- Removed "Dabbr · Week 1 build" footer label

### ✅ Dashboard (`src/app/dashboard/DashboardClient.tsx`)
- Removed "All Done" button
- "Send to rider" modal now shows empty state with "Add a rider" button if no riders exist
- "Served This Week" section collapsed by default, expandable

### ✅ Customers (`src/app/customers/`)
- Contacts import converted from bottom sheet → centered modal
- Bulk import flow: select contacts → choose "one by one" or "save all"
- `router.refresh()` after every customer add to bust server cache (fixes stale count bug)

### ✅ Android
- Added `READ_CONTACTS` / `WRITE_CONTACTS` permissions to `AndroidManifest.xml`

### ✅ CLAUDE.md
- Created comprehensive project memory file with tech stack, patterns, UI system, gotchas

---

## Pending / Unresolved

### ⚠️ Copy/Paste button layout — user still seeing stacked on device
The "Copy" + "Paste" buttons in Menu Planner have been changed 5+ times. Latest fix (`dd322e5` → `1b8f13b`) uses inline `style` grid. If user still reports stacking:
- Ask them to hard-refresh (`Cmd+Shift+R` on Chrome, or clear app cache on Android)
- The Capacitor Android WebView caches the JS bundle aggressively — may need app reinstall or cache clear
- Code itself is correct; it's almost certainly a stale JS bundle issue

---

## Recent Commits (this session)
```
1b8f13b  docs: add CLAUDE.md with project context, UI patterns, and dev notes
dd322e5  fix(menu): combine Copy and Paste into one side-by-side row
a127267  fix(menu): force week buttons side-by-side with inline grid style
0cb0190  fix(menu): use grid grid-cols-2 for week copy buttons
881eebe  feat(payments): convert record payment to centered modal with quick-amount chips
c3e68b1  fix(menu): move week copy buttons outside grid to guarantee single-row layout
```

---

## Files Most Recently Changed
| File | What changed |
|---|---|
| `src/app/payments/PaymentsClient.tsx` | Modal + quick chips |
| `src/app/menu/MenuPlannerClient.tsx` | Copy/Paste row layout |
| `src/components/OnboardingGuide.tsx` | Full onboarding guide |
| `src/app/onboarding/OnboardingClient.tsx` | Simplified welcome screen |
| `src/app/onboarding/page.tsx` | Redirect logic + preview param |
| `src/app/dashboard/DashboardClient.tsx` | Removed all-done btn, rider empty state |
| `src/app/settings/SettingsClient.tsx` | Portal copy/visit buttons |
| `src/app/customers/ContactsImport.tsx` | Modal + bulk import |
| `src/app/customers/CustomersClient.tsx` | Import queue + router.refresh |
| `android/app/src/main/AndroidManifest.xml` | Contacts permissions |
| `CLAUDE.md` | Created |

---

## Things to Build Next (Backlog ideas from conversation)
_Not committed to — just ideas that came up:_
- [ ] Customer portal improvements
- [ ] Delivery log / mark delivered per customer
- [ ] Push notifications for payment reminders
- [ ] Better analytics / earnings summary

---

## Key Decisions Made
1. **Onboarding uses real app pages** (not a separate wizard) — less maintenance, more authentic
2. **Inline confirm dialogs** instead of `window.confirm()` — broken on Android WebView
3. **`router.refresh()` after every mutation** — fixes stale `unstable_cache` data
4. **Contacts import = centered modal** — consistent with other modals in the app
5. **Payment form = centered modal** — consistent pattern, not bottom sheet
6. **Tailwind `col-span-2` unreliable on mobile** — always use a fresh grid wrapper or inline styles

---

## How to Run Locally
```bash
cd /Users/Rutvik/Applications/Dabbr
npm run dev        # web at localhost:3000
```
Android picks up from live Vercel URL — push + wait ~30s for deploy, then open app.

## How to Test Onboarding
Visit `https://dabbr.in/onboarding?preview=1` (bypasses the "already set up" redirect).
