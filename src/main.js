import * as THREE from 'three';
import { initDebug, log, error } from './debug.js';
import { Game } from './Game.js';

// Initialize debug
initDebug();
log('Starting game initialization...');

// Check if THREE.js is loaded
try {
    log(`THREE.js version: ${THREE.REVISION}`);
} catch (err) {
    error('Failed to load THREE.js', err);
}

// Check if AmmoLib is defined (should be set by the index.html script)
if (typeof window.AmmoLib === 'undefined') {
    error('AmmoLib is not defined. Make sure Ammo.js is loaded and initialized correctly.');
} else {
    log('AmmoLib found, creating game...');

    // Make Ammo globally available for compatibility
    window.Ammo = window.AmmoLib;

    // Create and initialize game
    try {
        log('Creating game instance');
        const game = new Game();
        log('Game instance created, initializing...');

        // Make game globally accessible for the Player's getAimDirection method
        window.game = game;

        // Use setTimeout to allow UI to update before continuing
        setTimeout(async () => {
            try {
                await game.init();
                log('Game initialized successfully');
            } catch (err) {
                error('Failed to initialize game', err);
                // Show stack trace
                if (err.stack) {
                    log(`Stack trace: ${err.stack}`);
                }
            }
        }, 100);
    } catch (err) {
        error('Failed to create game instance', err);
        // Show stack trace
        if (err.stack) {
            log(`Stack trace: ${err.stack}`);
        }
    }
}

// Add global error handler
window.addEventListener('error', function (event) {
    error(`Global error: ${event.message} at ${event.filename}:${event.lineno}`);
});