# Auth headers, element crop, device scale factor

From the disky deep-dive deck (`~/c/oa/disky-deep-dive`, `scrns/disky.config.ts`), which recreates screenshots taken while using disky as scrns recipes. Three gaps came up:

## 1. Request headers (auth)

Most disky deploys (gcs.oa.dev, cw.oa.dev, hf.oa.dev, …) sit behind `@open-athena/auth`, which also accepts `Authorization: Bearer <grant token>` on every request (page navigations and in-app `fetch`es). disky's own Playwright e2e config does exactly this via `extraHTTPHeaders`. scrns can't: it calls `browser.newPage()` with no options, and there's no header / cookie / storage-state config.

Proposal:
- Config-level `headers?: Record<string, string>` (and per-shot override/merge), applied to every request from the page: Playwright `browser.newContext({ extraHTTPHeaders })` (or `page.setExtraHTTPHeaders`); Puppeteer `page.setExtraHTTPHeaders`.
- Values can reference env vars, so tokens stay out of committed configs, e.g. `headers: { Authorization: 'Bearer $SITE_TOKEN' }` expanded at run time (error if the var is unset), or just let TS configs read `process.env` and document that.
- Optional: `storageState?: string` (Playwright only) for cookie-based sessions.
- Never log header values.

## 2. Crop to an element

`selector` only waits; the capture is always the viewport. Recipes want "just this panel" (e.g. disky `/health`'s `section.hl-store`, a treemap, a modal).

Proposal: `crop?: string | { selector: string, padding?: number }`: screenshot `page.locator(sel).first()` (Playwright) / `elementHandle.screenshot()` (Puppeteer), with optional padding (via `clip` from the bounding box, clamped to the page). For screencasts, apply the same clip to every frame, computed once after load/actions settle (or per frame, behind a flag).

## 3. Device scale factor

`--force-device-scale-factor=1` is a base launch arg, and there's no way to get 2× captures for slides/retina. Proposal: `scale?: number` (config + per shot) → `newContext({ deviceScaleFactor })` / `setViewport({ deviceScaleFactor })`, replacing the forced arg when set.

## Tests

- Headers: a local test server that 401s without the header and echoes it; assert the shot is taken (200 path) and that a missing env var errors before launch.
- Crop: output PNG dimensions equal the element's box (× scale, + 2·padding).
- Scale: `scale: 2` doubles output dimensions.

## As built

All three landed (config + per-shot), for both engines, plus `storageState` (Playwright only). Deviations / decisions from implementation:

- **Pages**: `ScrnsBrowser.newPage(PageOptions)` takes `{ headers, scale, storageState }`. Playwright opens one context per page (`newContext({ extraHTTPHeaders, deviceScaleFactor, storageState })`), so nothing leaks between shots; Puppeteer uses `setExtraHTTPHeaders` + `setViewport({ deviceScaleFactor })` (and throws on `storageState`). `takeScreenshots` reuses a page across consecutive shots with identical page options and opens a fresh one when they change.
- **Headers**: per-shot `headers` merge over top-level ones. `$NAME` / `${NAME}` refs are expanded for every shot before any browser launches (unset var → `Header "<name>" references unset env var $NAME`). Only header *names* are logged. They go to every request from the page, including third-party origins (as proposed); documented as a caveat rather than scoped to `baseUrl`'s origin. `--docker` forwards referenced vars by name (`docker run -e NAME`). No CLI flags (config-only); `storageState` files aren't mounted into Docker.
- **Scale**: `--force-device-scale-factor=1` is kept, not replaced: both engines' per-context/viewport DSF overrides it (verified: 2× output with the flag present), and the flag still pins headful-on-retina captures to 1× by default.
- **Crop**: the box is measured in document coordinates after load / scroll / `preScreenshotSleep`, snapped outward to whole pixels, padded, and clamped to the page. Puppeteer's `clip` is document-relative; Playwright's is viewport-relative unless `fullPage: true`, which its adapter sets whenever clipping (so off-viewport elements work in both). Missing selector → error. Screencasts use one clip for every frame; the per-frame option wasn't needed (disky's crops are static panels).
- **Screencasts**: GIF frames are now sized from each frame's PNG (not the viewport), since crop and scale change frame dims; video output adds `-vf pad=ceil(iw/2)*2:ceil(ih/2)*2`, since `yuv420p` needs even dims and crops can be odd (a no-op otherwise; mp4 idempotency test still byte-identical).
- **Tests** (both engines): an in-process server that 401s without `Authorization` and records each request's headers (asserting navigations and in-page `fetch`es carry them, per-shot/global merging, and page re-creation); crop dims + pixel colors for an off-viewport element at `scale: 2`, padding clamping, missing selector, cropped screencast GIF dims; `scale: 2` dims; env expansion unit tests, including erroring before launch.
