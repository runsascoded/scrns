import type { ScrnsEngine, ScrnsBrowser, ScrnsPage } from './types.js'

export async function createPlaywrightEngine(): Promise<ScrnsEngine> {
  const { chromium } = await import('playwright')
  return {
    name: 'playwright',
    async launch(opts) {
      const browser = await chromium.launch({
        headless: opts.headless,
        args: opts.args,
      })
      return wrapBrowser(browser)
    },
  }
}

function wrapBrowser(browser: any): ScrnsBrowser {
  return {
    async newPage() {
      const page = await browser.newPage()
      return wrapPage(page)
    },
    async close() {
      await browser.close()
    },
  }
}

function wrapPage(page: any): ScrnsPage {
  return {
    async goto(url: string) {
      await page.goto(url)
    },
    async setViewportSize(size: { width: number; height: number }) {
      await page.setViewportSize(size)
    },
    async waitForSelector(selector: string, opts?: { timeout?: number }) {
      // Use state: 'attached' to match Puppeteer's behavior (exists in DOM),
      // rather than Playwright's default 'visible' which can fail on hidden SVG elements etc.
      await page.waitForSelector(selector, { ...opts, state: 'attached' })
    },
    async screenshot(opts?: { path?: string; timeout?: number }): Promise<Buffer> {
      return page.screenshot({ path: opts?.path, timeout: opts?.timeout })
    },
    async evaluate<R>(pageFunction: string | ((...args: any[]) => R), arg?: any): Promise<R> {
      if (arg !== undefined) {
        return page.evaluate(pageFunction, arg)
      }
      return page.evaluate(pageFunction)
    },
    keyboard: {
      async down(key: string) { await page.keyboard.down(key) },
      async up(key: string) { await page.keyboard.up(key) },
      async type(text: string) { await page.keyboard.type(text) },
    },
    mouse: {
      async click(x: number, y: number, opts?: { button?: 'left' | 'right' }) {
        await page.mouse.click(x, y, opts)
      },
      async move(x: number, y: number) {
        await page.mouse.move(x, y)
      },
      async down(opts?: { button?: 'left' | 'right' }) {
        await page.mouse.down(opts)
      },
      async up(opts?: { button?: 'left' | 'right' }) {
        await page.mouse.up(opts)
      },
    },
    async setDownloadPath(dir: string) {
      const session = await page.context().newCDPSession(page)
      await session.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: dir,
      })
    },
  }
}
