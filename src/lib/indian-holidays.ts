// ── Indian Public & Festival Holidays ─────────────────────────────────────────
// Covers 2024 – 2027. Lunar-calendar dates are best estimates.
// Marked with type so the UI can colour them differently.

export type IndianHolidayType =
  | 'national'   // Republic Day, Independence Day, Gandhi Jayanti
  | 'festival'   // Diwali, Holi, Dussehra, Ganesh Chaturthi, etc.
  | 'religious'  // Eid, Christmas, Good Friday, Guru Nanak, etc.

export interface IndianHoliday {
  date: string               // YYYY-MM-DD
  name: string
  type: IndianHolidayType
  emoji: string
}

const HOLIDAYS: IndianHoliday[] = [
  // ── 2024 ──────────────────────────────────────────────────────────────────
  { date: '2024-01-14', name: 'Makar Sankranti / Pongal',      type: 'festival',  emoji: '🪁' },
  { date: '2024-01-22', name: 'Ram Mandir Consecration',        type: 'festival',  emoji: '🛕' },
  { date: '2024-01-26', name: 'Republic Day',                   type: 'national',  emoji: '🇮🇳' },
  { date: '2024-03-08', name: 'Maha Shivaratri',                type: 'festival',  emoji: '🕉️' },
  { date: '2024-03-25', name: 'Holi',                           type: 'festival',  emoji: '🎨' },
  { date: '2024-03-29', name: 'Good Friday',                    type: 'religious', emoji: '✝️' },
  { date: '2024-04-09', name: 'Eid ul-Fitr',                   type: 'religious', emoji: '🌙' },
  { date: '2024-04-14', name: 'Ambedkar Jayanti / Baisakhi',   type: 'festival',  emoji: '🌾' },
  { date: '2024-04-17', name: 'Ram Navami',                     type: 'festival',  emoji: '🛕' },
  { date: '2024-04-21', name: 'Mahavir Jayanti',                type: 'religious', emoji: '🕉️' },
  { date: '2024-05-01', name: 'Maharashtra Day / Labour Day',   type: 'national',  emoji: '🏗️' },
  { date: '2024-05-23', name: 'Buddha Purnima',                 type: 'religious', emoji: '☸️' },
  { date: '2024-06-17', name: 'Eid ul-Adha',                   type: 'religious', emoji: '🌙' },
  { date: '2024-08-15', name: 'Independence Day',               type: 'national',  emoji: '🇮🇳' },
  { date: '2024-08-19', name: 'Raksha Bandhan',                 type: 'festival',  emoji: '🪢' },
  { date: '2024-08-26', name: 'Janmashtami',                    type: 'festival',  emoji: '🦚' },
  { date: '2024-09-07', name: 'Ganesh Chaturthi',               type: 'festival',  emoji: '🐘' },
  { date: '2024-10-02', name: 'Gandhi Jayanti',                 type: 'national',  emoji: '🇮🇳' },
  { date: '2024-10-02', name: 'Dussehra',                       type: 'festival',  emoji: '🏹' },
  { date: '2024-10-13', name: 'Navratri ends',                  type: 'festival',  emoji: '🪔' },
  { date: '2024-10-31', name: 'Diwali — Lakshmi Puja',          type: 'festival',  emoji: '🪔' },
  { date: '2024-11-01', name: 'Govardhan Puja',                 type: 'festival',  emoji: '🪔' },
  { date: '2024-11-02', name: 'Bhai Dooj',                      type: 'festival',  emoji: '🪔' },
  { date: '2024-11-15', name: 'Guru Nanak Jayanti',             type: 'religious', emoji: '🙏' },
  { date: '2024-12-25', name: 'Christmas',                      type: 'religious', emoji: '🎄' },

  // ── 2025 ──────────────────────────────────────────────────────────────────
  { date: '2025-01-14', name: 'Makar Sankranti / Pongal',      type: 'festival',  emoji: '🪁' },
  { date: '2025-01-26', name: 'Republic Day',                   type: 'national',  emoji: '🇮🇳' },
  { date: '2025-02-26', name: 'Maha Shivaratri',                type: 'festival',  emoji: '🕉️' },
  { date: '2025-03-14', name: 'Holi',                           type: 'festival',  emoji: '🎨' },
  { date: '2025-03-31', name: 'Eid ul-Fitr',                   type: 'religious', emoji: '🌙' },
  { date: '2025-04-06', name: 'Ram Navami',                     type: 'festival',  emoji: '🛕' },
  { date: '2025-04-10', name: 'Mahavir Jayanti',                type: 'religious', emoji: '🕉️' },
  { date: '2025-04-14', name: 'Ambedkar Jayanti / Baisakhi',   type: 'festival',  emoji: '🌾' },
  { date: '2025-04-18', name: 'Good Friday',                    type: 'religious', emoji: '✝️' },
  { date: '2025-05-01', name: 'Maharashtra Day / Labour Day',   type: 'national',  emoji: '🏗️' },
  { date: '2025-05-12', name: 'Buddha Purnima',                 type: 'religious', emoji: '☸️' },
  { date: '2025-06-07', name: 'Eid ul-Adha',                   type: 'religious', emoji: '🌙' },
  { date: '2025-08-09', name: 'Raksha Bandhan',                 type: 'festival',  emoji: '🪢' },
  { date: '2025-08-15', name: 'Independence Day',               type: 'national',  emoji: '🇮🇳' },
  { date: '2025-08-16', name: 'Janmashtami',                    type: 'festival',  emoji: '🦚' },
  { date: '2025-08-27', name: 'Ganesh Chaturthi',               type: 'festival',  emoji: '🐘' },
  { date: '2025-10-02', name: 'Gandhi Jayanti / Dussehra',      type: 'national',  emoji: '🇮🇳' },
  { date: '2025-10-20', name: 'Diwali — Lakshmi Puja',          type: 'festival',  emoji: '🪔' },
  { date: '2025-10-21', name: 'Govardhan Puja',                 type: 'festival',  emoji: '🪔' },
  { date: '2025-10-22', name: 'Bhai Dooj',                      type: 'festival',  emoji: '🪔' },
  { date: '2025-11-05', name: 'Guru Nanak Jayanti',             type: 'religious', emoji: '🙏' },
  { date: '2025-12-25', name: 'Christmas',                      type: 'religious', emoji: '🎄' },

  // ── 2026 ──────────────────────────────────────────────────────────────────
  { date: '2026-01-14', name: 'Makar Sankranti / Pongal',      type: 'festival',  emoji: '🪁' },
  { date: '2026-01-26', name: 'Republic Day',                   type: 'national',  emoji: '🇮🇳' },
  { date: '2026-02-15', name: 'Maha Shivaratri',                type: 'festival',  emoji: '🕉️' },
  { date: '2026-03-03', name: 'Holi',                           type: 'festival',  emoji: '🎨' },
  { date: '2026-03-20', name: 'Eid ul-Fitr',                   type: 'religious', emoji: '🌙' },
  { date: '2026-03-29', name: 'Ram Navami',                     type: 'festival',  emoji: '🛕' },
  { date: '2026-04-02', name: 'Mahavir Jayanti',                type: 'religious', emoji: '🕉️' },
  { date: '2026-04-03', name: 'Good Friday',                    type: 'religious', emoji: '✝️' },
  { date: '2026-04-14', name: 'Ambedkar Jayanti / Baisakhi',   type: 'festival',  emoji: '🌾' },
  { date: '2026-05-01', name: 'Maharashtra Day / Labour Day',   type: 'national',  emoji: '🏗️' },
  { date: '2026-05-27', name: 'Eid ul-Adha',                   type: 'religious', emoji: '🌙' },
  { date: '2026-08-02', name: 'Raksha Bandhan',                 type: 'festival',  emoji: '🪢' },
  { date: '2026-08-14', name: 'Janmashtami',                    type: 'festival',  emoji: '🦚' },
  { date: '2026-08-15', name: 'Independence Day',               type: 'national',  emoji: '🇮🇳' },
  { date: '2026-09-16', name: 'Ganesh Chaturthi',               type: 'festival',  emoji: '🐘' },
  { date: '2026-10-02', name: 'Gandhi Jayanti',                 type: 'national',  emoji: '🇮🇳' },
  { date: '2026-10-19', name: 'Dussehra',                       type: 'festival',  emoji: '🏹' },
  { date: '2026-11-08', name: 'Diwali — Lakshmi Puja',          type: 'festival',  emoji: '🪔' },
  { date: '2026-11-09', name: 'Govardhan Puja',                 type: 'festival',  emoji: '🪔' },
  { date: '2026-11-10', name: 'Bhai Dooj',                      type: 'festival',  emoji: '🪔' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti',             type: 'religious', emoji: '🙏' },
  { date: '2026-12-25', name: 'Christmas',                      type: 'religious', emoji: '🎄' },

  // ── 2027 ──────────────────────────────────────────────────────────────────
  { date: '2027-01-14', name: 'Makar Sankranti / Pongal',      type: 'festival',  emoji: '🪁' },
  { date: '2027-01-26', name: 'Republic Day',                   type: 'national',  emoji: '🇮🇳' },
  { date: '2027-02-20', name: 'Holi',                           type: 'festival',  emoji: '🎨' },
  { date: '2027-03-10', name: 'Eid ul-Fitr',                   type: 'religious', emoji: '🌙' },
  { date: '2027-03-26', name: 'Good Friday',                    type: 'religious', emoji: '✝️' },
  { date: '2027-04-14', name: 'Ambedkar Jayanti / Baisakhi',   type: 'festival',  emoji: '🌾' },
  { date: '2027-05-01', name: 'Maharashtra Day / Labour Day',   type: 'national',  emoji: '🏗️' },
  { date: '2027-05-17', name: 'Eid ul-Adha',                   type: 'religious', emoji: '🌙' },
  { date: '2027-08-15', name: 'Independence Day',               type: 'national',  emoji: '🇮🇳' },
  { date: '2027-10-02', name: 'Gandhi Jayanti',                 type: 'national',  emoji: '🇮🇳' },
  { date: '2027-10-06', name: 'Dussehra',                       type: 'festival',  emoji: '🏹' },
  { date: '2027-10-29', name: 'Diwali — Lakshmi Puja',          type: 'festival',  emoji: '🪔' },
  { date: '2027-12-25', name: 'Christmas',                      type: 'religious', emoji: '🎄' },
]

// Build a lookup: date → list of holidays (multiple can fall on same date)
const _byDate = new Map<string, IndianHoliday[]>()
for (const h of HOLIDAYS) {
  const list = _byDate.get(h.date) ?? []
  list.push(h)
  _byDate.set(h.date, list)
}

/** Returns Indian holidays for a given YYYY-MM-DD date string (may be empty). */
export function getIndianHolidays(date: string): IndianHoliday[] {
  return _byDate.get(date) ?? []
}

/** Returns all Indian holidays in a given YYYY-MM month prefix. */
export function getIndianHolidaysInMonth(yearMonth: string): IndianHoliday[] {
  return HOLIDAYS.filter(h => h.date.startsWith(yearMonth))
}
