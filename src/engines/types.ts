export type Clip = { x: number; y: number; width: number; height: number }

export interface ScreenshotOptions {
  path?: string
  timeout?: number
  /** Region to capture, in document (not viewport) CSS-pixel coordinates */
  clip?: Clip
}

export interface ScrnsPage {
  goto(url: string): Promise<void>
  setViewportSize(size: { width: number; height: number }): Promise<void>
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>
  screenshot(opts?: ScreenshotOptions): Promise<Buffer>
  evaluate<R>(pageFunction: string | ((...args: any[]) => R), arg?: any): Promise<R>
  keyboard: {
    down(key: string): Promise<void>
    up(key: string): Promise<void>
    type(text: string): Promise<void>
  }
  mouse: {
    click(x: number, y: number, opts?: { button?: 'left' | 'right' }): Promise<void>
    move(x: number, y: number): Promise<void>
    down(opts?: { button?: 'left' | 'right' }): Promise<void>
    up(opts?: { button?: 'left' | 'right' }): Promise<void>
  }
  setDownloadPath(dir: string): Promise<void>
  close(): Promise<void>
}

export type ColorScheme = 'light' | 'dark'

export interface PageOptions {
  /** Extra HTTP headers sent with every request from the page */
  headers?: Record<string, string>
  /** Device scale factor (default: 1) */
  scale?: number
  /** Path to a Playwright storage-state JSON (cookies + localStorage); Playwright only */
  storageState?: string
  /** Emulated `prefers-color-scheme` (default: light) */
  colorScheme?: ColorScheme
}

export interface ScrnsBrowser {
  newPage(opts?: PageOptions): Promise<ScrnsPage>
  close(): Promise<void>
}

export interface ScrnsEngine {
  name: string
  launch(opts: { headless: boolean; args?: string[] }): Promise<ScrnsBrowser>
}
