import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    server: {
        port: 3000,
        open: true // Open the browser automatically
    },
    publicDir: 'public', // Serve static assets from the public directory
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    },
    resolve: {
        alias: {
            'three': 'three'
        }
    },
    optimizeDeps: {
        include: ['three']
    }
}); 