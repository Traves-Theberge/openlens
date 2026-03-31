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
