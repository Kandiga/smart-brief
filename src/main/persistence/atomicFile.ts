import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * Atomic write: write to a temp file, flush to disk, keep the previous version
 * as a .bak recovery copy, then rename the temp file into place.
 */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fsp.mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  const handle = await fsp.open(tmpPath, 'w')
  try {
    await handle.writeFile(data, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  // Keep a recovery backup of the previous file before replacing it.
  try {
    if (fs.existsSync(filePath)) {
      await fsp.copyFile(filePath, `${filePath}.bak`)
    }
  } catch {
    // A missing backup must not block the save itself.
  }
  await fsp.rename(tmpPath, filePath)
}

export async function readJson(filePath: string): Promise<any | null> {
  try {
    const text = await fsp.readFile(filePath, 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Read a JSON file, falling back to its .bak recovery copy if corrupt. */
export async function readJsonWithBackup(
  filePath: string
): Promise<{ data: any | null; usedBackup: boolean; corrupt: boolean }> {
  if (!fs.existsSync(filePath)) return { data: null, usedBackup: false, corrupt: false }
  const primary = await readJson(filePath)
  if (primary !== null) return { data: primary, usedBackup: false, corrupt: false }
  const backup = await readJson(`${filePath}.bak`)
  if (backup !== null) return { data: backup, usedBackup: true, corrupt: true }
  return { data: null, usedBackup: false, corrupt: true }
}
