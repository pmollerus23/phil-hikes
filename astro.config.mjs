import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: { server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/gpx_map_data/**'] } } },
});
