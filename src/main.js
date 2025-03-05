import { Game } from './Game.js';

console.log('Script started');
console.log('About to initialize Ammo.js');

// Initialize Ammo.js first, then start the game
Ammo().then(function (AmmoLib) {
    console.log('Ammo.js loaded successfully');
    Ammo = AmmoLib;

    try {
        // Start the game
        console.log('Creating game instance');
        const game = new Game();
        console.log('Initializing game');
        game.init();
        console.log('Game initialized successfully');
    } catch (error) {
        console.error('Error initializing game:', error);
    }

}).catch(function (error) {
    console.error('Failed to load Ammo.js:', error);
    console.error('Make sure ammo.wasm.js and ammo.wasm.wasm are in the public folder');
    alert('Failed to load physics engine. See console for details.');
});