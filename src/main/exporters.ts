import { BrowserWindow, dialog, app } from 'electron'
import path from 'node:path'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'

// When SMART_BRIEF_EXPORT_DIR is set (tests, scripting) exports skip the
// native save dialog and write straight into that directory.
function exportDirOverride(): string | null {
  return process.env.SMART_BRIEF_EXPORT_DIR ?? null
}

async function pickSavePath(
  win: BrowserWindow | null,
  defaultName: string,
  extension: string,
  filterName: string,
  defaultDir?: string | null
): Promise<string | null> {
  const override = exportDirOverride()
  if (override) {
    await fsp.mkdir(override, { recursive: true })
    return path.join(override, defaultName)
  }
  if (!win) return null
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultDir ? path.join(defaultDir, defaultName) : defaultName,
    filters: [{ name: filterName, extensions: [extension] }]
  })
  return result.canceled || !result.filePath ? null : result.filePath
}

/**
 * Write the AI Brief ZIP. The bytes are written to a temp file first and
 * renamed into place, so a failed export never leaves a partial ZIP that
 * looks valid.
 */
export async function exportZipFile(
  win: BrowserWindow | null,
  bytes: Buffer,
  defaultName: string,
  defaultDir?: string | null
): Promise<string | null> {
  const target = await pickSavePath(win, defaultName, 'zip', 'AI Brief ZIP', defaultDir)
  if (!target) return null
  const temp = `${target}.tmp-${crypto.randomUUID()}`
  try {
    await fsp.writeFile(temp, bytes)
    await fsp.rename(temp, target)
    return target
  } catch (err) {
    await fsp.rm(temp, { force: true })
    throw err
  }
}

export async function exportHtmlFile(
  win: BrowserWindow | null,
  html: string,
  defaultName: string
): Promise<string | null> {
  const target = await pickSavePath(win, defaultName, 'html', 'HTML brief')
  if (!target) return null
  await fsp.writeFile(target, html, 'utf8')
  return target
}

export async function exportJpegParts(
  win: BrowserWindow | null,
  dataUrls: string[],
  defaultName: string
): Promise<string[] | null> {
  const target = await pickSavePath(win, defaultName, 'jpg', 'JPEG')
  if (!target) return null
  const written: string[] = []
  const base = target.replace(/\.jpe?g$/i, '')
  for (let i = 0; i < dataUrls.length; i++) {
    const match = dataUrls[i].match(/^data:image\/jpeg;base64,(.+)$/)
    if (!match) continue
    const buffer = Buffer.from(match[1], 'base64')
    const file = dataUrls.length === 1 ? `${base}.jpg` : `${base}-part${i + 1}.jpg`
    await fsp.writeFile(file, buffer)
    written.push(file)
  }
  return written
}

export async function exportPdfFile(
  win: BrowserWindow | null,
  html: string,
  defaultName: string
): Promise<string | null> {
  const target = await pickSavePath(win, defaultName, 'pdf', 'PDF brief')
  if (!target) return null

  // Render the export HTML in a hidden window and print it to PDF.
  const tempPath = path.join(app.getPath('temp'), `smart-brief-export-${crypto.randomUUID()}.html`)
  await fsp.writeFile(tempPath, html, 'utf8')
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  try {
    await printWindow.loadFile(tempPath)
    // Wait for embedded images to decode before printing.
    await printWindow.webContents.executeJavaScript(
      `Promise.all([...document.images].map((img) => img.decode().catch(() => {})))`,
      true
    )
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      pageSize: 'A4'
    })
    await fsp.writeFile(target, pdf)
    return target
  } finally {
    printWindow.destroy()
    await fsp.rm(tempPath, { force: true })
  }
}
