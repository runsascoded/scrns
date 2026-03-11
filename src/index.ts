import { isAbsolute, dirname, resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { spawn, execFileSync } from 'child_process'
import * as gifencModule from 'gifenc'
// gifenc is CJS; handle both ESM interop shapes (namespace vs default-wrapped)
const gifenc = ('default' in gifencModule && typeof (gifencModule as any).default === 'object')
  ? (gifencModule as any).default
  : gifencModule
const { GIFEncoder, quantize, applyPalette } = gifenc
import { PNG } from 'pngjs'

export type { ScrnsEngine, ScrnsBrowser, ScrnsPage } from './engines/types.js'
export type { EngineName } from './engines/resolve.js'
export { resolveEngine } from './engines/resolve.js'

export type ScreenshotConfig = {
  /** Output path (relative to outputDir, or absolute). Defaults to `{name}.png` */
  path?: string
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
  /** Additional browser launch args for this screenshot */
  browserArgs?: string[]
  /** Override headless mode for this screenshot (default: true) */
  headless?: boolean
  /** Timeout in ms for page.screenshot() calls (default: 30000) */
  screenshotTimeout?: number
}

export type ScreencastAction =
  | { type: 'wait', duration: number }
  | { type: 'keydown', key: string }
  | { type: 'keyup', key: string }
  | { type: 'key', key: string, duration: number }
  | { type: 'type', text: string }
  | { type: 'click', x: number, y: number, button?: 'left' | 'right' }
  | { type: 'drag', from: [number, number], to: [number, number], duration: number, button?: 'left' | 'right' }
  | { type: 'animate', frames: number, eval: string, frameDelay?: number }

export type ScreencastConfig = ScreenshotConfig & {
  /** Presence of `actions` distinguishes a screencast from a screenshot */
  actions: ScreencastAction[]
  /** Frames per second for GIF capture (default: 15) */
  fps?: number
  /** GIF quality: 1-30, lower = better (default: 10) */
  gifQuality?: number
  /** Whether the GIF should loop (default: true) */
  loop?: boolean
  /** CRF quality for video output (default: 23, lower = better) */
  videoCrf?: number
}

export function isScreencast(config: ScreenshotConfig | ScreencastConfig): config is ScreencastConfig {
  return 'actions' in config && Array.isArray(config.actions)
}

export type Screens = Record<string, ScreenshotConfig | ScreencastConfig>

export type Config = {
  engine?: 'puppeteer' | 'playwright'
  host?: string | number
  https?: boolean
  output?: string
  selector?: string
  loadTimeout?: number
  downloadSleep?: number
  browserArgs?: string[]
  headless?: boolean
  screenshotTimeout?: number
  docker?: boolean
  dockerImage?: string
  dockerPlatform?: string
  screenshots: Screens
}

/** Screenshot entry keys that distinguish a ScreenshotConfig from a nested Screens */
const SCREENSHOT_KEYS = ['query', 'width', 'height', 'selector', 'loadTimeout', 'path', 'preScreenshotSleep', 'scrollY', 'scrollTo', 'scrollOffset', 'download', 'downloadSleep', 'actions', 'fps', 'gifQuality', 'loop', 'videoCrf', 'browserArgs', 'headless', 'screenshotTimeout'] as const

function isScreens(value: unknown): value is Screens {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && !SCREENSHOT_KEYS.some(k => k in value)
}

export function parseConfig(
  config: Screens | Config,
): { screens: Screens, options: Partial<Config> } {
  if ('screenshots' in config && isScreens(config.screenshots)) {
    const { screenshots, ...options } = config as Config
    return { screens: screenshots, options }
  }
  return { screens: config as Screens, options: {} }
}

export function resolveBaseUrl(host?: string | number, https?: boolean): string {
  let h: string = host == null ? '127.0.0.1:3000' : String(host)
  if (h.match(/^\d+$/)) h = `127.0.0.1:${h}`
  return `${https ? 'https' : 'http'}://${h}`
}

import type { ScrnsEngine, ScrnsPage } from './engines/types.js'
import type { EngineName } from './engines/resolve.js'
import { resolveEngine } from './engines/resolve.js'

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
  /** Browser engine (resolved automatically if not provided) */
  engine?: ScrnsEngine
  /** Additional browser launch args (merged with defaults and per-screenshot args) */
  browserArgs?: string[]
  /** Default headless mode (default: true) */
  headless?: boolean
  /** Default screenshot timeout in ms (default: 30000) */
  defaultScreenshotTimeout?: number
}

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 560
const DEFAULT_LOAD_TIMEOUT = 30000
const DEFAULT_DOWNLOAD_SLEEP = 1000
const DEFAULT_SCREENSHOT_TIMEOUT = 30000

const BASE_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-skia-runtime-opts',
  '--force-device-scale-factor=1',
]

