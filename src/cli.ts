#!/usr/bin/env node

import { program } from 'commander'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { takeScreenshots, previewScreenshot, resolveEngine, Screens, Config, ScreenshotConfig, parseConfig, resolveBaseUrl } from './index.js'
import type { EngineName } from './index.js'

const DEFAULT_CONFIGS = [
  'scrns.config.ts',
  'scrns.config.js',
  'scrns.config.json',
]

function findConfig(configOpt?: string): string {
  if (configOpt) {
    return resolve(configOpt)
  }
  for (const name of DEFAULT_CONFIGS) {
    const path = resolve(name)
    if (existsSync(path)) {
      return path
    }
  }
  throw new Error(`No config file found. Tried: ${DEFAULT_CONFIGS.join(', ')}`)
}

async function loadRawConfig(configPath: string): Promise<Screens | Config> {
  if (configPath.endsWith('.json')) {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content)
  }
  // Dynamic import for JS/TS configs
  const module = await import(configPath)
  return module.default || module.screens || module
}

type ResolvedConfig = {
  screens: Screens
  baseUrl: string
  outputDir: string
  defaultSelector?: string
  defaultLoadTimeout?: number
  defaultDownloadSleep?: number
  engine?: EngineName
  browserArgs: string[]
}

async function loadResolvedConfig(opts: {
  config?: string
  engine?: string
  host?: string
  https?: boolean
  output?: string
  selector?: string
  loadTimeout?: number
  downloadSleep?: number
  browserArg?: string[]
}): Promise<ResolvedConfig> {
  const configPath = findConfig(opts.config)
  const log = (...args: unknown[]) => console.error(...args)
  log(`Using config: ${configPath}`)
  const rawConfig = await loadRawConfig(configPath)
  const { screens, options: configOptions } = parseConfig(rawConfig)

  const host = opts.host ?? configOptions.host
  const https = opts.https ?? configOptions.https
  const baseUrl = resolveBaseUrl(host, https)

  const engine = (opts.engine ?? configOptions.engine) as EngineName | undefined

  const browserArgs = [
    ...(configOptions.browserArgs ?? []),
    ...(opts.browserArg ?? []),
  ]

  return {
    screens,
    baseUrl,
    outputDir: opts.output ?? configOptions.output ?? './screenshots',
    defaultSelector: opts.selector ?? configOptions.selector,
    defaultLoadTimeout: opts.loadTimeout ?? configOptions.loadTimeout,
    defaultDownloadSleep: opts.downloadSleep ?? configOptions.downloadSleep,
    engine,
    browserArgs,
  }
}

// Shared options applied to both default command and preview
function addSharedOptions(cmd: typeof program) {
  return cmd
    .option('-c, --config <path>', 'Path to config file (default: scrns.config.{ts,js,json})')
    .option('-b, --browser-arg <arg>', 'Additional browser launch arg (repeatable)', (val: string, prev: string[]) => [...prev, val], [] as string[])
    .option('-E, --engine <name>', 'Browser engine: puppeteer or playwright (default: auto-detect)')
    .option('-h, --host <host>', 'Hostname or port (numeric port maps to 127.0.0.1:port)')
    .option('-l, --load-timeout <ms>', 'Timeout waiting for selector (default: 30000)', parseInt)
    .option('-o, --output <dir>', 'Output directory (default: ./screenshots)')
    .option('-s, --selector <css>', 'Default CSS selector to wait for')
    .option('--https', 'Use HTTPS instead of HTTP')
}

// Default action: take all screenshots
addSharedOptions(program)
  .name('scrns')
  .description('Take automated screenshots with Playwright/Puppeteer')
  .option('-d, --download-sleep <ms>', 'Sleep while waiting for downloads (default: 1000)', parseInt)
  .option('-i, --include <regex>', 'Only generate screenshots matching this regex')
  .action(async (opts) => {
    const resolved = await loadResolvedConfig(opts)
    const engine = await resolveEngine(resolved.engine)
    const include = opts.include ? new RegExp(opts.include) : undefined
    await takeScreenshots(resolved.screens, {
      baseUrl: resolved.baseUrl,
      outputDir: resolved.outputDir,
      defaultSelector: resolved.defaultSelector,
      defaultLoadTimeout: resolved.defaultLoadTimeout,
      defaultDownloadSleep: resolved.defaultDownloadSleep,
      include,
      engine,
      browserArgs: resolved.browserArgs,
    })
  })

// Preview subcommand
const previewCmd = program
  .command('preview [name]')
  .alias('record')
  .description('Open headful browser for interactive screenshot composition')
  .option('--url <url>', 'URL to open (overrides config entry)')

addSharedOptions(previewCmd)
  .action(async (name: string | undefined, cmdOpts) => {
    const log = (...args: unknown[]) => console.error(...args)
    let config: ScreenshotConfig
    let baseUrl: string
    let outputDir: string
    let defaultSelector: string | undefined
    let defaultLoadTimeout: number | undefined
    let engineName: EngineName | undefined
    let browserArgs: string[] = []

    if (cmdOpts.url) {
      // --url mode: no config file needed
      const parsed = new URL(cmdOpts.url)
      baseUrl = `${parsed.protocol}//${parsed.host}`
      config = {
        query: parsed.pathname.slice(1) + parsed.search + parsed.hash,
      }
      outputDir = cmdOpts.output ?? './screenshots'
      defaultSelector = cmdOpts.selector
      defaultLoadTimeout = cmdOpts.loadTimeout
      engineName = cmdOpts.engine as EngineName | undefined
      browserArgs = cmdOpts.browserArg ?? []
    } else {
      // Config-based mode
      const resolved = await loadResolvedConfig(cmdOpts)
      baseUrl = resolved.baseUrl
      outputDir = resolved.outputDir
      defaultSelector = resolved.defaultSelector
      defaultLoadTimeout = resolved.defaultLoadTimeout
      engineName = resolved.engine
      browserArgs = resolved.browserArgs

      if (name) {
        config = resolved.screens[name]
        if (!config) {
          log(`Entry "${name}" not found in config. Available: ${Object.keys(resolved.screens).join(', ')}`)
          process.exit(1)
        }
        // Use entry name as default output filename
        if (!config.path) {
          config = { ...config, path: `${name}.png` }
        }
      } else {
        // No name: use defaults
        config = {}
      }
    }

    const engine = await resolveEngine(engineName)
    const result = await previewScreenshot(config, {
      baseUrl,
      outputDir,
      defaultSelector,
      defaultLoadTimeout,
      log,
      engine,
      browserArgs,
    })

    const label = name ? `"${name}"` : 'preview'
    log(`\nCaptured ${label}:`)
    log(`  query: '${result.query}'`)
    log(`  width: ${result.width}`)
    log(`  height: ${result.height}`)
  })

program.parse()
