/**
 * Cutoff time utilities for customer portal.
 *
 * Providers set a daily cutoff (e.g. 9 PM IST). Changes requested
 * BEFORE the cutoff affect the NEXT delivery. Changes requested
 * AFTER the cutoff skip the next delivery (already planned) and
 * take effect from the one after.
 *
 * This gives providers operational predictability for:
 *   grocery purchasing, cooking prep, packing, delivery planning.
 */

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** Returns today's date string in the given IANA timezone, e.g. 'Asia/Kolkata' */
function todayInTz(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
}

/** Returns current hour (0-23) in the given IANA timezone */
function currentHourInTz(tz: string): number {
  const str = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false })
  const h = parseInt(str, 10)
  return isNaN(h) ? new Date().getUTCHours() : h
}

/**
 * Given provider cutoff settings and the current moment, returns the
 * effective start date for a customer-requested pause or resume.
 *
 * Before cutoff → effective tomorrow (next delivery)
 * After cutoff  → effective day-after-tomorrow (provider has already planned tomorrow)
 */
export function getEffectiveChangeDate(
  cutoffHour: number,
  cutoffTz: string,
): string {
  const hour = currentHourInTz(cutoffTz)
  const today = todayInTz(cutoffTz)
  return hour < cutoffHour
    ? addDays(today, 1)  // before cutoff → tomorrow
    : addDays(today, 2)  // after cutoff  → day after tomorrow
}

/**
 * Human-readable description of when a change will take effect.
 * e.g. "Changes before 9 PM apply from tomorrow's delivery."
 */
export function cutoffMessage(cutoffHour: number, cutoffTz: string): string {
  const hour = currentHourInTz(cutoffTz)
  const ampm = cutoffHour >= 12
    ? `${cutoffHour === 12 ? 12 : cutoffHour - 12} PM`
    : `${cutoffHour === 0 ? 12 : cutoffHour} AM`
  const tzAbbr = cutoffTz === 'Asia/Kolkata' ? 'IST' : cutoffTz
  if (hour < cutoffHour) {
    return `Changes before ${ampm} ${tzAbbr} apply from tomorrow's delivery.`
  }
  return `Changes after ${ampm} ${tzAbbr} apply from the delivery after tomorrow.`
}

/**
 * Formats an ISO date string for friendly display.
 * e.g. "Thursday, 15 May"
 */
export function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Short date label, e.g. "15 May" */
export function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

/** Day label for week strip, e.g. "MON" */
export function formatDayLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()
}

/** Day number, e.g. "15" */
export function formatDayNumber(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric' })
}

/** Generate array of date strings: today + next N days */
export function getWeekDates(n = 7): string[] {
  const today = new Date().toISOString().split('T')[0]
  return Array.from({ length: n }, (_, i) => addDays(today, i))
}
