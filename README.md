# scrns

[![npm version][npm-badge]][npm]

Automated screenshots and screencasts (GIF/WebM) with Puppeteer - wait for selectors, configurable viewports, scroll positioning, action timelines, and downloads.

## Install
```bash
pnpm add scrns
# or
npm install scrns
```

## CLI Usage
```bash
scrns [options]
```

### Options
| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Config file path (default: `scrns.config.{ts,js,json}`) |
| `-d, --download-sleep <ms>` | Sleep while waiting for downloads (default: 1000) |
| `-h, --host <host>` | Hostname or port (numeric port maps to `127.0.0.1:port`) |
| `-i, --include <regex>` | Only generate screenshots matching this regex |
| `-l, --load-timeout <ms>` | Timeout waiting for selector (default: 30000) |
| `-o, --output <dir>` | Output directory (default: `./screenshots`) |
| `-s, --selector <css>` | Default CSS selector to wait for |
| `--https` | Use HTTPS instead of HTTP |

### Example
```bash
# Auto-detect config, use localhost:3000
scrns

# Specify port and config
scrns -h 8080 -c my-config.ts

# Filter to specific screenshots
scrns -i "home|about"
```

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

Top-level config options (`host`, `https`, `output`, `selector`, `loadTimeout`, `downloadSleep`) are overridden by their corresponding CLI flags when both are specified.

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

### Screencast Options

Adding an `actions` array to a config entry turns it into a screencast. The output defaults to `.gif`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `actions` | `ScreencastAction[]` | - | Action timeline (presence triggers screencast mode) |
| `fps` | `number` | `15` | Frames per second for GIF capture |
| `gifQuality` | `number` | `10` | GIF quality: 1-30, lower = better |
| `loop` | `boolean` | `true` | Whether the GIF should loop |

### Screencast Actions

| Action | Fields | Description |
|--------|--------|-------------|
| `wait` | `duration` | Pause for `duration` ms |
| `key` | `key`, `duration` | Hold key(s) for `duration` ms (e.g. `'Shift+ArrowLeft'`) |
| `keydown` | `key` | Press and hold key(s) |
| `keyup` | `key` | Release key(s) |
| `type` | `text` | Type text |
| `click` | `x`, `y`, `button?` | Click at coordinates |
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

## Programmatic Usage

```typescript
import { takeScreenshots, ScreencastConfig } from 'scrns'

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
[GitLab]: https://gitlab.com/runsascoded/js/scrns
[npm]: https://www.npmjs.com/package/scrns
[npm-badge]: https://img.shields.io/npm/v/scrns.svg
