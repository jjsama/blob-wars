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

// Create a toggleable console container
function createToggleableConsole() {
    // Create console container
    const consoleContainer = document.createElement('div');
    consoleContainer.id = 'game-console';
    consoleContainer.style.position = 'fixed';
    consoleContainer.style.top = '0';
    consoleContainer.style.left = '0';
    consoleContainer.style.width = '100%';
    consoleContainer.style.height = '200px';
    consoleContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    consoleContainer.style.color = '#fff';
    consoleContainer.style.fontFamily = 'monospace';
    consoleContainer.style.fontSize = '12px';
    consoleContainer.style.padding = '10px';
    consoleContainer.style.overflowY = 'auto';
    consoleContainer.style.zIndex = '1000';
    consoleContainer.style.display = 'none'; // Hidden by default

    document.body.appendChild(consoleContainer);

    // Add event listener for Tab key to toggle console
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault(); // Prevent default tab behavior
            consoleContainer.style.display =
                consoleContainer.style.display === 'none' ? 'block' : 'none';
        }
    });

    return consoleContainer;
}

// Override the console.log function to also output to our game console
function setupConsoleOverride() {
    const consoleContainer = createToggleableConsole();
    const originalLog = console.log;
    const originalError = console.error;

    // Override console.log
    console.log = function () {
        // Call the original console.log
        originalLog.apply(console, arguments);

        // Add to our custom console
        const logEntry = document.createElement('div');
        logEntry.textContent = Array.from(arguments).join(' ');
        consoleContainer.appendChild(logEntry);

        // Auto-scroll to bottom
        consoleContainer.scrollTop = consoleContainer.scrollHeight;
    };

    // Override console.error
    console.error = function () {
        // Call the original console.error
        originalError.apply(console, arguments);

        // Add to our custom console with error styling
        const errorEntry = document.createElement('div');
        errorEntry.textContent = Array.from(arguments).join(' ');
        errorEntry.style.color = '#ff5555';
        consoleContainer.appendChild(errorEntry);

        // Auto-scroll to bottom
        consoleContainer.scrollTop = consoleContainer.scrollHeight;
    };
}

// Call this function when the game starts
setupConsoleOverride();