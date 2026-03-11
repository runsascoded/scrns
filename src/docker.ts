import { spawn, execFileSync } from 'child_process'
import { createRequire } from 'module'
import { readFileSync, existsSync } from 'fs'
import { resolve, basename, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

export type DockerOptions = {
  host: string | number
  https?: boolean
  output: string
  config?: string
  engine?: string
  selector?: string
  loadTimeout?: number
  downloadSleep?: number
  screenshotTimeout?: number
  include?: string
  browserArgs?: string[]
  headful?: boolean
  dockerImage?: string
  dockerPlatform?: string
  version?: string
}

function getPlaywrightVersion(): string {
  const pwPkg = require.resolve('playwright/package.json')
  const { version } = JSON.parse(readFileSync(pwPkg, 'utf8'))
  return version
}

function getDockerImage(override?: string): string {
  if (override) return override
  const version = getPlaywrightVersion()
  // Docker image tags use major.minor.0 (patch versions may not have their own image)
  const [major, minor] = version.split('.')
  return `mcr.microsoft.com/playwright:v${major}.${minor}.0-noble`
}

/**
 * Find the scrns project root (where package.json lives).
 * Works whether running from source (`src/`) or built (`dist/`).
 */
function getScrnsRoot(): string {
  // __dirname is src/ or dist/; parent should have package.json
  const root = resolve(__dirname, '..')
  if (existsSync(resolve(root, 'package.json'))) return root
  return root
}

/**
 * Create a local tarball of the current scrns build via `npm pack`.
 * Returns the absolute path to the tarball.
 */
function packLocal(): string {
  const root = getScrnsRoot()
  const output = execFileSync('npm', ['pack', '--pack-destination', '.'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  // npm pack prints the tarball filename (e.g. "scrns-0.3.0.tgz")
  const tarball = resolve(root, output)
  console.error(`Packed local build: ${tarball}`)
  return tarball
}

function rewriteHostForDocker(host: string | number): string {
  let h = String(host)
  if (h.match(/^\d+$/)) h = `host.docker.internal:${h}`
  else h = h.replace(/^(localhost|127\.0\.0\.1)/, 'host.docker.internal')
  return h
}

export async function runInDocker(opts: DockerOptions): Promise<void> {
  const image = getDockerImage(opts.dockerImage)
  const platform = opts.dockerPlatform ?? 'linux/amd64'
  const outputDir = resolve(opts.output)
  const host = rewriteHostForDocker(opts.host)

  // Determine how to install scrns inside the container
  let installCmd: string
  const extraMounts: string[][] = []

  if (opts.version) {
    // Explicit version: npm install directly (npm version, github SHA, tarball URL, etc.)
    installCmd = `npm install -g 'scrns@${opts.version}'`
  } else {
    // Default: pack local build, mount tarball, install from it
    const tarball = packLocal()
    const tarballName = basename(tarball)
    extraMounts.push(['-v', `${tarball}:/work/${tarballName}:ro`])
    installCmd = `npm install -g '/work/${tarballName}'`
  }

  const dockerArgs = [
    'run', '--rm',
    '--platform', platform,
    '--add-host=host.docker.internal:host-gateway',
    '-v', `${outputDir}:/work/output`,
    '-w', '/work',
  ]

  // Mount config file (always — it was resolved by the CLI)
  if (opts.config) {
    const configPath = resolve(opts.config)
    const configName = basename(configPath)
    dockerArgs.push('-v', `${configPath}:/work/${configName}:ro`)
  }

  // Mount tarball if using local pack
  for (const mount of extraMounts) {
    dockerArgs.push(...mount)
  }

  dockerArgs.push(image)

  // Build the scrns command to run inside the container
  const scrnsArgs = ['-h', host, '-o', '/work/output']
  if (opts.config) {
    scrnsArgs.push('-c', `/work/${basename(resolve(opts.config))}`)
  }
  if (opts.engine) scrnsArgs.push('-E', opts.engine)
  if (opts.selector) scrnsArgs.push('-s', opts.selector)
  if (opts.loadTimeout != null) scrnsArgs.push('-l', String(opts.loadTimeout))
  if (opts.downloadSleep != null) scrnsArgs.push('-d', String(opts.downloadSleep))
  if (opts.screenshotTimeout != null) scrnsArgs.push('-T', String(opts.screenshotTimeout))
  if (opts.include) scrnsArgs.push('-i', opts.include)
  if (opts.https) scrnsArgs.push('--https')
  if (opts.browserArgs) {
    for (const arg of opts.browserArgs) {
      scrnsArgs.push('-b', arg)
    }
  }

  const shellCmd = `${installCmd} && scrns ${scrnsArgs.map(a => `'${a}'`).join(' ')}`
  dockerArgs.push('sh', '-c', shellCmd)

  console.error(`Docker image: ${image}`)
  console.error(`Platform: ${platform}`)
  console.error(`Install: ${installCmd}`)
  console.error(`Running: scrns ${scrnsArgs.join(' ')}`)

  const child = spawn('docker', dockerArgs, {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  const code = await new Promise<number | null>((resolve) => {
    child.on('close', resolve)
  })

  if (code !== 0) {
    throw new Error(`Docker process exited with code ${code}`)
  }
}