function parseKeys(key: string): string[] {
  return key.split('+')
}

async function executeActions(
  page: ScrnsPage,
  actions: ScreencastAction[],
  log: (message: string) => void,
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'wait':
        log(`  action: wait ${action.duration}ms`)
        await sleep(action.duration)
        break
      case 'keydown':
        log(`  action: keydown ${action.key}`)
        for (const k of parseKeys(action.key)) await page.keyboard.down(k)
        break
      case 'keyup':
        log(`  action: keyup ${action.key}`)
        for (const k of parseKeys(action.key).reverse()) await page.keyboard.up(k)
        break
      case 'key': {
        log(`  action: key ${action.key} ${action.duration}ms`)
        const keys = parseKeys(action.key)
        for (const k of keys) await page.keyboard.down(k)
        await sleep(action.duration)
        for (const k of keys.reverse()) await page.keyboard.up(k)
        break
      }
      case 'type':
        log(`  action: type "${action.text}"`)
        await page.keyboard.type(action.text)
        break
      case 'click':
        log(`  action: click (${action.x}, ${action.y})`)
        await page.mouse.click(action.x, action.y, { button: action.button ?? 'left' })
        break
      case 'drag': {
        log(`  action: drag (${action.from}) → (${action.to}) ${action.duration}ms`)
        const button = action.button ?? 'left'
        await page.mouse.move(action.from[0], action.from[1])
        await page.mouse.down({ button })
        const steps = Math.ceil(action.duration / 16)
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const x = action.from[0] + t * (action.to[0] - action.from[0])
          const y = action.from[1] + t * (action.to[1] - action.from[1])
          await page.mouse.move(x, y)
          await sleep(16)
        }
        await page.mouse.up({ button })
        break
      }
    }
  }
}

function encodeGif(
  frames: Buffer[],
  path: string,
  width: number,
  height: number,
  fps: number,
  loop: boolean,
  log: (message: string) => void,
): void {
  log(`Encoding GIF: ${frames.length} frames...`)
  const gif = GIFEncoder()
  const delay = Math.round(1000 / fps)
  for (const frame of frames) {
    const png = PNG.sync.read(frame)
    const { data } = png
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, width, height, { palette, delay })
  }
  gif.finish()
  writeFileSync(path, gif.bytesView())
  if (!loop) {
    // gifenc loops by default; to disable, patch the Netscape extension byte
    // For now, looping is always on (gifenc default)
  }
  log(`Saved screencast: ${path}`)
}

function hasAnimateAction(actions: ScreencastAction[]): boolean {
  return actions.some(a => a.type === 'animate')
}

const VIDEO_EXTS = ['.mp4', '.mkv', '.mov', '.webm'] as const

function isVideoExt(path: string): boolean {
  return VIDEO_EXTS.some(ext => path.endsWith(ext))
}

function codecForExt(path: string): string {
  if (path.endsWith('.webm')) return 'libvpx-vp9'
  return 'libx264'
}

function assertFfmpeg(): void {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }) }
  catch { throw new Error('ffmpeg not found. Install it to use video output:\n  brew install ffmpeg    # macOS\n  apt install ffmpeg     # Ubuntu/Debian') }
}

interface FrameSink {
  write(frame: Buffer): void
  finish(): void | Promise<void>
}

function createGifSink(
  path: string,
  width: number,
  height: number,
  fps: number,
  loop: boolean,
  log: (message: string) => void,
): FrameSink {
  const frames: Buffer[] = []
  return {
    write(frame: Buffer) { frames.push(frame) },
    finish() { encodeGif(frames, path, width, height, fps, loop, log) },
  }
}

function createVideoSink(
  path: string,
  fps: number,
  crf: number,
  log: (message: string) => void,
): FrameSink {
  assertFfmpeg()
  const codec = codecForExt(path)
  const args = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-i', '-',
    '-c:v', codec,
    '-pix_fmt', 'yuv420p',
  ]
  if (codec === 'libvpx-vp9') {
    args.push('-crf', String(crf), '-b:v', '0')
  } else {
    args.push('-crf', String(crf))
  }
  args.push(path)
  const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  ffmpeg.stderr!.on('data', (data: Buffer) => { stderr += data.toString() })
  return {
    write(frame: Buffer) { ffmpeg.stdin!.write(frame) },
    async finish() {
      ffmpeg.stdin!.end()
      await new Promise<void>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            log(`Saved screencast: ${path}`)
            resolve()
          } else {
            reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
          }
        })
        ffmpeg.on('error', reject)
      })
    },
  }
}

function createSink(
  path: string,
  width: number,
  height: number,
  config: ScreencastConfig,
  log: (message: string) => void,
): FrameSink {
  const { fps = 15, loop = true, videoCrf = 23 } = config
  if (isVideoExt(path)) {
    return createVideoSink(path, fps, videoCrf, log)
  }
  return createGifSink(path, width, height, fps, loop, log)
}

