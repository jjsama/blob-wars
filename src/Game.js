import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { GameScene } from './rendering/Scene.js';
import { InputHandler } from './input/InputHandler.js';
import { Player } from './entities/Player.js';
import { RemotePlayer } from './entities/RemotePlayer.js';
import { Ground } from './entities/Ground.js';
import { Projectile } from './entities/Projectile.js';
import { log, error } from './debug.js';
import { NetworkManager } from './utils/NetworkManager.js';
import { ColorManager } from './utils/ColorManager.js';
import { GAME_CONFIG } from './utils/constants.js';
import { PredictionSystem } from './physics/PredictionSystem.js';
import { UIManager } from './managers/UIManager.js'; // Import UIManager (Corrected Path)
import { PlayerManager } from './managers/PlayerManager.js'; // Import PlayerManager

export class Game {
    constructor() {
        console.log('Game constructor called');
        this.physics = new PhysicsWorld();
        this.scene = new GameScene();
        this.input = new InputHandler();
        this.ground = null;
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.enemies = [];
        this.previousTime = 0;

        // Performance tracking and game loop properties
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.fps = 0;

        // Create a color manager to handle unique entity colors
        this.colorManager = new ColorManager();

        // Network-related properties
        this.networkManager = new NetworkManager();
        this.remotePlayers = {}; // Track other players in the game
        this.isMultiplayer = false; // Flag to enable multiplayer features - set to false by default

        // Initialize prediction system for client-side prediction and server reconciliation
        this.predictionSystem = new PredictionSystem(this);

        // Set up network event handlers (MOVED TO initNetworkAsync)
        /*
        this.networkManager.on('projectileSpawn', (projectileData) => {
            // Only handle projectiles from other players
            if (projectileData.ownerId !== this.networkManager.playerId) {
                this.handleRemoteProjectileSpawn(projectileData);
            } else {
                // For our own projectiles, create them locally
                this.handleLocalProjectileSpawn(projectileData);
            }
        });

        // Updated handler to process full state messages
        this.networkManager.on('gameStateUpdate', (message) => {
            // Log received message size for verification
            const messageSize = JSON.stringify(message).length;
            console.log(`[Network] Received ${message.type}. Size: ${messageSize} bytes`);

            // Ensure this only handles full GAME_STATE messages
            if (message.type === 'GAME_STATE') {
                this.handleFullGameStateUpdate(message.data); // Handle full state
            } else {
                console.warn('gameStateUpdate listener received non-GAME_STATE message:', message.type);
            }
        });

        // Add new handler specifically for delta updates
        this.networkManager.on('gameStateDeltaUpdate', (deltaData) => {
            console.log(`[Network] Received GAME_STATE_DELTA.`);
            this.handleGameStateDeltaUpdate(deltaData); // Handle delta update
        });

        // Register event handler for player damage
        this.networkManager.on('playerDamage', (data) => {
            // Check if the damage is for our local player
            if (data.targetId === this.networkManager.playerId && this.player) {
                console.log(`Local player took ${data.amount} damage`);

                // Apply damage to local player
                this.player.takeDamage(data.amount, data.attackerId);
            }
            // Check if it's a remote player we have
            else if (this.remotePlayers[data.targetId]) {
                console.log(`Remote player ${data.targetId} took ${data.amount} damage`);

                // Apply damage to remote player
                this.remotePlayers[data.targetId].takeDamage(data.amount);
            }
        });

        // Register event handler for player death
        this.networkManager.on('playerDeath', (data) => {
            console.log(`Player death event for ${data.playerId}`);

            // If it's our player, handle local death
            if (data.playerId === this.networkManager.playerId && this.player) {
                console.log('Local player died');

                // Only update local player if not already dead
                if (!this.player.isDead) {
                    this.player.isDead = true;
                    this.player.health = 0;
                    this.player.die();
                }
            }
            // If it's a remote player, handle remote death
            else if (this.remotePlayers[data.playerId]) {
                console.log(`Remote player ${data.playerId} died`);

                // Only update remote player if not already dead
                if (!this.remotePlayers[data.playerId].isDead) {
                    this.remotePlayers[data.playerId].isDead = true;
                    this.remotePlayers[data.playerId].health = 0;
                    this.remotePlayers[data.playerId].die();
                }
            }
        });

        // Register event handler for player respawn
        this.networkManager.on('playerRespawn', (data) => {
            console.log(`Player respawn event for ${data.playerId}`);

            // If it's our player, handle local respawn
            if (data.playerId === this.networkManager.playerId && this.player) {
                console.log('Local player respawned');

                // Apply respawn to local player
                this.player.health = 100;
                this.player.isDead = false;

                // Use server position if provided
                if (data.position) {
                    this.player.setPosition(data.position);
                }

                // Reset to idle animation
                this.player.playAnimation('idle');
            }
            // If it's a remote player, handle remote respawn
            else if (this.remotePlayers[data.playerId]) {
                console.log(`Remote player ${data.playerId} respawned`);

                // Apply respawn to remote player
                const remotePlayer = this.remotePlayers[data.playerId];
                remotePlayer.health = 100;
                remotePlayer.isDead = false;

                // Use server position if provided
                if (data.position) {
                    remotePlayer.setPosition(data.position);
                }

                // Reset to idle animation
                remotePlayer.playAnimation('idle');
            }
        });

        // Connect to server (MOVED TO initNetworkAsync)
        this.networkManager.connect()
            .then(() => {
                console.log('Connected to server successfully');
            })
            .catch((error) => {
                error('Failed to connect to server:', error);
                this.showConnectionStatus('Connection failed. Running in single player mode.');
                this.isMultiplayer = false;

                // Hide message after 5 seconds
                setTimeout(() => {
                    document.getElementById('connection-status')?.remove();
                }, 5000);
            });
        */

        // Reduce movement speed for better gameplay
        this.moveForce = 15;

        // Initialize UI
        this.uiManager = null; // Initialize as null, will be created in init()
    }

    initUI() {
        // --- Create UIManager Instance ---+
        try {
            this.uiManager = new UIManager(this.scene, document.body);
            // --- Create the 3D aiming reticle --- +
            this.uiManager.createAimingReticule();
            // --- End create reticle --- +
        } catch (err) {
            error("Failed to initialize UIManager:", err);
            // Game might be unplayable without UI, consider stopping or showing a fatal error
        }

        // --- Create Health Bar ---+
        const healthBar = document.getElementById('health-bar');
        const healthText = document.getElementById('health-text');

        if (!healthBar || !healthText) {
            const healthContainer = document.createElement('div');
            healthContainer.id = 'health-container';
            healthContainer.style.position = 'fixed';
            healthContainer.style.bottom = '10px';
            healthContainer.style.left = '10px';
            healthContainer.style.padding = '5px';
            healthContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            healthContainer.style.borderRadius = '5px';
            healthContainer.style.color = 'white';

            if (!healthBar) {
                const newHealthBar = document.createElement('div');
                newHealthBar.id = 'health-bar';
                newHealthBar.style.width = '200px';
                newHealthBar.style.height = '15px';
                newHealthBar.style.backgroundColor = 'gray';
                newHealthBar.style.borderRadius = '3px';
                newHealthBar.style.overflow = 'hidden';

                const healthFill = document.createElement('div');
                healthFill.id = 'health-fill';
                healthFill.style.width = '100%';
                healthFill.style.height = '100%';
                healthFill.style.backgroundColor = 'green';
                healthFill.style.transition = 'width 0.3s ease';

                newHealthBar.appendChild(healthFill);
                healthContainer.appendChild(newHealthBar);
            }

            if (!healthText) {
                const newHealthText = document.createElement('div');
                newHealthText.id = 'health-text';
                newHealthText.style.marginTop = '5px';
                newHealthText.style.textAlign = 'center';
                newHealthText.textContent = '100 HP';
                healthContainer.appendChild(newHealthText);
            }

            document.body.appendChild(healthContainer);
        }

        // --- Inform UIManager about static elements (optional but good practice) ---
        this.uiManager.localHealthBar = healthBar;
        this.uiManager.localHealthText = healthText;
        // this.uiManager.crosshair = document.getElementById('crosshair'); // REMOVED - we're using 3D reticle now
    }

