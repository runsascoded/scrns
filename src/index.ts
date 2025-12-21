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
