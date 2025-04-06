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
        this.lastNetworkUpdateTime = 0;
        this.networkUpdateInterval = 50; // Send updates every 50ms (20 times per second)

        // Initialize prediction system for client-side prediction and server reconciliation
        this.predictionSystem = new PredictionSystem(this);

        // Set up network event handlers
        this.networkManager.on('projectileSpawn', (projectileData) => {
            // Only handle projectiles from other players
            if (projectileData.ownerId !== this.networkManager.playerId) {
                this.handleRemoteProjectileSpawn(projectileData);
            } else {
                // For our own projectiles, create them locally
                this.handleLocalProjectileSpawn(projectileData);
            }
        });

        // Reduce movement speed for better gameplay
        this.moveForce = 15;

        // Make game instance globally available for enemies
        window.game = this;

        // Initialize crosshair
        this.initCrosshair();

        // Initialize UI
        this.initUI();
    }

    initUI() {
        // Create HUD container
        const hudContainer = document.createElement('div');
        hudContainer.id = 'hud-container';
        hudContainer.style.position = 'fixed';
        hudContainer.style.bottom = '20px';
        hudContainer.style.left = '20px';
        hudContainer.style.zIndex = '1000';
        document.body.appendChild(hudContainer);

        // Create health bar container
        const healthBarContainer = document.createElement('div');
        healthBarContainer.id = 'health-bar-container';
        healthBarContainer.style.width = '200px';
        healthBarContainer.style.height = '20px';
        healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthBarContainer.style.border = '2px solid #000';
        healthBarContainer.style.borderRadius = '10px';
        healthBarContainer.style.overflow = 'hidden';
        hudContainer.appendChild(healthBarContainer);

        // Create health bar
        const healthBar = document.createElement('div');
        healthBar.id = 'health-bar';
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
        healthBar.style.transition = 'width 0.3s ease-in-out, background-color 0.3s ease-in-out';
        healthBarContainer.appendChild(healthBar);

        // Create health text
        const healthText = document.createElement('div');
        healthText.id = 'health-text';
        healthText.style.position = 'absolute';
        healthText.style.width = '100%';
        healthText.style.textAlign = 'center';
        healthText.style.color = '#fff';
        healthText.style.fontFamily = 'Arial, sans-serif';
        healthText.style.fontSize = '14px';
        healthText.style.fontWeight = 'bold';
        healthText.style.textShadow = '1px 1px 2px #000';
        healthText.style.lineHeight = '20px';
        healthText.textContent = '100 HP';
        healthBarContainer.appendChild(healthText);
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
            if (!gameState || !gameState.players) {
                console.warn('Received invalid game state:', gameState);
                return;
            }

            // Track seen player IDs for cleanup
            const seenPlayerIds = new Set();

            // Process all players in the game state
            Object.entries(gameState.players).forEach(([id, playerData]) => {
                seenPlayerIds.add(id);

                if (id === this.networkManager.playerId) {
                    // Handle local player updates
                    if (playerData && playerData.position && this.player) {
                        if (this.isValidPosition(playerData.position)) {
                            const currentPos = this.player.getPosition();
                            const posDiff = new THREE.Vector3(
                                playerData.position.x - currentPos.x,
                                playerData.position.y - currentPos.y,
                                playerData.position.z - currentPos.z
                            );

                            if (posDiff.lengthSq() > 1) {
                                this.player.setPosition(playerData.position);
                            }
                        }
                    }
                } else {
                    // Handle remote player updates
                    let remotePlayer = this.remotePlayers[id];
                    if (!remotePlayer && playerData) {
                        // Create new remote player if it doesn't exist
                        remotePlayer = this.addRemotePlayer(id, playerData.position);
                    }
                    if (remotePlayer && playerData) {
                        // Update remote player
                        this.updateRemotePlayerState(remotePlayer, playerData);
                    }
                }
            });

            // Clean up disconnected players
            Object.keys(this.remotePlayers).forEach(id => {
                if (!seenPlayerIds.has(id)) {
                    // Remove player's visual elements
                    if (this.remotePlayers[id]) {
                        // Remove name tag if it exists
                        if (this.remotePlayers[id].nameTag) {
                            document.body.removeChild(this.remotePlayers[id].nameTag);
                        }
                        // Remove health bar if it exists
                        if (this.remotePlayers[id].healthBar) {
                            this.scene.scene.remove(this.remotePlayers[id].healthBar);
                        }
                        // Remove the player model from the scene
                        this.scene.scene.remove(this.remotePlayers[id]);
                        // Delete the player reference
                        delete this.remotePlayers[id];
                        console.log(`Cleaned up disconnected player: ${id}`);
                    }
                }
            });
        } catch (err) {
            console.error('Error handling game state update:', err);
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

        // Update position and rotation if provided
        if (playerData.position) {
            remotePlayer.setPosition(playerData.position);
        }
        if (playerData.rotation) {
            remotePlayer.setRotation(playerData.rotation);
        }

        // Handle death state
        if (playerData.isDead !== undefined) {
            if (playerData.isDead && !remotePlayer.isDead) {
                remotePlayer.die();
            } else if (!playerData.isDead && remotePlayer.isDead) {
                remotePlayer.respawn(playerData.position);
            }
        }

        // Handle attack state
        if (playerData.isAttacking && !remotePlayer.isAttacking) {
            remotePlayer.attack();
        }

        // Handle jumping state
        if (playerData.isJumping && !remotePlayer.isJumping) {
            remotePlayer.setAnimation('jump');
            remotePlayer.isJumping = true;

            // Reset jumping state after animation
            setTimeout(() => {
                remotePlayer.isJumping = false;
                if (!remotePlayer.isDead && !remotePlayer.isAttacking) {
                    remotePlayer.setAnimation(remotePlayer.isMoving ? 'walkForward' : 'idle');
                }
            }, 1000);
        }

        // Update animation based on movement state
        if (!remotePlayer.isDead && !remotePlayer.isAttacking && !remotePlayer.isJumping) {
            if (playerData.animation) {
                remotePlayer.setAnimation(playerData.animation);
            }
        }
    }

    cleanupDisconnectedPlayers(seenPlayerIds) {
        for (const id in this.remotePlayers) {
            if (!seenPlayerIds.has(id)) {
                // Remove player from scene
                const player = this.remotePlayers[id];
                if (player.nameTag) {
                    player.nameTag.remove();
                }
                if (player.healthBar) {
                    player.healthBar.remove();
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
        if (projectile.ownerId && this.remotePlayers[projectile.ownerId]) {
            projectileColor = this.remotePlayers[projectile.ownerId].playerColor || 0xff0000;
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
        log(`Adding remote player: ${id}`);

        // First, check if a player with this ID already exists and remove it
        if (this.remotePlayers[id]) {
            log(`Remote player ${id} already exists, removing old instance first`);
            this.removeRemotePlayer(id);
        }

        // Make sure position is valid
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
            position = {
                x: 0,
                y: 5, // Place above ground
                z: 0
            };
            log(`Using default position for remote player ${id} due to invalid position`);
        }

        // Get a unique color for this remote player from the color manager
        const playerColor = this.colorManager.getColorForId(id);
        log(`Assigning color ${playerColor.toString(16)} to remote player ${id}`);

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
            if (!this.scene) {
                error(`Cannot create remote player ${id}: scene not initialized`);
                return null;
            }

            this.remotePlayers[id] = new RemotePlayer(this.scene, id, offsetPosition, playerColor);

            // Add name tag after a short delay to ensure DOM is ready
            setTimeout(() => {
                if (this.remotePlayers[id]) {
                    this.addNameTag(this.remotePlayers[id], id);
                }
            }, 100);

            log(`Remote player ${id} created at position: x=${offsetPosition.x.toFixed(2)}, y=${offsetPosition.y.toFixed(2)}, z=${offsetPosition.z.toFixed(2)}`);
            return this.remotePlayers[id];
        } catch (err) {
            error(`Failed to create remote player ${id}:`, err);
            return null;
        }
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

        // Get camera position and direction for accurate targeting
        const cameraPos = new THREE.Vector3();
        const cameraDir = new THREE.Vector3();
        this.scene.camera.getWorldPosition(cameraPos);
        this.scene.camera.getWorldDirection(cameraDir);

        // Get the player's position
        const playerPos = this.player.getPosition();

        // Calculate spawn position (right hand offset)
        const spawnPos = new THREE.Vector3(playerPos.x, playerPos.y + 0.8, playerPos.z);
        const playerRotation = this.player.getRotation().y;

        // Apply right-hand offset
        spawnPos.x += Math.cos(playerRotation + Math.PI / 2) * 0.4;
        spawnPos.z += Math.sin(playerRotation + Math.PI / 2) * 0.4;

        // Calculate exact target point using raycasting
        const raycaster = new THREE.Raycaster(cameraPos, cameraDir);
        const targetPoint = new THREE.Vector3();
        targetPoint.copy(cameraPos).add(cameraDir.multiplyScalar(1000)); // Project far into the distance

        // Calculate exact shooting direction from spawn to target
        const shootDirection = new THREE.Vector3()
            .subVectors(targetPoint, spawnPos)
            .normalize();

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
            active: true
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
            opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(spawnPos);
        this.scene.scene.add(mesh);
        projectile.mesh = mesh;

        // Add to projectiles array
        this.projectiles.push(projectile);

        // Set player as attacking
        this.player.attack();

        // Add muzzle flash for visual feedback
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
                this.player.updateMovementAnimation(movementState);
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
            log(`Network Stats: ${JSON.stringify(stats)}`);
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
            this.updateRemotePlayers(fixedDeltaTime);

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
            try {
                if (player && typeof player.update === 'function') {
                    player.update(deltaTime);
                }
            } catch (err) {
                error(`Error updating remote player ${player.remoteId}:`, err);
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

                return true;
            }
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
            log(`Remote player ${id} spawned at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
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
                log(`Remote player ${playerId} disconnected and cleaned up`);
            }
        } catch (err) {
            error(`Error cleaning up remote player ${playerId}:`, err);
        }
    }
} 