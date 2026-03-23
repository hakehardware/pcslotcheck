import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,prop}.ts'],
    globals: true,
    passWithNoTests: true,
  },
});
