/**
 * Phone Number Formatter & Normalization Utility
 * Standardizes phone numbers across customers, drivers, and IVR caller IDs
 * and provides match patterns to strictly prevent duplicate entries.
 */

export function cleanPhoneDigits(raw: string): string {
  if (!raw) return '';
  // Strip SIP domain if present (e.g., +1919685434928@208.69.82.26 -> +1919685434928)
  const withoutSip = String(raw).split('@')[0].trim();
  // Strip all non-digit characters
  return withoutSip.replace(/\D/g, '');
}

/**
 * Normalizes a phone number to standard 10-digit US format (e.g. 3475632341).
 * If a leading 1 (US country code) is present on an 11-digit number, it is removed.
 * International numbers outside US standard (length != 10 and length != 11) keep their digits.
 */
export function normalizePhoneNumber(raw: string): string {
  const digits = cleanPhoneDigits(raw);
  if (!digits) return '';

  // 10-digit standard US number (e.g. 3475632341)
  if (digits.length === 10) {
    return digits;
  }

  // 11-digit US number starting with '1' (e.g., 13475632341 -> 3475632341)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  // US numbers with leading country code 1 and trunk routing (e.g. +1919685434928 -> extract 10 digits)
  if (digits.length > 10 && digits.startsWith('1')) {
    return digits.slice(-10);
  }

  // If 10 or more digits, extract standard 10-digit phone
  if (digits.length >= 10) {
    return digits.slice(-10);
  }

  // Otherwise return cleaned digits
  return digits;
}

/**
 * Formats a 10-digit phone number as (XXX) XXX-XXXX for clean display.
 */
export function formatToNational(raw: string): string {
  const normalized = normalizePhoneNumber(raw);
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  return raw;
}

/**
 * Formats a 10-digit phone number as +1XXXXXXXXXX.
 */
export function formatToE164(raw: string): string {
  const normalized = normalizePhoneNumber(raw);
  if (normalized.length === 10) {
    return `+1${normalized}`;
  }
  return `+${normalized}`;
}

/**
 * Formats a 10-digit phone number with dashes: XXX-XXX-XXXX.
 */
export function formatToDashed(raw: string): string {
  const normalized = normalizePhoneNumber(raw);
  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  return raw;
}

/**
 * Checks if a phone number contains a valid US 10-digit number.
 */
export function isValidPhoneNumber(raw: string): boolean {
  const normalized = normalizePhoneNumber(raw);
  return normalized.length >= 10;
}

/**
 * Builds MongoDB $or query conditions matching all possible formats
 * in which this phone number could have previously been entered into the DB.
 */
export function buildPhoneMatchConditions(
  raw: string,
  fieldName: string = 'mobileNumber',
): any[] {
  if (!raw) return [{ [fieldName]: '__INVALID_PHONE__' }];

  const normalized = normalizePhoneNumber(raw);
  const rawClean = cleanPhoneDigits(raw);
  const rawTrimmed = String(raw).trim();

  const variants = new Set<string>();

  if (rawTrimmed) variants.add(rawTrimmed);
  if (normalized) variants.add(normalized);
  if (rawClean) variants.add(rawClean);

  if (normalized.length === 10) {
    variants.add(`1${normalized}`);
    variants.add(`+1${normalized}`);
    variants.add(formatToNational(normalized));
    variants.add(formatToDashed(normalized));
    variants.add(`+1 ${formatToNational(normalized)}`);
  }

  const conditions: any[] = Array.from(variants).map((val) => ({
    [fieldName]: val,
  }));

  // Also include regex for the last 10 digits to catch any custom formatting
  if (normalized.length === 10) {
    conditions.push({
      [fieldName]: { $regex: `${normalized}$`, $options: 'i' },
    });
  }

  return conditions;
}
