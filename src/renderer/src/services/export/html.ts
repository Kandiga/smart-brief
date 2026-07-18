import type { Project } from '@shared/schemas/project'
import { buildExportModel, escapeHtml } from '@shared/exportModel'
import { renderPageToDataUrl } from '../../canvas/renderPage'

/**
 * Build a fully self-contained HTML document: embedded images, inline styles,
 * works offline on any machine. Content is limited to the visual brief itself.
 */
export async function buildHtmlExport(project: Project, forPrint = false): Promise<string> {
  const model = buildExportModel(project)
  const images: string[] = []
  for (const page of project.pages) {
    images.push(await renderPageToDataUrl(page, { maxDimension: 2000 }))
  }

  const pagesHtml = model.pages
    .map((page, i) => {
      const regions = page.regions
        .map(
          (r) => `
        <li class="region">
          <span class="badge" style="background:${escapeHtml(r.color)}">${r.number}</span>
          <span class="instruction">${escapeHtml(r.instruction) || '<em class="empty">No instruction</em>'}</span>
        </li>`
        )
        .join('')
      return `
    <section class="page">
      <header class="page-header">
        <span class="page-number">Page ${page.index}</span>
        ${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}
      </header>
      <img class="page-image" src="${images[i]}" alt="Page ${page.index}${page.title ? ` — ${escapeHtml(page.title)}` : ''}" />
      ${page.overallMessage ? `<p class="overall">${escapeHtml(page.overallMessage)}</p>` : ''}
      ${page.regions.length > 0 ? `<ol class="regions">${regions}</ol>` : ''}
    </section>`
    })
    .join('\n')

  const printCss = forPrint
    ? `
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    body { max-width: none; }`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(model.title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #f6f5f2;
    color: #23262a;
    max-width: 960px;
    margin: 0 auto;
    padding: 40px 24px 80px;
    line-height: 1.5;
  }
  h1 { font-size: 26px; font-weight: 650; letter-spacing: -0.01em; margin-bottom: 28px; }
  .page { background: #ffffff; border: 1px solid #e4e1db; border-radius: 8px; padding: 24px; margin-bottom: 28px; }
  .page-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
  .page-number { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #7b7f85; }
  .page-header h2 { font-size: 17px; font-weight: 600; }
  .page-image { width: 100%; height: auto; border: 1px solid #e4e1db; border-radius: 4px; display: block; }
  .overall { margin-top: 14px; font-size: 15px; color: #3a3f45; padding-left: 12px; border-left: 3px solid #2a7d6c; }
  .regions { margin-top: 16px; list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .region { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
  .badge {
    flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%;
    color: #fff; font-size: 13px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .instruction { padding-top: 2px; }
  .empty { color: #9aa0a6; }
  ${printCss}
</style>
</head>
<body>
  <h1>${escapeHtml(model.title)}</h1>
${pagesHtml}
</body>
</html>`
}

export async function exportHtml(project: Project): Promise<string | null> {
  const html = await buildHtmlExport(project)
  const name = safeFileName(project.title) || 'brief'
  return window.smartBrief.exportHtml(html, `${name}.html`)
}

export async function exportPdf(project: Project): Promise<string | null> {
  const html = await buildHtmlExport(project, true)
  const name = safeFileName(project.title) || 'brief'
  return window.smartBrief.exportPdf(html, `${name}.pdf`)
}

export function safeFileName(title: string): string {
  return title
    .trim()
    .replace(/[/\\:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
