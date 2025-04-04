import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { GameScene } from './rendering/Scene.js';
import { InputHandler } from './input/InputHandler.js';
import { Player } from './entities/Player.js';
import { RemotePlayer } from './entities/RemotePlayer.js';
import { Ground } from './entities/Ground.js';
import { Projectile } from './entities/Projectile.js';
import { Enemy } from './entities/Enemy.js';
import { log, error } from './debug.js';
import { NetworkManager } from './utils/NetworkManager.js';
import { ColorManager } from './utils/ColorManager.js';
import { GAME_CONFIG } from './utils/constants.js';
import { PredictionSystem } from './physics/PredictionSystem.js';

export class Game {
    constructor() {
        log('Game constructor called');
        this.physics = new PhysicsWorld();
        this.scene = new GameScene();
        this.input = new InputHandler();
        this.player = null;
        this.ground = null;
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.enemies = [];
        this.previousTime = 0;

        // Create a color manager to handle unique entity colors
        this.colorManager = new ColorManager();

        // Network-related properties
        this.networkManager = new NetworkManager();
        this.remotePlayers = {}; // Track other players in the game
        this.isMultiplayer = false; // Flag to enable multiplayer features - set to false by default
        this.lastNetworkUpdateTime = 0;
        this.networkUpdateInterval = 50; // Send updates every 50ms (20 times per second)

        // Initialize prediction system for client-side prediction and server reconciliation
        this.predictionSystem = new PredictionSystem(this);

        // Reduce movement speed for better gameplay
        this.moveForce = 15; // Reduced from 20
        this.maxVelocity = 18; // Reduced from 25
        this.jumpForce = 10; // Keep jump force the same

        this.canJump = true;
        this.lastJumpTime = 0;
        this.bhopWindow = 300;

        // Store projectile class for enemies to use
        this.projectileClass = Projectile;

        // Make game instance globally available for enemies
        window.game = this;

        // Initialize crosshair
        this.initCrosshair();

        // Initialize UI
        this.initUI();

        // Initialize console system
        this.initConsole();
    }

    initUI() {
        // Create health display
        const healthContainer = document.createElement('div');
        healthContainer.id = 'health-container';
        healthContainer.style.position = 'fixed';
        healthContainer.style.bottom = '20px';
        healthContainer.style.left = '20px';
        healthContainer.style.width = '200px';
        healthContainer.style.height = '30px';
        healthContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthContainer.style.border = '2px solid white';
        healthContainer.style.borderRadius = '5px';

        const healthBar = document.createElement('div');
        healthBar.id = 'health-bar';
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
        healthBar.style.transition = 'width 0.3s, background-color 0.3s';

        const healthText = document.createElement('div');
        healthText.id = 'health-text';
        healthText.style.position = 'absolute';
        healthText.style.top = '50%';
        healthText.style.left = '50%';
        healthText.style.transform = 'translate(-50%, -50%)';
        healthText.style.color = 'white';
        healthText.style.fontFamily = 'Arial, sans-serif';
        healthText.style.fontWeight = 'bold';
        healthText.style.textShadow = '1px 1px 2px black';
        healthText.textContent = '100 HP';

        healthContainer.appendChild(healthBar);
        healthContainer.appendChild(healthText);
        document.body.appendChild(healthContainer);
    }

    async init() {
        try {
            log('Initializing game systems');

            // Initialize systems
            log('Initializing scene');
            this.scene.init();
            log('Scene initialized');

            log('Initializing physics');
            this.physics.init();
            log('Physics initialized');

            log('Initializing input');
            this.input.init();
            log('Input initialized');

            // Create game objects first to ensure animations work properly
            log('Creating ground');
            this.ground = new Ground(this.scene.scene, this.physics.physicsWorld);
            this.ground.create();
            log('Ground created');

            // Add environment elements
            log('Adding environment elements');
            this.addEnvironmentElements();
            log('Environment elements added');

            // Add invisible walls
            log('Adding invisible walls');
            this.addInvisibleWalls();
            log('Invisible walls added');

            log('Creating player');
            // Use the network ID if available, otherwise create with default local ID
            const playerId = this.networkManager.playerId || 'local-' + Math.random().toString(36).substring(2, 9);
            // Get a unique color for this player
            const playerColor = this.colorManager.getColorForId(playerId);
            this.player = new Player(
                this.scene.scene,
                this.physics.physicsWorld,
                { x: 0, y: 5, z: 0 },
                playerId,
                playerColor
            );
            this.physics.registerRigidBody(this.player.mesh, this.player.body);
            log(`Player created with ID: ${playerId} and color: ${playerColor.toString(16)}`);

            // Set up input handlers
            log('Setting up input handlers');
            this.setupInputHandlers();
            log('Input handlers set up');

            // Register debug keyboard commands for prediction system
            document.addEventListener('keydown', (event) => {
                // J key - toggle prediction (changed from P)
                if (event.key === 'j') {
                    this.predictionSystem.togglePrediction();
                }
                // K key - toggle reconciliation (changed from R)
                if (event.key === 'k') {
                    this.predictionSystem.toggleReconciliation();
                }
                // L key - toggle debug display (changed from D)
                if (event.key === 'l') {
                    this.predictionSystem.toggleDebugMode();
                    log('Debug display toggled');
                }
            });
            log('Debug commands registered (J: toggle prediction, K: toggle reconciliation, L: toggle debug display)');

            // Start the game loop before attempting to connect
            // This ensures the game is playable even if connection fails
            log('Starting animation loop');
            this.animate();
            log('Animation loop started');

            // Enable multiplayer and connect to server
            this.isMultiplayer = true;
            log('Enabling multiplayer mode');
            log('Initializing network connection (non-blocking)');
            await this.initNetworkAsync();

            // Initialize bots to fill up to 12 slots
            this.adjustBotCount();

            log('Game initialization complete');
        } catch (err) {
            error('Error in Game.init', err);
            throw err;
        }
    }

