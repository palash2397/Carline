/**
 * Unified Date and Time Range Parser Utility
 * 
 * Supports:
 * - Date-only strings: 'YYYY-MM-DD' (defaults start to 00:00:00.000 and end to 23:59:59.999)
 * - ISO date-time strings: 'YYYY-MM-DDTHH:mm:ss.sssZ' (preserves exact time)
 * - Separate time parameters: fromTime='09:00', toTime='17:30' (combined with fromDate/toDate or date)
 * - Field aliases:
 *     from: fromDate, startDate, from
 *     to:   toDate, endDate, to
 *     time: fromTime/startTime, toTime/endTime
 *     single date: date
 */

export interface DateTimeRangeResult {
  startDate: Date | null;
  endDate: Date | null;
  hasFilter: boolean;
  filter: Record<string, any> | null;
}

function parseTimeComponents(timeStr: string): { hours: number; minutes: number; seconds: number; ms: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 1) return null;

  const hours = parseInt(parts[0], 10);
  const minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  let seconds = 0;
  let ms = 0;

  if (parts.length > 2) {
    const secParts = parts[2].split('.');
    seconds = parseInt(secParts[0], 10) || 0;
    if (secParts.length > 1) {
      ms = parseInt(secParts[1].slice(0, 3).padEnd(3, '0'), 10) || 0;
    }
  }

  if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes, seconds, ms };
}

function parseDateWithOptionalTime(dateInput: any, timeInput?: any, isEndOfRange: boolean = false): Date | null {
  if (!dateInput) return null;
  const str = String(dateInput).trim();
  if (!str) return null;

  // Case 1: Separate time provided and date string is date-only (length <= 10, e.g. YYYY-MM-DD)
  const timeComp = timeInput ? parseTimeComponents(String(timeInput)) : null;

  if (timeComp && str.length <= 10) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(timeComp.hours, timeComp.minutes, timeComp.seconds, timeComp.ms);
    return d;
  }

  // Case 2: Date string only (YYYY-MM-DD or similar without time)
  if (str.length <= 10 && !str.includes('T') && !str.includes(' ')) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    if (isEndOfRange) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  // Case 3: String contains time or ISO format (e.g. 2026-10-15T14:30:00Z)
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;

  // If timeInput was explicitly provided even with a full date string, apply time override
  if (timeComp) {
    parsed.setHours(timeComp.hours, timeComp.minutes, timeComp.seconds, timeComp.ms);
  }

  return parsed;
}

export function parseDateTimeRange(
  query: any,
  fieldName: string = 'createdAt',
): DateTimeRangeResult {
  if (!query || typeof query !== 'object') {
    return { startDate: null, endDate: null, hasFilter: false, filter: null };
  }

  const fromParam = query.fromDate ?? query.startDate ?? query.from;
  const toParam = query.toDate ?? query.endDate ?? query.to;
  const singleDate = query.date;
  const fromTime = query.fromTime ?? query.startTime;
  const toTime = query.toTime ?? query.endTime;

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (singleDate) {
    startDate = parseDateWithOptionalTime(singleDate, fromTime, false);
    endDate = parseDateWithOptionalTime(singleDate, toTime, true);
  } else {
    if (fromParam) {
      startDate = parseDateWithOptionalTime(fromParam, fromTime, false);
    }
    if (toParam) {
      endDate = parseDateWithOptionalTime(toParam, toTime, true);
    }
  }

  const dateCond: any = {};
  if (startDate && !isNaN(startDate.getTime())) {
    dateCond.$gte = startDate;
  }
  if (endDate && !isNaN(endDate.getTime())) {
    dateCond.$lte = endDate;
  }

  const hasFilter = Object.keys(dateCond).length > 0;
  const filter = hasFilter ? { [fieldName]: dateCond } : null;

  return {
    startDate,
    endDate,
    hasFilter,
    filter,
  };
}
