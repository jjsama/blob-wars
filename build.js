import { build } from "bun";

await build({
    entrypoints: ['./src/main.js'],
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

// Copy styles.css to dist
await Bun.write(
    './dist/styles.css',
    await Bun.file('./styles.css').text()
);

// Copy Ammo.js files to dist
console.log('Copying Ammo.js files to dist...');
try {
    await Bun.write(
        './dist/ammo.wasm.js',
        await Bun.file('./public/ammo.wasm.js').text()
    );
    await Bun.write(
        './dist/ammo.wasm.wasm',
        await Bun.file('./public/ammo.wasm.wasm')
    );
    console.log('Successfully copied Ammo.js files to dist');
} catch (e) {
    console.error('Error copying Ammo.js files:', e);
}

// Copy public directory if it exists
try {
    await Bun.spawn(['cp', '-r', 'public', 'dist/']);
} catch (e) {
    console.log('No public directory found, skipping...');
} 