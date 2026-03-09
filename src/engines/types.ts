export interface ScrnsPage {
  goto(url: string): Promise<void>
  setViewportSize(size: { width: number; height: number }): Promise<void>
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>
  screenshot(opts?: { path?: string; timeout?: number }): Promise<Buffer>
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
}

export interface ScrnsBrowser {
  newPage(): Promise<ScrnsPage>
  close(): Promise<void>
}

export interface ScrnsEngine {
  name: string
  launch(opts: { headless: boolean; args?: string[] }): Promise<ScrnsBrowser>
}
