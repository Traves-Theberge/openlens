import { Hono } from "hono"
import fs from "fs/promises"
import path from "path"

// ─── Markdown to HTML converter ─────────────────────────────────
// Handles: headings, code blocks, mermaid, tables, lists, links,
// bold, italic, inline code, blockquotes, horizontal rules, paragraphs

function md2html(md: string): string {
  let html = md
  const preserved: string[] = []

  // 1. Extract and preserve fenced code blocks (including mermaid)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = preserved.length
    if (lang === "mermaid") {
      preserved.push(
        `<div class="mermaid-wrapper"><pre class="mermaid">${code.trim()}</pre></div>`
      )
    } else {
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
      const langLabel = lang ? `<div class="code-lang">${lang}</div>` : ""
      preserved.push(
        `<div class="code-block">${langLabel}<pre><code class="language-${lang || "text"}">${escaped}</code></pre></div>`
      )
    }
    return `\n%%BLOCK_${idx}%%\n`
  })

  // 2. Inline code (before other inline transforms)
  html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>')

  // 3. Tables
  html = html.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split("\n")
      if (rows.length < 2) return tableBlock
      const headerCells = rows[0].split("|").slice(1, -1).map((c) => c.trim())
      // Skip separator row
      const bodyRows = rows.slice(2)
      let table = '<div class="table-wrapper"><table><thead><tr>'
      table += headerCells.map((c) => `<th>${c}</th>`).join("")
      table += "</tr></thead><tbody>"
      for (const row of bodyRows) {
        const cells = row.split("|").slice(1, -1).map((c) => c.trim())
        table += "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>"
      }
      table += "</tbody></table></div>"
      return table
    }
  )

  // 4. Headings (capture for TOC)
  html = html.replace(/^#### (.+)$/gm, (_, t) => {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
    return `<h4 id="${id}">${t}</h4>`
  })
  html = html.replace(/^### (.+)$/gm, (_, t) => {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
    return `<h3 id="${id}">${t}</h3>`
  })
  html = html.replace(/^## (.+)$/gm, (_, t) => {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
    return `<h2 id="${id}">${t}</h2>`
  })
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  // 5. Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // 6. Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    if (href.endsWith(".md")) href = href.replace(/\.md$/, "")
    return `<a href="${href}">${text}</a>`
  })

  // 7. Blockquotes
  html = html.replace(
    /((?:^> .+$\n?)+)/gm,
    (block) => {
      const content = block.replace(/^> /gm, "").trim()
      return `<blockquote>${content}</blockquote>`
    }
  )

  // 8. Unordered lists (handle nested with indentation)
  html = html.replace(
    /((?:^[ ]*- .+$\n?)+)/gm,
    (block) => {
      const items = block.trim().split("\n").map((line) => {
        const text = line.replace(/^[ ]*- /, "")
        return `<li>${text}</li>`
      })
      return `<ul>${items.join("\n")}</ul>`
    }
  )

  // 9. Ordered lists
  html = html.replace(
    /((?:^\d+\. .+$\n?)+)/gm,
    (block) => {
      const items = block.trim().split("\n").map((line) => {
        const text = line.replace(/^\d+\. /, "")
        return `<li>${text}</li>`
      })
      return `<ol>${items.join("\n")}</ol>`
    }
  )

  // 10. Horizontal rules
  html = html.replace(/^---$/gm, "<hr>")

  // 11. Paragraphs — wrap loose text lines
  const lines = html.split("\n")
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith("<") ||
      trimmed.startsWith("%%BLOCK_")
    ) {
      result.push(line)
    } else {
      result.push(`<p>${trimmed}</p>`)
    }
  }
  html = result.join("\n")

  // 12. Restore preserved blocks
  html = html.replace(/<p>%%BLOCK_(\d+)%%<\/p>|%%BLOCK_(\d+)%%/g, (_, a, b) => preserved[Number(a ?? b)])

  return html
}

