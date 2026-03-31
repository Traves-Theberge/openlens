/**
 * Convert a string to a URL-safe slug.
 *
 * - Lowercases
 * - Normalizes unicode (NFD) and strips combining marks
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 */
export function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric runs with a single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
