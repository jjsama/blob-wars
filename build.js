import { build } from "bun";

await build({
    entrypoints: ['./index.ts'],
    outdir: './dist',
    minify: true,
    target: 'browser',
    splitting: true,
    sourcemap: 'none',
});

// Copy index.html to dist
await Bun.write(
    './dist/index.html',
    await Bun.file('./index.html').text()
);

// Copy public directory if it exists
try {
    await Bun.spawn(['cp', '-r', 'public', 'dist/']);
} catch (e) {
    console.log('No public directory found, skipping...');
} 