# `colorScheme` option

From the disky deep-dive deck (`~/c/oa/disky-deep-dive`), which captures every recipe in light and dark (`SCRNS_THEME=dark` → `public/scrns/<app>/dark/`, shown per-slide via a theme toggle).

## Problem

scrns has no way to emulate `prefers-color-scheme`. Apps whose dark mode is a URL param or a `localStorage` key can be handled with a prelude of `js` actions, but apps that only use `@media (prefers-color-scheme: dark)` (e.g. the `@open-athena/auth` demo) can't be. Chromium's `--force-dark-mode` / `--blink-settings=preferredColorScheme=…` launch args are no help: Playwright sets the emulated scheme per context and defaults it to `light`, overriding them.

The deck's workaround (`forceDarkMedia` in `scrns/lib.ts`) is a `js` action that copies every `@media (prefers-color-scheme: dark)` rule's contents into an unconditional `<style>` and sets `documentElement.style.colorScheme = 'dark'`. It's fragile: it misses cross-origin stylesheets, `matchMedia` listeners, `<picture><source media>`, and anything rendered before the action runs (flash of light content in casts).

## Proposal

- `colorScheme?: 'light' | 'dark' | 'no-preference'` at the config level and per shot (per-shot wins), in the same `PageOptions` as `headers` / `scale` / `storageState`, so a change of scheme between shots opens a new page.
- Playwright: `browser.newContext({ colorScheme })`.
- Puppeteer: `page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value }])` before `goto`.
- Optional CLI flag `--color-scheme <scheme>` (overrides the config's top-level value), so one config can be run in both themes without an env var: `scrns -c x.config.ts --color-scheme dark -o out/dark`. If added, an `--output`/`-o` override would make that one line; skip the flag if it doesn't fit the CLI's "config-only" stance from `headers`.

## Tests

- A fixture page whose body background is set only by `@media (prefers-color-scheme: dark)`. Assert a pixel's color for `dark`, `light`, and unset (light), on both engines.
- Per-shot override over the global value, plus page re-creation when the scheme changes between shots (like the headers merge test).

## As built

- `colorScheme?: 'light' | 'dark'` at the config level, per shot (wins), and on `ScreenshotsOptions` / `previewScreenshot`. It's part of `PageOptions`, so a scheme change between shots opens a fresh page/context. Validated before any browser launches: `Invalid colorScheme "drak" (expected one of: light, dark)`.
- **No `no-preference`**: on both engines it rendered identically to `light` (Chromium stopped matching `prefers-color-scheme: no-preference`), so it'd be a value that does nothing.
- Playwright: `browser.newContext({ colorScheme })` (unset → Playwright's default, `light`).
- Puppeteer: `page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value }])` right after `newPage`, **always** (default `light`). Previously Puppeteer didn't emulate at all, so headless Chrome followed the host OS theme: on a dark-mode Mac, unthemed Puppeteer captures came out dark, differing from Playwright / CI / Docker. The "unset → light" test caught this.
- CLI: `-C, --color-scheme <light|dark>` (shared by the default command and `preview`, incl. `preview --url`), overriding top-level `colorScheme`; per-shot values still win. `-o` already existed, so one config in both themes is `scrns -C dark -o screenshots/dark`. Passed through to Docker runs as `-C`.
- Tests: `test/color-scheme-fixture.html` (background set only by `prefers-color-scheme: light` → blue / `dark` → black media rules); per engine: unset / `light` / `dark` pixels, and per-shot `light` between two global-`dark` shots (fails if the page isn't re-created). Plus an engine-independent invalid-value-before-launch test.