    async init() {
        try {
            console.log('Initializing game systems');

            // Initialize systems
            console.log('Initializing scene');
            this.scene.init();
            console.log('Scene initialized');

            console.log('Initializing physics');
            await this.physics.init();
            console.log('Physics initialized');

            // Set up collision detection AFTER physics is initialized and projectile arrays exist
            this.physics.setupCollisionDetection(this.projectiles, this.enemyProjectiles);
            console.log('Physics collision detection setup complete');

            // --- Initialize UIManager (Moved BEFORE PlayerManager) ---+
            try {
                this.uiManager = new UIManager(this.scene, document.body);
                // Now initialize the static UI elements
                this.initUI();
                console.log('UIManager and UI initialized');
            } catch (err) {
                error("Failed to initialize UIManager:", err);
                alert("CRITICAL ERROR: Failed to initialize UI Manager. Game cannot continue.");
                return; // Stop initialization if UI fails
            }

            // --- Debug: Log dependencies before PlayerManager init ---+
            console.log('DEBUG: Pre-PlayerManager Init Check:');
            console.log('  this.scene.scene:', !!this.scene?.scene);
            console.log('  this.physics.physicsWorld:', !!this.physics?.physicsWorld);
            console.log('  this.networkManager:', !!this.networkManager);
            console.log('  this.uiManager:', !!this.uiManager);
            console.log('  this.colorManager:', !!this.colorManager);

            // --- Initialize PlayerManager (AFTER physics and UI) ---+
            try {
                this.playerManager = new PlayerManager(
                    this.scene.scene, // Pass THREE.Scene directly
                    this.physics.physicsWorld,
                    this.networkManager,
                    this.uiManager,
                    this.colorManager,
                    this.scene.camera, // Pass camera
                    this.projectiles   // Pass projectiles array
                );
                console.log('PlayerManager initialized');
            } catch (err) {
                error("Failed to initialize PlayerManager:", err);
                alert("CRITICAL ERROR: Failed to initialize Player Manager.");
                return;
            }

            console.log('Initializing input');
            await this.input.init();
            console.log('Input initialized');

            // Create game objects (Ground)
            console.log('Creating ground');
            this.ground = new Ground(this.scene.scene, this.physics.physicsWorld);
            this.ground.create();
            console.log('Ground created');

            // Add environment elements
            console.log('Adding environment elements');
            this.addEnvironmentElements();
            console.log('Environment elements added');

            // Add invisible walls
            console.log('Adding invisible walls');
            this.addInvisibleWalls();
            console.log('Invisible walls added');

            // --- Create Local Player using PlayerManager ---+
            try {
                this.player = this.playerManager.initLocalPlayer();
                // Register the physics body AFTER it's created
                if (this.player && this.player.body) {
                    this.physics.registerRigidBody(this.player.mesh, this.player.body);
                    console.log('Local player physics body registered.');
                } else {
                    throw new Error("Player or player body not created successfully by PlayerManager.");
                }
            } catch (err) {
                error("Failed to initialize local player via PlayerManager:", err);
                alert("CRITICAL ERROR: Failed to create local player.");
                return;
            }

            // Set the player for the scene to follow
            this.scene.setPlayerToFollow(this.player);

            // Set up input handlers
            console.log('Input polling initialized (processing in update loop)');

            // Start the game loop before attempting to connect
            // This ensures the game is playable even if connection fails
            console.log('Starting animation loop');
            this.animate();
            console.log('Animation loop started');

            // Enable multiplayer and connect to server
            this.isMultiplayer = true;
            console.log('Enabling multiplayer mode');
            console.log('Initializing network connection (non-blocking)');

            // Call the async network initialization
            await this.initNetworkAsync(); // Await the async function
            console.log('Network setup attempted.');

        } catch (err) { // Single catch block for init errors
            error('Error during Game initialization:', err);
            // Show error to user if possible
            const errorMessage = document.getElementById('debug');
            if (errorMessage) {
                errorMessage.innerHTML = `
                    <div style="color: #ff5555; background: rgba(0,0,0,0.8); padding: 20px; border-radius: 5px;">
                        <h3>Initialization Error</h3>
                        <p>Failed to initialize the game.</p>
                        <p>Error details: ${err.message}</p>
                        <p>URL: ${window.location.href}</p>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Reload Game
                        </button>
                    </div>
                `;
            }
            // Optionally rethrow or handle differently
            // throw err; // Re-throwing might stop execution entirely
        }
    } // Closing brace for init method

    /**
     * Initialize network connection asynchronously (doesn't block game startup)
     */
    async initNetworkAsync() {
        // Set a temporary message
        this.showConnectionStatus('Connecting to server...');
        console.log('Initializing network connection...');

        // --- Register event handlers BEFORE connecting ---

        // Handle connection success
        this.networkManager.on('connect', () => {
            console.log('Connected to game server successfully');
            document.getElementById('connection-status')?.remove();

            // Update UI to show connected status
            this.showConnectionStatus('Connected to server');
            setTimeout(() => {
                document.getElementById('connection-status')?.remove();
            }, 3000);

            // Start sending position updates to server
            this._startPositionUpdates();
        });

        // Handle disconnection
        this.networkManager.on('disconnect', () => {
            console.log('Disconnected from game server');
            // Clear remote players on disconnect
            this.playerManager?.clearRemotePlayers(); // Use PlayerManager method

            // When disconnected after max retries, switch to single player mode
            if (!this.networkManager.autoReconnect) {
                this.isMultiplayer = false;
                this.showConnectionStatus('Connection failed. Running in single player mode.');

                // Hide message after 5 seconds
                setTimeout(() => {
                    document.getElementById('connection-status')?.remove();
                }, 5000);
            } else {
                this.showConnectionStatus('Disconnected from server. Attempting to reconnect...');
            }
        });

        // Handle receiving our player ID
        this.networkManager.on('playerConnected', (data) => {
            console.log(`Player connected: ${data.id}`);
            // Delegate to PlayerManager to handle ID and color updates
            this.playerManager?.updateLocalPlayerNetworkInfo(data.id);
        });

        // Handle PROJECTILE spawn events (local and remote)
        this.networkManager.on('projectileSpawn', (projectileData) => {
            // Only handle projectiles from other players here visually
            if (projectileData.ownerId !== this.networkManager.playerId) {
                console.log('[Network] Received remote projectile spawn:', projectileData.id);
                this.handleRemoteProjectileSpawn(projectileData);
            } else {
                // Log confirmation of our own projectile
                console.log('[Network] Received confirmation for local projectile:', projectileData.id);
                // We already created it visually in shootProjectile,
                // could potentially update its ID or state if needed based on server confirmation
                // this.handleLocalProjectileSpawn(projectileData); // This might duplicate the projectile if called
            }
        });


        // Updated handler to process FULL game state messages
        this.networkManager.on('gameStateUpdate', (message) => {
            // Log received message size for verification
            const messageSize = JSON.stringify(message).length;
            console.log(`[Game Network Handler] Received ${message.type}. Size: ${messageSize} bytes. Data:`, message.data); // Log data

            // Ensure this only handles full GAME_STATE messages
            if (message.type === 'GAME_STATE') {
                this.playerManager?.handleGameStateUpdate(message.data); // Delegate to PlayerManager
            } else {
                console.warn('gameStateUpdate listener received non-GAME_STATE message:', message.type);
            }
        });

        // Add new handler specifically for DELTA updates
        this.networkManager.on('gameStateDeltaUpdate', (deltaData) => {
            console.log(`[Network] Received GAME_STATE_DELTA.`);
            console.log(`[Game Network Handler] Received GAME_STATE_DELTA. Data:`, deltaData); // Log data
            this.playerManager?.handleGameStateDeltaUpdate(deltaData); // Delegate to PlayerManager
        });

        // Register event handler for player damage
        this.networkManager.on('playerDamage', (data) => {
            this.playerManager?.handlePlayerDamage(data); // Delegate to PlayerManager
        });

        // Register event handler for player death
        this.networkManager.on('playerDeath', (data) => {
            console.log(`Player death event for ${data.playerId}`);
            this.playerManager?.handlePlayerDeath(data); // Delegate to PlayerManager
        });

        // Register event handler for player respawn
        this.networkManager.on('playerRespawn', (data) => {
            console.log(`Player respawn event for ${data.playerId}`);
            this.playerManager?.handlePlayerRespawn(data); // Delegate to PlayerManager
        });

        // --- Connect to server AFTER handlers are registered ---
        try {
            await this.networkManager.connect(); // Use await here
            console.log('Network connection process initiated.');
            // Success is handled by the 'connect' event listener above
        } catch (error) {
            // Handle connection failure
            console.error('Failed to connect to server:', error);
            this.showConnectionStatus('Connection failed. Running in single player mode.');
            this.isMultiplayer = false;

            // Hide message after 5 seconds
            setTimeout(() => {
                document.getElementById('connection-status')?.remove();
            }, 5000);
            // No need to throw error here, just fall back to single player
        }
    }

