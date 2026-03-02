import type { ScrnsEngine } from './types.js'
import { createPuppeteerEngine } from './puppeteer.js'
import { createPlaywrightEngine } from './playwright.js'

export type EngineName = 'puppeteer' | 'playwright'

export async function resolveEngine(preference?: EngineName): Promise<ScrnsEngine> {
  if (preference === 'playwright') return createPlaywrightEngine()
  if (preference === 'puppeteer') return createPuppeteerEngine()
  // Auto-detect: prefer playwright
  try { return await createPlaywrightEngine() }
  catch { /* not installed */ }
  try { return await createPuppeteerEngine() }
  catch { /* not installed */ }
  throw new Error(
    'No browser engine found. Install either:\n' +
    '  pnpm add playwright    # recommended\n' +
    '  pnpm add puppeteer     # alternative',
  )
}
