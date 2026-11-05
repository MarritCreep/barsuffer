import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительные пути, чтобы сборка работала на GitHub Pages из подпапки.
  base: './',
  test: {
    include: ['src/**/*.test.ts'], // логика, состояние и редьюсер плана
  },
});
