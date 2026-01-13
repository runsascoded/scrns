import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { takeScreenshots } from '../src/index.js'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, rmSync, mkdirSync } from 'fs'
import { resolve } from 'path'

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
