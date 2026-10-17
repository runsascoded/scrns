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
