/**
 * Utilities for timezone-safe date formatting, parsing, and document expiry calculations.
 */

export type ExpiryStatus = 'expired' | 'upcoming' | 'active' | 'none';

export interface ExpiryCalculation {
  status: ExpiryStatus;
  daysRemaining: number;
  label: string;
}

/**
 * Parses YYYY-MM-DD into a local midnight Date object, completely avoiding UTC offset drift.
 */
export function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return new Date(year, month - 1, day);
}

/**
 * Formats YYYY-MM-DD for readable human display without timezone shifts.
 */
export function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculates whether a document is expired, upcoming (within lead time), active, or none.
 * Uses local calendar days to guarantee zero off-by-one errors across timezones.
 */
export function calculateExpiryStatus(
  expiryDateStr?: string,
  leadDays: number = 30,
  referenceDate: Date = new Date()
): ExpiryCalculation {
  if (!expiryDateStr || !expiryDateStr.trim()) {
    return { status: 'none', daysRemaining: 0, label: 'No expiry date set' };
  }

  const parts = expiryDateStr.split('-');
  if (parts.length !== 3) {
    return { status: 'none', daysRemaining: 0, label: 'Invalid date' };
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return { status: 'none', daysRemaining: 0, label: 'Invalid date' };
  }

  const targetDate = new Date(year, month - 1, day);
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const diffMs = targetDate.getTime() - today.getTime();
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    const daysAgo = Math.abs(daysRemaining);
    return {
      status: 'expired',
      daysRemaining,
      label: daysAgo === 1 ? 'Expired yesterday' : `Expired ${daysAgo} days ago`,
    };
  }

  if (daysRemaining === 0) {
    return {
      status: 'upcoming',
      daysRemaining: 0,
      label: 'Expires today',
    };
  }

  if (daysRemaining <= leadDays) {
    return {
      status: 'upcoming',
      daysRemaining,
      label: daysRemaining === 1 ? 'Expires tomorrow' : `Expires in ${daysRemaining} days`,
    };
  }

  return {
    status: 'active',
    daysRemaining,
    label: `Expires in ${daysRemaining} days`,
  };
}
