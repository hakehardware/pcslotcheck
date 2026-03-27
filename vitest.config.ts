import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'tsx-jsdom',
          include: ['tests/**/*.{test,prop}.tsx', 'src/**/__tests__/*.{test,prop}.tsx'],
          environment: 'jsdom',
        },
      },
      {
        extends: true,
        test: {
          name: 'ts-node',
          include: ['tests/**/*.{test,prop}.ts', 'src/**/__tests__/*.{test,prop}.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
