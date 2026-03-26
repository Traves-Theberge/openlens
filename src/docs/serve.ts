import { Hono } from "hono"
import fs from "fs/promises"
import path from "path"

// Minimal markdown-to-HTML converter (no external deps)
function md2html(md: string): string {
  let html = md

  // Fenced code blocks (must be first — protect from other transforms)
  const codeBlocks: string[] = []
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    codeBlocks.push(`<pre><code class="language-${lang || "text"}">${escaped}</code></pre>`)
    return `%%CODEBLOCK_${idx}%%`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Mermaid blocks (render as div for client-side rendering)
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
    const block = codeBlocks[Number(idx)]
    if (block.includes('class="language-mermaid"')) {
      const content = block.replace(/<pre><code class="language-mermaid">/, "").replace(/<\/code><\/pre>/, "")
      return `<pre class="mermaid">${content}</pre>`
    }
    return block
  })

  // Restore remaining code blocks
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[Number(idx)])

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (line) => {
    if (line.match(/^\|\s*[-:]+/)) return "%%TABLE_SEP%%"
    const cells = line.split("|").slice(1, -1).map((c) => c.trim())
    return cells.map((c) => `<td>${c}</td>`).join("")
  })
  html = html.replace(/((?:<td>.*<\/td>\n?)+)/g, (block) => {
    const rows = block.trim().split("\n").filter((r) => r !== "%%TABLE_SEP%%")
    if (rows.length === 0) return block
    const headerRow = `<tr>${rows[0].replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>")}</tr>`
    const bodyRows = rows.slice(1).map((r) => `<tr>${r}</tr>`).join("\n")
    return `<table>${headerRow}${bodyRows}</table>`
  })
  html = html.replace(/%%TABLE_SEP%%\n?/g, "")

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 id="$1">$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3 id="$1">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 id="$1">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    // Convert .md links to .html-style routes
    if (href.endsWith(".md")) href = href.replace(/\.md$/, "")
    return `<a href="${href}">${text}</a>`
  })

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>")
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>")

  // Paragraphs (lines that aren't already HTML)
  html = html.replace(/^(?!<[a-z]|%%|$)(.+)$/gm, "<p>$1</p>")

  // Clean up double-wrapped paragraphs
  html = html.replace(/<p><(h[1-4]|ul|ol|li|table|pre|blockquote|hr)/g, "<$1")
  html = html.replace(/<\/(h[1-4]|ul|ol|li|table|pre|blockquote)><\/p>/g, "</$1>")

  return html
}

const CSS = `
:root {
  --bg: #0d1117;
  --bg-secondary: #161b22;
  --text: #e6edf3;
  --text-secondary: #8b949e;
  --border: #30363d;
  --accent: #58a6ff;
  --accent-hover: #79c0ff;
  --code-bg: #1c2129;
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  display: flex;
  min-height: 100vh;
}

nav {
  width: 280px;
  min-width: 280px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  padding: 24px 16px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

nav h2 {
  font-size: 16px;
  margin-bottom: 16px;
  color: var(--text);
}

nav a {
  display: block;
  padding: 6px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  border-radius: 6px;
  margin-bottom: 2px;
}

nav a:hover { background: var(--border); color: var(--text); }
nav a.active { background: rgba(88,166,255,0.1); color: var(--accent); }

main {
  flex: 1;
  max-width: 900px;
  padding: 40px 48px;
}

h1 { font-size: 32px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
h2 { font-size: 24px; margin: 32px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
h3 { font-size: 18px; margin: 24px 0 8px; }
h4 { font-size: 16px; margin: 20px 0 6px; }

p { margin: 8px 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); text-decoration: underline; }

code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0;
  font-size: 13px;
  line-height: 1.5;
}

pre code { background: none; padding: 0; }

table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 14px;
}

th, td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}

th { background: var(--bg-secondary); font-weight: 600; }

ul, ol { margin: 8px 0; padding-left: 24px; }
li { margin: 4px 0; }

blockquote {
  border-left: 3px solid var(--accent);
  padding: 8px 16px;
  margin: 12px 0;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-radius: 0 6px 6px 0;
}

hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }

strong { color: var(--text); }

.mermaid { background: var(--bg-secondary); border-radius: 8px; padding: 16px; margin: 12px 0; }
`

interface WikiPage {
  slug: string
  title: string
  path: string
}

async function loadPages(wikiDir: string): Promise<WikiPage[]> {
  const files = await fs.readdir(wikiDir)
  const pages: WikiPage[] = []

  for (const file of files.sort()) {
    if (!file.endsWith(".md") || file === "index.md") continue
    const content = await fs.readFile(path.join(wikiDir, file), "utf-8")
    const titleMatch = content.match(/^#\s+(.+)$/m)
    pages.push({
      slug: file.replace(".md", ""),
      title: titleMatch?.[1] || file.replace(".md", ""),
      path: path.join(wikiDir, file),
    })
  }

  return pages
}

function renderNav(pages: WikiPage[], currentSlug: string): string {
  return pages
    .map(
      (p) =>
        `<a href="/${p.slug}" class="${p.slug === currentSlug ? "active" : ""}">${p.title}</a>`
    )
    .join("\n")
}

function renderPage(content: string, pages: WikiPage[], currentSlug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenLens Wiki</title>
  <style>${CSS}</style>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'dark' });
  </script>
</head>
<body>
  <nav>
    <h2><a href="/" style="color: var(--text)">OpenLens Wiki</a></h2>
    ${renderNav(pages, currentSlug)}
  </nav>
  <main>
    ${md2html(content)}
  </main>
</body>
</html>`
}

export function createDocsServer(wikiDir: string) {
  const app = new Hono()

  app.get("/", async (c) => {
    const pages = await loadPages(wikiDir)
    // Redirect to overview
    return c.redirect("/1-overview")
  })

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug")
    const pages = await loadPages(wikiDir)
    const page = pages.find((p) => p.slug === slug)

    if (!page) {
      return c.text("Page not found", 404)
    }

    const content = await fs.readFile(page.path, "utf-8")
    return c.html(renderPage(content, pages, slug))
  })

  return app
}