    /**
     * Initialize network connection asynchronously (doesn't block game startup)
     */
    initNetworkAsync() {
        // Set a temporary message
        this.showConnectionStatus('Connecting to server...');
        log('Initializing network connection...');

        // Register event handlers before connecting
        this.networkManager.on('connect', () => {
            log('Connected to game server successfully');
            document.getElementById('connection-status')?.remove();

            // Update UI to show connected status
            this.showConnectionStatus('Connected to server');
            setTimeout(() => {
                document.getElementById('connection-status')?.remove();
            }, 3000);

            // Start sending position updates to server
            this._startPositionUpdates();
        });

        this.networkManager.on('disconnect', () => {
            log('Disconnected from game server');
            // Clear remote players on disconnect
            this.clearRemotePlayers();

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

        this.networkManager.on('playerConnected', (data) => {
            log(`Player connected: ${data.id}`);
            if (data.id === this.networkManager.playerId) {
                log('Received our player ID from server');

                // Update player color with the network ID if we have a player already created
                if (this.player) {
                    // If we already have a local player with a temporary ID
                    if (this.player.playerId !== data.id) {
                        // Release the old color associated with the temporary ID
                        this.colorManager.releaseColor(this.player.playerId);

                        // Update player ID
                        this.player.playerId = data.id;

                        // Always get a fresh new color for the real network ID
                        const playerColor = this.colorManager.getNewColorForId(data.id);
                        log(`Updating local player color to ${playerColor.toString(16)} based on ID: ${data.id}`);

                        // Update player color and refresh the model
                        this.player.playerColor = playerColor;
                        if (this.player.mesh) {
                            this.player.mesh.traverse((child) => {
                                if (child.isMesh) {
                                    // Skip eyes
                                    if (!child.material.name || !child.material.name.toLowerCase().includes('eye')) {
                                        child.material.color.setHex(playerColor);
                                        child.material.emissive = new THREE.Color(playerColor);
                                        child.material.emissiveIntensity = 0.2;
                                        child.material.needsUpdate = true;
                                    }
                                }
                            });
                        }
                    }
                }
            }
        });

        // Register event handler for game state updates
        this.networkManager.on('gameStateUpdate', (gameState) => {
            this.handleGameStateUpdate(gameState);
        });

        // Register event handler for player damage
        this.networkManager.on('playerDamage', (data) => {
            // Check if the damage is for our local player
            if (data.targetId === this.networkManager.playerId && this.player) {
                log(`Local player took ${data.amount} damage`);

                // Apply damage to local player
                this.player.takeDamage(data.amount, data.attackerId);
            }
            // Check if it's a remote player we have
            else if (this.remotePlayers[data.targetId]) {
                log(`Remote player ${data.targetId} took ${data.amount} damage`);

                // Apply damage to remote player
                this.remotePlayers[data.targetId].takeDamage(data.amount);
            }
        });

        // Register event handler for player death
        this.networkManager.on('playerDeath', (data) => {
            log(`Player death event for ${data.playerId}`);

            // If it's our player, handle local death
            if (data.playerId === this.networkManager.playerId && this.player) {
                log('Local player died');

                // Only update local player if not already dead
                if (!this.player.isDead) {
                    this.player.isDead = true;
                    this.player.health = 0;
                    this.player.die();
                }
            }
            // If it's a remote player, handle remote death
            else if (this.remotePlayers[data.playerId]) {
                log(`Remote player ${data.playerId} died`);

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
            log(`Player respawn event for ${data.playerId}`);

            // If it's our player, handle local respawn
            if (data.playerId === this.networkManager.playerId && this.player) {
                log('Local player respawned');

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
                log(`Remote player ${data.playerId} respawned`);

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

        // Connect to server
        this.networkManager.connect()
            .then(() => {
                log('Connected to server successfully');
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

        log(`Started sending position updates every ${this.networkUpdateInterval}ms`);
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
    handleGameStateUpdate(gameState) {
        try {
            if (!gameState.players) {
                console.warn('Received gameState without players property');
                return;
            }

            // Process local player state if it exists in the update
            const localPlayerId = this.networkManager.playerId;
            if (localPlayerId && gameState.players[localPlayerId] && this.player) {
                const localPlayerData = gameState.players[localPlayerId];

                // Process server update through prediction system for smooth reconciliation
                if (this.predictionSystem) {
                    this.predictionSystem.processServerUpdate(gameState);
                } else {
                    // If no prediction system, directly update the position
                    this.player.setPosition(localPlayerData.position);
                }

                // Update health if server says it has changed and client-side prediction didn't catch it
                if (localPlayerData.health !== undefined && this.player.health !== localPlayerData.health) {
                    this.player.health = localPlayerData.health;
                    this.player.updateHealthUI();
                }

                // Update death state if server says it has changed
                if (localPlayerData.isDead !== undefined && this.player.isDead !== localPlayerData.isDead) {
                    this.player.isDead = localPlayerData.isDead;

                    // If newly dead according to server, trigger death if we didn't already
                    if (localPlayerData.isDead && !this.player.isDead) {
                        this.player.die();
                    } else if (!localPlayerData.isDead && this.player.isDead) {
                        // If server says we're alive but we think we're dead, respawn
                        this.player.respawn();
                    }
                }
            }

            const seenPlayerIds = new Set();

            // Process remote players
            for (const id in gameState.players) {
                // Skip local player (already processed above)
                if (id === this.networkManager.playerId) {
                    seenPlayerIds.add(id);
                    continue;
                }

                seenPlayerIds.add(id);

                const playerData = gameState.players[id];

                // Validate player data
                if (!playerData || !playerData.position) {
                    console.warn('Received invalid player data:', playerData);
                    continue;
                }

                // If player exists, update it
                if (this.remotePlayers[id]) {
                    // Debug: log position update occasionally
                    if (Math.random() < 0.01) {
                        console.log(`Updating remote player ${id} position: x=${playerData.position.x.toFixed(2)}, y=${playerData.position.y.toFixed(2)}, z=${playerData.position.z.toFixed(2)}`);
                    }

                    const remotePlayer = this.remotePlayers[id];

                    // Store previous position for movement detection
                    const prevPos = remotePlayer.getPosition();

                    // Update position with smooth interpolation
                    remotePlayer.setPosition(playerData.position);

                    // Update rotation if available
                    if (playerData.rotation) {
                        remotePlayer.setRotation(playerData.rotation);
                    }

                    // Handle health updates
                    if (playerData.health !== undefined && remotePlayer.health !== playerData.health) {
                        remotePlayer.health = playerData.health;
                        remotePlayer.updateHealthBar(); // Ensure health bar is updated
                    }

                    // Handle death state
                    if (playerData.isDead !== undefined) {
                        if (playerData.isDead && !remotePlayer.isDead) {
                            // Player just died
                            remotePlayer.isDead = true;
                            remotePlayer.setAnimation('death');
                            console.log(`Remote player ${id} died`);
                        } else if (!playerData.isDead && remotePlayer.isDead) {
                            // Player respawned
                            remotePlayer.isDead = false;
                            remotePlayer.setAnimation('idle');
                            console.log(`Remote player ${id} respawned`);
                        }
                    }

                    // Handle attack state
                    if (playerData.isAttacking && !remotePlayer.isAttacking) {
                        remotePlayer.attack();
                        console.log(`Remote player ${id} attacked`);
                    }

                    // Handle jumping state
                    if (playerData.isJumping && !remotePlayer.isJumping) {
                        remotePlayer.setAnimation('jump');
                        remotePlayer.isJumping = true;

                        // Reset jumping state after a fixed time
                        setTimeout(() => {
                            remotePlayer.isJumping = false;
                            if (!remotePlayer.isDead && !remotePlayer.isAttacking) {
                                remotePlayer.setAnimation('idle');
                            }
                        }, 1000);

                        console.log(`Remote player ${id} jumped`);
                    }

                    // Handle movement animation based on position changes
                    if (!remotePlayer.isDead && !remotePlayer.isAttacking && !remotePlayer.isJumping) {
                        this.detectRemotePlayerMovement(prevPos, playerData.position, remotePlayer);
                    }
                } else {
                    // New player joined, create it
                    console.log(`Creating new remote player ${id}`);
                    this.addRemotePlayer(id, playerData.position);

                    // Set initial state if provided
                    const remotePlayer = this.remotePlayers[id];
                    if (remotePlayer) {
                        if (playerData.health !== undefined) {
                            remotePlayer.health = playerData.health;
                        }

                        if (playerData.isDead) {
                            remotePlayer.isDead = true;
                            remotePlayer.setAnimation('death');
                        }

                        if (playerData.isAttacking) {
                            remotePlayer.isAttacking = true;
                            remotePlayer.setAnimation('attack');

                            // Reset attack state after animation duration
                            setTimeout(() => {
                                remotePlayer.isAttacking = false;
                            }, 800);
                        }
                    }
                }
            }

            // Remove disconnected players (those not in the current game state)
            for (const id in this.remotePlayers) {
                if (!seenPlayerIds.has(id)) {
                    console.log(`Remote player ${id} not in game state, removing`);
                    this.removeRemotePlayer(id);
                }
            }

            // Handle projectiles from server
            if (gameState.projectiles && Array.isArray(gameState.projectiles)) {
                // Process server-side projectiles
                this.syncServerProjectiles(gameState.projectiles);
            }

            // Handle enemies from server
            if (gameState.enemies && Array.isArray(gameState.enemies)) {
                // Process server-side enemies
                this.syncServerEnemies(gameState.enemies);
            }
        } catch (err) {
            console.error('Error processing game state update:', err);
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

            // Get local player ID for reference
            const localPlayerId = this.networkManager.playerId;

            // Track which local projectiles have been confirmed by the server
            const confirmedProjectileIds = new Set();

            // Process each server projectile
            for (const serverProjectile of serverProjectiles) {
                // Track server-confirmed projectiles by ID
                if (serverProjectile.id) {
                    confirmedProjectileIds.add(serverProjectile.id);
                }

                // Handle projectiles from other players by creating visual representations
                if (serverProjectile.ownerId !== localPlayerId && serverProjectile.active && serverProjectile.position) {
                    // Visualize remote player projectiles
                    this.visualizeRemoteProjectile(serverProjectile);
                }
                // For local player projectiles, reconcile with server state
                else if (serverProjectile.ownerId === localPlayerId && serverProjectile.id) {
                    // Find matching local projectile
                    const localProjectile = this.projectiles.find(p => p.id === serverProjectile.id);

                    if (localProjectile) {
                        // If server says projectile is inactive but client shows active, deactivate it
                        if (!serverProjectile.active && localProjectile.active) {
                            console.log(`Server marked projectile ${serverProjectile.id} as inactive`);
                            localProjectile.active = false;

                            // If this projectile has a mesh, remove it
                            if (localProjectile.mesh) {
                                this.scene.scene.remove(localProjectile.mesh);
                            }
                        }
                    }
                }
            }

            // Remove local projectiles that weren't confirmed by the server (if they're older than reconciliation window)
            if (this.isMultiplayer && this.networkManager.connected) {
                // Only enforce this for older projectiles (200ms or older) to account for network delay
                const reconciliationTime = Date.now() - 200;

                for (let i = this.projectiles.length - 1; i >= 0; i--) {
                    const projectile = this.projectiles[i];

                    // If this projectile is from the local player, has an ID, was created before our window,
                    // and is not confirmed by the server, remove it
                    if (projectile.ownerId === localPlayerId &&
                        projectile.id &&
                        projectile.creationTime < reconciliationTime &&
                        !confirmedProjectileIds.has(projectile.id)) {

                        console.log(`Removing unconfirmed projectile ${projectile.id}`);

                        // Remove mesh from scene
                        if (projectile.mesh) {
                            this.scene.scene.remove(projectile.mesh);
                        }

                        // Remove from array
                        this.projectiles.splice(i, 1);
                    }
                }
            }
        } catch (err) {
            console.error('Error syncing server projectiles:', err);
        }
    }

    /**
     * Visualize a remote projectile
     * @param {Object} projectile - Server projectile data
     */
    visualizeRemoteProjectile(projectile) {
        // This is a simplified visualization - in a full implementation,
        // you would track these by ID and update their positions

        // Create a simple sphere to represent the projectile
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000, // Red for remote projectiles
            emissive: 0xff0000,
            emissiveIntensity: 0.5
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
        log(`Adding remote player: ${id}`);

        // First, check if a player with this ID already exists and remove it
        if (this.remotePlayers[id]) {
            log(`Remote player ${id} already exists, removing old instance first`);
            this.removeRemotePlayer(id);
        }

        // Get a unique color for this remote player from the color manager
        const playerColor = this.colorManager.getColorForId(id);
        log(`Assigning color ${playerColor.toString(16)} to remote player ${id}`);

        // Add random offset to prevent players from spawning on top of each other
        const spawnOffset = {
            x: (Math.random() - 0.5) * 5,
            y: 0,
            z: (Math.random() - 0.5) * 5
        };

        // Create new position with offset
        const offsetPosition = {
            x: position.x + spawnOffset.x,
            y: position.y,
            z: position.z + spawnOffset.z
        };

        // Create a new remote player
        this.remotePlayers[id] = new RemotePlayer(this.scene, id, offsetPosition, playerColor);

        // Add name tag
        this.addNameTag(this.remotePlayers[id], id);

        log(`Remote player ${id} created at position: x=${offsetPosition.x.toFixed(2)}, y=${offsetPosition.y.toFixed(2)}, z=${offsetPosition.z.toFixed(2)}`);

        return this.remotePlayers[id];
    }

    /**
     * Add a name tag above a player
     */
    addNameTag(player, name) {
        // Create a div for the name tag
        const nameTag = document.createElement('div');
        nameTag.className = 'player-nametag';
        nameTag.textContent = `Player ${name.substring(0, 4)}`;
        nameTag.style.position = 'absolute';
        nameTag.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        nameTag.style.color = 'white';
        nameTag.style.padding = '2px 6px';
        nameTag.style.borderRadius = '4px';
        nameTag.style.fontSize = '12px';
        nameTag.style.fontFamily = 'Arial, sans-serif';
        nameTag.style.textAlign = 'center';
        nameTag.style.pointerEvents = 'none'; // Don't block mouse events
        nameTag.style.zIndex = '1000';
        nameTag.style.fontWeight = 'bold';
        nameTag.style.textShadow = '1px 1px 2px black';

        document.body.appendChild(nameTag);

        // Store a reference to the name tag in the player object
        player.nameTag = nameTag;

        // Update the name tag position in the update loop
        const updateNameTag = () => {
            if (!player.nameTag) return;

            // Get the correct mesh reference based on player type
            const playerMesh = player.model || player.mesh;
            if (!playerMesh) return;

            // Convert 3D position to screen coordinates
            const playerPos = new THREE.Vector3();
            playerPos.setFromMatrixPosition(playerMesh.matrixWorld);

            const screenPos = playerPos.clone();
            screenPos.project(this.scene.camera);

            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = -(screenPos.y * 0.5 - 0.5) * window.innerHeight;

            // Position name tag above player's head
            nameTag.style.left = `${x - nameTag.offsetWidth / 2}px`;
            nameTag.style.top = `${y - 50}px`; // Offset above the player

            // Only show if in front of camera
            if (screenPos.z > 1) {
                nameTag.style.display = 'none';
            } else {
                nameTag.style.display = 'block';
            }

            // Queue next update
            requestAnimationFrame(updateNameTag);
        };

        // Start updating the name tag
        updateNameTag();
    }

    /**
     * Remove a remote player from the game
     */
    removeRemotePlayer(id) {
        log(`Removing remote player: ${id}`);

        if (this.remotePlayers[id]) {
            // Get reference to the remote player
            const remotePlayer = this.remotePlayers[id];

            // Remove nametag if it exists
            if (remotePlayer.nameTag) {
                document.body.removeChild(remotePlayer.nameTag);
                remotePlayer.nameTag = null;
            }

            // Use the RemotePlayer's built-in removal method
            remotePlayer.remove();

            // Release the color so it can be reused
            this.colorManager.releaseColor(id);

            // Remove from our tracking
            delete this.remotePlayers[id];

            log(`Remote player ${id} successfully removed`);

            // Adjust bot count when a player leaves
            this.adjustBotCount();
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
        if (!this.isMultiplayer || !this.player || !this.networkManager.connected) return;

        const now = Date.now();
        // Only send updates at the specified interval
        if (now - this.lastNetworkUpdateTime < this.networkUpdateInterval) return;

        this.lastNetworkUpdateTime = now;

        const position = this.player.getPosition();
        const rotation = this.player.getRotation();

        // Include player status information
        const playerState = {
            health: this.player.health,
            isAttacking: this.player.isAttacking,
            isDead: this.player.isDead,
            animation: this.player.currentAnimation
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
        this.input.onMouseDown((event) => {
            if (event.button === 0) { // Left mouse button
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

        // Add a regular check for jump key
        // This helps if the key event was missed or there are issues with key events
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

    initCrosshair() {
        // Check if crosshair already exists
        let crosshair = document.getElementById('crosshair');

        // If it doesn't exist, create it programmatically
        if (!crosshair) {
            crosshair = document.createElement('div');
            crosshair.id = 'crosshair';

            const verticalLine = document.createElement('div');
            verticalLine.className = 'crosshair-vertical';

            const horizontalLine = document.createElement('div');
            horizontalLine.className = 'crosshair-horizontal';

            crosshair.appendChild(verticalLine);
            crosshair.appendChild(horizontalLine);

            // Apply inline styles to ensure visibility
            crosshair.style.position = 'fixed';
            crosshair.style.top = '50%';
            crosshair.style.left = '50%';
            crosshair.style.transform = 'translate(-50%, -50%)';
            crosshair.style.width = '24px';
            crosshair.style.height = '24px';
            crosshair.style.pointerEvents = 'none';
            crosshair.style.zIndex = '1000';

            verticalLine.style.position = 'absolute';
            verticalLine.style.top = '0';
            verticalLine.style.left = '50%';
            verticalLine.style.width = '2px';
            verticalLine.style.height = '100%';
            verticalLine.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            verticalLine.style.transform = 'translateX(-50%)';
            verticalLine.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.9)';

            horizontalLine.style.position = 'absolute';
            horizontalLine.style.top = '50%';
            horizontalLine.style.left = '0';
            horizontalLine.style.width = '100%';
            horizontalLine.style.height = '2px';
            horizontalLine.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            horizontalLine.style.transform = 'translateY(-50%)';
            horizontalLine.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.9)';

            // Add the center dot
            const style = document.createElement('style');
            style.textContent = `
                #crosshair::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 5px;
                    height: 5px;
                    background-color: rgba(255, 0, 0, 0.9);
                    border-radius: 50%;
                    box-shadow: 0 0 4px rgba(255, 0, 0, 0.7);
                }
            `;
            document.head.appendChild(style);

            document.body.appendChild(crosshair);
        }

        // Make sure the crosshair is visible
        crosshair.style.display = 'block';

        // Remove the floating controls UI - we don't need it
        const existingControls = document.getElementById('game-controls');
        if (existingControls) {
            existingControls.remove();
        }
    }

    // Add this method to initialize the console
    initConsole() {
        // Create a console element
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
        consoleContainer.style.overflow = 'auto';
        consoleContainer.style.zIndex = '1000';
        consoleContainer.style.display = 'none'; // Hidden by default

        document.body.appendChild(consoleContainer);

        // Override console.log to capture messages
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        // Keep track of console state
        this.consoleVisible = false;

        // Add console toggle with ~ key
        window.addEventListener('keydown', (event) => {
            if (event.key === '`' || event.key === '~') {
                this.consoleVisible = !this.consoleVisible;
                consoleContainer.style.display = this.consoleVisible ? 'block' : 'none';
                event.preventDefault();
            }
        });

        // Override console methods to write to our game console
        console.log = function () {
            // Call original console.log
            originalLog.apply(console, arguments);

            // Add to game console
            const msg = Array.from(arguments).join(' ');
            const logEntry = document.createElement('div');
            logEntry.textContent = msg;
            consoleContainer.appendChild(logEntry);

            // Auto-scroll to bottom
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
        };

        console.error = function () {
            // Call original console.error
            originalError.apply(console, arguments);

            // Add to game console with error styling
            const msg = Array.from(arguments).join(' ');
            const logEntry = document.createElement('div');
            logEntry.textContent = msg;
            logEntry.style.color = '#ff5555';
            consoleContainer.appendChild(logEntry);

            // Auto-scroll to bottom
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
        };

        console.warn = function () {
            // Call original console.warn
            originalWarn.apply(console, arguments);

            // Add to game console with warning styling
            const msg = Array.from(arguments).join(' ');
            const logEntry = document.createElement('div');
            logEntry.textContent = msg;
            logEntry.style.color = '#ffff55';
            consoleContainer.appendChild(logEntry);

            // Auto-scroll to bottom
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
        };
    }

    shootProjectile() {
        if (!this.player) return;

        // Don't allow shooting while dead
        if (this.player.isDead) return;

        // Apply a cooldown to prevent rapid-fire
        const now = Date.now();
        if (this.lastShootTime && now - this.lastShootTime < 200) {
            return; // Still in cooldown
        }
        this.lastShootTime = now;

        // Get the direction the player is facing (camera forward vector)
        const direction = new THREE.Vector3();
        this.scene.camera.getWorldDirection(direction);

        // Get the position to spawn the projectile (slightly in front of player)
        const playerPos = this.player.getPosition();
        const spawnPos = new THREE.Vector3(
            playerPos.x + direction.x * 1.5,
            playerPos.y + 1.7, // Adjust for height
            playerPos.z + direction.z * 1.5
        );

        // Generate a unique ID for this projectile
        const projectileId = `proj_${this.networkManager.playerId || 'local'}_${now}_${Math.floor(Math.random() * 1000)}`;

        // Create a new projectile immediately for client-side prediction
        const projectile = {
            id: projectileId,
            position: spawnPos.clone(),
            velocity: direction.clone().multiplyScalar(40), // Speed: 40 units per second
            mesh: null,
            ownerId: this.networkManager.playerId || 'local',
            creationTime: now,
            active: true,
            update: function (deltaTime) {
                if (!this.active) return false;

                // Update position
                this.position.x += this.velocity.x * deltaTime;
                this.position.y += this.velocity.y * deltaTime;
                this.position.z += this.velocity.z * deltaTime;

                // Update mesh position
                if (this.mesh) {
                    this.mesh.position.copy(this.position);
                }

                // Auto-deactivate old projectiles
                if (Date.now() - this.creationTime > 3000) {
                    this.active = false;
                    return false;
                }

                return true;
            }
        };

        // Create a sphere mesh for the projectile
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.5
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(spawnPos);

        // Add to scene
        this.scene.scene.add(mesh);
        projectile.mesh = mesh;

        // Add to projectiles array
        this.projectiles.push(projectile);

        // Set player as attacking - do this before sending to server for faster local feedback
        this.player.attack();

        // Add muzzle flash immediately for visual feedback
        this.addMuzzleFlash(spawnPos, direction);

        // Send shoot event to server in multiplayer
        if (this.isMultiplayer && this.networkManager.connected) {
            this.networkManager.sendShoot(direction, spawnPos, projectileId);
        }

        // Debug info
        console.log(`Projectile ${projectileId} fired at position: ${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)}`);
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
        if (!this.projectiles || this.projectiles.length === 0) return;
        if (!this.remotePlayers || Object.keys(this.remotePlayers).length === 0) return;

        // Check each projectile against each remote player
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];

            // Skip inactive projectiles
            if (!projectile.active) continue;

            // Get projectile position
            const projPos = projectile.mesh ? projectile.mesh.position : projectile.position;
            if (!projPos) continue;

            // Check against each remote player
            for (const id in this.remotePlayers) {
                const remotePlayer = this.remotePlayers[id];

                // Skip dead players
                if (remotePlayer.isDead) continue;

                // Get player position
                const playerPos = remotePlayer.getPosition();
                if (!playerPos) continue;

                // Calculate distance between projectile and player
                const dx = projPos.x - playerPos.x;
                const dy = projPos.y - playerPos.y;
                const dz = projPos.z - playerPos.z;
                const distSquared = dx * dx + dy * dy + dz * dz;

                // Hit detection radius (1.5 units squared)
                const hitRadiusSquared = 2.25;

                if (distSquared < hitRadiusSquared) {
                    // Hit detected! Handle damage
                    console.log(`Projectile hit remote player ${id}`);

                    // Deactivate projectile
                    projectile.active = false;

                    // Remove projectile mesh
                    if (projectile.mesh) {
                        this.scene.scene.remove(projectile.mesh);
                        // Clean up resources
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

                    // Send damage event to server if connected
                    if (this.isMultiplayer && this.networkManager.connected) {
                        this.networkManager.sendDamage(id, damageAmount);
                        console.log(`Sent damage event to server: player ${id} took ${damageAmount} damage`);
                    } else {
                        // In single player or when server connection is not available,
                        // apply damage directly
                        remotePlayer.takeDamage(damageAmount);
                    }

                    // Create hit effect at point of impact
                    this.createHitEffect(projPos);

                    // Remove from projectiles array
                    this.projectiles.splice(i, 1);

                    // Break the loop since this projectile is now inactive
                    break;
                }
            }
        }
    }

    /**
     * Check for enemy projectile collisions with local player
     */
    checkEnemyProjectilePlayerCollisions() {
        // Skip if no projectiles or player is dead
        if (!this.enemyProjectiles || this.enemyProjectiles.length === 0) return;
        if (!this.player || this.player.isDead) return;

        // Get player position
        const playerPos = this.player.getPosition();
        if (!playerPos) return;

        // Check each enemy projectile against local player
        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.enemyProjectiles[i];

            // Skip inactive projectiles
            if (!projectile.active) continue;

            // Get projectile position
            const projPos = projectile.mesh ? projectile.mesh.position : projectile.position;
            if (!projPos) continue;

            // Calculate distance between projectile and player
            const dx = projPos.x - playerPos.x;
            const dy = projPos.y - playerPos.y;
            const dz = projPos.z - playerPos.z;
            const distSquared = dx * dx + dy * dy + dz * dz;

            // Hit detection radius (1.5 units squared)
            const hitRadiusSquared = 2.25;

            if (distSquared < hitRadiusSquared) {
                // Hit detected! Handle damage
                console.log(`Enemy projectile hit local player`);

                // Deactivate projectile
                projectile.active = false;

                // Remove projectile mesh
                if (projectile.mesh) {
                    this.scene.scene.remove(projectile.mesh);
                    // Clean up resources
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
                const damageAmount = projectile.damage || 10;

                // Apply damage to local player
                this.player.takeDamage(damageAmount);

                // Create hit effect at point of impact
                this.createHitEffect(projPos);

                // Remove from projectiles array
                this.enemyProjectiles.splice(i, 1);
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

            // Check for jump input
            const isJumping = this.input.keys.space && this.canJump;

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
                    this.player.updateMovementAnimation(movementState);
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

            // Apply movement force with defensive checks
            if (typeof this.player.applyMovementForce === 'function') {
                this.player.applyMovementForce(moveDirection, this.moveForce, this.maxVelocity);

                // Update animation based on movement
                if (this.player && this.input) {
                    this.player.updateMovementAnimation(movementState);
                }
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
            if (projectile) {
                projectile.update(deltaTime);

                // Remove old projectiles
                if (projectile.lifeTime > 3) {
                    this.scene.scene.remove(projectile.mesh);
                    this.physics.physicsWorld.removeRigidBody(projectile.body);
                    this.projectiles.splice(i, 1);
                }
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

    checkProjectileEnemyCollisions() {
        // Simple collision detection between projectiles and enemies
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            if (!projectile.mesh) continue;

            const projectilePos = projectile.mesh.position;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (enemy.isDead || !enemy.mesh) continue;

                const enemyPos = enemy.mesh.position;
                const distance = projectilePos.distanceTo(enemyPos);

                // If projectile is close enough to enemy
                if (distance < 2) {
                    // Enemy takes damage
                    const isDead = enemy.takeDamage(25); // Each hit does 25 damage

                    // Remove projectile
                    projectile.remove();
                    this.projectiles.splice(i, 1);

                    // If enemy died, remove from array
                    if (isDead) {
                        // Release the enemy's color back to the pool when it dies
                        if (enemy.id) {
                            this.colorManager.releaseColor(enemy.id);
                            log(`Released color for enemy ${enemy.id}`);
                        }
                        this.enemies.splice(j, 1);
                    }

                    break; // Projectile can only hit one enemy
                }
            }
        }
    }

    updateEnemyProjectiles(deltaTime) {
        // Update and clean up enemy projectiles
        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.enemyProjectiles[i];
            if (projectile) {
                projectile.update(deltaTime);

                // Remove old projectiles
                if (projectile.lifeTime > 3) {
                    this.scene.scene.remove(projectile.mesh);
                    this.physics.physicsWorld.removeRigidBody(projectile.body);
                    this.enemyProjectiles.splice(i, 1);
                }
            }
        }
    }

    /**
     * Create or update a debug display for multiplayer information
     */
    updateDebugDisplay() {
        // Completely disable debug display to avoid interfering with gameplay
        return;

        // Only create/update when debug mode is enabled
        if (!this.isMultiplayer || !this.predictionSystem || !this.predictionSystem.debugMode) {
            // If debug display exists but should be hidden, remove it
            if (this.debugDisplay && this.debugDisplay.container) {
                this.debugDisplay.container.style.display = 'none';
            }
            return;
        }

        // Create debug display if it doesn't exist
        if (!this.debugDisplay) {
            this.debugDisplay = {
                container: document.createElement('div'),
                stats: document.createElement('div'),
                positions: document.createElement('div'),
                prediction: document.createElement('div'),
                network: document.createElement('div'),
                lastUpdateTime: 0
            };

            // Style the container
            const container = this.debugDisplay.container;
            container.style.position = 'fixed';
            container.style.top = '10px';
            container.style.right = '10px';
            container.style.width = '300px';
            container.style.padding = '10px';
            container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            container.style.color = '#fff';
            container.style.fontFamily = 'monospace';
            container.style.fontSize = '12px';
            container.style.borderRadius = '5px';
            container.style.zIndex = '1000';
            container.style.pointerEvents = 'none'; // Don't block mouse clicks

            // Add sections
            container.appendChild(this.debugDisplay.stats);
            container.appendChild(this.debugDisplay.positions);
            container.appendChild(this.debugDisplay.prediction);
            container.appendChild(this.debugDisplay.network);

            // Add container to document
            document.body.appendChild(container);
        }

        // Only update every 200ms for performance
        const now = Date.now();
        if (now - this.debugDisplay.lastUpdateTime < 200) {
            return;
        }
        this.debugDisplay.lastUpdateTime = now;

        // Make sure display is visible
        this.debugDisplay.container.style.display = 'block';

        // Update information

        // 1. General statistics
        this.debugDisplay.stats.innerHTML = `
            <h3 style="margin: 0 0 5px 0; color: #4fc3f7;">Multiplayer Stats</h3>
            <p>Connected: ${this.networkManager.connected ? '✓' : '✘'}</p>
            <p>Player ID: ${this.networkManager.playerId || 'Unknown'}</p>
            <p>Remote Players: ${Object.keys(this.remotePlayers).length}</p>
            <p>Projectiles: ${this.projectiles.length}</p>
        `;

        // 2. Position information
        const playerPos = this.player ? this.player.getPosition() : { x: 0, y: 0, z: 0 };
        this.debugDisplay.positions.innerHTML = `
            <h3 style="margin: 10px 0 5px 0; color: #4fc3f7;">Position</h3>
            <p>Local: x=${playerPos.x.toFixed(2)}, y=${playerPos.y.toFixed(2)}, z=${playerPos.z.toFixed(2)}</p>
        `;

        // 3. Prediction system info
        if (this.predictionSystem) {
            const stats = this.predictionSystem.getStats();
            this.debugDisplay.prediction.innerHTML = `
                <h3 style="margin: 10px 0 5px 0; color: #4fc3f7;">Prediction</h3>
                <p>Enabled: ${stats.enabled.prediction ? '✓' : '✘'}</p>
                <p>Reconciliation: ${stats.enabled.reconciliation ? '✓' : '✘'}</p>
                <p>Pending Inputs: ${stats.pendingInputCount}</p>
                <p>Corrections: ${stats.reconciliationCount}</p>
                <p>Last Correction: ${stats.timeSinceLastReconciliation}ms ago</p>
                <p>Avg Correction: x=${stats.averageCorrection.x.toFixed(2)}, y=${stats.averageCorrection.y.toFixed(2)}, z=${stats.averageCorrection.z.toFixed(2)}</p>
                <p>Is Jumping: ${stats.isJumping ? '✓' : '✘'}</p>
            `;
        }
    }

    /**
     * Adjust the number of bots based on player count to maintain a total of 12 players
     */
    adjustBotCount() {
        // Calculate how many bots we need
        const totalPlayers = 12; // Target number for deathmatch
        const connectedPlayerCount = Object.keys(this.remotePlayers).length + 1; // +1 for local player
        const requiredBotCount = Math.max(0, totalPlayers - connectedPlayerCount);

        // Current bot count
        const currentBotCount = this.enemies.length;

        log(`Adjusting bot count: ${currentBotCount} bots currently, need ${requiredBotCount} (${connectedPlayerCount} players connected)`);

        // If we need more bots, spawn them
        if (requiredBotCount > currentBotCount) {
            const botsToSpawn = requiredBotCount - currentBotCount;
            log(`Spawning ${botsToSpawn} more bots to reach required ${requiredBotCount}`);
            this.spawnEnemies(botsToSpawn);
        }
        // If we need fewer bots, remove some
        else if (requiredBotCount < currentBotCount) {
            const botsToRemove = currentBotCount - requiredBotCount;
            log(`Removing ${botsToRemove} bots to reach required ${requiredBotCount}`);

            // Remove the oldest bots
            for (let i = 0; i < botsToRemove; i++) {
                if (this.enemies.length > 0) {
                    const enemy = this.enemies.shift(); // Remove the first (oldest) enemy

                    // Release its color
                    if (enemy.id) {
                        this.colorManager.releaseColor(enemy.id);
                    }

                    // Properly remove from scene and physics
                    if (enemy.mesh) {
                        this.scene.scene.remove(enemy.mesh);
                    }
                    if (enemy.body) {
                        this.physics.physicsWorld.removeRigidBody(enemy.body);
                    }

                    // Make sure health bar is removed
                    if (enemy.healthBarContainer) {
                        document.body.removeChild(enemy.healthBarContainer);
                    }

                    log(`Removed bot ${enemy.id || 'unknown'}`);
                }
            }
        } else {
            log('Bot count is already correct');
        }
    }

    /**
     * Spawn a specified number of enemy bots
     * @param {Number} count - Number of bots to spawn
     */
    spawnEnemies(count) {
        try {
            log(`Spawning ${count} enemies`);

            for (let i = 0; i < count; i++) {
                // Generate a unique ID for the bot
                const botId = 'bot-' + Math.random().toString(36).substring(2, 9);

                // Get a random spawn position
                const spawnPosition = this.getRandomSpawnPosition();

                // Get a unique color for this bot
                const botColor = this.colorManager.getColorForId(botId);

                // Create the enemy
                const enemy = new Enemy(
                    this.scene.scene,
                    this.physics.physicsWorld,
                    spawnPosition,
                    botColor
                );

                // Set the bot's ID
                enemy.id = botId;

                // Add to enemies list
                this.enemies.push(enemy);

                log(`Spawned bot with ID: ${botId} at position: x=${spawnPosition.x.toFixed(2)}, y=${spawnPosition.y.toFixed(2)}, z=${spawnPosition.z.toFixed(2)}`);
            }
        } catch (err) {
            error('Error spawning enemies:', err);
        }
    }

    /**
     * Get a random spawn position away from the player
     * @returns {Object} Position object with x, y, z coordinates
     */
    getRandomSpawnPosition() {
        // Get player position
        const playerPos = this.player ? this.player.getPosition() : { x: 0, y: 0, z: 0 };

        // Get a random position that's at least 15 units away from the player
        let position;
        let distance = 0;

        // Try up to 10 times to find a suitable position
        for (let attempts = 0; attempts < 10 && distance < 15; attempts++) {
            // Random position within a 30x30 area
            position = {
                x: (Math.random() - 0.5) * 60,
                y: 5, // Start above ground
                z: (Math.random() - 0.5) * 60
            };

            // Calculate distance to player
            const dx = position.x - playerPos.x;
            const dz = position.z - playerPos.z;
            distance = Math.sqrt(dx * dx + dz * dz);
        }

        return position;
    }

    /**
     * Animation loop - handles requesting animation frames and calculating delta time
     */
    animate() {
        try {
            // Set flag to indicate initialization is complete
            this.initialized = true;

            // Use requestAnimationFrame for smooth animation
            requestAnimationFrame((timestamp) => {
                // Calculate delta time in seconds
                const deltaTime = (timestamp - this.previousTime) / 1000;
                this.previousTime = timestamp;

                // Limit delta time to avoid large jumps if the game was paused
                const clampedDeltaTime = Math.min(deltaTime, 0.1);

                // Update game state
                this.update(clampedDeltaTime);

                // Continue the animation loop
                this.animate();
            });
        } catch (err) {
            error('Error in animation loop', err);
        }
    }

    /**
     * Main update method for the game
     * @param {Number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
        try {
            // Skip update if game is not initialized
            if (!this.initialized) return;

            // Skip update if physics world is not initialized
            if (!this.physics || !this.physics.physicsWorld) return;

            // Get raw input state
            const inputState = this.input.getInputState();

            // Process input with prediction system in multiplayer mode
            if (this.isMultiplayer && this.predictionSystem && this.networkManager.connected) {
                this.predictionSystem.processInput({
                    movement: {
                        forward: inputState.forward,
                        backward: inputState.backward,
                        left: inputState.left,
                        right: inputState.right
                    },
                    jump: inputState.jump,
                    attack: inputState.attack
                }, deltaTime);

                // Update prediction system for velocity damping
                this.predictionSystem.update(deltaTime);
            } else {
                // Single player movement
                this.updateMovement();
            }

            // Update physics world - include time step and maximum substeps
            this.physics.update(deltaTime, 2);

            // Check if player exists
            if (!this.player) return;

            // Update player physics
            try {
                // Update player
                this.player.update(deltaTime);
                this.player.checkGroundContact();

                // Ensure player is above minimum Y position
                // This prevents falling out of the world
                const playerPosition = this.player.getPosition();
                if (playerPosition.y < -20) {
                    console.log('Player fell out of bounds, resetting position...');
                    this.player.setPosition({ x: 0, y: 5, z: 0 });

                    // If in multiplayer, also send the player's death
                    if (this.isMultiplayer && this.networkManager.connected) {
                        this.player.takeDamage(this.player.health); // Ensure death
                    }
                }
            } catch (playerErr) {
                error('Error updating player:', playerErr);
            }

            // Update projectiles
            try {
                this.updateProjectiles(deltaTime);
            } catch (projErr) {
                error('Error updating projectiles:', projErr);
            }

            // Update enemies
            try {
                this.updateEnemies(deltaTime);
            } catch (enemyErr) {
                error('Error updating enemies:', enemyErr);
            }

            // Update remote players
            try {
                for (const id in this.remotePlayers) {
                    this.remotePlayers[id].update(deltaTime);
                }
            } catch (remoteErr) {
                error('Error updating remote players:', remoteErr);
            }

            // Check projectile-enemy collisions
            try {
                this.checkProjectileEnemyCollisions();
            } catch (collisionErr) {
                error('Error checking projectile-enemy collisions:', collisionErr);
            }

            // Update enemy projectiles
            try {
                this.updateEnemyProjectiles(deltaTime);
            } catch (enemyProjErr) {
                error('Error updating enemy projectiles:', enemyProjErr);
            }

            // Check for enemy collision with player
            try {
                this.checkEnemyProjectilePlayerCollisions();
            } catch (enemyProjErr) {
                error('Error checking enemy projectile collisions:', enemyProjErr);
            }

            // Check collisions with remote players
            try {
                this.checkProjectileRemotePlayerCollisions();
            } catch (remoteCollErr) {
                error('Error checking remote player collisions:', remoteCollErr);
            }

            // Send player state to server in multiplayer mode
            if (this.isMultiplayer && this.networkManager.connected) {
                try {
                    this.sendPlayerState();
                } catch (netErr) {
                    error('Error sending player state:', netErr);
                }
            }

            // Update debug display for multiplayer information
            if (this.isMultiplayer) {
                try {
                    this.updateDebugDisplay();
                } catch (debugError) {
                    error('Error updating debug display:', debugError);
                }
            }

            // Update renderer
            if (this.scene) {
                try {
                    this.scene.update();
                } catch (renderError) {
                    error('Error updating scene:', renderError);
                }
            }
        } catch (err) {
            error('Error in game update loop', err);
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
} 