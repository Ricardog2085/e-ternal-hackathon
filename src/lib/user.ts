/**
 * Computes intelligent initials from full name or email according to E-ternal specifications:
 * - If the user sets 'Ricardo Castro' -> returns 'RC'.
 * - If only 1 name 'Ricardo' -> returns 'RI'.
 * - If no name is set yet, extracts first two letters of their email -> e.g. 'ricardo@...' -> 'RI'.
 */
export function computeInitials(fullName?: string | null, email?: string | null): string {
  const trimmedName = fullName?.trim();
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
  }

  // Fallback: primeras dos letras del correo
  if (email) {
    const emailPrefix = email.split('@')[0].trim();
    if (emailPrefix.length >= 2) {
      return emailPrefix.slice(0, 2).toUpperCase();
    }
    if (emailPrefix.length === 1) {
      return emailPrefix[0].toUpperCase();
    }
  }

  return 'CU';
}