    /**
     * Start sending periodic position updates to the server
     * @private
     */
    _startPositionUpdates() {
        if (this._positionUpdateInterval) {
            clearInterval(this._positionUpdateInterval);
        }

        // Send position updates every 50ms (20 times per second)
        this._positionUpdateInterval = setInterval(() => {
            this.sendPlayerState();
        }, this.networkUpdateInterval);

        console.log(`Started sending position updates every ${this.networkUpdateInterval}ms`);
    }

    /**
     * Display a connection status message to the user
     */
    showConnectionStatus(message) {
        // Remove any existing message
        const existingMessage = document.getElementById('connection-status');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create status message element
        const statusContainer = document.createElement('div');
        statusContainer.id = 'connection-status';
        statusContainer.style.position = 'fixed';
        statusContainer.style.top = '10px';
        statusContainer.style.right = '10px';
        statusContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        statusContainer.style.color = '#fff';
        statusContainer.style.padding = '10px';
        statusContainer.style.borderRadius = '5px';
        statusContainer.style.fontFamily = 'Arial, sans-serif';
        statusContainer.style.zIndex = '1000';
        statusContainer.textContent = message;

        document.body.appendChild(statusContainer);
    }

    /**
     * Handle a game state update from the server
     * @param {Object} gameState - The game state
     */
    handleFullGameStateUpdate(gameState) {
        try {
            if (!gameState || !gameState.players) {
                console.warn('Received invalid game state:', gameState);
                return;
            }

            // Track seen player IDs for cleanup
            const seenPlayerIds = new Set();

            // Process all players in the game state
            for (const [id, playerData] of Object.entries(gameState.players)) {
                seenPlayerIds.add(id);

                if (id === this.networkManager.playerId) {
                    // Handle local player updates (minimal correction for now)
                    // If needed, re-implement prediction system reconciliation here
                } else {
                    // Handle remote player updates
                    let remotePlayer = this.remotePlayers[id];
                    if (!remotePlayer && playerData) {
                        // Create new remote player if it doesn't exist
                        console.log(`[Game] handleFullGameStateUpdate: Player ${id} not found locally, adding.`);
                        remotePlayer = this.addRemotePlayer(id, playerData.position);
                    }
                    // IMPORTANT: Update player state EVEN IF just added
                    if (remotePlayer && playerData) {
                        // Update remote player
                        this.updateRemotePlayerState(remotePlayer, playerData);
                    }
                }
            }

            // *** Add Logging before cleanup ***
            // console.log(`[Game] Cleanup Check: Seen IDs: ${Array.from(seenPlayerIds).join(', ')}`);
            // console.log(`[Game] Cleanup Check: Current Remote Players: ${Object.keys(this.remotePlayers).join(', ')}`);
            // *** End Logging ***

            // Clean up disconnected players
            Object.keys(this.remotePlayers).forEach(id => {
                if (!seenPlayerIds.has(id)) {
                    console.warn(`[Game] Player ${id} not in latest state update. Removing.`);
                    this.removeRemotePlayer(id); // Use the proper removal function
                }
            });
        } catch (err) {
            console.error('Error handling game state update:', err);
        }
    }

    /**
     * Handle a game state delta update from the server
     * @param {Object} deltaData - The delta update data
     */
    handleGameStateDeltaUpdate(deltaData) {
        try {
            // --- Process Player Deltas ---
            if (deltaData.playerDeltas) {
                for (const playerId in deltaData.playerDeltas) {
                    const delta = deltaData.playerDeltas[playerId];

                    if (playerId === this.networkManager.playerId) {
                        // Apply server correction to local player (prediction handles this mostly)
                        if (this.player && delta.position && this.predictionSystem) {
                            // Pass relevant state to prediction system for reconciliation
                            // We structure it like a mini serverState update
                            this.predictionSystem.processServerUpdate({
                                players: { [playerId]: delta }
                            });
                        }
                    } else {
                        // Apply updates to remote players
                        let remotePlayer = this.remotePlayers[playerId];
                        if (!remotePlayer) {
                            // If player doesn't exist, delta should contain full state for creation
                            console.log(`[Game] handleGameStateDeltaUpdate: Player ${playerId} not found locally, adding.`);
                            remotePlayer = this.addRemotePlayer(playerId, delta.position);
                            if (remotePlayer) { // Ensure player was created successfully
                                this.updateRemotePlayerState(remotePlayer, delta); // Apply remaining state
                            }
                        } else {
                            // Player exists, apply partial updates
                            this.updateRemotePlayerState(remotePlayer, delta);
                        }
                    }
                }
            }

            // --- Process Removed Players ---
            if (deltaData.removedPlayerIds && deltaData.removedPlayerIds.length > 0) {
                // *** Add Logging before removal ***
                // console.log(`[Game] Delta Removal Check: IDs to remove: ${deltaData.removedPlayerIds.join(', ')}`);
                // console.log(`[Game] Delta Removal Check: Current Remote Players: ${Object.keys(this.remotePlayers).join(', ')}`);
                // *** End Logging ***
                deltaData.removedPlayerIds.forEach(playerId => {
                    if (playerId !== this.networkManager.playerId && this.remotePlayers[playerId]) { // Check if player exists before removing
                        console.warn(`[Game] Removing player ${playerId} based on delta update.`);
                        this.removeRemotePlayer(playerId);
                    }
                });
            }

            // TODO: Process Projectile Deltas later

        } catch (err) {
            console.error('Error handling game state delta update:', err);
        }
    }

    isValidPosition(position) {
        return position &&
            typeof position.x === 'number' && !isNaN(position.x) &&
            typeof position.y === 'number' && !isNaN(position.y) &&
            typeof position.z === 'number' && !isNaN(position.z);
    }

    isValidPlayerData(playerData) {
        return playerData && this.isValidPosition(playerData.position);
    }

