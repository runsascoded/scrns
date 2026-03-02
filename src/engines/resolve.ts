import type { ScrnsEngine } from './types.js'
import { createPuppeteerEngine } from './puppeteer.js'
import { createPlaywrightEngine } from './playwright.js'

export type EngineName = 'puppeteer' | 'playwright'

export async function resolveEngine(preference?: EngineName): Promise<ScrnsEngine> {
  if (preference === 'playwright') return createPlaywrightEngine()
  if (preference === 'puppeteer') return createPuppeteerEngine()
  // Auto-detect: prefer puppeteer (still a regular dep in Phase 1)
  try { return await createPuppeteerEngine() }
  catch { /* not installed */ }
  try { return await createPlaywrightEngine() }
  catch { /* not installed */ }
  throw new Error(
    'No browser engine found. Install either:\n' +
    '  pnpm add puppeteer     # default\n' +
    '  pnpm add playwright    # alternative',
  )
}
