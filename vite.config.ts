import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    // Pages supplies its path during CI; development stays at the server root.
    base: command === 'build' ? process.env.VITE_BASE_PATH ?? '/chess-roguelite/' : '/',
    plugins: [react()],
}));