    updateRemotePlayerState(remotePlayer, playerData) {
        if (!remotePlayer || !playerData) return;

        // *** Add Logging ***
        if (Math.random() < 0.1) { // Log occasionally to avoid spam
            console.log(`[Game] Updating RemotePlayer ${remotePlayer.remoteId} with data:`, JSON.stringify(playerData));
        }
        // *** End Logging ***

        // Update position and rotation if provided and valid
        if (playerData.position && this.isValidPosition(playerData.position)) {
            // *** Add Logging ***
            // console.log(`[Game] Calling setPosition for ${remotePlayer.remoteId} with:`, JSON.stringify(playerData.position));
            // *** End Logging ***
            remotePlayer.setPosition(playerData.position);
        }
        if (playerData.rotation) { // Consider adding isValidRotation if needed
            remotePlayer.setRotation(playerData.rotation);
        }

        // --- 1. Update State Flags based on Server Data --- 
        let stateChanged = false;

        // Handle death state 
        if (playerData.isDead !== undefined && remotePlayer.isDead !== playerData.isDead) {
            if (playerData.isDead) {
                remotePlayer.die(); // Sets internal flag and might stop animations
            } else {
                // Pass server position to ensure correct respawn location
                remotePlayer.respawn(playerData.position); // Resets flags and sets idle animation
            }
            stateChanged = true;
        }

        // Update attacking state flag
        if (playerData.isAttacking !== undefined && remotePlayer.isAttacking !== playerData.isAttacking) {
            remotePlayer.isAttacking = playerData.isAttacking;
            stateChanged = true;
            console.log(`[Client UpdateRemote] ${remotePlayer.remoteId} isAttacking set to: ${remotePlayer.isAttacking}`);
        }

        // Update jumping state flag
        if (playerData.isJumping !== undefined && remotePlayer.isJumping !== playerData.isJumping) {
            remotePlayer.isJumping = playerData.isJumping;
            stateChanged = true;
            console.log(`[Client UpdateRemote] ${remotePlayer.remoteId} isJumping set to: ${remotePlayer.isJumping}`);
        }

        // --- 2. Determine Target Animation based on Updated Flags --- 
        let targetAnimation = 'idle'; // Default to idle

        // Use server's base animation if provided (usually idle/walk/jump/attack)
        if (playerData.animation) {
            targetAnimation = playerData.animation;
        }

        // Prioritize specific states determined solely by server flags
        // (The animation field from server should already reflect jump/attack if applicable)
        if (remotePlayer.isDead) {
            // Don't play specific animation, die() or respawn() handles visual state
            targetAnimation = remotePlayer.currentAnimation; // Keep current anim if dead?
        } else if (playerData.isAttacking) { // Check the isAttacking flag *from the server data*
            // Server attack state takes ultimate priority for *this tick*
            targetAnimation = 'attack';
        }
        // Note: We no longer explicitly check remotePlayer.isJumping here, 
        // because playerData.animation from the server should already be 'jump' if the server thinks the player is jumping.
        // If server sends 'idle' or 'walkForward' via playerData.animation, we trust that.

        // --- 3. Play Animation if Changed --- 
        // Play the target animation if it's different from the current one, unless dead (handled above)
        if (!remotePlayer.isDead && remotePlayer.currentAnimation !== targetAnimation) {
            remotePlayer.playAnimation(targetAnimation);
        }

        // --- 4. Update Other Properties --- 
        // Update health (if provided) - Do this AFTER state changes like die/respawn
        if (playerData.health !== undefined && remotePlayer.health !== playerData.health) {
            remotePlayer.health = playerData.health;
            remotePlayer.updateHealthBar(); // Update visual
        }

        // Update movement state flag (used by RemotePlayer for interpolation/visuals if needed)
        if (playerData.isMoving !== undefined) {
            remotePlayer.isMoving = playerData.isMoving;
        }

        // Log the final state occasionally
        if (stateChanged || Math.random() < 0.05) { // Log if state changed or occasionally
            console.log(`[Client UpdateRemote End] ID: ${remotePlayer.remoteId}, Target Anim: ${targetAnimation}, isDead: ${remotePlayer.isDead}, isJumping: ${remotePlayer.isJumping}, isAttacking: ${remotePlayer.isAttacking}, Serv Anim: ${playerData.animation}`);
        }
    }; // Added semicolon

    cleanupDisconnectedPlayers(seenPlayerIds) {
        for (const id in this.remotePlayers) {
            if (!seenPlayerIds.has(id)) {
                // Remove player from scene
                const player = this.remotePlayers[id];
                if (player.nameTag) {
                    player.nameTag.remove();
                }
                this.scene.scene.remove(player);
                delete this.remotePlayers[id];
                console.log(`Removed disconnected player: ${id}`);
            }
        }
    }

