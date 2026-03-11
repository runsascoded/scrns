# Reusable GitHub Action for `scrns`

## Overview

Expose a reusable GitHub Action from the `scrns` repo (on a disjoint-lineage `v1` branch) that downstream repos can use to automate screenshot generation + diff checking in CI.

## Motivation

Two existing projects have scrns-in-CI patterns with significant boilerplate:

### hudson-transit (diff-and-fail)
- Runs `scrns`, then `git diff --exit-code public/screenshots/`
- Fails CI if screenshots changed (forces developer to update + commit)
- Uploads actual screenshots as artifact for inspection

### ctbk (commit-and-re-run)
- Runs `scrns` in a Docker container
- If screenshots changed: commits, pushes to multiple branches, sets `REGENERATED=true`
- Skips deployment if `REGENERATED=true` (the push re-triggers the workflow with updated HEAD)
- Eventually stabilizes: no diff → deployment proceeds

Both share common boilerplate: install scrns, run it, check diffs, optionally commit/push. The reusable action should absorb this.

## Action interface

```yaml
# .github/workflows/screenshots.yml (downstream usage)
- uses: runsascoded/scrns@v1
  with:
    # Required
    host: localhost:3847           # or just a port number

    # Optional (all have defaults)
    output: public/screenshots    # default: ./screenshots
    config: www/scrns.config.ts   # default: auto-detect
    engine: playwright            # default: auto-detect
    selector: '.plotly svg rect'  # default: from config
    load-timeout: 120000          # default: 30000
    browser-args: '--use-gl=swiftshader'  # space-separated extra args

    # Diff behavior (mutually exclusive modes)
    on-diff: fail                 # "fail" (default) | "commit" | "none"

    # For on-diff: commit
    commit-message: 'Update screenshots'  # default
    push-branches: 'main,www'    # default: current branch
    git-user: 'GitHub Actions'   # default
    git-email: 'github@actions'  # default
```

### Outputs

```yaml
outputs:
  changed:
    description: 'Whether screenshots changed ("true" or "false")'
  changed-files:
    description: 'Newline-separated list of changed screenshot files'
  committed:
    description: 'Whether a commit was created ("true" or "false")'
```

## Modes

### `on-diff: fail` (default)
1. Run `scrns` with provided options
2. `git diff --exit-code <output>/`
3. If diffs: upload changed screenshots as artifact, fail the step
4. Set `changed=true`, `committed=false`

### `on-diff: commit`
1. Run `scrns`
2. Check for diffs
3. If diffs:
   - `git add <output>/`
   - Commit with configured message/user
   - Push to each branch in `push-branches`
   - Set `changed=true`, `committed=true`
4. Downstream can use `committed` output to skip deployment (the ctbk pattern):
   ```yaml
   - uses: runsascoded/scrns@v1
     id: scrns
     with:
       on-diff: commit
       push-branches: main,www

   - name: Deploy
     if: steps.scrns.outputs.committed != 'true'
     uses: JamesIves/github-pages-deploy-action@v4
   ```

### `on-diff: none`
1. Run `scrns`
2. Set `changed` output but take no action
3. Downstream decides what to do

## Action implementation

### `action.yml`

