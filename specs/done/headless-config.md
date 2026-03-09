# Per-shot headless mode + screenshot timeout

## Problem

`browserArgs` like `--use-angle=swiftshader` are needed for WebGL in headless mode, but SwiftShader is too slow for frame-by-frame animation (each `page.screenshot()` exceeds the 30s timeout). Headful mode uses native GPU and is fast, but the entire browser session is currently either headless (`takeScreenshots`) or headful (`previewScreenshot`).

This means animated screencasts (`cast.gif`) can't be captured alongside static screenshots in a single run when SwiftShader is required.

## Changes

### 1. Config-level `headless` option

Add `headless` to top-level config and per-shot config:

```ts
// Top-level: default for all shots (default: true)
interface Config {
  headless?: boolean
  // ...existing fields
}

// Per-shot: override for individual screenshots
interface ScreenshotConfig {
  headless?: boolean
  // ...existing fields
}
```

### 2. CLI `--headful` flag

Add `--headful` / `-H` flag to override config:

```bash
scrns --headful           # all shots headful
scrns --headful cast      # just cast, headful
```

### 3. Per-shot browser relaunch

Currently, all screenshots share one browser instance. When per-shot `headless` differs from the current browser's mode, scrns must close and relaunch with the new mode.

Group shots by headless mode and launch a browser per group:

```ts
// Partition screenshots by effective headless value
const groups = groupBy(screenshots, (s) => s.headless ?? config.headless ?? true)
for (const [headless, shots] of groups) {
  const browser = await engine.launch({ headless, args })
  // take screenshots for this group
  await browser.close()
}
```

Per-shot `browserArgs` should also be regrouped: if a shot sets `headless: false`, it likely doesn't need SwiftShader args. When `headless: false`, filter out SwiftShader-related args (`--use-angle=swiftshader`) from the merged args, unless the shot explicitly includes them in its own `browserArgs`.

### 4. Screenshot timeout

Add `screenshotTimeout` to config and per-shot config (default: 30000):

```ts
interface Config {
  screenshotTimeout?: number  // ms, default 30000
}

interface ScreenshotConfig {
  screenshotTimeout?: number  // ms, per-shot override
}
```

Pass to engine's `screenshot()`:

```ts
// src/engines/types.ts
interface ScrnsPage {
  screenshot(opts?: { path?: string; timeout?: number }): Promise<Buffer>
}
```

Both Puppeteer and Playwright support `timeout` in their `page.screenshot()` options natively.

Also add CLI flag:

```bash
scrns --screenshot-timeout 60000  # 60s per frame
```

### 5. `preview` subcommand

`preview` already uses `headless: false`. No changes needed, but if `--headful` is passed to `preview`, it should be a no-op (not an error).

## Example config

```ts
export default {
  host: 3201,
  output: 'public',
  selector: '[data-loaded]',
  browserArgs: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  screenshots: {
    'og-lot': {
      query: '...',
      width: 1200, height: 630,
      // inherits headless: true (default), uses SwiftShader
    },
    cast: {
      query: '...',
      width: 800, height: 500,
      headless: false,  // native GPU, fast enough for animation
      path: 'cast.gif',
      fps: 30,
      actions: [/* ... */],
    },
  },
}
```

## Files

| File | Change |
|------|--------|
| `src/index.ts` | `headless` in `Config` + `ScreenshotConfig` types, group-by-headless launch, `screenshotTimeout` plumbing |
| `src/cli.ts` | `--headful` and `--screenshot-timeout` CLI flags |
| `src/engines/types.ts` | Add `timeout` to `screenshot()` opts |
| `src/engines/puppeteer.ts` | Pass `timeout` to `page.screenshot()` |
| `src/engines/playwright.ts` | Pass `timeout` to `page.screenshot()` |
