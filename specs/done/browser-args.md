# Browser launch args

## Problem

`takeScreenshots` and `previewScreenshot` hardcode browser launch args:
```js
args: [
  "--no-sandbox",
  "--disable-skia-runtime-opts",
  "--force-device-scale-factor=1"
]
```

Consumers can't pass additional flags (e.g. `--use-gl=swiftshader`, `--enable-webgl`) needed for WebGL in headless Chrome. This causes deck.gl / luma.gl apps to fail with "Cannot read properties of null (reading 'luma')" in headless mode.

## Design

Support browser args at three levels (later overrides earlier):

### 1. Config-level `browserArgs`

Top-level array in the config, applies to all screenshots:

```ts
// scrns.config.ts
export default {
  host: 3201,
  browserArgs: ['--use-gl=swiftshader'],
  screenshots: { ... },
}
```

### 2. Per-screenshot `browserArgs`

Per-entry override (merged with config-level):

```ts
screenshots: {
  'og-unit': {
    query: '?agg=unit&sp=br',
    browserArgs: ['--use-gl=angle'],  // overrides/extends config-level
    ...
  },
}
```

Per-screenshot args are relevant because `takeScreenshots` currently reuses a single browser for all shots. If a per-shot `browserArgs` differs from the current browser's args, the browser would need to be relaunched. Simpler alternative: just merge all per-shot args into the single launch, and document that per-shot args don't create separate browser instances.

### 3. CLI `--browser-arg`

Repeatable CLI flag, highest priority:

```
scrns --browser-arg='--use-gl=swiftshader'
scrns --browser-arg='--disable-gpu' --browser-arg='--use-gl=egl'
```

Short form: `-a` or `-b`.

### Merging

All three levels concatenate (config + per-shot + CLI). The hardcoded defaults (`--no-sandbox`, `--disable-skia-runtime-opts`, `--force-device-scale-factor=1`) remain as base args that are always included.

## Changes

### Types (`index.d.ts`)

```ts
type Config = {
  // ... existing fields
  browserArgs?: string[]
}

type ScreenshotConfig = {
  // ... existing fields
  browserArgs?: string[]
}

type ScreenshotsOptions = {
  // ... existing fields
  browserArgs?: string[]
}
```

### CLI (`cli.ts`)

Add option:
```ts
.option('-b, --browser-arg <arg...>', 'Additional browser launch args (repeatable)')
```

Pass through to `takeScreenshots` / `previewScreenshot` options.

### Runtime (`index.ts`)

In `takeScreenshots` and `previewScreenshot`, merge args:
```ts
const baseArgs = [
  "--no-sandbox",
  "--disable-skia-runtime-opts",
  "--force-device-scale-factor=1",
]
const args = [
  ...baseArgs,
  ...(configOptions.browserArgs ?? []),
  ...(options.browserArgs ?? []),  // CLI-level
]
```

Per-shot args: collect all unique per-shot `browserArgs` and include them in the single browser launch. (Don't relaunch per shot.)

## Motivation

`jc-taxes` uses deck.gl (WebGL) which fails in headless Chromium without `--use-gl=swiftshader` or similar. The workaround of using `scrns preview` (headful) works but defeats the purpose of automated screenshots.
