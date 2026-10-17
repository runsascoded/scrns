import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { takeScreenshots, resolveEngine, ScreencastConfig, Screens, Config, parseConfig, resolveBaseUrl, expandHeaders, headerEnvRefs } from '../src/index.js'
import type { ScrnsEngine, EngineName, ColorScheme } from '../src/index.js'
import { spawn, execFileSync, execSync, ChildProcess } from 'child_process'
import { existsSync, rmSync, mkdirSync, readFileSync, statSync } from 'fs'
import { createServer, Server } from 'http'
import { resolve } from 'path'
import { PNG } from 'pngjs'

function pngDims(path: string): { width: number, height: number } {
  const { width, height } = PNG.sync.read(readFileSync(path))
  return { width, height }
}

/** RGB of the pixel at (x, y) */
function pngPixel(path: string, x: number, y: number): [number, number, number] {
  const { width, data } = PNG.sync.read(readFileSync(path))
  const i = 4 * (y * width + x)
  return [data[i], data[i + 1], data[i + 2]]
}

function gifDims(path: string): { width: number, height: number } {
  // Logical screen descriptor, right after the 6-byte header
  const buf = readFileSync(path)
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
}

/** Count frames in a GIF by parsing the block structure (not naive byte scanning). */
function countGifFrames(buf: Buffer): number {
  let i = 13 // skip header (6) + logical screen descriptor (7)
  // Skip global color table if present
  const packed = buf[10]
  if (packed & 0x80) {
    const gctSize = 3 * (1 << ((packed & 0x07) + 1))
    i += gctSize
  }
  let frames = 0
  while (i < buf.length) {
    const block = buf[i]
    if (block === 0x3B) break // trailer
    if (block === 0x21) {
      // extension block
      i += 2 // extension introducer + label
      while (i < buf.length) {
        const subBlockSize = buf[i]
        i++
        if (subBlockSize === 0) break
        i += subBlockSize
      }
    } else if (block === 0x2C) {
      // image descriptor
      frames++
      i += 10 // image separator + descriptor (9 bytes after separator)
      // Skip local color table if present
      const imgPacked = buf[i - 1]
      if (imgPacked & 0x80) {
        const lctSize = 3 * (1 << ((imgPacked & 0x07) + 1))
        i += lctSize
      }
      i++ // LZW minimum code size
      // Skip sub-blocks
      while (i < buf.length) {
        const subBlockSize = buf[i]
        i++
        if (subBlockSize === 0) break
        i += subBlockSize
      }
    } else {
      break // unknown block
    }
  }
  return frames
}

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function hasEngine(name: EngineName): Promise<boolean> {
  try {
    await resolveEngine(name)
    return true
  } catch {
    return false
  }
}

const TEST_PORT = 9876
const AUTH_PORT = 9877
const AUTH_TOKEN = 'test-token'
const BASE_TEST_DIR = resolve(import.meta.dirname, 'output')
const FIXTURE_DIR = resolve(import.meta.dirname)

let server: ChildProcess

/** Requests to the auth server: [path, Authorization, X-Global] */
type AuthRequest = [string, string | undefined, string | undefined]
let authRequests: AuthRequest[] = []
let authServer: Server

// Detect available engines
const availableEngines: EngineName[] = []
if (await hasEngine('puppeteer')) availableEngines.push('puppeteer')
if (await hasEngine('playwright')) availableEngines.push('playwright')

