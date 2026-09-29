import legalData from "./legal-content.json";

function renderMarkdownSimple(md: string): string {
  // Simple, secure markdown to HTML conversion with proper escaping
  const lines = md.split("\n");
  const htmlParts: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (trimmed.startsWith("# ")) {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      htmlParts.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith("## ")) {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      htmlParts.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("### ")) {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      htmlParts.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("- ")) {
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      htmlParts.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
    } else {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      htmlParts.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  if (inList) {
    htmlParts.push("</ul>");
  }

  return htmlParts.join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(str: string): string {
  let s = escapeHtml(str);
  // bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // code
  s = s.replace(/`(.+?)`/g, "<code>$1</code>");
  return s;
}

function pageTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - AegisDesk</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --primary: #38bdf8;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --text: #0f172a;
        --text-muted: #475569;
        --border: #e2e8f0;
        --primary: #0284c7;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 2.5rem;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    h1 { font-size: 1.875rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; margin-top: 0; }
    h2 { font-size: 1.35rem; margin-top: 2rem; color: var(--primary); }
    h3 { font-size: 1.1rem; margin-top: 1.5rem; }
    p, li { font-size: 1rem; color: var(--text); }
    code { background: var(--border); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    .version-meta { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <main class="container">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

export function getLegalContent() {
  return legalData;
}

export function getTermsHtml(): string {
  return pageTemplate(
    "Términos y Condiciones",
    renderMarkdownSimple(legalData.termsMarkdown),
  );
}

export function getPrivacyHtml(): string {
  return pageTemplate(
    "Aviso de Privacidad",
    renderMarkdownSimple(legalData.privacyMarkdown),
  );
}
