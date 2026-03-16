# Add `hover` screencast action

## Context

scrns supports `click`, `drag`, `keydown`, `type`, and `animate` actions for screencasts, but not `hover` (mouse move without click). This is needed for capturing GIFs that show hover-driven UI state changes, like legend item highlighting in Plotly charts.

Current workaround: writing a custom Playwright script that uses `page.mouse.move()` directly, bypassing scrns entirely. This loses scrns's config-driven approach, GIF encoding, and parallelization.

## Requirements

Add a `hover` action type to `ScreencastAction`:

```ts
| { type: 'hover', x: number, y: number }
```

Implementation in `executeActions`:

```ts
case 'hover':
  log(`  action: hover (${action.x}, ${action.y})`)
  await page.mouse.move(action.x, action.y)
  break
```

That's it — one union member, four lines of implementation.

## Optional enhancements

- `{ type: 'hover', selector: string }` — hover the center of an element matching a CSS selector (computes x/y from bounding box)
- `{ type: 'hover', selector: string, index: number }` — hover the nth matching element (for cycling through legend items)

These would be more useful than raw coordinates for the legend-cycling use case, since element positions vary by viewport size.

## Acceptance Criteria

1. `{ type: 'hover', x, y }` moves the mouse to the specified coordinates
2. Screencast captures the resulting UI state in the next frame
3. Works with `animate` for multi-frame hover sequences
