# Model Path Configuration in Blob Wars

## Overview

This document explains how asset paths (models, textures, audio) are handled in both development and production environments.

## Current Setup

### Development Mode

In development mode (when running the Bun server directly):
- Assets are stored in the `/public` folder
- The server serves these files directly from paths like `/public/models/blobville-player.glb`
- No build step is needed

### Production Mode

When built for production with Bun's bundler:
- Assets will be processed by the build tool
- They will be placed in the `/dist` directory
- Paths are updated accordingly

## Path Configuration

We've created a constants file that handles this automatically:

```javascript
// src/utils/constants.js
export const IS_PRODUCTION = false; // Set to true for production builds

export const ASSET_PATHS = {
    models: {
        player: IS_PRODUCTION ? '/assets/models/blobville-player.glb' : '/public/models/blobville-player.glb',
        // Add other model paths as needed
    }
};
```

## How to Build for Production

1. Update `IS_PRODUCTION` flag in `constants.js` to `true`
2. Run your build command:
   ```
   bun run build
   ```
3. Serve the built assets:
   ```
   bun run start
   ```

## Folder Structure

### Development
```
project/
  ├── public/
  │   └── models/
  │       └── blobville-player.glb
  ├── src/
  │   └── ...
  └── ...
```

### Production (after build)
```
project/
  ├── dist/
  │   ├── assets/
  │   │   └── models/
  │   │       └── blobville-player.glb
  │   ├── index.html
  │   └── ...
  └── ...
```

## Tips for Troubleshooting

If models don't appear:
1. Check browser console for 404 errors
2. Verify that the model file exists in the correct location
3. Make sure path constants are correctly configured for your environment
4. Check server logs to see where the server is looking for model files 