import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: { manualChunks: (id: string) => id.includes('vexflow') ? 'notation' : undefined },
    },
  },
});
