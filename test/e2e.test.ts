import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { takeScreenshots, resolveEngine, ScreencastConfig, Screens, Config, parseConfig, resolveBaseUrl } from '../src/index.js'
import type { ScrnsEngine, EngineName } from '../src/index.js'
import { spawn, execFileSync, execSync, ChildProcess } from 'child_process'
import { existsSync, rmSync, mkdirSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'

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
const BASE_TEST_DIR = resolve(import.meta.dirname, 'output')
const FIXTURE_DIR = resolve(import.meta.dirname)

let server: ChildProcess

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
})

afterAll(() => {
  server?.kill()
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

  describe.skipIf(!hasFfmpeg())('video output', () => {
    it('produces an mp4 via real-time capture', { timeout: 15000 }, async () => {
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
