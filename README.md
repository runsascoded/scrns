# scrns

[![npm version][npm-badge]][npm]

Automated screenshots and screencasts (GIF/video) with Playwright or Puppeteer — wait for selectors, configurable viewports, scroll positioning, action timelines, and downloads.

Also available on [GitLab][gl]. Reusable CI integrations: [GitHub Action][gh-v1] (`v1` branch), [GitLab CI component][gl-v1].

## Install
```bash
pnpm add scrns
# or
npm install scrns
```

[Playwright] is included by default; install its Chromium binary once per machine:
```bash
pnpm exec playwright install chromium
```

To use [Puppeteer] instead (or alongside; it downloads Chrome automatically on install):
```bash
pnpm add puppeteer
```

[Playwright]: https://playwright.dev/
[Puppeteer]: https://pptr.dev/

## CLI Usage
```bash
scrns [options]
```

### Options
| Flag | Description |
|------|-------------|
| `-b, --browser-arg <arg>` | Additional browser launch arg (repeatable) |
| `-c, --config <path>` | Config file path (default: `scrns.config.{ts,js,json}`) |
| `-d, --download-sleep <ms>` | Sleep while waiting for downloads (default: 1000) |
| `-D, --docker` | Run in Docker for reproducible output (see [Docker mode](#docker-mode)) |
| `--docker-image <image>` | Docker image (default: auto-detect from Playwright version) |
| `--docker-platform <platform>` | Docker platform (default: `linux/amd64`) |
| `--docker-scrns <ver>` | scrns version for Docker (npm version, SHA, `gh:<sha>`, `gl:<sha>`) |
| `-E, --engine <name>` | Browser engine: `playwright` or `puppeteer` (default: auto-detect, prefers Playwright) |
| `-h, --host <host>` | Hostname or port (numeric port maps to `127.0.0.1:port`) |
| `-H, --headful` | Run browser in headful mode (override config `headless`) |
| `-i, --include <regex>` | Only generate screenshots matching this regex |
| `-l, --load-timeout <ms>` | Timeout waiting for selector (default: 30000) |
| `-o, --output <dir>` | Output directory (default: `./screenshots`) |
| `-s, --selector <css>` | Default CSS selector to wait for |
| `-T, --screenshot-timeout <ms>` | Timeout per screenshot capture (default: 30000) |
| `--https` | Use HTTPS instead of HTTP |

### Example
```bash
# Auto-detect config, use localhost:3000
scrns

# Specify port and config
scrns -h 8080 -c my-config.ts

# Filter to specific screenshots
scrns -i "home|about"

# Use Puppeteer instead of Playwright
scrns -E puppeteer
```

### Preview Mode

`scrns preview` (aliased `record`) opens a headful browser for interactively composing screenshots. Adjust the view and resize the window, then capture with Enter (terminal) or Ctrl+Shift+S (browser):

```bash
# Preview a specific config entry
scrns preview <name>

# Preview an arbitrary URL (no config needed)
scrns preview --url 'http://localhost:3000/?view=map'
```

On capture, prints the resulting state as a config snippet:
```
Captured "og":
  query: '?view=map&zoom=12'
  width: 1200
  height: 800
```

### Docker Mode

Screenshots rendered on macOS differ from Linux CI output (fonts, antialiasing). `scrns -D`/`--docker` runs the capture inside a `mcr.microsoft.com/playwright` container matching the GHA runner environment, so locally-generated screenshots are byte-identical to CI:

```bash
scrns -D
```

- The image defaults to `mcr.microsoft.com/playwright:v<version>-noble`, matching the installed Playwright version; override with `--docker-image`.
- When run from a scrns checkout (local dev), the local build is packed and mounted; otherwise the installed version is reused. Pin explicitly with `--docker-scrns <ver>` (npm version, bare SHA, or `gh:<sha>` / `gl:<sha>`).
- `docker`, `dockerImage`, and `dockerPlatform` can also be set in the config file.

## Config File

Create `scrns.config.ts` (or `.js`/`.json`). The config can be a flat `Screens` map:

```typescript
export default {
  'home': {
    query: '',
    width: 1200,
    height: 800,
  },
  'about': {
    query: 'about',
    selector: '.main-content',
  },
  'footer': {
    query: '',
    scrollTo: 'footer',
    scrollOffset: 20,
  },
}
```

Or a `Config` with top-level options and a `screenshots` key, so that `host`, `output`, etc. live in the config file instead of CLI flags:

```typescript
import { Config } from 'scrns'

const config: Config = {
  engine: 'playwright',  // or 'puppeteer' (default: auto-detect, prefers Playwright)
  host: 3456,
  output: 'public/img/screenshots',
  selector: '.app',
  screenshots: {
    'home': { query: '' },
    'about': { query: 'about' },
  },
}

export default config
```

Top-level config options (`engine`, `host`, `https`, `output`, `selector`, `loadTimeout`, `downloadSleep`, `browserArgs`, `headless`, `screenshotTimeout`, `docker`, `dockerImage`, `dockerPlatform`) are overridden by their corresponding CLI flags when both are specified.

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `{name}.png` | Output path (relative to outputDir, or absolute) |
| `query` | `string` | `''` | URL path/query (appended to baseUrl) |
| `width` | `number` | `800` | Viewport width |
| `height` | `number` | `560` | Viewport height |
| `selector` | `string` | - | CSS selector to wait for before capturing |
| `loadTimeout` | `number` | `30000` | Timeout in ms for selector wait |
| `preScreenshotSleep` | `number` | `0` | Sleep in ms before taking screenshot |
| `scrollY` | `number` | `0` | Scroll Y pixels before screenshot |
| `scrollTo` | `string` | - | CSS selector to scroll into view |
| `scrollOffset` | `number` | `0` | Offset pixels above `scrollTo` element |
| `download` | `boolean` | `false` | Set download behavior instead of screenshot |
| `downloadSleep` | `number` | `1000` | Sleep in ms while waiting for download |
| `browserArgs` | `string[]` | - | Additional browser launch args for this screenshot |
| `headless` | `boolean` | `true` | Override headless mode for this screenshot |
| `screenshotTimeout` | `number` | `30000` | Timeout in ms per screenshot capture |

### Screencast Options

Adding an `actions` array to a config entry turns it into a screencast. The output defaults to `.gif`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `actions` | `ScreencastAction[]` | - | Action timeline (presence triggers screencast mode) |
| `fps` | `number` | `15` | Frames per second for GIF capture |
| `gifQuality` | `number` | `10` | GIF quality: 1-30, lower = better |
| `loop` | `boolean` | `true` | Whether the GIF should loop |
| `videoCrf` | `number` | `23` | CRF quality for video output (lower = better, requires ffmpeg) |

### Screencast Actions

| Action | Fields | Description |
|--------|--------|-------------|
| `wait` | `duration` | Pause for `duration` ms |
| `key` | `key`, `duration` | Hold key(s) for `duration` ms (e.g. `'Shift+ArrowLeft'`) |
| `keydown` | `key` | Press and hold key(s) |
| `keyup` | `key` | Release key(s) |
| `type` | `text` | Type text |
| `click` | `x`, `y`, `button?` | Click at coordinates |
| `hover` | `x`, `y` or `selector`, `index?` | Move mouse to coordinates, or to the center of the `index`th element matching `selector` |
| `drag` | `from`, `to`, `duration`, `button?` | Drag between coordinates over `duration` ms |
| `animate` | `frames`, `eval`, `frameDelay?` | Deterministic frame-by-frame capture (see below) |

The `animate` action calls `eval` as `(frameIndex, totalFrames) => ...` for each frame, capturing a screenshot after each call. This produces deterministic, idempotent GIF output.

### Screencast Example

```typescript
export default {
  // Screenshot (unchanged)
  'og': {
    query: '?view=default',
    width: 1200,
    height: 800,
    selector: '#root',
    path: 'og.png',
  },
  // Screencast: hold a key to rotate a 3D view
  'hero': {
    query: '?view=3d',
    width: 800,
    height: 500,
    selector: '#root',
    preScreenshotSleep: 3000,
    path: 'hero.gif',
    fps: 15,
    actions: [
      { type: 'wait', duration: 1000 },
      { type: 'key', key: 'Shift+ArrowLeft', duration: 4000 },
      { type: 'wait', duration: 1000 },
    ],
  },
  // Screencast: deterministic frame-by-frame animation
  'rotate': {
    query: '?view=3d',
    width: 800,
    height: 500,
    selector: '#root',
    preScreenshotSleep: 3000,
    path: 'rotate.gif',
    fps: 15,
    actions: [
      { type: 'wait', duration: 500 },
      { type: 'animate', frames: 60, eval: '(i, n) => { window.setBearing(i * 360 / n) }' },
      { type: 'wait', duration: 500 },
    ],
  },
}
```

### Video Output

Set the output `path` to `.mp4`, `.mkv`, `.mov`, or `.webm` to produce video output via ffmpeg instead of GIF. This gives frame-accurate recordings with proper codec compression (H.264 or VP9).

**Requires [ffmpeg] on `$PATH`.**

```typescript
export default {
  'demo': {
    query: '?view=demo',
    width: 800,
    height: 600,
    selector: '#root',
    path: 'demo.mp4',
    videoCrf: 18,  // lower = better quality
    actions: [
      { type: 'wait', duration: 1000 },
      { type: 'key', key: 'ArrowRight', duration: 3000 },
      { type: 'wait', duration: 1000 },
    ],
  },
}
```

Codec selection is based on extension: `.webm` → VP9 (`libvpx-vp9`), all others → H.264 (`libx264`).

To derive a GIF from video output:
```bash
ffmpeg -i demo.mp4 -vf "fps=15,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" demo.gif
```

[ffmpeg]: https://ffmpeg.org/

## Programmatic Usage

```typescript
import { takeScreenshots, resolveEngine, ScreencastConfig } from 'scrns'

// Optional: explicitly choose an engine (auto-detects if omitted)
const engine = await resolveEngine('playwright')

await takeScreenshots({
  'home': { query: '' },
  'about': { query: 'about', selector: '.content' },
  'demo': {
    query: 'demo',
    actions: [
      { type: 'wait', duration: 1000 },
      { type: 'key', key: 'Enter', duration: 100 },
      { type: 'wait', duration: 2000 },
    ],
    fps: 10,
  } satisfies ScreencastConfig,
}, {
  baseUrl: 'http://localhost:3000',
  outputDir: './screenshots',
  defaultSelector: '#app',
  include: /home|demo/,
  log: console.log,
  engine,  // omit to auto-detect
})
```

## Used by

- [jc-taxes] ([usage][jc-taxes-scrns]) — Jersey City property tax map (deck.gl 3D visualization)
- [use-kbd] ([usage][use-kbd-scrns]) — Omnibars, editable hotkeys, search, and keyboard-navigation for React apps
<!-- - [disk-tree] ([usage][disk-tree-scrns]) — Disk usage visualization -->
<!-- - [elvis] ([usage][elvis-scrns]) — Electrai visualization -->
- [ctbk] ([usage][ctbk-scrns]) — Citi Bike trip data explorer
- [apvd] ([usage][apvd-scrns]) — Area-proportional Venn diagrams

[jc-taxes]: https://github.com/runsascoded/jc-taxes
[jc-taxes-scrns]: https://github.com/search?q=repo%3Arunsascoded%2Fjc-taxes+scrns&type=code
[use-kbd]: https://github.com/runsascoded/use-kbd
[use-kbd-scrns]: https://github.com/search?q=repo%3Arunsascoded%2Fuse-kbd+scrns&type=code
[disk-tree]: https://github.com/runsascoded/disk-tree
[disk-tree-scrns]: https://github.com/search?q=repo%3Arunsascoded%2Fdisk-tree+scrns&type=code
[ctbk]: https://github.com/hudcostreets/ctbk.dev
[ctbk-scrns]: https://github.com/search?q=repo%3Ahudcostreets%2Fctbk.dev+scrns&type=code
[apvd]: https://github.com/runsascoded/apvd
[apvd-scrns]: https://github.com/search?q=repo%3Arunsascoded%2Fapvd+scrns&type=code
[elvis]: https://github.com/Quantum-Accelerators/electrai
[elvis-scrns]: https://github.com/search?q=repo%3AQuantum-Accelerators%2Felectrai+scrns&type=code
[gl]: https://gitlab.com/runsascoded/js/scrns
[gh-v1]: https://github.com/runsascoded/scrns/tree/v1
[gl-v1]: https://gitlab.com/runsascoded/js/scrns/-/tree/v1
[npm]: https://www.npmjs.com/package/scrns
[npm-badge]: https://img.shields.io/npm/v/scrns.svg
