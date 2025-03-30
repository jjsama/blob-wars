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
  // Show fallback error message on screen
  showErrorMessage('Failed to load THREE.js library. Please check your internet connection and try again.');
}

// Function to show error messages to the user
function showErrorMessage(message) {
  const errorElement = document.createElement('div');
  errorElement.style.position = 'fixed';
  errorElement.style.top = '50%';
  errorElement.style.left = '50%';
  errorElement.style.transform = 'translate(-50%, -50%)';
  errorElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  errorElement.style.color = '#ff5555';
  errorElement.style.padding = '20px';
  errorElement.style.borderRadius = '5px';
  errorElement.style.maxWidth = '80%';
  errorElement.style.textAlign = 'center';
  errorElement.style.fontFamily = 'Arial, sans-serif';
  errorElement.style.zIndex = '1000';

  const heading = document.createElement('h3');
  heading.textContent = 'Error';
  heading.style.color = '#ff5555';

  const text = document.createElement('p');
  text.textContent = message;

  const button = document.createElement('button');
  button.textContent = 'Refresh Page';
  button.style.marginTop = '15px';
  button.style.padding = '8px 16px';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.backgroundColor = '#4CAF50';
  button.style.color = 'white';
  button.style.cursor = 'pointer';
  button.onclick = () => window.location.reload();

  errorElement.appendChild(heading);
  errorElement.appendChild(text);
  errorElement.appendChild(button);

  document.body.appendChild(errorElement);
}

// Check if AmmoLib is defined (should be set by the index.html script)
if (typeof window.AmmoLib === 'undefined') {
  error('AmmoLib is not defined. Make sure Ammo.js is loaded and initialized correctly.');
  log('Attempting to continue without physics (this may cause errors)...');

  try {
    // Try to load the game without physics
    initializeGameWithoutPhysics();
  } catch (err) {
    error('Failed to initialize game without physics', err);
    showErrorMessage('The physics engine failed to load. Please refresh the page to try again.');
  }
} else {
  log('AmmoLib found, creating game...');

  // Make Ammo globally available for compatibility
  window.Ammo = window.AmmoLib;

  // Create and initialize game
  try {
    initializeGame();
  } catch (err) {
    error('Failed to create or initialize game instance', err);
    // Show stack trace
    if (err.stack) {
      log(`Stack trace: ${err.stack}`);
    }
    showErrorMessage('Failed to initialize the game. Please refresh and try again.');
  }
}

function initializeGame() {
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
      showErrorMessage('Failed to initialize the game systems. Please refresh and try again.');
    }
  }, 100);
}

function initializeGameWithoutPhysics() {
  // This is a stub function that would need to be implemented
  // if you want to support running the game without physics
  error('Game without physics is not implemented');
  showErrorMessage('This game requires the Ammo.js physics engine which failed to load. Please refresh the page to try again.');
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