    /**
     * Synchronize projectiles from server
     * @param {Array} serverProjectiles - Projectiles from server state
     */
    syncServerProjectiles(serverProjectiles) {
        try {
            // Skip if running single-player
            if (!this.isMultiplayer) return;

            const localPlayerId = this.networkManager.playerId;
            const confirmedProjectileIds = new Set();

            // Process each server projectile
            for (const serverProjectile of serverProjectiles) {
                if (!serverProjectile.id) continue;

                confirmedProjectileIds.add(serverProjectile.id);

                // Find existing projectile
                let projectile = this.projectiles.find(p => p.id === serverProjectile.id);

                if (!serverProjectile.active) {
                    // If server says projectile is inactive, remove it
                    if (projectile) {
                        if (projectile.mesh) {
                            this.scene.scene.remove(projectile.mesh);
                            if (projectile.mesh.geometry) projectile.mesh.geometry.dispose();
                            if (projectile.mesh.material) projectile.mesh.material.dispose();
                        }
                        this.projectiles = this.projectiles.filter(p => p.id !== serverProjectile.id);
                    }
                    continue;
                }

                if (!projectile) {
                    // Create new projectile if it doesn't exist
                    if (serverProjectile.ownerId !== localPlayerId) {
                        projectile = {
                            ...serverProjectile,
                            mesh: null,
                            update: function (deltaTime) {
                                if (!this.active) return false;

                                // Update position using velocity
                                this.position.x += this.velocity.x * deltaTime;
                                this.position.y += this.velocity.y * deltaTime;
                                this.position.z += this.velocity.z * deltaTime;

                                // Update mesh position
                                if (this.mesh) {
                                    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
                                }

                                return true;
                            }
                        };

                        // Create visual representation
                        const geometry = new THREE.SphereGeometry(0.08, 16, 16);
                        const material = new THREE.MeshStandardMaterial({
                            color: this.remotePlayers[serverProjectile.ownerId]?.playerColor || 0xff0000,
                            roughness: 0.3,
                            metalness: 0.7,
                            transparent: true,
                            opacity: 0.8
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.position.set(
                            serverProjectile.position.x,
                            serverProjectile.position.y,
                            serverProjectile.position.z
                        );
                        this.scene.scene.add(mesh);
                        projectile.mesh = mesh;

                        this.projectiles.push(projectile);
                    }
                } else {
                    // Update existing projectile
                    projectile.position = serverProjectile.position;
                    projectile.velocity = serverProjectile.velocity;
                    projectile.active = serverProjectile.active;

                    // Update mesh position
                    if (projectile.mesh) {
                        projectile.mesh.position.set(
                            serverProjectile.position.x,
                            serverProjectile.position.y,
                            serverProjectile.position.z
                        );
                    }
                }
            }

            // Remove unconfirmed projectiles after reconciliation window
            const reconciliationTime = Date.now() - 200;
            this.projectiles = this.projectiles.filter(projectile => {
                if (projectile.creationTime < reconciliationTime && !confirmedProjectileIds.has(projectile.id)) {
                    if (projectile.mesh) {
                        this.scene.scene.remove(projectile.mesh);
                        if (projectile.mesh.geometry) projectile.mesh.geometry.dispose();
                        if (projectile.mesh.material) projectile.mesh.material.dispose();
                    }
                    return false;
                }
                return true;
            });
        } catch (err) {
            console.error('Error syncing server projectiles:', err);
        }
    }

    /**
     * Visualize a remote projectile
     * @param {Object} projectile - Server projectile data
     */
    visualizeRemoteProjectile(projectile) {
        // Get the owner's color from remote players, or use default red
        let projectileColor = 0xff0000; // Default red
        const owner = this.playerManager?.getPlayer(projectile.ownerId); // Get owner via PlayerManager
        if (owner) {
            projectileColor = owner.playerColor || 0xff0000;
        }

        // Create a smaller sphere with smoother geometry to match local projectiles
        const geometry = new THREE.SphereGeometry(0.08, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: projectileColor,
            roughness: 0.3,
            metalness: 0.7,
            transparent: true,
            opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            projectile.position.x,
            projectile.position.y,
            projectile.position.z
        );

        // Add to scene
        this.scene.scene.add(mesh);

        // Remove after a short time
        setTimeout(() => {
            this.scene.scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        }, 100); // Quick flash to indicate projectile position
    }

    /**
     * Synchronize enemies from server
     * @param {Array} serverEnemies - Enemies from server state
     */
    syncServerEnemies(serverEnemies) {
        // Enemies disabled for multiplayer-only mode
        return;

        /*
        // In multiplayer mode, we use server-provided enemies
        if (!this.isMultiplayer) return;
    
        try {
            // For simplicity in this implementation, we just handle basic enemy visualization
            // A full implementation would track enemies by ID, interpolate positions, etc.
    
            // For now, we just update existing enemies or create new ones if needed
            for (const serverEnemy of serverEnemies) {
                // Find if we have this enemy locally
                const existingEnemy = this.enemies.find(e => e.id === serverEnemy.id);
    
                if (existingEnemy) {
                    // Update existing enemy
                    existingEnemy.setPosition(serverEnemy.position);
    
                    if (serverEnemy.rotation) {
                        existingEnemy.setRotation(serverEnemy.rotation.y);
                    }
    
                    // Update health and state
                    if (typeof serverEnemy.health === 'number') {
                        existingEnemy.health = serverEnemy.health;
                    }
    
                    if (serverEnemy.isDead) {
                        existingEnemy.die();
                    }
    
                    if (serverEnemy.isAttacking) {
                        existingEnemy.attack();
                    }
                }
                // We will rely on the server to manage enemy creation/destruction
                // The local adjustBotCount method handles this separately
            }
        } catch (err) {
            console.error('Error syncing server enemies:', err);
        }
        */
    }

    /**
     * Detect if a remote player is moving by comparing positions
     */
    detectRemotePlayerMovement(prevPos, newPos, remotePlayer) {
        if (!prevPos || !newPos) return;

        // Calculate distance between positions
        const dx = prevPos.x - newPos.x;
        const dz = prevPos.z - newPos.z;
        const distanceSquared = dx * dx + dz * dz;

        // Consider the player moving if they've moved more than a small threshold
        // Using squared distance for efficiency (avoiding square root)
        const MOVEMENT_THRESHOLD_SQUARED = 0.0001; // ~0.01 units of movement

        if (distanceSquared > MOVEMENT_THRESHOLD_SQUARED) {
            // Use walkForward animation when moving
            remotePlayer.setAnimation('walkForward');
        } else {
            // Use idle animation when not moving
            remotePlayer.setAnimation('idle');
        }
    }

    /**
     * Add a remote player to the game
     */
    addRemotePlayer(id, position) {
        console.log(`[Game] Adding remote player: ${id} at ${JSON.stringify(position)}`);

        // First, check if a player with this ID already exists and remove it
        if (this.remotePlayers[id]) {
            console.log(`Remote player ${id} already exists, removing old instance first`);
            this.removeRemotePlayer(id);
        }

        // Make sure position is valid
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
            position = {
                x: 0,
                y: 5, // Place above ground - might be adjusted by physics
                z: 0
            };
            console.warn(`Using default position for remote player ${id} due to invalid incoming position data`);
        }

        // Get a unique color for this remote player from the color manager
        const playerColor = this.colorManager.getColorForId(id);
        console.log(`Assigning color ${playerColor.toString(16)} to remote player ${id}`);

        // Add small random offset to prevent players from spawning on top of each other
        const spawnOffset = {
            x: (Math.random() - 0.5) * 3,
            y: 0,
            z: (Math.random() - 0.5) * 3
        };

        // Create new position with offset
        const offsetPosition = {
            x: position.x + spawnOffset.x,
            y: position.y,
            z: position.z + spawnOffset.z
        };

        // Create a new remote player
        try {
            // Make sure scene exists
            if (!this.scene || !this.scene.scene) {
                error(`Cannot create remote player ${id}: scene or scene.scene not initialized`);
                return null;
            }

            this.remotePlayers[id] = new RemotePlayer(this.scene, id, offsetPosition, playerColor);

            // Create UI elements using UIManager
            if (this.uiManager) {
                this.uiManager.createPlayerUI(id, id); // Use player ID as name for now
            }

            console.log(`[Game] Remote player ${id} created at final offset position: x=${offsetPosition.x.toFixed(2)}, y=${offsetPosition.y.toFixed(2)}, z=${offsetPosition.z.toFixed(2)}`);
            return this.remotePlayers[id];
        } catch (err) {
            error(`Failed to create remote player ${id}:`, err);
            return null;
        }
    }

    /**
     * Remove a remote player from the game
     */
    removeRemotePlayer(id) {
        console.log(`[Game] Removing remote player: ${id}`);

        if (this.remotePlayers[id]) {
            // Get reference to the remote player
            const remotePlayer = this.remotePlayers[id];

            // Remove UI elements using UIManager
            if (this.uiManager) {
                this.uiManager.removePlayerUI(id);
            }

            // Use the RemotePlayer's built-in removal method
            remotePlayer.remove();

            // Release the color so it can be reused
            this.colorManager.releaseColor(id);

            // Remove from our tracking
            delete this.remotePlayers[id];

            console.log(`[Game] Remote player ${id} successfully removed`);
        }
    }

    /**
     * Clear all remote players
     */
    clearRemotePlayers() {
        for (const id in this.remotePlayers) {
            this.removeRemotePlayer(id);
        }
    }

    /**
     * Send player state to the server
     */
    sendPlayerState() {
        const player = this.playerManager?.getLocalPlayer(); // Get player from manager
        if (!this.isMultiplayer || !player || !this.networkManager.connected) return;

        const now = Date.now();
        // Only send updates at the specified interval
        if (now - this.lastNetworkUpdateTime < this.networkUpdateInterval) return;

        this.lastNetworkUpdateTime = now;

        const position = player.getPosition();
        const rotation = player.getRotation();

        // Include player status information
        const playerState = {
            health: player.health,
            isAttacking: player.isAttacking,
            isDead: player.isDead,
            animation: player.currentAnimation
        };

        this.networkManager.updatePlayerState(position, rotation, playerState);
    }

    // Modify setupInputHandlers to include network events
    setupInputHandlers() {
        // Handle key down events
        this.input.onKeyDown((event) => {
            const key = event.key;

            // Jump handling
            if ((key === ' ' || key === 'Spacebar') && !event.repeat) {
                console.log('Space key pressed in Game, triggering jump');
                this.handleJump();

                // Send jump event to server in multiplayer
                if (this.isMultiplayer && this.networkManager.connected) {
                    this.networkManager.sendJump();
                }
            }

            // Shooting with F key
            if ((key === 'f' || key === 'F') && !event.repeat) {
                this.shootProjectile();
                if (this.player) this.player.playAnimation('attack');
            }
        });

        // Handle mouse down events
        let lastMouseDownTime = 0; // Add a timestamp to prevent rapid double calls
        this.input.onMouseDown((event) => {
            const now = Date.now();
            console.log(`[onMouseDown Listener] Fired. Button: ${event.button}, Time since last: ${now - lastMouseDownTime}ms`); // Use console.log

            if (event.button === 0) { // Left mouse button
                if (now - lastMouseDownTime < 100) { // Cooldown: Ignore if less than 100ms since last call
                    console.log('[onMouseDown Listener] Cooldown active, ignoring call.'); // Use console.log
                    return;
                }
                lastMouseDownTime = now;

                console.log('Left mouse button pressed, shooting');
                this.shootProjectile();
                if (this.player) this.player.playAnimation('attack');

                // In multiplayer, send shoot event to server
                if (this.isMultiplayer && this.networkManager.connected && this.player) {
                    const direction = this.player.getAimDirection();
                    const origin = this.player.getPosition();
                    this.networkManager.sendShoot(direction, origin);
                }
            }
        });

        // -- REMOVED Redundant Interval Check for Jump --
        /*
        setInterval(() => {
            const inputState = this.input.getInputState();
            if (inputState.jump && this.isPlayerOnGround()) {
                console.log('Jump detected from interval check');
                this.handleJump();
    
                // Send jump event to server in multiplayer
                if (this.isMultiplayer && this.networkManager.connected) {
                    this.networkManager.sendJump();
                }
            }
        }, 100); // Check every 100ms
        */
    }

    handleJump() {
        if (!this.player) return;

        const now = Date.now();
        const timeSinceLastJump = now - this.lastJumpTime;

        if (this.isPlayerOnGround()) {
            // Call the player's jump method - it now handles setting velocity directly
            this.player.jump();
            this.lastJumpTime = now;
            this.canJump = false;
        } else if (timeSinceLastJump < this.bhopWindow) {
            // For bunny hopping, we'll just call jump again but with a smaller velocity
            // The jump method now manages velocity directly
            this.player.jump();
            this.lastJumpTime = now;
        }
    }

    isPlayerOnGround() {
        if (!this.player) return false;

        // Use the player's canJump property which is updated by checkGroundContact
        return this.player.canJump;

        /* Original implementation using manual ray test
        const playerPos = this.player.getPosition();
        const rayStart = new Ammo.btVector3(
            playerPos.x,
            playerPos.y - 0.9,
            playerPos.z
        );
        const rayEnd = new Ammo.btVector3(
            playerPos.x,
            playerPos.y - 1.1,
            playerPos.z
        );
    
        const rayCallback = this.physics.rayTest(rayStart, rayEnd);
        return rayCallback.hasHit();
        */
    }

    shootProjectile() {
        console.log(`[shootProjectile] Function called. isDead: ${this.player?.isDead}, lastShootTime: ${this.lastShootTime}`);

        // Check if player exists and is alive
        if (!this.player || this.player.isDead) {
            console.log(`[shootProjectile] Cancelled - Player is dead or doesn't exist`);
            return;
        }

        // Check cooldown
        const now = Date.now();
        const cooldownMs = 200; // 200ms = 5 shots per second
        if (now - this.lastShootTime < cooldownMs) {
            // Still in cooldown
            return; // Still in cooldown
        }
        this.lastShootTime = now;

        // --- Get camera info for shooting ---
        const cameraPos = new THREE.Vector3();
        const cameraDir = new THREE.Vector3();
        this.scene.camera.getWorldPosition(cameraPos);
        this.scene.camera.getWorldDirection(cameraDir);

        // --- Get Target Point from reticle or center of screen ---
        let targetPoint = new THREE.Vector3();

        if (this.uiManager && this.uiManager.aimingReticule && this.uiManager.aimingReticule.visible) {
            // Use the reticle's position if available (should be center-screen or where hit detected)
            targetPoint.copy(this.uiManager.aimingReticule.position);
            console.log(`[shootProjectile] Aiming at reticle position:`,
                targetPoint.x.toFixed(2),
                targetPoint.y.toFixed(2),
                targetPoint.z.toFixed(2));
        } else {
            // Fallback: use center of screen (camera forward)
            targetPoint.copy(cameraPos).add(cameraDir.multiplyScalar(1000));
            console.warn("[shootProjectile] Aiming reticle not found, using center-screen fallback.");
        }

        // Get the player's position (for spawn point visual adjustment)
        const playerPos = this.player.getPosition();

        // In pre-refactor style, spawn projectile from near camera but visible from player's "gun"
        // This maintains the visual that projectiles come from the player while having accurate aiming
        const spawnPos = cameraPos.clone();
        spawnPos.addScaledVector(cameraDir, 0.8); // Move slightly forward from camera

        // Add a small visual offset to make it look like coming from right side of player
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.scene.camera.quaternion);
        spawnPos.addScaledVector(right, 0.3); // Offset to right side
        spawnPos.y -= 0.2; // Slight downward adjustment

        // Calculate exact shooting direction from spawn to target
        const shootDirection = new THREE.Vector3()
            .subVectors(targetPoint, spawnPos)
            .normalize();

        // Set player animation
        this.player.attack();

        // Generate a unique ID for this projectile
        const projectileId = `proj_${this.networkManager.playerId || 'local'}_${now}_${Math.floor(Math.random() * 1000)}`;

        // Calculate velocity (direction * speed)
        const velocity = shootDirection.clone().multiplyScalar(60);

        // Create the projectile data
        const projectileData = {
            id: projectileId,
            position: {
                x: spawnPos.x,
                y: spawnPos.y,
                z: spawnPos.z
            },
            velocity: {
                x: velocity.x,
                y: velocity.y,
                z: velocity.z
            },
            ownerId: this.networkManager.playerId || 'local',
            creationTime: now,
            active: true,
            lifeTime: 0 // Initialize lifetime
        };

        // In multiplayer, send to server first
        if (this.isMultiplayer && this.networkManager && this.networkManager.connected) {
            // Send projectile spawn to server
            this.networkManager.sendProjectileSpawn(projectileData);
        }

        // Create visual projectile
        const projectile = {
            ...projectileData,
            mesh: null,
            update: function (deltaTime) {
                if (!this.active) return false;

                // Update position using velocity
                this.position.x += this.velocity.x * deltaTime;
                this.position.y += this.velocity.y * deltaTime;
                this.position.z += this.velocity.z * deltaTime;

                // Update mesh position
                if (this.mesh) {
                    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
                }

                // Update lifetime
                this.lifeTime += deltaTime;

                return true;
            }
        };

        // Create visual representation
        const geometry = new THREE.SphereGeometry(0.08, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.player.playerColor || 0xff0000,
            roughness: 0.3,
            metalness: 0.7,
            transparent: true,
            opacity: 0.8,
            emissive: this.player.playerColor || 0xff0000,
            emissiveIntensity: 0.5  // Add glow effect for better visibility
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(spawnPos);
        this.scene.scene.add(mesh);
        projectile.mesh = mesh;

        // Add to projectiles array
        this.projectiles.push(projectile);

        // Add muzzle flash at the exact spawn position
        this.addMuzzleFlash(spawnPos, shootDirection);
    }

    addMuzzleFlash(position, direction) {
        // Create a point light for muzzle flash
        const light = new THREE.PointLight(0x00ffff, 5, 3);
        light.position.copy(position);
        this.scene.scene.add(light);

        // Remove after a short time
        setTimeout(() => {
            this.scene.scene.remove(light);
        }, 100);
    }

    /**
     * Check for projectile collisions with remote players
     */
    checkProjectileRemotePlayerCollisions() {
        // Skip if no projectiles or no remote players
        if (!this.projectiles.length || !Object.keys(this.remotePlayers).length) {
            return;
        }

        // Process each projectile
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            if (!projectile || !projectile.active || !projectile.mesh) continue;

            const projPos = projectile.mesh.position;

            // Check against each remote player
            for (const id in this.remotePlayers) {
                const remotePlayer = this.remotePlayers[id];

                // Skip dead players
                if (remotePlayer.isDead) continue;

                // Get player position
                const playerPos = remotePlayer.getPosition();
                if (!playerPos) continue;

                // Calculate distance between projectile and player's center
                const dx = projPos.x - playerPos.x;
                const dy = projPos.y - playerPos.y;
                const dz = projPos.z - playerPos.z;

                // Use tighter hit detection radius (0.5 units squared = ~0.7 unit radius)
                // This roughly matches the player model's actual size
                const hitRadiusSquared = 0.25; // Reduced from 2.25

                // Additional height-based check to improve accuracy
                const heightCheck = Math.abs(dy) < 1.5; // Only hit within reasonable height range

                const distSquared = dx * dx + dz * dz; // Only check horizontal distance for main hit

                if (distSquared < hitRadiusSquared && heightCheck) {
                    // Hit detected! Handle damage
                    console.log(`Projectile hit remote player ${id} at distance: ${Math.sqrt(distSquared).toFixed(2)}`);

                    // Create hit effect
                    this.createHitEffect(projPos);

                    // Deactivate projectile
                    projectile.active = false;

                    // Remove projectile mesh
                    if (projectile.mesh) {
                        this.scene.scene.remove(projectile.mesh);
                        if (projectile.mesh.geometry) projectile.mesh.geometry.dispose();
                        if (projectile.mesh.material) {
                            if (Array.isArray(projectile.mesh.material)) {
                                projectile.mesh.material.forEach(m => m.dispose());
                            } else {
                                projectile.mesh.material.dispose();
                            }
                        }
                    }

                    // Set damage amount based on projectile type
                    const damageAmount = projectile.damage || 20;

                    // Send hit confirmation to server
                    if (this.networkManager && this.networkManager.connected) {
                        this.networkManager.sendHit({
                            targetId: id,
                            damage: damageAmount,
                            projectileId: projectile.id,
                            hitPosition: projPos
                        });
                    }

                    // Remove projectile from array
                    this.projectiles.splice(i, 1);
                    break;
                }
            }
        }
    }

