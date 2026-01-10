# scrns

[![npm version][npm-badge]][npm]

Automated screenshots with Puppeteer - wait for selectors, configurable viewports, scroll positioning, and downloads.

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

Create `scrns.config.ts` (or `.js`/`.json`):

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

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
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

## Programmatic Usage

```typescript
import { takeScreenshots } from 'scrns'

await takeScreenshots({
  'home': { query: '' },
  'about': { query: 'about', selector: '.content' },
}, {
  baseUrl: 'http://localhost:3000',
  outputDir: './screenshots',
  defaultSelector: '#app',
  include: /home/,
  log: console.log,
})
```

[GitLab]: https://gitlab.com/runsascoded/js/scrns
[npm]: https://www.npmjs.com/package/scrns
[npm-badge]: https://img.shields.io/npm/v/scrns.svg