async function recordFrameByFrame(
  page: ScrnsPage,
  config: ScreencastConfig,
  path: string,
  width: number,
  height: number,
  log: (message: string) => void,
  screenshotTimeout?: number,
): Promise<void> {
  const { actions, fps = 15 } = config
  const sink = createSink(path, width, height, config, log)
  const ssOpts = screenshotTimeout ? { timeout: screenshotTimeout } : undefined

  log(`Recording frame-by-frame screencast...`)

  for (const action of actions) {
    switch (action.type) {
      case 'animate': {
        log(`  animate: ${action.frames} frames`)
        for (let i = 0; i < action.frames; i++) {
          await page.evaluate(`(${action.eval})(${i}, ${action.frames})`)
          await page.evaluate(() => new Promise<void>(r =>
            requestAnimationFrame(() => requestAnimationFrame(() => r()))
          ))
          if (action.frameDelay) await sleep(action.frameDelay)
          const frame = await page.screenshot(ssOpts)
          sink.write(frame)
          if ((i + 1) % 10 === 0 || i === action.frames - 1) {
            log(`    frame ${i + 1}/${action.frames}`)
          }
        }
        break
      }
      case 'wait': {
        const staticFrames = Math.ceil(action.duration * fps / 1000)
        log(`  wait: ${action.duration}ms (${staticFrames} static frames)`)
        const frame = await page.screenshot(ssOpts)
        for (let i = 0; i < staticFrames; i++) sink.write(frame)
        break
      }
      default:
        await executeActions(page, [action], log)
        break
    }
  }

  await sink.finish()
}

async function recordScreencastRealtime(
  page: ScrnsPage,
  config: ScreencastConfig,
  path: string,
  width: number,
  height: number,
  log: (message: string) => void,
  screenshotTimeout?: number,
): Promise<void> {
  const { actions, fps = 15 } = config
  const frameInterval = 1000 / fps
  const sink = createSink(path, width, height, config, log)
  const ssOpts = screenshotTimeout ? { timeout: screenshotTimeout } : undefined

  // Signal the page that capture is about to start
  await page.evaluate(() => document.dispatchEvent(new Event('scrns:capture-start')))

  let recording = true
  const captureLoop = (async () => {
    while (recording) {
      const start = Date.now()
      const frame = await page.screenshot(ssOpts)
      sink.write(frame)
      const elapsed = Date.now() - start
      if (elapsed < frameInterval) await sleep(frameInterval - elapsed)
    }
  })()

  await executeActions(page, actions, log)

  recording = false
  await captureLoop

  await sink.finish()
}

/** SwiftShader-related args that should be filtered out in headful mode */
const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--use-gl=swiftshader']

