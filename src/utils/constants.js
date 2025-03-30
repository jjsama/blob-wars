/**
 * Constants file for Blob Wars
 * Contains configuration values that might change between development and production
 */

// Environment detection (you can set this based on ENV variables in production)
export const IS_PRODUCTION = false; // Set to true for production builds

// Asset paths
export const ASSET_PATHS = {
    // In development, models are served from the public folder directly
    // In production with a build step, they would be in the dist/assets folder
    models: {
        player: IS_PRODUCTION ? '/assets/models/blobville-player.glb' : '/public/models/blobville-player.glb',
        // Add other model paths as needed
    },
    textures: {
        // Add texture paths as needed
    },
    audio: {
        // Add audio paths as needed
    }
};

// Game configuration
export const GAME_CONFIG = {
    playerStartPosition: { x: 0, y: 5, z: 0 },
    enemySpawnHeight: 5,
    physics: {
        gravity: -20
    }
}; 