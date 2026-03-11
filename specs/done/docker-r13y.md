# Docker-based reproducible screenshots

## Problem

Screenshots differ between macOS and Linux due to font rendering, subpixel antialiasing, and other platform-specific rendering behavior. Projects that track screenshots in Git and verify them in CI (via `runsascoded/scrns@v1`) need a way to generate locally that matches the GHA Ubuntu runner output.

Currently, each project must create its own:
- `Dockerfile.screenshots` (PW image, pnpm install, build, serve, run scrns)
- `scripts/docker-screenshots.sh` (docker build/run/cp wrapper)

This is ~30 lines of boilerplate per project that's nearly identical everywhere (see [ctbk] and [hudson-transit] for examples). `scrns` should handle this natively.

[ctbk]: https://github.com/hudcostreets/ctbk/blob/main/www/Dockerfile.screenshots
[hudson-transit]: https://github.com/hccs-org/hub-bound-travel

## Goal

`scrns --docker` generates screenshots inside a Docker container matching the GHA runner environment, producing byte-identical output locally (macOS/ARM) and in CI (Ubuntu/x64).

## Design

### CLI flag

```
scrns --docker [--docker-image <image>] [--docker-platform <platform>]
```

- `--docker` / `-D`: Run scrns inside a Docker container instead of natively
- `--docker-image`: Override the Docker image (default: `mcr.microsoft.com/playwright:v<PW_VERSION>-noble`)
- `--docker-platform`: Override platform (default: `linux/amd64`)

All other flags (`-h`, `-o`, `-s`, `-l`, `-E`, `-i`, `-c`, etc.) are forwarded to the scrns invocation inside the container.

### Config support

```ts
// scrns.config.ts
export default {
  docker: true,                    // or just use --docker flag
  dockerImage: '...',              // optional override
  dockerPlatform: 'linux/amd64',   // optional override
  engine: 'playwright',
  host: 3847,
  output: 'public/screenshots',
  screenshots: { ... },
} satisfies Config
```

Add to `Config` type:

```ts
export type Config = {
  // ...existing fields...
  docker?: boolean
  dockerImage?: string
  dockerPlatform?: string
}
```

### How it works

When `--docker` is active, instead of launching a browser locally, scrns:

1. **Resolves the PW version** from its own dependency (`playwright@^1.50.0` → locked version in node_modules)
2. **Determines the Docker image**: `mcr.microsoft.com/playwright:v${PW_VERSION}-noble`
3. **Starts a container** with:
   - `--platform linux/amd64`
   - Config file + output dir mounted
4. **Inside the container**:
   - The target server is already running on the host (user's responsibility, same as non-Docker mode)
   - Runs `scrns` (installed inside the container) with forwarded args
   - `--host` is rewritten from `localhost` → `host.docker.internal` so the container can reach the host's dev server
5. **Screenshots land directly** in the mounted output dir — no `docker cp` needed

### Volume mount approach

```bash
docker run --rm \
  --platform linux/amd64 \
  -v "$PWD/scrns.config.ts":/work/scrns.config.ts:ro \
  -v "$PWD/$OUTPUT_DIR":/work/$OUTPUT_DIR \
  -w /work \
  --add-host=host.docker.internal:host-gateway \
  mcr.microsoft.com/playwright:v1.50.0-noble \
  sh -c "npm install -g scrns@$SCRNS_VERSION && scrns -h host.docker.internal:3847 ..."
```

Only the config file and output dir need mounting — scrns doesn't need the full project tree since it just talks to a running server.

Pros:
- No `docker build` step (fast, no image caching issues)
- No per-project Dockerfile
- Works with any project structure

### Host networking

The server runs on the host (user starts `pnpm dev` or `pnpm preview` themselves). Inside the container:
- macOS Docker Desktop: `host.docker.internal` works natively
- Linux: `--add-host=host.docker.internal:host-gateway`

Scrns rewrites `localhost`/`127.0.0.1` in the `--host` arg to `host.docker.internal` automatically when in Docker mode.

### GHA action integration

The `runsascoded/scrns@v1` action runs natively on Ubuntu (no Docker). Since:
- GHA Ubuntu ≈ Docker `noble` base image
- Same PW Chromium binary
- Same `linux/amd64` arch

The output should match `--docker` on local Mac. The action doesn't need a `--docker` flag — it's already in the "right" environment.

If there turn out to be font/rendering diffs between GHA Ubuntu and the PW Docker image, the action could gain a `docker: true` input that mirrors the CLI behavior. But start without it and see if native GHA matches.

### PW version detection

To auto-select the Docker image tag:

```ts
function getPlaywrightVersion(): string {
  const pwPkg = require.resolve('playwright/package.json')
  const { version } = JSON.parse(readFileSync(pwPkg, 'utf8'))
  return version  // e.g. "1.50.1"
}
```

The Docker image tag format is `v${major}.${minor}.0-noble` (patch versions may not have their own image). Validate the image exists or fall back to the nearest available tag.

## Config type changes

```ts
export type Config = {
  engine?: 'puppeteer' | 'playwright'
  host?: string | number
  https?: boolean
  output?: string
  selector?: string
  loadTimeout?: number
  downloadSleep?: number
  browserArgs?: string[]
  headless?: boolean
  screenshotTimeout?: number

  // New: Docker-based r13y
  docker?: boolean
  dockerImage?: string
  dockerPlatform?: string

  screenshots: Screens
}
```

## CLI changes

```
Options:
  ...existing options...
  -D, --docker                    Run in Docker for reproducible output
  --docker-image <image>          Docker image (default: auto-detect from PW version)
  --docker-platform <platform>    Docker platform (default: linux/amd64)
```

## Implementation steps

1. Add `docker`, `dockerImage`, `dockerPlatform` to `Config` type in `src/index.ts`
2. Add CLI flags `-D`, `--docker-image`, `--docker-platform` in `src/cli.ts`
3. Implement `runInDocker()` in new `src/docker.ts`:
   - Resolve PW version → Docker image tag
   - Build `docker run` command
   - Mount config file + output dir
   - Rewrite host to `host.docker.internal`
   - Forward all other CLI args
   - Spawn `docker run` and stream stdout/stderr
4. In `cli.ts`, before `takeScreenshots()`, check if Docker mode and call `runInDocker()` instead
5. Optionally add `docker` input to GHA `action.yml` (low priority)
6. Update README with Docker usage

## Example usage

```bash
# Local dev: run server yourself, scrns handles Docker
pnpm dev &
scrns --docker -h 3847 -o public/screenshots

# Or in config:
# scrns.config.ts has docker: true
scrns -h 3847 -o public/screenshots

# CI (GHA): no Docker needed, native PW matches
# uses: runsascoded/scrns@v1
#   with: { host: localhost:3847, output: public/screenshots }
```

## Open questions

1. **Config file format in container**: `.ts` configs need a TS runtime. The PW Docker image has Node but not tsx/ts-node. Options:
   - Install `tsx` in container at runtime (adds ~2s)
   - Have scrns serialize its parsed config to JSON before passing to container
   - `npm install -g scrns` in container brings tsx as a transitive dep if scrns depends on it

2. **Caching**: `npm install -g scrns` on every `--docker` run is slow (~10-15s). Options:
   - Pre-build a thin scrns Docker image (`scrns docker-build`?)
   - Use a named Docker volume for npm cache
   - Accept the latency (it's a dev-time operation, not hot path)

3. **Windows support**: `host.docker.internal` works on Docker Desktop (Mac/Win). Linux needs `--add-host`. Detect platform and adjust.
