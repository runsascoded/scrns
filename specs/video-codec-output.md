# Frame-accurate video output via ffmpeg

## Summary

Add a fourth recording mode: deterministic frame capture (like GIF mode) piped to ffmpeg for proper video codec output (H.264/VP9). This gives jitter-free recordings at modern compression ratios, from which GIFs can be derived downstream.

## Motivation

The current recording modes have complementary weaknesses:

- **GIF mode** captures frames deterministically (no jitter) but outputs 256-color GIF with poor compression (6+ MB for a 4-second 800x600 clip).
- **WebM mode** uses Chrome's `page.screencast()` which records in real-time, producing jittery output when the page is under load (e.g. WebGL rendering).

The ideal pipeline for producing web-ready screencasts:
1. Capture frames deterministically at exact intervals (like GIF mode)
2. Encode to a proper video codec (H.264, VP9) with good compression
3. Optionally derive GIFs from the video at lower framerate/resolution

## Design

### Output format detection

Extend the existing dispatch logic to handle video extensions:

```ts
const VIDEO_EXTS = ['.mp4', '.mkv', '.mov', '.webm']

if (hasAnimateAction(config.actions)) {
  await recordFrameByFrame(page, config, path, width, height, log)
} else if (VIDEO_EXTS.some(ext => path.endsWith(ext))) {
  await recordScreencastVideo(page, config, path, width, height, log)
} else {
  await recordScreencastGif(page, config, path, width, height, log)
}
```

When the path ends in `.webm`, the new mode takes precedence over the old `recordScreencastWebM` (which used Chrome's native screencast). The old behavior could be accessed via an explicit `mode: 'native-screencast'` config option if needed, but is unlikely to be preferred.

### `recordScreencastVideo`

Same frame capture loop as `recordScreencastGif` — runs actions concurrently with `page.screenshot({ encoding: 'binary' })` at the target FPS interval. But instead of accumulating frames in memory for `gifenc`, pipes each PNG frame to an ffmpeg subprocess via stdin.

```ts
async function recordScreencastVideo(
  page: Page,
  config: ScreencastConfig,
  path: string,
  width: number,
  height: number,
  log: LogFn,
): Promise<void> {
  const fps = config.fps ?? 15
  const frameInterval = 1000 / fps

  // Spawn ffmpeg: read PNG frames from stdin, encode to output format
  const ffmpeg = spawn('ffmpeg', [
    '-y',                          // overwrite output
    '-f', 'image2pipe',            // read images from pipe
    '-framerate', String(fps),     // input framerate
    '-i', '-',                     // stdin
    '-c:v', codecForExt(path),     // e.g. libx264, libvpx-vp9
    '-pix_fmt', 'yuv420p',        // compatibility
    '-crf', String(config.videoCrf ?? 23), // quality (lower = better)
    path,
  ])

  // Capture loop (same as GIF mode)
  let capturing = true
  const captureLoop = async () => {
    while (capturing) {
      const start = Date.now()
      const frame = await page.screenshot({ encoding: 'binary' })
      ffmpeg.stdin.write(frame)
      const elapsed = Date.now() - start
      if (elapsed < frameInterval) {
        await sleep(frameInterval - elapsed)
      }
    }
  }

  const [capturePromise] = [captureLoop(), await executeActions(page, config.actions, log)]
  capturing = false
  await capturePromise

  ffmpeg.stdin.end()
  await new Promise((resolve, reject) => {
    ffmpeg.on('close', resolve)
    ffmpeg.on('error', reject)
  })
}
```

### Codec selection

Map output extension to ffmpeg codec:

```ts
function codecForExt(path: string): string {
  if (path.endsWith('.mp4') || path.endsWith('.mov')) return 'libx264'
  if (path.endsWith('.webm')) return 'libvpx-vp9'
  if (path.endsWith('.mkv')) return 'libx264'  // MKV supports most codecs
  return 'libx264'
}
```

### Config additions

```ts
export type ScreencastConfig = ScreenshotConfig & {
  actions: ScreencastAction[]
  fps?: number          // default: 15
  gifQuality?: number   // 1-30, lower = better (GIF only, default: 10)
  loop?: boolean        // default: true (GIF only)
  videoCrf?: number     // CRF quality for video output (default: 23, lower = better)
}
```

### ffmpeg dependency

ffmpeg is expected to be on `$PATH`. If not found, print a helpful error:

```
Error: ffmpeg not found. Install it to use video output:
  brew install ffmpeg    # macOS
  apt install ffmpeg     # Ubuntu/Debian
```

No npm dependency needed — ffmpeg is a system tool that most developers already have. This keeps the package lean.

### GIF derivation

Not in scope for scrns itself, but the intended downstream workflow:

```bash
# High-quality video capture
pnpm scrns -i my-screencast   # outputs my-screencast.mp4

# Derive GIF with controlled palette and framerate
ffmpeg -i my-screencast.mp4 -vf "fps=15,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" my-screencast.gif
```

This two-pass GIF generation produces much better results than direct 256-color quantization.

## Files modified

| File | Change |
|---|---|
| `src/index.ts` | `recordScreencastVideo()`, `codecForExt()`; update dispatch logic; add `videoCrf` to `ScreencastConfig` |
| `README.md` | Document video output, ffmpeg requirement, GIF derivation workflow |

## Testing

1. Video output with `.mp4` extension produces valid H.264 file (check magic bytes or ffprobe)
2. Frame count matches expected value for given FPS and action durations
3. Missing ffmpeg produces helpful error message
4. `.webm` extension now uses frame-accurate capture (not Chrome native screencast)
