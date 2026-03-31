/**
 * Convert a string to a URL-safe slug.
 *
 * - Lowercases the input
 * - Normalises unicode (NFKD) and strips combining marks
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 */
export function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // split camelCase boundaries
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2") // split ACRONYMWord boundaries
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
    .replace(/-+/g, "-") // collapse consecutive hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}
