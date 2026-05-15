/**
 * Utility helpers for provider holiday and off-day logic.
 */

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/**
 * Returns true if the given date is a provider off-day or specific holiday.
 * @param dateStr      - YYYY-MM-DD
 * @param offDays      - day-of-week integers (0=Sunday … 6=Saturday)
 * @param holidayDates - YYYY-MM-DD strings for one-off holidays
 */
export function isProviderHoliday(
  dateStr: string,
  offDays: number[],
  holidayDates: string[],
): boolean {
  if (offDays.length === 0 && holidayDates.length === 0) return false
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay()
  return offDays.includes(dow) || holidayDates.includes(dateStr)
}
