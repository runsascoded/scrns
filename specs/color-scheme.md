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
