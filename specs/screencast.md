# Screencast support for `scrns`

## Summary

Screencast (screen recording) support alongside existing screenshot capture. A `ScreencastConfig` type extends the current config with an `actions` array — a timeline of keyboard/mouse inputs and waits that Puppeteer performs while capturing frames. Output is GIF (primary) or WebM.

## Motivation

The motivating use case is [jc-taxes](https://github.com/neighbor-ryan/jc-taxes), a deck.gl 3D map visualization. The app has keyboard shortcuts for continuous viewport control (pan, rotate, pitch, zoom via `requestAnimationFrame`). A good README screencast would:
1. Show the opening 3D view for ~1s
2. Slowly rotate to show off the 3D geometry
3. Hold the final view for ~1s
4. Loop as a GIF

This is achievable by holding `Shift+ArrowLeft` (which triggers continuous rotation in the app's rAF loop). The app could also expose a URL param like `&rotateSpeed=30` to control animation speed for cinematic recordings.

## Design

### Config type

```ts
export type ScreencastAction =
  | { type: 'wait', duration: number }
  | { type: 'keydown', key: string }
  | { type: 'keyup', key: string }
  | { type: 'key', key: string, duration: number }
  | { type: 'type', text: string }
  | { type: 'click', x: number, y: number, button?: 'left' | 'right' }
  | { type: 'drag', from: [number, number], to: [number, number], duration: number, button?: 'left' | 'right' }
  | { type: 'animate', frames: number, eval: string, frameDelay?: number }

export type ScreencastConfig = ScreenshotConfig & {
  actions: ScreencastAction[]
  fps?: number          // default: 15
  gifQuality?: number   // 1-30, lower = better (default: 10)
  loop?: boolean        // default: true
}
```

The existing `ScreenshotConfig` fields (`query`, `width`, `height`, `selector`, `preScreenshotSleep`) all apply — the screencast navigates and waits the same way, then runs `actions` while recording.

### Detection

If a config entry has an `actions` array, it's a screencast. Otherwise it's a screenshot:

```ts
export type ScreenshotsMap = Record<string, ScreenshotConfig | ScreencastConfig>

export function isScreencast(config: ScreenshotConfig | ScreencastConfig): config is ScreencastConfig {
  return 'actions' in config && Array.isArray(config.actions)
}
```

Default output extension is `.gif` for screencasts, `.png` for screenshots.

### Recording modes

Three recording modes, selected automatically based on config:

1. **`recordScreencastGif`** — Concurrent frame capture via `page.screenshot()` at target FPS, running in parallel with action execution. Used for GIF output with standard actions.

2. **`recordFrameByFrame`** — Deterministic per-frame capture for `animate` actions. Each frame calls `page.evaluate()` with the `eval` function, waits for double-rAF (to ensure React/framework re-render + paint), then captures. `wait` actions produce static frames (single screenshot repeated). Selected when any action has `type: 'animate'`.

3. **`recordScreencastWebM`** — Uses Puppeteer's native `page.screencast()` API for WebM output. Selected when the output path ends in `.webm`.

Dispatch logic:
```ts
if (hasAnimateAction(config.actions)) {
  await recordFrameByFrame(page, config, path, width, height, log)
} else if (path.endsWith('.webm')) {
  await recordScreencastWebM(page, config, path, log)
} else {
  await recordScreencastGif(page, config, path, width, height, log)
}
```

### Action execution

Actions are processed sequentially by `executeActions()`. Compound keys like `'Shift+ArrowLeft'` are split via `parseKeys()` into individual key events.

### GIF encoding

PNG frames are decoded to raw RGBA via `pngjs`, then quantized to 256-color palettes and encoded via [`gifenc`].

### Dependencies

- [`gifenc`] — GIF encoder with `quantize`/`applyPalette` (pure JS, ~15KB)
- [`pngjs`] — PNG decoder for converting screenshot frames to raw RGBA
- `@types/pngjs` — TypeScript types (devDep)

[`gifenc`]: https://github.com/mattdesl/gifenc
[`pngjs`]: https://github.com/lukeapage/pngjs

Note: `gifenc` has no TypeScript types, so `src/gifenc.d.ts` provides declarations. The CJS→ESM interop is handled via `import * as gifencModule` with runtime detection of the default-wrapped vs namespace shape.

### Example config

```ts
export default {
  // Existing screenshot — unchanged
  og: {
    query: '?v=40.7268-74.0620+12.9+57-30&sel=14506',
    width: 1200,
    height: 710,
    selector: '#root',
    preScreenshotSleep: 5000,
    path: 'og.png',
  },
  // Screencast with key-hold rotation
  'hero-cast': {
    query: '?v=40.7190-74.0696+13.0+50-16&agg=lot&rotateSpeed=20',
    width: 800,
    height: 500,
    selector: '#root',
    preScreenshotSleep: 5000,
    path: 'hero.gif',
    fps: 15,
    loop: true,
    actions: [
      { type: 'wait', duration: 1000 },
      { type: 'key', key: 'Shift+ArrowLeft', duration: 4000 },
      { type: 'wait', duration: 1000 },
    ],
  },
  // Screencast with deterministic frame-by-frame animation
  'rotate-anim': {
    query: '?v=40.7190-74.0696+13.0+50-16',
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

### CLI changes

No CLI changes needed — the `-i` filter and other flags work the same way. Screencasts are distinguished by config shape, not CLI flags.

## Files modified

| File | Change |
|---|---|
| `package.json` | Add `gifenc`, `pngjs` deps; `@types/pngjs` devDep |
| `src/index.ts` | `ScreencastAction`, `ScreencastConfig` types; `isScreencast()`; `executeActions()`, `parseKeys()`; `encodeGif()`, `recordScreencastGif()`, `recordFrameByFrame()`, `recordScreencastWebM()`; dispatch in `takeScreenshots()` |
| `src/gifenc.d.ts` | Type declarations for `gifenc` |
| `test/e2e.test.ts` | 3 screencast tests (GIF magic bytes, action execution, default `.gif` extension) |
| `test/screencast-fixture.html` | Test page with keypress-driven color cycling |

## Testing

Three e2e tests in `test/e2e.test.ts`:
1. Basic screencast with `wait` action produces `.gif` file with `GIF89a` header
2. Actions execute: key presses change page color, verified by GIF file size (multiple frames)
3. Default extension is `.gif` when no `path` specified

Test fixture (`test/screencast-fixture.html`): page where Space key cycles background color (red → green → blue).

## Future extensions

- **`--headful` flag** for debugging screencasts with a visible browser
- **Easing functions** for drag actions (ease-in-out mouse movement)
- **Composite actions**: `{ type: 'sequence', actions: [...], parallel: true }` for simultaneous key + mouse
