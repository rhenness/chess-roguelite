import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        include: ['src/game/**/*.test.ts', 'src/App.test.tsx'],
        setupFiles: './src/test/setup.ts',
        clearMocks: true,
    },
});