// Extract headings for table of contents
function extractToc(md: string): Array<{ level: number; text: string; id: string }> {
  const toc: Array<{ level: number; text: string; id: string }> = []
  const lines = md.split("\n")
  let inCodeBlock = false

  for (const line of lines) {
    if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; continue }
    if (inCodeBlock) continue

    const match = line.match(/^(#{2,3})\s+(.+)$/)
    if (match) {
      const text = match[2]
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
      toc.push({ level: match[1].length, text, id })
    }
  }
  return toc
}

// ─── CSS (Fumadocs-inspired dark theme) ─────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg: #0a0a0a;
  --bg-card: #111111;
  --bg-sidebar: #0a0a0a;
  --bg-hover: #1a1a1a;
  --bg-active: #1a1a1a;
  --bg-code: #131313;
  --bg-inline-code: #1e1e1e;
  --text: #ededed;
  --text-secondary: #888;
  --text-muted: #555;
  --border: #1e1e1e;
  --border-subtle: #181818;
  --accent: #3b82f6;
  --accent-dim: rgba(59,130,246,0.1);
  --radius: 10px;
  --radius-sm: 6px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.layout {
  display: flex;
  min-height: 100vh;
}

/* ─── Sidebar ──────────────────────────────────────────── */

.sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 20px 0;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.sidebar-header {
  padding: 0 20px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

.sidebar-header a {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  font-weight: 600;
  font-size: 15px;
}

.sidebar-header .logo {
  width: 24px;
  height: 24px;
  background: var(--accent);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  font-weight: 700;
}

.sidebar-nav { padding: 0 8px; }

.sidebar-nav a {
  display: block;
  padding: 7px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13.5px;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  margin-bottom: 1px;
}

.sidebar-nav a:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.sidebar-nav a.active {
  background: var(--accent-dim);
  color: var(--accent);
  font-weight: 500;
}

.sidebar-section {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 16px 12px 6px;
}

/* ─── Content ──────────────────────────────────────────── */

.content-area {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.content {
  max-width: 780px;
  width: 100%;
  padding: 40px 48px 80px;
}

/* ─── TOC (right sidebar) ──────────────────────────────── */

.toc {
  width: 220px;
  min-width: 220px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 40px 20px;
  scrollbar-width: none;
}

.toc-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.toc a {
  display: block;
  font-size: 12.5px;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 3px 0;
  border-left: 2px solid transparent;
  padding-left: 12px;
  transition: all 0.15s ease;
}

.toc a:hover { color: var(--text); }
.toc a.depth-3 { padding-left: 24px; font-size: 12px; }

/* ─── Typography ───────────────────────────────────────── */

h1 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
  line-height: 1.2;
}

h2 {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 40px 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  line-height: 1.3;
}

h3 {
  font-size: 17px;
  font-weight: 600;
  margin: 28px 0 10px;
  line-height: 1.4;
}

h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 22px 0 8px;
}

p { margin: 10px 0; color: var(--text-secondary); font-size: 14.5px; }
p strong, li strong { color: var(--text); }

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* ─── Code ─────────────────────────────────────────────── */

code.inline {
  background: var(--bg-inline-code);
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  border: 1px solid var(--border);
  color: #d4d4d4;
}

.code-block {
  position: relative;
  margin: 16px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-code);
}

.code-lang {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  text-transform: lowercase;
  pointer-events: none;
}

.code-block pre {
  margin: 0;
  padding: 16px 20px;
  overflow-x: auto;
  background: transparent;
  border: none;
  border-radius: 0;
}

.code-block code {
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
}

pre {
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}

pre code {
  background: none;
  padding: 0;
  border: none;
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  color: #d4d4d4;
}

/* ─── Mermaid ──────────────────────────────────────────── */

.mermaid-wrapper {
  margin: 16px 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  overflow-x: auto;
}

.mermaid-wrapper pre.mermaid {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
}

/* ─── Tables ───────────────────────────────────────────── */

