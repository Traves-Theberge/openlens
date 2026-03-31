/**
 * Truncate a string to a maximum length, appending a suffix if truncated.
 * Uses codepoint-aware iteration for correct multi-byte unicode handling.
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = "...",
): string {
  const codepoints = Array.from(str);

  if (codepoints.length <= maxLength) {
    return str;
  }

  const suffixCodepoints = Array.from(suffix);
  const keepLength = maxLength - suffixCodepoints.length;

  if (keepLength <= 0) {
    return Array.from(suffix).slice(0, maxLength).join("");
  }

  return codepoints.slice(0, keepLength).join("") + suffix;
}

/**
 * Truncate a string at word boundaries to fit within a maximum length.
 * Finds the last complete word that fits, then appends the suffix.
 */
export function truncateWords(
  str: string,
  maxLength: number,
  suffix: string = "...",
): string {
  const codepoints = Array.from(str);

  if (codepoints.length <= maxLength) {
    return str;
  }

  const suffixCodepoints = Array.from(suffix);
  const keepLength = maxLength - suffixCodepoints.length;

  if (keepLength <= 0) {
    return suffixCodepoints.slice(0, maxLength).join("");
  }

  const kept = codepoints.slice(0, keepLength).join("");

  // If we're cutting between words (next char is space or end of string), no need to backtrack
  if (keepLength >= codepoints.length || codepoints[keepLength] === " ") {
    return kept.trimEnd() + suffix;
  }

  // We're cutting mid-word — backtrack to last space
  const lastSpace = kept.lastIndexOf(" ");

  if (lastSpace <= 0) {
    // No word boundary found — fall back to character truncation
    return kept + suffix;
  }

  return kept.slice(0, lastSpace).trimEnd() + suffix;
}
