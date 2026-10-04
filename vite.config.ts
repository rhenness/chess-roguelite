import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
    const siteUrl = new URL(process.env.VITE_SITE_URL ?? 'https://rhenness.github.io/chess-roguelite/');
    if (!siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/';
    const htmlSiteUrl = siteUrl.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

    return {
        // Pages supplies its path during CI; development stays at the server root.
        base: command === 'build' ? process.env.VITE_BASE_PATH ?? '/chess-roguelite/' : '/',
        plugins: [react(), {
            name: 'social-preview-url',
            // Link preview crawlers need absolute URLs in the initial HTML response.
            transformIndexHtml: html => html.replaceAll('__SITE_URL__', htmlSiteUrl),
        }],
    };
});
