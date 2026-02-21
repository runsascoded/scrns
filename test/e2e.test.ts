import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { takeScreenshots, ScreencastConfig } from '../src/index.js'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs'
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

const TEST_PORT = 9876
const TEST_DIR = resolve(import.meta.dirname, 'output')
const FIXTURE_DIR = resolve(import.meta.dirname)

let server: ChildProcess

beforeAll(async () => {
  // Clean output dir
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
  mkdirSync(TEST_DIR, { recursive: true })

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

describe('scrns e2e', () => {
  it('takes a basic screenshot', async () => {
    await takeScreenshots({
      'basic': {
        query: 'fixture.html',
        width: 800,
        height: 600,
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: TEST_DIR,
    })

    expect(existsSync(resolve(TEST_DIR, 'basic.png'))).toBe(true)
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
      outputDir: TEST_DIR,
    })

    expect(existsSync(resolve(TEST_DIR, 'selector.png'))).toBe(true)
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
      outputDir: TEST_DIR,
    })

    expect(existsSync(resolve(TEST_DIR, 'scroll-to.png'))).toBe(true)
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
      outputDir: TEST_DIR,
    })

    expect(existsSync(resolve(TEST_DIR, 'scroll-y.png'))).toBe(true)
  })

  it('respects include filter', async () => {
    await takeScreenshots({
      'included': { query: 'fixture.html' },
      'excluded': { query: 'fixture.html' },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: TEST_DIR,
      include: /included/,
      log: () => {},
    })

    expect(existsSync(resolve(TEST_DIR, 'included.png'))).toBe(true)
    expect(existsSync(resolve(TEST_DIR, 'excluded.png'))).toBe(false)
  })

  it('uses custom path when specified', async () => {
    await takeScreenshots({
      'custom': {
        query: 'fixture.html',
        path: 'subdir/custom-name.png',
      },
    }, {
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      outputDir: TEST_DIR,
      log: () => {},
    })

    expect(existsSync(resolve(TEST_DIR, 'subdir/custom-name.png'))).toBe(true)
  })
})

describe('scrns screencast', () => {
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
      outputDir: TEST_DIR,
      log: () => {},
    })

    const gifPath = resolve(TEST_DIR, 'cast-basic.gif')
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
      outputDir: TEST_DIR,
      log: () => {},
    })

    const gifPath = resolve(TEST_DIR, 'cast-actions.gif')
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
      outputDir: TEST_DIR,
      log: () => {},
    }

    // Run 1
    await takeScreenshots(config, opts)
    const gifPath = resolve(TEST_DIR, 'cast-animate.gif')
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
      outputDir: TEST_DIR,
      log: () => {},
    })

    // Should use .gif extension, not .png
    expect(existsSync(resolve(TEST_DIR, 'cast-default-ext.gif'))).toBe(true)
    expect(existsSync(resolve(TEST_DIR, 'cast-default-ext.png'))).toBe(false)
  })
})
