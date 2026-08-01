import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Browser e2e tests routinely exceed vitest's 5s default on shared CI runners
    testTimeout: 30000,
  },
})
