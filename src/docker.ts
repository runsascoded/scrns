import { spawn } from 'child_process'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
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

function getScrnsVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'))
  return pkg.version
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
  const scrnsVersion = opts.version ?? getScrnsVersion()
  const configPath = opts.config ? resolve(opts.config) : undefined
  const outputDir = resolve(opts.output)
  const host = rewriteHostForDocker(opts.host)

  const dockerArgs = [
    'run', '--rm',
    '--platform', platform,
    '--add-host=host.docker.internal:host-gateway',
    '-v', `${outputDir}:/work/output`,
    '-w', '/work',
  ]

  if (configPath) {
    const configName = basename(configPath)
    dockerArgs.push('-v', `${configPath}:/work/${configName}:ro`)
  }

  dockerArgs.push(image)

  // Build the scrns command to run inside the container
  const scrnsArgs = ['-h', host, '-o', '/work/output']
  if (configPath) {
    scrnsArgs.push('-c', `/work/${basename(configPath)}`)
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

  const shellCmd = `npm install -g scrns@${scrnsVersion} && scrns ${scrnsArgs.map(a => `'${a}'`).join(' ')}`
  dockerArgs.push('sh', '-c', shellCmd)

  console.error(`Docker image: ${image}`)
  console.error(`Platform: ${platform}`)
  console.error(`Running: docker ${dockerArgs.slice(0, 3).join(' ')} ... scrns ${scrnsArgs.join(' ')}`)

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
