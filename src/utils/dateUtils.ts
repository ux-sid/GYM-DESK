/**
 * Date Utilities scoped to Asia/Kolkata
 */

/**
 * Returns the current date in Asia/Kolkata timezone as a JavaScript Date object (midnight local time)
 */
export function getKolkataToday(): Date {
  const options = { timeZone: 'Asia/Kolkata' };
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...options,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
  return new Date(year, month, day);
}

/**
 * Returns the current date in Asia/Kolkata timezone as a YYYY-MM-DD string
 */
export function getKolkataTodayString(): string {
  const d = getKolkataToday();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses a YYYY-MM-DD string into a local Date object representing midnight on that day.
 */
export function parseLocalDate(dateStr: string): Date {
  const [yyyy, mm, dd] = dateStr.split('-').map((num) => parseInt(num, 10));
  return new Date(yyyy, mm - 1, dd);
}

/**
 * Formats a Date object to YYYY-MM-DD in the local timezone.
 */
export function formatLocalDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calculates membership end date from start date and plan duration, handling month-end bounds correctly.
 * Example: start='2026-01-31', duration=1 month -> end='2026-02-28' (or 29th on leap years)
 */
export function calculateMembershipEndDate(
  startDateStr: string,
  durationValue: number,
  durationUnit: 'days' | 'months' | 'years'
): string {
  const start = parseLocalDate(startDateStr);
  const end = new Date(start);

  if (durationUnit === 'days') {
    end.setDate(start.getDate() + durationValue - 1); // -1 because membership is inclusive of start date
  } else if (durationUnit === 'months') {
    // Adding months handles overflow (e.g., Jan 31 + 1 month -> Feb 28)
    const expectedMonth = start.getMonth() + durationValue;
    end.setMonth(expectedMonth);
    // If the month rolled over beyond the intended target (e.g. Feb 31 -> March 3), snap to the last day of the intended month
    if (end.getMonth() !== expectedMonth % 12) {
      end.setDate(0); // set to 0th day of next month, which is the last day of target month
    }
    end.setDate(end.getDate() - 1); // inclusive end
  } else if (durationUnit === 'years') {
    end.setFullYear(start.getFullYear() + durationValue);
    end.setDate(end.getDate() - 1); // inclusive end
  }

  return formatLocalDate(end);
}

/**
 * Calculates the number of calendar days in a freeze period (inclusive)
 */
export function getDaysBetween(startDateStr: string, endDateStr: string): number {
  const start = parseLocalDate(startDateStr);
  const end = parseLocalDate(endDateStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
}

/**
 * Extends membership end date by the given number of frozen days.
 */
export function extendEndDateByDays(endDateStr: string, days: number): string {
  const end = parseLocalDate(endDateStr);
  end.setDate(end.getDate() + days);
  return formatLocalDate(end);
}

/**
 * Compare two dates. Returns true if first is after second.
 */
export function isDateAfter(dateStrA: string, dateStrB: string): boolean {
  return parseLocalDate(dateStrA).getTime() > parseLocalDate(dateStrB).getTime();
}

/**
 * Compare two dates. Returns true if first is before second.
 */
export function isDateBefore(dateStrA: string, dateStrB: string): boolean {
  return parseLocalDate(dateStrA).getTime() < parseLocalDate(dateStrB).getTime();
}
