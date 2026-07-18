import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import {
  launchApp,
  closeApp,
  makeDataDir,
  makePng,
  dropPng,
  waitForSaved,
  dragOnCanvas
} from './helpers'

const FORBIDDEN = ['Brief Direction', 'Target model', 'Must preserve', 'Must avoid', '>Goal<']

test('TEST 5 — HTML, JPG and PDF exports contain the brief and nothing else', async () => {
  const dataDir = makeDataDir('exports')
  const exportDir = makeDataDir('exports-out')
  const { app, page } = await launchApp(dataDir, { SMART_BRIEF_EXPORT_DIR: exportDir })

  // Two-page brief with annotations and instructions.
  await dropPng(page, '[data-testid="empty-state"]', makePng(800, 500, [190, 205, 225]), 'p1.png')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.2, 0.2, 0.5, 0.45)
  await page.keyboard.type('Move the signup button above the fold.')
  await page.fill('[data-testid="overall-message"]', 'Overall: simplify the header.')

  await dropPng(page, '.workspace', makePng(700, 900, [225, 195, 195]), 'p2.png')
  await page.waitForSelector('[data-testid="page-canvas-1"] canvas')
  await dragOnCanvas(page, '[data-testid="page-canvas-1"]', 0.3, 0.3, 0.6, 0.6)
  await page.keyboard.type('Second page instruction text.')

  await page.fill('[data-testid="project-title"]', 'Export Test Brief')
  await waitForSaved(page)

  // Export all three formats.
  await page.click('[data-testid="export-button"]')
  await page.click('[data-testid="export-html"]')
  await expect(page.locator('[data-testid="export-result"]')).toBeVisible({ timeout: 30000 })
  await page.click('[data-testid="export-jpg"]')
  await expect(page.locator('[data-testid="export-result"]')).toContainText('.jpg', {
    timeout: 30000
  })
  await page.click('[data-testid="export-pdf"]')
  await expect(page.locator('[data-testid="export-result"]')).toContainText('.pdf', {
    timeout: 45000
  })

  const files = fs.readdirSync(exportDir)
  const htmlFile = files.find((f) => f.endsWith('.html'))
  const jpgFiles = files.filter((f) => f.endsWith('.jpg'))
  const pdfFile = files.find((f) => f.endsWith('.pdf'))
  expect(htmlFile).toBeTruthy()
  expect(jpgFiles.length).toBeGreaterThan(0)
  expect(pdfFile).toBeTruthy()
  for (const f of [htmlFile!, ...jpgFiles, pdfFile!]) {
    expect(fs.statSync(path.join(exportDir, f)).size).toBeGreaterThan(1000)
  }

  // HTML content checks.
  const html = fs.readFileSync(path.join(exportDir, htmlFile!), 'utf8')
  expect(html).toContain('Export Test Brief')
  expect(html).toContain('Move the signup button above the fold.')
  expect(html).toContain('Second page instruction text.')
  expect(html).toContain('Overall: simplify the header.')
  expect(html).toContain('data:image/jpeg') // embedded, self-contained
  for (const term of FORBIDDEN) {
    expect(html).not.toContain(term)
  }

  // Render the exported HTML in a plain browser and verify images appear.
  const browser = await chromium.launch()
  const htmlPage = await browser.newPage()
  await htmlPage.goto(`file://${path.join(exportDir, htmlFile!)}`)
  await expect(htmlPage.locator('.page-image')).toHaveCount(2)
  const naturalWidth = await htmlPage
    .locator('.page-image')
    .first()
    .evaluate((img: HTMLImageElement) => img.naturalWidth)
  expect(naturalWidth).toBeGreaterThan(100)
  await htmlPage.screenshot({
    path: path.join('screenshots', 'exported-html.png'),
    fullPage: true
  })
  await browser.close()

  await closeApp({ app, page })
})