beforeAll(async () => {
  // Clean output dir
  if (existsSync(BASE_TEST_DIR)) {
    rmSync(BASE_TEST_DIR, { recursive: true })
  }
  mkdirSync(BASE_TEST_DIR, { recursive: true })

  // Start static server
  server = spawn('npx', ['serve', FIXTURE_DIR, '-p', String(TEST_PORT), '-L'], {
    stdio: 'pipe',
  })

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000)
    server.stdout?.on('data', (data) => {
      if (data.toString().includes('Accepting connections')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  // 401s without `Authorization: Bearer <AUTH_TOKEN>`; the authed page `fetch`es `/api`, then renders `#authed`
  authServer = createServer((req, res) => {
    const auth = req.headers['authorization']
    const path = req.url ?? ''
    if (path !== '/auth.html' && path !== '/api') {
      res.writeHead(404).end()
      return
    }
    authRequests.push([path, auth, req.headers['x-global'] as string | undefined])
    if (auth !== `Bearer ${AUTH_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'text/plain' }).end('unauthorized')
    } else if (path === '/api') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(
        `<body><script>fetch('/api').then(r => { if (r.ok) document.body.innerHTML = '<div id="authed">ok</div>' })</script></body>`,
      )
    }
  })
  await new Promise<void>(resolve => authServer.listen(AUTH_PORT, '127.0.0.1', resolve))
})

afterAll(() => {
  server?.kill()
  authServer?.close()
})

describe.each(availableEngines)('scrns e2e (%s)', (engineName) => {
  let engine: ScrnsEngine
  let testDir: string

  beforeAll(async () => {
    engine = await resolveEngine(engineName)
    testDir = resolve(BASE_TEST_DIR, engineName)
    mkdirSync(testDir, { recursive: true })
  })

  it('takes a basic screenshot', async () => {
    await takeScreenshots({
      'basic': {
        query: 'fixture.html',
        width: 800,
        height: 600,
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      engine,
    })

    expect(existsSync(resolve(testDir, 'basic.png'))).toBe(true)
  })

  it('waits for selector before screenshot', async () => {
    await takeScreenshots({
      'selector': {
        query: 'fixture.html',
        selector: '#loaded',
        width: 800,
        height: 600,
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      engine,
    })

    expect(existsSync(resolve(testDir, 'selector.png'))).toBe(true)
  })

  it('scrolls to element before screenshot', async () => {
    await takeScreenshots({
      'scroll-to': {
        query: 'fixture.html',
        scrollTo: '#footer',
        width: 800,
        height: 600,
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      engine,
    })

    expect(existsSync(resolve(testDir, 'scroll-to.png'))).toBe(true)
  })

  it('scrolls by Y pixels before screenshot', async () => {
    await takeScreenshots({
      'scroll-y': {
        query: 'fixture.html',
        scrollY: 200,
        width: 800,
        height: 600,
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      engine,
    })

    expect(existsSync(resolve(testDir, 'scroll-y.png'))).toBe(true)
  })

  it('respects include filter', async () => {
    await takeScreenshots({
      'included': { query: 'fixture.html' },
      'excluded': { query: 'fixture.html' },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      include: /included/,
      log: () => {},
      engine,
    })

    expect(existsSync(resolve(testDir, 'included.png'))).toBe(true)
    expect(existsSync(resolve(testDir, 'excluded.png'))).toBe(false)
  })

  it('uses custom path when specified', async () => {
    await takeScreenshots({
      'custom': {
        query: 'fixture.html',
        path: 'subdir/custom-name.png',
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })

    expect(existsSync(resolve(testDir, 'subdir/custom-name.png'))).toBe(true)
  })

  it('produces a GIF file with correct magic bytes', async () => {
    await takeScreenshots({
      'cast-basic': {
        query: 'screencast-fixture.html',
        width: 200,
        height: 150,
        actions: [
          { type: 'wait', duration: 200 },
        ],
        fps: 10,
      } satisfies ScreencastConfig,
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })

    const gifPath = resolve(testDir, 'cast-basic.gif')
    expect(existsSync(gifPath)).toBe(true)
    const buf = readFileSync(gifPath)
    // GIF89a magic bytes
    expect(buf.subarray(0, 6).toString('ascii')).toBe('GIF89a')
  })

  it('executes actions that affect the page', async () => {
    await takeScreenshots({
      'cast-actions': {
        query: 'screencast-fixture.html',
        width: 200,
        height: 150,
        actions: [
          { type: 'wait', duration: 100 },
          { type: 'key', key: ' ', duration: 50 },
          { type: 'wait', duration: 100 },
          { type: 'key', key: ' ', duration: 50 },
          { type: 'wait', duration: 100 },
        ],
        fps: 10,
      } satisfies ScreencastConfig,
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })

    const gifPath = resolve(testDir, 'cast-actions.gif')
    expect(existsSync(gifPath)).toBe(true)
    const buf = readFileSync(gifPath)
    expect(buf.subarray(0, 6).toString('ascii')).toBe('GIF89a')
    // File should have multiple frames (> a single-frame GIF)
    expect(buf.length).toBeGreaterThan(500)
  })

  it('animate action produces deterministic GIF with exact frame count', async () => {
    const config = {
      'cast-animate': {
        query: 'screencast-fixture.html',
        width: 100,
        height: 80,
        actions: [
          { type: 'animate' as const, frames: 3, eval: '(i) => { window.setColorIndex(i) }' },
        ],
        fps: 10,
      } satisfies ScreencastConfig,
    }
    const opts = {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    }

    // Run 1
    await takeScreenshots(config, opts)
    const gifPath = resolve(testDir, 'cast-animate.gif')
    expect(existsSync(gifPath)).toBe(true)
    const buf1 = readFileSync(gifPath)

    // GIF89a header
    expect(buf1.subarray(0, 6).toString('ascii')).toBe('GIF89a')

    // Verify exact frame count via GIF block structure parsing
    expect(countGifFrames(buf1)).toBe(3)

    // Run 2: idempotent — should produce byte-identical output
    await takeScreenshots(config, opts)
    const buf2 = readFileSync(gifPath)
    expect(Buffer.compare(buf1, buf2)).toBe(0)
  })

  it('defaults to .gif extension when no path specified', async () => {
    await takeScreenshots({
      'cast-default-ext': {
        query: 'screencast-fixture.html',
        width: 200,
        height: 150,
        actions: [
          { type: 'wait', duration: 100 },
        ],
        fps: 10,
      } satisfies ScreencastConfig,
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })

    // Should use .gif extension, not .png
    expect(existsSync(resolve(testDir, 'cast-default-ext.gif'))).toBe(true)
    expect(existsSync(resolve(testDir, 'cast-default-ext.png'))).toBe(false)
  })

  it('`scale: 2` doubles output dimensions', async () => {
    await takeScreenshots({
      'scale-2': { query: 'fixture.html', width: 300, height: 200, scale: 2 },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })
    expect(pngDims(resolve(testDir, 'scale-2.png'))).toEqual({ width: 600, height: 400 })
  })

  it('crops to an off-viewport element, with padding and scale', async () => {
    await takeScreenshots({
      'crop-panel': {
        query: 'crop-fixture.html',
        width: 800,
        height: 600,
        scale: 2,
        crop: { selector: '#panel', padding: 10 },
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })
    const path = resolve(testDir, 'crop-panel.png')
    // (120 + 2·10) × (70 + 2·10), × 2
    expect(pngDims(path)).toEqual({ width: 280, height: 180 })
    // Padding is page background; the element fills the rest
    expect(pngPixel(path, 5, 5)).toEqual([255, 255, 255])
    expect(pngPixel(path, 140, 90)).toEqual([255, 0, 0])
  })

  it('clamps crop padding to the page', async () => {
    await takeScreenshots({
      'crop-corner': {
        query: 'crop-fixture.html',
        crop: { selector: '#corner', padding: 10 },
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })
    // Padding only on the right / bottom: the element is flush with the page's top-left
    expect(pngDims(resolve(testDir, 'crop-corner.png'))).toEqual({ width: 60, height: 40 })
  })

  it('rejects when the crop selector matches nothing', async () => {
    await expect(takeScreenshots({
      'crop-missing': { query: 'crop-fixture.html', crop: '#nope' },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })).rejects.toThrow(new Error('crop selector "#nope" not found'))
  })

  it('crops every screencast frame', async () => {
    await takeScreenshots({
      'crop-cast': {
        query: 'crop-fixture.html',
        crop: '#panel',
        actions: [{ type: 'wait', duration: 200 }],
        fps: 10,
      } satisfies ScreencastConfig,
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
    })
    expect(gifDims(resolve(testDir, 'crop-cast.gif'))).toEqual({ width: 120, height: 70 })
  })

  describe('colorScheme', () => {
    const BLUE = [0, 0, 255], BLACK = [0, 0, 0]
    const shoot = (screens: Screens, colorScheme?: ColorScheme) => takeScreenshots(screens, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: testDir,
      log: () => {},
      engine,
      colorScheme,
    })
    const bg = (name: string) => pngPixel(resolve(testDir, `${name}.png`), 10, 10)

    it('emulates `prefers-color-scheme`, defaulting to light', async () => {
      const shot = { query: 'color-scheme-fixture.html', width: 100, height: 100 }
      await shoot({
        'cs-unset': shot,
        'cs-light': { ...shot, colorScheme: 'light' },
        'cs-dark': { ...shot, colorScheme: 'dark' },
      })
      expect(['cs-unset', 'cs-light', 'cs-dark'].map(bg)).toEqual([BLUE, BLUE, BLACK])
    })

    it('per-shot `colorScheme` overrides the global one, with a fresh page per scheme', async () => {
      const shot = { query: 'color-scheme-fixture.html', width: 100, height: 100 }
      await shoot({
        'cs-g1': shot,
        'cs-override': { ...shot, colorScheme: 'light' },
        'cs-g2': shot,
      }, 'dark')
      expect(['cs-g1', 'cs-override', 'cs-g2'].map(bg)).toEqual([BLACK, BLUE, BLACK])
    })
  })

  describe('headers', () => {
    const authUrl = `http://127.0.0.1:${AUTH_PORT}`

    beforeAll(() => { process.env.SCRNS_TEST_TOKEN = AUTH_TOKEN })
    afterAll(() => { delete process.env.SCRNS_TEST_TOKEN })

    it('sends env-expanded headers with navigations and in-page fetches', async () => {
      authRequests = []
      await takeScreenshots({
        'auth': {
          query: 'auth.html',
          selector: '#authed',
          loadTimeout: 5000,
          headers: { Authorization: 'Bearer $SCRNS_TEST_TOKEN' },
        },
      }, {
        baseUrl: authUrl,
        outputDir: testDir,
        log: () => {},
        engine,
      })
      expect(existsSync(resolve(testDir, 'auth.png'))).toBe(true)
      expect(authRequests).toEqual([
        ['/auth.html', `Bearer ${AUTH_TOKEN}`, undefined],
        ['/api', `Bearer ${AUTH_TOKEN}`, undefined],
      ])
    })

    it('times out waiting for the authed page without headers', async () => {
      authRequests = []
      await expect(takeScreenshots({
        'unauth': { query: 'auth.html', selector: '#authed', loadTimeout: 1000 },
      }, {
        baseUrl: authUrl,
        outputDir: testDir,
        log: () => {},
        engine,
      })).rejects.toThrow()
      expect(authRequests).toEqual([['/auth.html', undefined, undefined]])
    })

    it('merges per-shot headers over global ones, with a fresh page per header set', async () => {
      authRequests = []
      await takeScreenshots({
        'global-only': { query: 'auth.html' },
        'override': {
          query: 'auth.html',
          selector: '#authed',
          loadTimeout: 5000,
          headers: { Authorization: 'Bearer ${SCRNS_TEST_TOKEN}' },
        },
      }, {
        baseUrl: authUrl,
        outputDir: testDir,
        log: () => {},
        engine,
        headers: { Authorization: 'Bearer wrong', 'X-Global': 'g' },
      })
      expect(authRequests).toEqual([
        ['/auth.html', 'Bearer wrong', 'g'],
        ['/auth.html', `Bearer ${AUTH_TOKEN}`, 'g'],
        ['/api', `Bearer ${AUTH_TOKEN}`, 'g'],
      ])
    })
  })

  describe.skipIf(!hasFfmpeg())('video output', () => {
    it('produces an mp4 via real-time capture', async () => {
      await takeScreenshots({
        'video-realtime': {
          query: 'video-fixture.html',
          width: 500,
          height: 400,
          path: 'video-realtime.mp4',
          actions: [
            { type: 'wait', duration: 8000 },
          ],
          fps: 10,
        } satisfies ScreencastConfig,
      }, {
        baseUrl: `http://127.0.0.1:${TEST_PORT}`,
        outputDir: testDir,
        log: () => {},
        engine,
      })

      const mp4Path = resolve(testDir, 'video-realtime.mp4')
      expect(existsSync(mp4Path)).toBe(true)
      expect(statSync(mp4Path).size).toBeGreaterThan(0)
    })

    it('produces an idempotent mp4 with exact frame count (frame-by-frame)', { timeout: 90000 }, async () => {
      const config = {
        'video-framewise': {
          query: 'video-fixture.html',
          width: 500,
          height: 400,
          path: 'video-framewise.mp4',
          actions: [
            { type: 'animate' as const, frames: 240, eval: '(i, n) => { window.setFrame(i, n) }' },
          ],
          fps: 30,
        } satisfies ScreencastConfig,
      }
      const opts = {
        baseUrl: `http://127.0.0.1:${TEST_PORT}`,
        outputDir: testDir,
        log: () => {},
        engine,
      }
      const mp4Path = resolve(testDir, 'video-framewise.mp4')

      // Run 1
      await takeScreenshots(config, opts)
      expect(existsSync(mp4Path)).toBe(true)
      const buf1 = readFileSync(mp4Path)

      // Verify frame count and codec via ffprobe
      const probe = execSync(
        `ffprobe -v quiet -print_format json -show_streams ${mp4Path}`,
      ).toString()
      const stream = JSON.parse(probe).streams[0]
      expect(stream.codec_name).toBe('h264')
      expect(Number(stream.nb_frames)).toBe(240)
      expect(Number(stream.width)).toBe(500)
      expect(Number(stream.height)).toBe(400)

      // Run 2: idempotent — should produce byte-identical output
      await takeScreenshots(config, opts)
      const buf2 = readFileSync(mp4Path)
      expect(Buffer.compare(buf1, buf2)).toBe(0)
    })
  })
})

describe('headers env expansion', () => {
  it('expands `$NAME` and `${NAME}` refs', () => {
    expect(expandHeaders(
      { Authorization: 'Bearer $TOK', 'X-Both': 'a-${TOK}-b', 'X-Plain': 'plain' },
      { TOK: 't0k' },
    )).toEqual({ Authorization: 'Bearer t0k', 'X-Both': 'a-t0k-b', 'X-Plain': 'plain' })
  })
  it('throws on an unset env var, naming the header and var', () => {
    expect(() => expandHeaders({ Authorization: 'Bearer $NOPE' }, {}))
      .toThrow(new Error('Header "Authorization" references unset env var $NOPE'))
  })
  it('lists referenced env var names, deduped', () => {
    expect(headerEnvRefs({ A: '$X ${Y}', B: '$X' })).toEqual(['X', 'Y'])
  })
  it('errors on an unset env var before launching a browser', async () => {
    const launches: string[] = []
    const engine: ScrnsEngine = {
      name: 'fake',
      async launch() { launches.push('launch'); throw new Error('should not launch') },
    }
    await expect(takeScreenshots({
      'a': { query: 'x' },
      'b': { query: 'y', headers: { Authorization: 'Bearer $SCRNS_TEST_UNSET' } },
    }, {
      baseUrl: 'http://127.0.0.1:1',
      outputDir: BASE_TEST_DIR,
      log: () => {},
      engine,
    })).rejects.toThrow(new Error('Header "Authorization" references unset env var $SCRNS_TEST_UNSET'))
    expect(launches).toEqual([])
  })
})

describe('colorScheme validation', () => {
  it('errors on an invalid value before launching a browser', async () => {
    const launches: string[] = []
    const engine: ScrnsEngine = {
      name: 'fake',
      async launch() { launches.push('launch'); throw new Error('should not launch') },
    }
    await expect(takeScreenshots({
      'a': { query: 'x', colorScheme: 'drak' as ColorScheme },
    }, {
      baseUrl: 'http://127.0.0.1:1',
      outputDir: BASE_TEST_DIR,
      log: () => {},
      engine,
    })).rejects.toThrow(new Error('Invalid colorScheme "drak" (expected one of: light, dark)'))
    expect(launches).toEqual([])
  })
})

describe('resolveBaseUrl', () => {
  it('defaults to 127.0.0.1:3000 with no args', () => {
    expect(resolveBaseUrl()).toBe('http://127.0.0.1:3000')
  })
  it('maps a numeric port to 127.0.0.1:{port}', () => {
    expect(resolveBaseUrl(5180)).toBe('http://127.0.0.1:5180')
  })
  it('maps a string port to 127.0.0.1:{port}', () => {
    expect(resolveBaseUrl('8080')).toBe('http://127.0.0.1:8080')
  })
  it('preserves a full host string', () => {
    expect(resolveBaseUrl('myhost:4000')).toBe('http://myhost:4000')
  })
  it('uses https when flag is set', () => {
    expect(resolveBaseUrl(443, true)).toBe('https://127.0.0.1:443')
  })
})

describe('parseConfig', () => {
  it('passes flat Screens map through unchanged', () => {
    const flat: Screens = {
      home: { query: '', width: 800 },
      about: { query: 'about' },
    }
    const { screens, options } = parseConfig(flat)
    expect(screens).toBe(flat)
    expect(options).toEqual({})
  })
  it('separates Config options from screenshots', () => {
    const config: Config = {
      host: 5180,
      output: 'public/img',
      selector: '.app',
      screenshots: {
        home: { query: '' },
      },
    }
    const { screens, options } = parseConfig(config)
    expect(screens).toEqual({ home: { query: '' } })
    expect(options).toEqual({ host: 5180, output: 'public/img', selector: '.app' })
  })
  it('does not misinterpret a screenshot entry with query as Config', () => {
    const flat: Screens = {
      screenshots: { query: 'screenshots-page', width: 1200 },
    }
    const { screens, options } = parseConfig(flat)
    expect(screens).toBe(flat)
    expect(options).toEqual({})
  })
})
