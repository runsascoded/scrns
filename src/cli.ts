#!/usr/bin/env node

import { program } from 'commander'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { takeScreenshots, Screens, Config, parseConfig, resolveBaseUrl } from './index.js'

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
  // Load config
  const configPath = findConfig()
  console.log(`Using config: ${configPath}`)
  let rawConfig: Screens | Config

  if (configPath.endsWith('.json')) {
    const content = readFileSync(configPath, 'utf-8')
    rawConfig = JSON.parse(content)
  } else {
    // Dynamic import for JS/TS configs
    const module = await import(configPath)
    rawConfig = module.default || module.screens || module
  }

  const { screens, options: configOptions } = parseConfig(rawConfig)

  // CLI flags override config values
  const host = opts.host ?? configOptions.host
  const https = opts.https ?? configOptions.https
  const baseUrl = resolveBaseUrl(host, https)
  const include = opts.include ? new RegExp(opts.include) : undefined

  await takeScreenshots(screens, {
    baseUrl,
    outputDir: opts.output ?? configOptions.output ?? './screenshots',
    defaultSelector: opts.selector ?? configOptions.selector,
    defaultLoadTimeout: opts.loadTimeout ?? configOptions.loadTimeout,
    defaultDownloadSleep: opts.downloadSleep ?? configOptions.downloadSleep,
    include,
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