.table-wrapper {
  margin: 16px 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

th {
  background: var(--bg-card);
  font-weight: 600;
  text-align: left;
  padding: 10px 16px;
  color: var(--text);
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

td {
  padding: 9px 16px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg-hover); }

/* ─── Lists ────────────────────────────────────────────── */

ul, ol {
  margin: 10px 0;
  padding-left: 22px;
}

li {
  margin: 5px 0;
  color: var(--text-secondary);
  font-size: 14.5px;
  line-height: 1.6;
}

/* ─── Blockquotes ──────────────────────────────────────── */

blockquote {
  border-left: 3px solid var(--accent);
  padding: 12px 20px;
  margin: 16px 0;
  background: var(--accent-dim);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
  font-size: 14px;
}

/* ─── Misc ─────────────────────────────────────────────── */

hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 32px 0;
}

strong { color: var(--text); font-weight: 600; }

/* ─── Responsive ───────────────────────────────────────── */

@media (max-width: 1200px) {
  .toc { display: none; }
}

@media (max-width: 768px) {
  .sidebar { display: none; }
  .content { padding: 24px 20px 60px; }
}
`

// ─── Page builder ───────────────────────────────────────

interface WikiPage {
  slug: string
  title: string
  path: string
  section?: string
}

const SECTIONS: Record<string, string> = {
  "1": "Getting Started",
  "2": "Architecture",
  "3": "Architecture",
  "4": "Architecture",
  "5": "Architecture",
  "6": "Reference",
  "7": "Reference",
  "8": "Integrations",
  "9": "Development",
  "10": "Development",
}

async function loadPages(wikiDir: string): Promise<WikiPage[]> {
  const files = await fs.readdir(wikiDir)
  const pages: WikiPage[] = []

  for (const file of files.sort()) {
    if (!file.endsWith(".md") || file === "index.md") continue
    const content = await fs.readFile(path.join(wikiDir, file), "utf-8")
    const titleMatch = content.match(/^#\s+(.+)$/m)
    const num = file.match(/^(\d+)/)?.[1] || ""
    pages.push({
      slug: file.replace(".md", ""),
      title: titleMatch?.[1] || file.replace(".md", ""),
      path: path.join(wikiDir, file),
      section: SECTIONS[num],
    })
  }
  return pages
}

function renderNav(pages: WikiPage[], currentSlug: string): string {
  let html = ""
  let lastSection = ""

  for (const p of pages) {
    if (p.section && p.section !== lastSection) {
      html += `<div class="sidebar-section">${p.section}</div>`
      lastSection = p.section
    }
    html += `<a href="/${p.slug}" class="${p.slug === currentSlug ? "active" : ""}">${p.title.replace(/^OpenLens\s*/, "")}</a>\n`
  }
  return html
}

function renderToc(toc: Array<{ level: number; text: string; id: string }>): string {
  if (toc.length === 0) return ""
  let html = '<div class="toc"><div class="toc-title">On this page</div>'
  for (const item of toc) {
    html += `<a href="#${item.id}" class="depth-${item.level}">${item.text}</a>\n`
  }
  html += "</div>"
  return html
}

function renderPage(content: string, pages: WikiPage[], currentSlug: string): string {
  const toc = extractToc(content)
  const htmlContent = md2html(content)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenLens Docs</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="/1-overview">
          <div class="logo">O</div>
          OpenLens
        </a>
      </div>
      <nav class="sidebar-nav">
        ${renderNav(pages, currentSlug)}
      </nav>
    </aside>
    <div class="content-area">
      <div class="content">
        ${htmlContent}
      </div>
    </div>
    ${renderToc(toc)}
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#111111',
        primaryColor: '#3b82f6',
        primaryTextColor: '#ededed',
        primaryBorderColor: '#1e1e1e',
        lineColor: '#555',
        secondaryColor: '#1a1a1a',
        tertiaryColor: '#0a0a0a',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
      },
    });
  </script>
</body>
</html>`
}

// ─── Server ─────────────────────────────────────────────

export function createDocsServer(wikiDir: string) {
  const app = new Hono()

  app.get("/", async (c) => c.redirect("/1-overview"))

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug")
    const pages = await loadPages(wikiDir)
    const page = pages.find((p) => p.slug === slug)

    if (!page) return c.text("Page not found", 404)

    const content = await fs.readFile(page.path, "utf-8")
    return c.html(renderPage(content, pages, slug))
  })

  return app
}
