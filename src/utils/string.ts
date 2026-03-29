/**
 * String utility functions for common string manipulation tasks
 */

/**
 * Capitalizes the first letter of a string and makes the rest lowercase
 * @param str The string to capitalize
 * @returns The capitalized string
 */
export function capitalize(str: string): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to a URL-friendly slug
 * @param str The string to slugify
 * @returns The slugified string
 */
export function slugify(str: string): string {
  if (!str || typeof str !== 'string') {
    return '';
  }

  return str
    .toLowerCase()
    .trim()
    // Replace accented characters with their ASCII equivalents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace non-alphanumeric characters with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncates a string to a specified length, optionally adding an ellipsis
 * @param str The string to truncate
 * @param length The maximum length of the string
 * @param ellipsis Whether to add '...' at the end (default: true)
 * @returns The truncated string
 */
export function truncate(str: string, length: number, ellipsis: boolean = true): string {
  if (!str || typeof str !== 'string') {
    return '';
  }

  if (length < 0) {
    return '';
  }

  if (str.length <= length) {
    return str;
  }

  if (!ellipsis) {
    return str.slice(0, length);
  }

  // If ellipsis is requested but length is too small for meaningful truncation
  if (length <= 3) {
    return str.slice(0, length);
  }

  return str.slice(0, length - 3) + '...';
}

/**
 * Reverses a string while preserving Unicode characters
 * @param str The string to reverse
 * @returns The reversed string
 */
export function reverse(str: string): string {
  if (!str || typeof str !== 'string') {
    return '';
  }

  // Use Array.from() to properly handle Unicode surrogate pairs
  return Array.from(str).reverse().join('');
}