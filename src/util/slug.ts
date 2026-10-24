/**
 * Convert a string to a URL-safe slug.
 *
 * - Normalizes unicode (NFD) and strips combining marks
 * - Lowercases
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Strips leading/trailing hyphens
 */
export function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // split camelCase boundaries
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2") // split PascalCase acronyms
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
