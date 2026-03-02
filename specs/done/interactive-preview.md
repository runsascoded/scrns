# Interactive Preview Mode

**Status**: Implemented (commit `250a60c`)

## Summary

`scrns preview` (aliased `record`) opens a headful browser for interactively finding the right view, dimensions, and state before capturing a screenshot. The captured state is printed as a config snippet.

## CLI

```bash
# Open a preview for a specific screenshot entry
scrns preview <name>

# Open a preview with an explicit URL (no config entry needed)
scrns preview --url 'http://localhost:3201/?v=...'

# Aliases
scrns record <name>   # same as preview
```

Shared flags (`-c`, `-h`, `-o`, `-s`, `-l`, `--https`) work on both the default command and `preview`.

## Behavior

### 1. Launch headful browser

Opens a headful browser, navigating to the entry's URL (`baseUrl` + `query`). Sets the initial viewport to the entry's `width`/`height` (or defaults: 800x560).

### 2. User adjusts view

The user can:
- Interact with the page (pan, zoom, rotate, click) to find the desired view
- Resize the browser window to change dimensions

### 3. Capture state

Signal capture via:
- **Enter** in the terminal
- **Ctrl+Shift+S** in the browser (injected keyboard listener)

Whichever fires first wins (Promise.race).

On capture:
1. Read `window.location` (href, search+hash) and `window.innerWidth/Height`
2. Take a screenshot (save to configured path or `preview.png`)
3. Print captured state to stderr:

```
Captured "og-west":
  query: '?v=40.7310-74.0834+12.5+57+106&agg=lot'
  width: 800
  height: 800
```

## Implementation

### `previewScreenshot()` in `src/index.ts`

```ts
export type PreviewResult = { url: string, query: string, width: number, height: number }

export async function previewScreenshot(
  config: ScreenshotConfig,
  options: {
    baseUrl: string
    outputDir: string
    defaultSelector?: string
    defaultLoadTimeout?: number
    log?: (message: string) => void
  },
): Promise<PreviewResult>
```

### `preview` subcommand in `src/cli.ts`

Config loading extracted into shared helpers (`findConfig`, `loadRawConfig`, `loadResolvedConfig`, `addSharedOptions`) used by both the default action and preview.

- `--url` mode: parses URL directly, no config file needed
- Config mode: looks up `name` in screens; exits with error + available names if not found
- No name + no `--url`: uses default config (empty `ScreenshotConfig`)

## Deferred

- `--save` (write captured state back to config file)
- Screencast preview (running actions in real-time)
- Graceful handling when user closes browser window before capture
