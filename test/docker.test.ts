import { describe, it, expect } from 'vitest'
import { resolveDistSha, resolveVersionSpec } from '../src/docker.js'

const SRC_A = 'aaaaaaa1111111111111111111111111111111111'.slice(0, 40)
const SRC_B = 'bbbbbbb2222222222222222222222222222222222'.slice(0, 40)
const DIST_A = 'da00000000000000000000000000000000000001'
const DIST_B = 'db00000000000000000000000000000000000002'

/** `dist` history, newest first: each dist commit sits on top of its source commit */
const HISTORY: [string, string][] = [
  [DIST_B, `scrns@0.4.0-dist.bbbbbbb\n\nBuilt from ${SRC_B}`],
  [SRC_B, 'Add a feature'],
  [DIST_A, `scrns@0.4.0-dist.aaaaaaa\n\nBuilt from ${SRC_A}`],
  [SRC_A, 'Fix a bug'],
]

/** Fake `fetch` serving HISTORY in pages of 2, in each host's response shape; records requested URLs */
function fakeFetch(urls: string[]) {
  return async (url: string) => {
    urls.push(url)
    const page = Number(new URL(url).searchParams.get('page'))
    const commits = HISTORY.slice(2 * (page - 1), 2 * page)
    const body = url.startsWith('https://api.github.com/')
      ? commits.map(([sha, message]) => ({ sha, commit: { message } }))
      : commits.map(([id, message]) => ({ id, message }))
    return { ok: true, status: 200, json: async () => body }
  }
}

describe('resolveDistSha', () => {
  it('maps a source SHA prefix to the dist commit built from it', async () => {
    const urls: string[] = []
    expect(await resolveDistSha('gitlab', 'aaaaaaa', fakeFetch(urls))).toBe(DIST_A)
    expect(urls).toEqual([1, 2].map(p =>
      `https://gitlab.com/api/v4/projects/runsascoded%2Fjs%2Fscrns/repository/commits?ref_name=dist&per_page=100&page=${p}`,
    ))
  })
  it('resolves a dist SHA to itself', async () => {
    expect(await resolveDistSha('github', 'db00000', fakeFetch([]))).toBe(DIST_B)
  })
  it('throws when no dist commit was built from the SHA', async () => {
    const urls: string[] = []
    await expect(resolveDistSha('github', 'ccccccc', fakeFetch(urls)))
      .rejects.toThrow(new Error('No github dist build found for ccccccc (pushed to main, and CI finished?)'))
    // Stops at the first empty page
    expect(urls.length).toBe(3)
  })
  it('throws on HTTP errors', async () => {
    const fetchFn = async () => ({ ok: false, status: 403, json: async () => ({}) })
    await expect(resolveDistSha('github', 'aaaaaaa', fetchFn)).rejects.toThrow(new Error(
      'Listing github dist commits failed: HTTP 403 (https://api.github.com/repos/runsascoded/scrns/commits?sha=dist&per_page=100&page=1)',
    ))
  })
})

describe('resolveVersionSpec', () => {
  it.each([
    ['0.4.0', 'scrns@0.4.0'],
    ['gh:bbbbbbb', `github:runsascoded/scrns#${DIST_B}`],
    ['bbbbbbb', `github:runsascoded/scrns#${DIST_B}`],
    ['gl:aaaaaaa', `gitlab:runsascoded/js/scrns#${DIST_A}`],
    ['github:someone/fork#abc1234', 'github:someone/fork#abc1234'],
  ])('%s → %s', async (version, spec) => {
    expect(await resolveVersionSpec(version, fakeFetch([]))).toBe(spec)
  })
})
