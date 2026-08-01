# Playwright Engine Support for `scrns`

**Status**: Complete (v0.4.0). Both phases implemented: engine abstraction with both adapters, `--engine`/`-E` CLI flag and `engine` config option, and the dependency inversion — Playwright is the regular dependency and default engine; Puppeteer is an optional peer.

## Motivation

`scrns` currently depends on Puppeteer (hard dependency). Many projects already use Playwright for e2e tests, so adding `scrns` means downloading a second Chromium. Additionally, Playwright has better cross-platform screenshot determinism and ships official Docker images (`mcr.microsoft.com/playwright`) that match GHA runners exactly, solving the long-standing "local vs CI pixel mismatch" problem.

## Goal

Let `scrns` work with either Puppeteer or Playwright as the browser engine, without requiring both to be installed. The user picks one; only that engine's browser binary gets downloaded.

## Design: Peer Dependencies + Optional Import

### Package structure (final — Phase 2)

Playwright is a regular dependency. Puppeteer is an optional peer dependency:

```json
{
  "peerDependencies": {
    "puppeteer": ">=20"
  },
  "peerDependenciesMeta": {
    "puppeteer": { "optional": true }
  },
  "dependencies": {
    "playwright": "^1.50.0"
  }
}
```

### Engine resolution

At runtime, resolve which engine to use:

1. **CLI flag**: `scrns -E playwright` or `scrns --engine puppeteer`
2. **Config**: `{ engine: "playwright", screenshots: { ... } }`
3. **Auto-detect**: try playwright first (the regular dep), fall back to puppeteer. Error if neither is found.

### Engine abstraction

`src/engines/types.ts` defines a minimal browser interface:

```ts
export interface ScrnsPage {
  goto(url: string): Promise<void>
  setViewportSize(size: { width: number; height: number }): Promise<void>
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>
  screenshot(opts?: { path?: string }): Promise<Buffer>
  evaluate<R>(pageFunction: string | ((...args: any[]) => R), arg?: any): Promise<R>
  keyboard: { down, up, type }
  mouse: { click, move, down, up }
  setDownloadPath(dir: string): Promise<void>
}

export interface ScrnsBrowser {
  newPage(): Promise<ScrnsPage>
  close(): Promise<void>
}

export interface ScrnsEngine {
  name: string
  launch(opts: { headless: boolean; args?: string[] }): Promise<ScrnsBrowser>
}
```

Key API differences handled by adapters:

| Operation | Puppeteer adapter | Playwright adapter |
|---|---|---|
| Set viewport | `page.setViewport(size)` | `page.setViewportSize(size)` |
| Screenshot buffer | `page.screenshot({ encoding: 'binary' })` → `Buffer.from()` | `page.screenshot()` → `Buffer` |
| CDP session (downloads) | `page.createCDPSession()` | `page.context().newCDPSession(page)` |
| Launch | `puppeteer.launch(opts)` | `chromium.launch(opts)` |

### Dynamic import

Each engine adapter uses a dynamic `import()` so that the unused engine is never loaded (and its absence doesn't cause import errors). tsup preserves these as runtime `import()` expressions since the packages are external.

### evaluate() convention

The `ScrnsPage.evaluate` signature uses a single `arg` parameter (matching Playwright's convention). The one callsite that previously passed multiple args (`scrollTo` + `scrollOffset`) was refactored to pass a single tuple.

## Migration path

### Phase 1: Abstraction (non-breaking) — DONE
- Introduced `ScrnsEngine` interface and both adapters (`src/engines/`)
- Moved all Puppeteer calls in `index.ts` behind the abstraction
- Kept `puppeteer` as a regular dependency (existing installs unchanged)
- Added Playwright adapter + auto-detection (puppeteer-first)
- Added `-E`/`--engine` CLI flag and `engine` config option
- All 20 existing tests pass unchanged

### Phase 2: Dependency inversion (v0.4.0) — DONE
- Moved `puppeteer` from `dependencies` to optional `peerDependencies`
- Made `playwright` a regular dependency and switched auto-detect to playwright-first
- Updated docs to show both installation paths
- Existing users: `pnpm add puppeteer` to keep prior behavior (or rely on the Playwright default)

## Download handling

Both adapters use CDP's `Page.setDownloadBehavior` via `setDownloadPath()`. For Playwright, this uses `page.context().newCDPSession(page)` (Chromium-only, which is fine since we're Chromium-only for now).

## Preview mode

The `preview` command launches a headful browser. Both Puppeteer and Playwright support `headless: false`. The stdin/keyboard-shortcut capture flow works the same way since it's `page.evaluate`-based.

## Testing

- E2e suite runs `describe.each(availableEngines)` — every test executes against both engines when both are installed
- CI installs both browsers (`playwright install chromium` + `puppeteer browsers install chrome`) so the full dual-engine matrix runs on every push

## Docker / CI implications

Once Playwright is supported, downstream projects can:
- Use `mcr.microsoft.com/playwright` as their Docker base image (pre-installed browser + fonts)
- GHA can use `npx playwright install --with-deps chromium` instead of manual apt-get
- Local `scrns:docker` and GHA produce pixel-identical results

## Out of scope

- Firefox/WebKit support (Playwright supports them, but screenshot rendering differs; keep Chromium-only for now)
- Removing Puppeteer support (it remains a first-class engine)
