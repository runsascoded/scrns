# scrns GitHub Action

Reusable GitHub Action for automated screenshot generation + diff checking in CI.

Installs [scrns], runs it against a target server, detects changes, and optionally fails or commits+pushes updated screenshots.

## Usage

### Fail on diff (default)

```yaml
- uses: runsascoded/scrns@v1
  with:
    host: localhost:3847
    output: public/screenshots
```

If screenshots change, the step fails with a diff summary.

### Commit and push on diff

```yaml
- uses: runsascoded/scrns@v1
  id: scrns
  with:
    host: localhost:8080
    output: public/screenshots
    selector: '.plotly svg rect'
    load-timeout: 120000
    on-diff: commit
    push-branches: main,www

- name: Deploy
  if: steps.scrns.outputs.committed != 'true'
  uses: JamesIves/github-pages-deploy-action@v4
```

When screenshots change, the action commits and pushes to the specified branches. The push re-triggers the workflow; on the next run, screenshots match and deployment proceeds.

### Silent diff detection

```yaml
- uses: runsascoded/scrns@v1
  id: scrns
  with:
    host: localhost:3000
    on-diff: none

- name: Custom handling
  if: steps.scrns.outputs.changed == 'true'
  run: echo "Changed files:" && echo "${{ steps.scrns.outputs.changed-files }}"
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `host` | **yes** | — | Hostname or port for the target server |
| `output` | no | `./screenshots` | Output directory |
| `config` | no | auto-detect | Config file path |
| `engine` | no | from config | `playwright` or `puppeteer` |
| `selector` | no | from config | CSS selector to wait for |
| `load-timeout` | no | from config | Timeout waiting for selector (ms) |
| `browser-args` | no | — | Space-separated extra browser args |
| `include` | no | — | Regex filter for which screenshots to generate |
| `on-diff` | no | `fail` | `fail`, `commit`, or `none` |
| `upload-artifact` | no | `false` | Upload changed screenshots as artifact on failure |
| `commit-message` | no | `Update screenshots` | For `on-diff: commit` |
| `push-branches` | no | current branch | Comma-separated branches to push to |
| `git-user` | no | `GitHub Actions` | Commit author name |
| `git-email` | no | `github@actions` | Commit author email |
| `version` | no | from repo deps | Pin scrns version |

## Outputs

| Output | Description |
|---|---|
| `changed` | `true` or `false` |
| `changed-files` | Newline-separated list of changed files |
| `committed` | `true` or `false` |

## How it works

1. **Detect scrns**: Uses the project's installed version (via `pnpm exec` or `npx`) if `scrns` is in `package.json`. Otherwise installs globally (latest, or pinned via `version` input).
2. **Detect engine**: Reads from `engine` input, or scans scrns config files. Defaults to `playwright`.
3. **Install browser**: Runs `npx playwright install --with-deps chromium` for Playwright. Puppeteer bundles its own Chrome.
4. **Run scrns**: Invokes scrns with CLI args built from inputs.
5. **Check diffs**: `git diff --name-only` against the output directory.
6. **Handle diffs**: Based on `on-diff` mode — fail the step, commit+push, or do nothing.

[scrns]: https://www.npmjs.com/package/scrns