```yaml
name: 'scrns'
description: 'Generate screenshots and check for changes'
inputs:
  host:
    description: 'Hostname or port for the target server'
    required: true
  output:
    description: 'Output directory'
    default: './screenshots'
  config:
    description: 'Path to scrns config file'
  engine:
    description: 'Browser engine (playwright or puppeteer)'
  selector:
    description: 'Default CSS selector to wait for'
  load-timeout:
    description: 'Timeout waiting for selector (ms)'
  browser-args:
    description: 'Additional browser launch args (space-separated)'
  include:
    description: 'Regex filter for which screenshots to generate'
  on-diff:
    description: 'What to do when screenshots change: fail, commit, or none'
    default: 'fail'
  commit-message:
    description: 'Commit message when on-diff is commit'
    default: 'Update screenshots'
  push-branches:
    description: 'Comma-separated branches to push to (on-diff: commit)'
  git-user:
    description: 'Git user name for commits'
    default: 'GitHub Actions'
  git-email:
    description: 'Git email for commits'
    default: 'github@actions'
outputs:
  changed:
    description: 'Whether screenshots changed'
  changed-files:
    description: 'Changed screenshot files (newline-separated)'
  committed:
    description: 'Whether a commit was created'
runs:
  using: 'composite'
  steps:
    - name: Install scrns
      shell: bash
      run: npm install -g scrns
    - name: Install Playwright browser
      shell: bash
      run: npx playwright install --with-deps chromium
    - name: Run scrns
      shell: bash
      run: |
        ARGS="-h ${{ inputs.host }} -o ${{ inputs.output }}"
        if [ -n "${{ inputs.config }}" ]; then ARGS="$ARGS -c ${{ inputs.config }}"; fi
        if [ -n "${{ inputs.engine }}" ]; then ARGS="$ARGS -E ${{ inputs.engine }}"; fi
        if [ -n "${{ inputs.selector }}" ]; then ARGS="$ARGS -s '${{ inputs.selector }}'"; fi
        if [ -n "${{ inputs.load-timeout }}" ]; then ARGS="$ARGS -l ${{ inputs.load-timeout }}"; fi
        if [ -n "${{ inputs.include }}" ]; then ARGS="$ARGS -i '${{ inputs.include }}'"; fi
        for arg in ${{ inputs.browser-args }}; do ARGS="$ARGS -b $arg"; done
        eval "scrns $ARGS"
    - name: Check for changes
      id: diff
      shell: bash
      run: |
        CHANGED_FILES=$(git diff --name-only -- "${{ inputs.output }}/")
        if [ -n "$CHANGED_FILES" ]; then
          echo "changed=true" >> $GITHUB_OUTPUT
          echo "changed-files<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGED_FILES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
        else
          echo "changed=false" >> $GITHUB_OUTPUT
          echo "changed-files=" >> $GITHUB_OUTPUT
        fi
    - name: Handle diff (fail)
      if: inputs.on-diff == 'fail' && steps.diff.outputs.changed == 'true'
      shell: bash
      run: |
        echo "::error::Screenshots have changed. Run scrns locally and commit the updated images."
        git diff --stat -- "${{ inputs.output }}/"
        exit 1
    - name: Handle diff (commit)
      id: commit
      if: inputs.on-diff == 'commit' && steps.diff.outputs.changed == 'true'
      shell: bash
      run: |
        git config user.name "${{ inputs.git-user }}"
        git config user.email "${{ inputs.git-email }}"
        git add "${{ inputs.output }}/"
        git commit -m "${{ inputs.commit-message }}"
        IFS=',' read -ra BRANCHES <<< "${{ inputs.push-branches }}"
        for branch in "${BRANCHES[@]}"; do
          branch=$(echo "$branch" | xargs)
          git push origin HEAD:"$branch"
        done
        echo "committed=true" >> $GITHUB_OUTPUT
```

## Hosting on a `v1` branch

The action lives on a disjoint `v1` branch (no shared history with `main`):

```bash
git checkout --orphan v1
git rm -rf .
# Add only action.yml (and maybe a README)
git add action.yml
git commit -m "Initial scrns GitHub Action v1"
git push origin v1
```

This keeps the action lightweight — no source code, tests, or build artifacts. `npm install -g scrns` pulls the published package at runtime.

## Open questions

1. **Playwright install step**: Always install Playwright's Chromium? Or let the downstream workflow handle browser installation? The action could detect which engine is configured and only install what's needed. For now, always installing Playwright (the default engine) seems simplest.

2. **Docker-based reproducibility**: ctbk uses Docker for deterministic screenshots. Should the action support a `docker-image` input that wraps the whole run in a container? Probably out of scope for v1 — downstream can use their own Docker setup and call the action inside it.

3. **Artifact upload on failure**: The `fail` mode could optionally upload the changed screenshots as a GHA artifact for inspection. Worth adding an `upload-artifact` input? Or let downstream handle it?

4. **`push-branches` default**: Default to current branch (`${{ github.ref_name }}`)? Or require explicit specification? Current branch seems safest.

5. **Version pinning**: The `npm install -g scrns` step installs latest. Should support a `version` input for pinning (`npm install -g scrns@0.3.0`).
