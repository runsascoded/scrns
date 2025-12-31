import puppeteer, { Browser, Page } from 'puppeteer'

export type ScreenshotConfig = {
  /** URL path/query (appended to baseUrl) */
  query?: string
  /** Viewport width (default: 800) */
  width?: number
  /** Viewport height (default: 560) */
  height?: number
  /** CSS selector to wait for before capturing (default: none) */
  selector?: string
  /** Timeout in ms for selector wait (default: 30000) */
  loadTimeout?: number
  /** Sleep in ms before taking screenshot (default: 0) */
  preScreenshotSleep?: number
  /** Scroll Y pixels before screenshot (default: 0) */
  scrollY?: number
  /** CSS selector to scroll into view before screenshot */
  scrollTo?: string
  /** Offset in pixels above the scrollTo element (positive = more space above) */
  scrollOffset?: number
  /** If true, set download behavior instead of taking screenshot */
  download?: boolean
  /** Sleep in ms while waiting for download (default: 1000) */
  downloadSleep?: number
}

export type ScreenshotsMap = Record<string, ScreenshotConfig>

export type ScreenshotsOptions = {
  /** Base URL (scheme + host) */
  baseUrl: string
  /** Output directory for screenshots */
  outputDir: string
  /** Default selector to wait for */
  defaultSelector?: string
  /** Default load timeout in ms */
  defaultLoadTimeout?: number
  /** Default download sleep in ms */
  defaultDownloadSleep?: number
  /** Filter: only process screenshots matching this regex */
  include?: RegExp
  /** Callback for logging */
  log?: (message: string) => void
}

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 560
const DEFAULT_LOAD_TIMEOUT = 30000
const DEFAULT_DOWNLOAD_SLEEP = 1000

export async function takeScreenshots(
  screens: ScreenshotsMap,
  options: ScreenshotsOptions,
): Promise<void> {
  const {
    baseUrl,
    outputDir,
    defaultSelector,
    defaultLoadTimeout = DEFAULT_LOAD_TIMEOUT,
    defaultDownloadSleep = DEFAULT_DOWNLOAD_SLEEP,
    include,
    log = console.log,
  } = options

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()

  try {
    for (const [name, config] of Object.entries(screens)) {
      if (include && !name.match(include)) {
        log(`Skipping ${name}`)
        continue
      }

      const {
        query = '',
        width = DEFAULT_WIDTH,
        height = DEFAULT_HEIGHT,
        selector = defaultSelector,
        loadTimeout = defaultLoadTimeout,
        preScreenshotSleep = 0,
        scrollY = 0,
        scrollTo,
        scrollOffset = 0,
        download = false,
        downloadSleep = defaultDownloadSleep,
      } = config

      const url = `${baseUrl}/${query}`
      const path = `${outputDir}/${name}.png`

      if (download) {
        log(`Setting download behavior to ${outputDir}`)
        const client = await page.createCDPSession()
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: outputDir,
        })
      }

      log(`Loading ${url}`)
      await page.goto(url)
      log(`Loaded ${url}`)

      await page.setViewport({ width, height })
      log('Set viewport')

      if (selector) {
        await page.waitForSelector(selector, { timeout: loadTimeout })
        log(`Found selector: ${selector}`)
      }

      if (scrollTo) {
        const scrolled = await page.evaluate((sel, offset) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const rect = el.getBoundingClientRect()
          const y = window.scrollY + rect.top - offset
          window.scrollTo(0, y)
          return y
        }, scrollTo, scrollOffset)
        if (scrolled !== null) {
          log(`Scrolled to ${scrollTo} at Y: ${scrolled}`)
        } else {
          log(`Warning: scrollTo selector "${scrollTo}" not found`)
        }
      } else if (scrollY > 0) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY)
        log(`Scrolled to Y: ${scrollY}`)
      }

      if (preScreenshotSleep > 0) {
        await sleep(preScreenshotSleep)
      }

      if (!download) {
        await page.screenshot({ path })
        log(`Saved screenshot: ${path}`)
      } else {
        await sleep(downloadSleep)
        log('Download complete')
      }
    }
  } finally {
    await browser.close()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export { Browser, Page }