    createHitEffect(position) {
        // Create a point light for hit effect
        const light = new THREE.PointLight(0xff0000, 3, 2);
        light.position.copy(position);
        this.scene.scene.add(light);

        // Remove after a short time
        setTimeout(() => {
            this.scene.scene.remove(light);
        }, 200);
    }

    updateMovement() {
        try {
            // Skip if player or physics is not available
            if (!this.player || !this.player.body || !this.physics) {
                return;
            }

            // Don't allow movement if player is dead
            if (this.player.isDead) {
                return;
            }

            // Get movement input
            const moveDirection = this.input.getMovementDirection();
            const movementState = this.input.getMovementState();

            // Get jump state correctly using the unified input state
            // Also ensure player exists and check player's canJump state
            const jumpInputPressed = this.input.getInputState().jump;
            const isJumping = jumpInputPressed && this.player && this.player.canJump;

            // If in multiplayer mode, use prediction system
            if (this.isMultiplayer && this.predictionSystem) {
                // Create an input packet
                const input = {
                    movement: movementState,
                    jump: isJumping
                };

                // Process input through prediction system
                this.predictionSystem.processInput(input, 1 / 60); // Using fixed timestep for prediction

                // Update animation separately from physics
                if (this.player) {
                    this.player.setMovementIntent(movementState);
                }

                return; // Exit early - prediction system handles the actual movement
            }

            // Single player mode - direct movement application

            // If no movement, explicitly stop the player by setting velocity to zero
            if (!moveDirection || (!moveDirection.x && !moveDirection.z)) {
                // Only preserve vertical velocity (for jumps/gravity)
                if (this.player.body) {
                    const velocity = this.player.body.getLinearVelocity();
                    const currentVelY = velocity.y();

                    const zeroVelocity = new Ammo.btVector3(0, currentVelY, 0);
                    this.player.body.setLinearVelocity(zeroVelocity);
                    Ammo.destroy(zeroVelocity);
                }
                return;
            }

            // Apply movement with direct velocity
            if (this.player && this.player.body) {
                // Get camera's forward and right vectors to move relative to camera orientation
                const camera = this.scene.camera;
                if (!camera) return;

                // Get forward and right vectors from camera (but ignore y-component for horizontal movement)
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                forward.y = 0;
                forward.normalize();

                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                right.y = 0;
                right.normalize();

                // Calculate final direction by combining forward/back and left/right components
                const finalDirection = new THREE.Vector3();
                finalDirection.addScaledVector(forward, -moveDirection.z); // Forward is -Z
                finalDirection.addScaledVector(right, moveDirection.x);
                finalDirection.normalize();

                // Get current velocity to preserve Y component
                const velocity = this.player.body.getLinearVelocity();
                const currentVelY = velocity.y();

                // Use a fixed speed for consistent movement
                const MOVE_SPEED = 15;

                // Set velocity directly
                const newVelocity = new Ammo.btVector3(
                    finalDirection.x * MOVE_SPEED,
                    currentVelY,
                    finalDirection.z * MOVE_SPEED
                );

                this.player.body.setLinearVelocity(newVelocity);
                Ammo.destroy(newVelocity);

                // Update animation based on movement
                this.player.setMovementIntent(movementState);
            }

            // Handle jumping in single player mode
            if (isJumping) {
                this.handleJump();
            }
        } catch (err) {
            error('Error in updateMovement:', err);
        }
    }

