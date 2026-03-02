import type { ScrnsEngine, ScrnsBrowser, ScrnsPage } from './types.js'

export async function createPuppeteerEngine(): Promise<ScrnsEngine> {
  const puppeteer = (await import('puppeteer')).default
  return {
    name: 'puppeteer',
    async launch(opts) {
      const browser = await puppeteer.launch({
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
      await page.setViewport(size)
    },
    async waitForSelector(selector: string, opts?: { timeout?: number }) {
      await page.waitForSelector(selector, opts)
    },
    async screenshot(opts?: { path?: string }): Promise<Buffer> {
      const result = await page.screenshot({
        path: opts?.path,
        encoding: 'binary',
      })
      return Buffer.from(result)
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
      const client = await page.createCDPSession()
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: dir,
      })
    },
  }
}
