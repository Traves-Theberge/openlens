const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const HTML_ENTITY_RE = /[&<>"']/g

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function trimWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ")
}

export function escapeHtml(input: string): string {
  return input.replace(HTML_ENTITY_RE, (ch) => HTML_ENTITIES[ch])
}

export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input)
}