    updateProjectiles(deltaTime) {
        // Update and clean up projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            if (projectile && projectile.update) {
                projectile.update(deltaTime); // Call the update method

                // Remove projectiles older than 3 seconds or inactive
                if (!projectile.active || projectile.lifeTime > GAME_CONFIG.projectileLifetime) {
                    // Ensure mesh exists before removing
                    if (projectile.mesh) {
                        this.scene.scene.remove(projectile.mesh);
                        // Dispose geometry and material to free memory
                        if (projectile.mesh.geometry) projectile.mesh.geometry.dispose();
                        if (projectile.mesh.material) {
                            if (Array.isArray(projectile.mesh.material)) {
                                projectile.mesh.material.forEach(m => m.dispose());
                            } else {
                                projectile.mesh.material.dispose();
                            }
                        }
                    }
                    // Remove from physics world if applicable (currently projectiles are visual only)
                    // if (projectile.body && this.physics && this.physics.physicsWorld) {
                    //     this.physics.physicsWorld.removeRigidBody(projectile.body);
                    // }
                    this.projectiles.splice(i, 1);
                } // End removal check
            } else if (!projectile || !projectile.update) {
                // Log or remove invalid projectile entry
                console.warn('Removing invalid projectile entry at index:', i);
                this.projectiles.splice(i, 1);
            }
        }
    }

    updateEnemies(deltaTime) {
        // Update each enemy
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            try {
                if (this.enemies[i]) {
                    this.enemies[i].update(deltaTime);
                }
            } catch (error) {
                error(`Error updating enemy at index ${i}:`, error);
                // Don't remove the enemy here, just skip it and continue
            }
        }
    }

    /**
     * Create or update a debug display for multiplayer information
     */
    updateDebugDisplay() {
        if (!this.networkManager) return;

        // Log network stats periodically
        const stats = {
            ping: this.networkManager.lastPing,
            players: Object.keys(this.remotePlayers).length,
            projectiles: this.projectiles.length,
            fps: Math.round(1 / this.deltaTime)
        };

        if (Math.random() < 0.1) { // Log only occasionally to prevent spam
            console.log(`Network Stats: ${JSON.stringify(stats)}`);
        }
    }

    // Add the missing method to handle environment elements
    addEnvironmentElements() {
        // Add only decorative elements, no walls
        this.addTrees();
        this.addRocks();
        this.addSkybox();
    }

    addTrees() {
        const treePositions = [
            { x: 20, z: 20 },
            { x: -15, z: 10 },
            { x: 5, z: -20 },
            { x: -25, z: -15 }
        ];

        treePositions.forEach(pos => {
            // Simple tree - trunk and foliage
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.7, 5, 8),
                new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 })
            );
            trunk.position.set(pos.x, 2.5, pos.z);
            trunk.castShadow = true;
            this.scene.scene.add(trunk);

            const foliage = new THREE.Mesh(
                new THREE.ConeGeometry(3, 6, 8),
                new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.7 })
            );
            foliage.position.set(pos.x, 7, pos.z);
            foliage.castShadow = true;
            this.scene.scene.add(foliage);
        });
    }

    addRocks() {
        const rockPositions = [
            { x: 12, z: -8, scale: 1.5 },
            { x: -7, z: 15, scale: 1 },
            { x: 18, z: 5, scale: 0.7 },
            { x: -20, z: -10, scale: 2 }
        ];

        rockPositions.forEach(pos => {
            // Simple rock
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(pos.scale, 1),
                new THREE.MeshStandardMaterial({
                    color: 0x808080,
                    roughness: 0.9,
                    metalness: 0.1
                })
            );
            rock.position.set(pos.x, pos.scale / 2, pos.z);
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.scene.scene.add(rock);
        });
    }

    addSkybox() {
        // Simple skybox
        const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
        const skyboxMaterials = [
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }), // Right
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }), // Left
            new THREE.MeshBasicMaterial({ color: 0x4682B4, side: THREE.BackSide }), // Top
            new THREE.MeshBasicMaterial({ color: 0x8B4513, side: THREE.BackSide }), // Bottom
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }), // Front
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide })  // Back
        ];

        const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterials);
        this.scene.scene.add(skybox);
    }

    addInvisibleWalls() {
        const mapSize = 100; // Size of the playable area
        const wallHeight = 20; // Height of invisible walls
        const wallThickness = 2;

        // Create invisible wall material
        const wallMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0 // Completely invisible
        });

        // Create walls for each side of the map
        const walls = [
            // North wall
            { pos: { x: 0, y: wallHeight / 2, z: -mapSize / 2 }, size: { x: mapSize, y: wallHeight, z: wallThickness } },
            // South wall
            { pos: { x: 0, y: wallHeight / 2, z: mapSize / 2 }, size: { x: mapSize, y: wallHeight, z: wallThickness } },
            // East wall
            { pos: { x: mapSize / 2, y: wallHeight / 2, z: 0 }, size: { x: wallThickness, y: wallHeight, z: mapSize } },
            // West wall
            { pos: { x: -mapSize / 2, y: wallHeight / 2, z: 0 }, size: { x: wallThickness, y: wallHeight, z: mapSize } }
        ];

        walls.forEach(wall => {
            // Create wall mesh
            const geometry = new THREE.BoxGeometry(wall.size.x, wall.size.y, wall.size.z);
            const mesh = new THREE.Mesh(geometry, wallMaterial);
            mesh.position.set(wall.pos.x, wall.pos.y, wall.pos.z);
            this.scene.scene.add(mesh);

            // Create physics body for wall
            const shape = new Ammo.btBoxShape(new Ammo.btVector3(
                wall.size.x / 2,
                wall.size.y / 2,
                wall.size.z / 2
            ));

            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(wall.pos.x, wall.pos.y, wall.pos.z));

            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, new Ammo.btVector3(0, 0, 0));
            const body = new Ammo.btRigidBody(rbInfo);

            this.physics.physicsWorld.addRigidBody(body);

            // Clean up Ammo.js objects
            Ammo.destroy(rbInfo);
        });

        console.log('Invisible walls added to map boundaries');
    }

    /**
     * Main game loop - handles updating and rendering each frame
     */
    animate() {
        try {
            // Request the next frame immediately to keep the loop going
            requestAnimationFrame(() => this.animate());

            // Calculate delta time
            const now = performance.now();
            const deltaTime = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;

            // Apply fixed time step to physics
            // Cap delta time to prevent huge jumps if tab was inactive
            const fixedDeltaTime = Math.min(deltaTime, 0.1);

            // Update physics if initialized
            if (this.physics && this.physics.physicsWorld) {
                this.physics.update(fixedDeltaTime);
            }

            // Update movement before physics for better responsiveness
            this.updateMovement();

            // Update player animations
            if (this.player && this.player.update) {
                this.player.update(fixedDeltaTime);
            }

            // Update prediction system if in multiplayer mode
            if (this.isMultiplayer && this.predictionSystem) {
                this.predictionSystem.update(fixedDeltaTime);
            }

            // Update projectiles
            this.updateProjectiles(fixedDeltaTime);

            // Update enemies if needed
            this.updateEnemies(fixedDeltaTime);

            // Update remote players
            this.playerManager?.updateRemotePlayers(fixedDeltaTime, (player) => this._isPlayerVisible(player));

            // --- Update Aiming Reticle ---+
            if (this.uiManager && this.player && this.scene.camera) {
                this.uiManager.updateAimingReticule(this.player, this.scene.camera);
            }
            // --- End Update Reticle ---+

            // Update collision detection
            this.checkProjectileRemotePlayerCollisions();

            // Update scene - camera follows player, etc.
            if (this.scene) {
                this.scene.update();
            }

            // Track FPS
            this.frameCount++;
            if (now - this.lastFpsUpdate > 1000) {
                this.fps = this.frameCount;
                this.frameCount = 0;
                this.lastFpsUpdate = now;
            }
        } catch (err) {
            console.error('Error in game loop:', err);
        }
    }

    /**
     * Update remote players
     */
    updateRemotePlayers(deltaTime) {
        Object.values(this.remotePlayers).forEach(player => {
            if (player) {
                try {
                    // Update player's internal logic (interpolation, animation)
                    if (typeof player.update === 'function') {
                        player.update(deltaTime);
                    }

                    // Update player's UI via UIManager
                    if (this.uiManager) {
                        const isVisible = this._isPlayerVisible(player);
                        this.uiManager.updatePlayerUI(player.remoteId, player.getPosition(), player.health, player.isDead, isVisible);
                    }
                } catch (err) {
                    error(`Error updating remote player ${player.remoteId}:`, err);
                    // Consider removing player if update consistently fails?
                }
            }
        });
    }

    /**
     * Handle a projectile spawn from another player
     * @param {Object} projectileData - Data about the spawned projectile
     */
    handleRemoteProjectileSpawn(projectileData) {
        // Create projectile with the received data
        const projectile = {
            id: projectileData.id,
            position: new THREE.Vector3(
                projectileData.position.x,
                projectileData.position.y,
                projectileData.position.z
            ),
            velocity: new THREE.Vector3(
                projectileData.velocity.x,
                projectileData.velocity.y,
                projectileData.velocity.z
            ),
            mesh: null,
            ownerId: projectileData.ownerId,
            creationTime: Date.now(),
            active: true,
            lifeTime: 0 // Initialize lifetime
        };

        // Create visual representation
        const geometry = new THREE.SphereGeometry(0.08, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.remotePlayers[projectileData.ownerId]?.playerColor || 0xff0000,
            roughness: 0.3,
            metalness: 0.7,
            transparent: true,
            opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(projectile.position);
        this.scene.scene.add(mesh);
        projectile.mesh = mesh;

        // Add to projectiles array
        this.projectiles.push(projectile);
    }

    /**
     * Handle confirmation of our own projectile spawn from the server
     * @param {Object} projectileData - Data about the spawned projectile
     */
    handleLocalProjectileSpawn(projectileData) {
        // Create the projectile locally now that the server has confirmed it
        const projectile = {
            id: projectileData.id,
            position: new THREE.Vector3(
                projectileData.position.x,
                projectileData.position.y,
                projectileData.position.z
            ),
            velocity: new THREE.Vector3(
                projectileData.velocity.x,
                projectileData.velocity.y,
                projectileData.velocity.z
            ),
            mesh: null,
            ownerId: projectileData.ownerId,
            creationTime: Date.now(),
            active: true,
            lifeTime: 0, // Initialize lifetime
            owner: this.player,
            update: function (deltaTime) {
                if (!this.active) return false;

                // Update position using exact velocity
                this.position.x += this.velocity.x * deltaTime;
                this.position.y += this.velocity.y * deltaTime;
                this.position.z += this.velocity.z * deltaTime;

                // Update mesh position
                if (this.mesh) {
                    this.mesh.position.copy(this.position);
                }

                // Update lifetime
                this.lifeTime += deltaTime;

                return true;
            }
        };

        // Create visual representation
        const geometry = new THREE.SphereGeometry(0.08, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.player.playerColor,
            roughness: 0.3,
            metalness: 0.7,
            transparent: true,
            opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(projectile.position);
        this.scene.scene.add(mesh);
        projectile.mesh = mesh;

        // Add to projectiles array
        this.projectiles.push(projectile);
    }

    handleRemotePlayerSpawn(data) {
        const { id, position, color } = data;

        // Check if player already exists
        if (this.remotePlayers[id]) {
            console.warn(`Remote player ${id} already exists, updating position`);
            this.remotePlayers[id].setPosition(position);
            return;
        }

        try {
            // Create new remote player
            const remotePlayer = new RemotePlayer(this, id, position, color);
            this.remotePlayers[id] = remotePlayer;
            console.log(`Remote player ${id} spawned at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
        } catch (err) {
            error(`Failed to spawn remote player ${id}:`, err);
        }
    }

    handleRemotePlayerDisconnect(playerId) {
        try {
            const remotePlayer = this.remotePlayers[playerId];
            if (remotePlayer) {
                // Clean up the remote player
                remotePlayer.destroy();
                delete this.remotePlayers[playerId];
                console.log(`Remote player ${playerId} disconnected and cleaned up`);
            }
        } catch (err) {
            error(`Error cleaning up remote player ${playerId}:`, err);
        }
    }

    /**
     * Check if a player is potentially visible to the camera.
     * @param {RemotePlayer | Player} player - The player entity.
     * @returns {boolean} True if the player is likely visible, false otherwise.
     * @private
     */
    _isPlayerVisible(player) {
        if (!player || !player.model || !this.scene || !this.scene.camera) {
            return false;
        }

        try {
            const playerWorldPos = new THREE.Vector3();
            player.getWorldPosition(playerWorldPos);

            // Basic Frustum Culling (optional optimization)
            // const frustum = new THREE.Frustum();
            // const projScreenMatrix = new THREE.Matrix4();
            // projScreenMatrix.multiplyMatrices(this.scene.camera.projectionMatrix, this.scene.camera.matrixWorldInverse);
            // frustum.setFromProjectionMatrix(projScreenMatrix);
            // if (!frustum.containsPoint(playerWorldPos)) {
            //     return false;
            // }

            // Check if player is behind camera plane
            const cameraDirection = this.scene.camera.getWorldDirection(new THREE.Vector3());
            const playerDirection = new THREE.Vector3().subVectors(playerWorldPos, this.scene.camera.position).normalize();
            const dotProduct = cameraDirection.dot(playerDirection);

            return dotProduct > 0; // Return true if player is in front of camera
        } catch (err) {
            error('Error checking player visibility:', err);
            return false; // Assume not visible on error
        }
    }
} 