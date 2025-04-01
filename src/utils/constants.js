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
    enemySpawnHeight: 2,
    physics: {
        gravity: -20
    }
};

// Array of bright and distinct colors for players and enemies
export const PLAYER_COLORS = [
    0xff6b6b, // Bright red
    0x48dbfb, // Bright blue
    0x1dd1a1, // Bright green
    0xfeca57, // Bright yellow
    0xff9ff3, // Bright pink
    0x54a0ff, // Bright sky blue
    0x00d2d3, // Bright teal
    0xf368e0, // Bright magenta
    0xff9f43, // Bright orange
    0xee5253, // Bright crimson
    0xa29bfe, // Bright purple
    0x6ab04c, // Forest green
    0xbadc58, // Lime
    0xc7ecee, // Powder blue
    0xdff9fb, // Light cyan
    0x7ed6df, // Middle blue
    0xe056fd, // Magenta
    0xeb4d4b, // Red
    0xf0932b, // Orange
    0xffbe76, // Sandy
]; 