#!/usr/bin/env node

import { program } from 'commander'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { takeScreenshots, ScreenshotsMap } from './index.js'

const DEFAULT_CONFIGS = [
  'scrns.config.ts',
  'scrns.config.js',
  'scrns.config.json',
]

program
  .name('scrns')
  .description('Take automated screenshots with Puppeteer')
  .option('-c, --config <path>', 'Path to config file (default: scrns.config.{ts,js,json})')
  .option('-d, --download-sleep <ms>', 'Sleep while waiting for downloads (default: 1000)', parseInt)
  .option('-h, --host <host>', 'Hostname or port (numeric port maps to 127.0.0.1:port)')
  .option('-i, --include <regex>', 'Only generate screenshots matching this regex')
  .option('-l, --load-timeout <ms>', 'Timeout waiting for selector (default: 30000)', parseInt)
  .option('-o, --output <dir>', 'Output directory (default: ./screenshots)')
  .option('-s, --selector <css>', 'Default CSS selector to wait for')
  .option('--https', 'Use HTTPS instead of HTTP')
  .parse()

const opts = program.opts()

function findConfig(): string {
  if (opts.config) {
    return resolve(opts.config)
  }
  for (const name of DEFAULT_CONFIGS) {
    const path = resolve(name)
    if (existsSync(path)) {
      return path
    }
  }
  throw new Error(`No config file found. Tried: ${DEFAULT_CONFIGS.join(', ')}`)
}

async function main() {
  // Parse host
  let host = opts.host || '127.0.0.1:3000'
  if (host.match(/^\d+$/)) {
    host = `127.0.0.1:${host}`
  }
  const scheme = opts.https ? 'https' : 'http'
  const baseUrl = `${scheme}://${host}`

  // Load config
  const configPath = findConfig()
  console.log(`Using config: ${configPath}`)
  let screens: ScreenshotsMap

  if (configPath.endsWith('.json')) {
    const content = readFileSync(configPath, 'utf-8')
    screens = JSON.parse(content)
  } else {
    // Dynamic import for JS/TS configs
    const module = await import(configPath)
    screens = module.default || module.screens || module
  }

  const include = opts.include ? new RegExp(opts.include) : undefined

  await takeScreenshots(screens, {
    baseUrl,
    outputDir: opts.output || './screenshots',
    defaultSelector: opts.selector,
    defaultLoadTimeout: opts.loadTimeout,
    defaultDownloadSleep: opts.downloadSleep,
    include,
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
