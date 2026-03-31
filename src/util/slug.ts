export interface SlugOptions {
  /** Split camelCase/PascalCase boundaries before slugifying. */
  camelCase?: boolean;
}

/**
 * Convert a string to a URL-safe slug.
 *
 * - Optionally splits camelCase/PascalCase boundaries
 * - Lowercases
 * - Normalizes unicode (NFD) and strips combining marks
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 */
export function slug(input: string, options?: SlugOptions): string {
  let s = input;

  if (options?.camelCase) {
    // Insert a hyphen before each uppercase letter that follows a lowercase letter or digit,
    // and between a run of uppercase letters and a following lowercase letter (e.g. "XMLParser" → "XML-Parser").
    s = s
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2");
  }

  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric runs with a single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