export async function takeScreenshots(
  screens: Screens,
  options: ScreenshotsOptions,
): Promise<void> {
  const {
    baseUrl,
    outputDir,
    defaultSelector,
    defaultLoadTimeout = DEFAULT_LOAD_TIMEOUT,
    defaultDownloadSleep = DEFAULT_DOWNLOAD_SLEEP,
    defaultScreenshotTimeout = DEFAULT_SCREENSHOT_TIMEOUT,
    include,
    log = console.log,
  } = options
  const defaultHeadless = options.headless ?? true

  const engine = options.engine ?? await resolveEngine()

  // Filter entries, preserving order
  const entries = Object.entries(screens)
    .filter(([name]) => !include || name.match(include))

  // Group by effective headless mode
  const groups = new Map<boolean, [string, ScreenshotConfig | ScreencastConfig][]>()
  for (const entry of entries) {
    const headless = entry[1].headless ?? defaultHeadless
    if (!groups.has(headless)) groups.set(headless, [])
    groups.get(headless)!.push(entry)
  }

  for (const [headless, groupEntries] of groups) {
    // Collect per-shot browserArgs for this group
    const perShotArgs = groupEntries.flatMap(([, s]) => s.browserArgs ?? [])
    let args = [
      ...BASE_BROWSER_ARGS,
      ...(options.browserArgs ?? []),
      ...perShotArgs,
    ]
    // In headful mode, filter out SwiftShader args unless a shot explicitly sets them
    if (!headless) {
      const explicitArgs = new Set(groupEntries.flatMap(([, s]) => s.browserArgs ?? []))
      args = args.filter(a => !SWIFTSHADER_ARGS.includes(a) || explicitArgs.has(a))
    }

    const browser = await engine.launch({ headless, args })
    const page = await browser.newPage()

    try {
      for (const [name, config] of groupEntries) {
        const screenshotTimeout = config.screenshotTimeout ?? defaultScreenshotTimeout
        const ssOpts: { path?: string; timeout?: number } = { timeout: screenshotTimeout }

        const {
          path: configPath,
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
        const defaultExt = isScreencast(config) ? '.gif' : '.png'
        const defaultPath = `${name}${defaultExt}`
        const path = configPath
          ? (isAbsolute(configPath) ? configPath : resolve(outputDir, configPath))
          : resolve(outputDir, defaultPath)

        // Ensure output directory exists
        mkdirSync(dirname(path), { recursive: true })

        if (download) {
          log(`Setting download behavior to ${outputDir}`)
          await page.setDownloadPath(outputDir)
        }

        log(`Loading ${url}`)
        await page.goto(url)
        log(`Loaded ${url}`)

        await page.setViewportSize({ width, height })
        log('Set viewport')

        if (selector) {
          await page.waitForSelector(selector, { timeout: loadTimeout })
          log(`Found selector: ${selector}`)
        }

        if (scrollTo) {
          const scrolled = await page.evaluate(
            ([sel, offset]: [string, number]) => {
              const el = document.querySelector(sel)
              if (!el) return null
              const rect = el.getBoundingClientRect()
              const y = window.scrollY + rect.top - offset
              window.scrollTo(0, y)
              return y
            },
            [scrollTo, scrollOffset] as [string, number],
          )
          if (scrolled !== null) {
            log(`Scrolled to ${scrollTo} at Y: ${scrolled}`)
          } else {
            log(`Warning: scrollTo selector "${scrollTo}" not found`)
          }
        } else if (scrollY > 0) {
          await page.evaluate((y: number) => window.scrollTo(0, y), scrollY)
          log(`Scrolled to Y: ${scrollY}`)
        }

        if (preScreenshotSleep > 0) {
          await sleep(preScreenshotSleep)
        }

        if (download) {
          await sleep(downloadSleep)
          log('Download complete')
        } else if (isScreencast(config)) {
          if (hasAnimateAction(config.actions)) {
            await recordFrameByFrame(page, config, path, width, height, log, screenshotTimeout)
          } else {
            await recordScreencastRealtime(page, config, path, width, height, log, screenshotTimeout)
          }
        } else {
          ssOpts.path = path
          await page.screenshot(ssOpts)
          log(`Saved screenshot: ${path}`)
        }
      }
    } finally {
      await browser.close()
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type PreviewResult = {
  url: string
  query: string
  width: number
  height: number
}

export async function previewScreenshot(
  config: ScreenshotConfig,
  options: {
    baseUrl: string
    outputDir: string
    defaultSelector?: string
    defaultLoadTimeout?: number
    log?: (message: string) => void
    engine?: ScrnsEngine
    browserArgs?: string[]
  },
): Promise<PreviewResult> {
  const {
    baseUrl,
    outputDir,
    defaultSelector,
    defaultLoadTimeout = DEFAULT_LOAD_TIMEOUT,
    log = (...args: unknown[]) => console.error(...args),
  } = options

  const {
    path: configPath,
    query = '',
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    selector = defaultSelector,
    loadTimeout = defaultLoadTimeout,
  } = config

  const url = `${baseUrl}/${query}`

  const engine = options.engine ?? await resolveEngine()
  const args = [
    ...BASE_BROWSER_ARGS,
    ...(options.browserArgs ?? []),
    ...(config.browserArgs ?? []),
  ]
  const browser = await engine.launch({ headless: false, args })
  const page = await browser.newPage()

  try {
    await page.setViewportSize({ width, height })
    log(`Loading ${url}`)
    await page.goto(url)

    if (selector) {
      await page.waitForSelector(selector, { timeout: loadTimeout })
      log(`Found selector: ${selector}`)
    }

    // Inject Ctrl+Shift+S capture shortcut
    await page.evaluate(() => {
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
          e.preventDefault()
          ;(window as any).__scrns_capture = true
        }
      })
    })

    log('Press Enter here or Ctrl+Shift+S in the browser to capture')

    // Race: stdin Enter vs browser Ctrl+Shift+S
    await Promise.race([
      new Promise<void>(resolve => {
        process.stdin.setRawMode?.(false)
        process.stdin.once('data', () => resolve())
      }),
      (async () => {
        while (true) {
          const captured = await page.evaluate(() => (window as any).__scrns_capture)
          if (captured) return
          await sleep(200)
        }
      })(),
    ])

    const state = await page.evaluate(() => ({
      url: window.location.href,
      query: window.location.search + window.location.hash,
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    // Take screenshot
    const defaultPath = `preview.png`
    const outPath = configPath
      ? (isAbsolute(configPath) ? configPath : resolve(outputDir, configPath))
      : resolve(outputDir, defaultPath)
    mkdirSync(dirname(outPath), { recursive: true })
    await page.screenshot({ path: outPath })
    log(`Saved screenshot: ${outPath}`)

    return state
  } finally {
    await browser.close()
  }
}
