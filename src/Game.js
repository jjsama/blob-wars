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
     * Handle game state updates from the server
     */
    handleGameStateUpdate(gameState) {
        if (!gameState || !gameState.players) {
            console.error('Received invalid game state update:', gameState);
            return;
        }

        try {
            // Debug: log game state update details occasionally
            if (Math.random() < 0.05) {
                console.log(`Game state update received with ${Object.keys(gameState.players).length} players`);
            }

            // Create a set to track which player IDs we've seen
            const seenPlayerIds = new Set();

            // Update remote players
            for (const id in gameState.players) {
                // Skip our own player
                if (id === this.networkManager.playerId) continue;

                // Mark this player ID as seen
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

                    // Determine animation based on movement
                    if (playerData.animation) {
                        // If server directly provides animation state, use it
                        remotePlayer.setAnimation(playerData.animation);
                    } else {
                        // Otherwise detect movement and set appropriate animation
                        const isMoving = this.detectRemotePlayerMovement(prevPos, playerData.position);

                        if (isMoving) {
                            // Use walkForward animation when moving
                            remotePlayer.setAnimation('walkForward');
                        } else {
                            // Use idle animation when not moving
                            remotePlayer.setAnimation('idle');
                        }
                    }
                } else {
                    // New player joined, create it
                    console.log(`Creating new remote player ${id}`);
                    this.addRemotePlayer(id, playerData.position);
                }
            }

            // Remove disconnected players (those not in the current game state)
            for (const id in this.remotePlayers) {
                if (!seenPlayerIds.has(id)) {
                    console.log(`Remote player ${id} not in game state, removing`);
                    this.removeRemotePlayer(id);
                }
            }
        } catch (err) {
            console.error('Error processing game state update:', err);
        }
    }

    /**
     * Detect if a remote player is moving by comparing positions
     */
    detectRemotePlayerMovement(prevPos, newPos) {
        if (!prevPos || !newPos) return false;

        // Calculate distance between positions
        const dx = prevPos.x - newPos.x;
        const dz = prevPos.z - newPos.z;
        const distanceSquared = dx * dx + dz * dz;

        // Consider the player moving if they've moved more than a small threshold
        // Using squared distance for efficiency (avoiding square root)
        const MOVEMENT_THRESHOLD_SQUARED = 0.0001; // ~0.01 units of movement

        return distanceSquared > MOVEMENT_THRESHOLD_SQUARED;
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

        // Create a new RemotePlayer instance
        const remotePlayer = new RemotePlayer(
            this.scene.scene,  // scene
            id,                // player ID
            position,          // initial position
            playerColor        // player color
        );

        // Create a nametag for the remote player
        this.addNameTag(remotePlayer, id);

        // Store the remote player
        this.remotePlayers[id] = remotePlayer;

        log(`Remote player ${id} added successfully`);

        // Adjust bot count when a new player joins
        this.adjustBotCount();

        return remotePlayer;
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

        this.networkManager.updatePlayerState(position, rotation);
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

        // Trigger attack animation
        this.player.attack();

        // Get camera position and direction
        const cameraPosition = this.scene.camera.position.clone();

        // Create a raycaster from the camera through the center of the screen (crosshair)
        const raycaster = new THREE.Raycaster();
        // Use the camera's view direction
        const direction = new THREE.Vector3(0, 0, -1);
        direction.unproject(this.scene.camera).sub(cameraPosition).normalize();

        raycaster.set(cameraPosition, direction);

        // Calculate a target point far in the distance
        const targetPoint = cameraPosition.clone().add(direction.clone().multiplyScalar(1000));

        // Calculate weapon position (offset from player)
        const playerPos = this.player.getPosition();
        const rightVector = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

        // Position the weapon to the right side of the player at shoulder height
        const weaponOffset = new THREE.Vector3(
            rightVector.x * 0.5,
            1.5, // Shoulder height
            rightVector.z * 0.5
        );

        // Start position is from this weapon position
        const position = new THREE.Vector3(
            playerPos.x + weaponOffset.x,
            playerPos.y + weaponOffset.y,
            playerPos.z + weaponOffset.z
        );

        // Calculate the EXACT direction from the weapon position to the target point
        // This is the key to accurate aiming
        const exactDirection = new THREE.Vector3();
        exactDirection.subVectors(targetPoint, position).normalize();

        // Create the projectile with the exact direction
        const projectile = new Projectile(
            this.scene.scene,
            this.physics.physicsWorld,
            position,
            exactDirection
        );

        this.projectiles.push(projectile);

        // Debug visualization (optional)
        // this.drawDebugLine(position, targetPoint);
    }

    // Optional debug method to visualize the projectile path
    drawDebugLine(start, end) {
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const points = [];
        points.push(start);
        points.push(end);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        this.scene.scene.add(line);

        // Remove the line after 1 second
        setTimeout(() => {
            this.scene.scene.remove(line);
        }, 1000);
    }

    updateMovement() {
        try {
            // Skip if player or physics is not available
            if (!this.player || !this.player.body || !this.physics) {
                return;
            }

            // Get movement input
            const moveDirection = this.input.getMovementDirection();

            // If no movement, explicitly stop the player by setting velocity to zero
            if (!moveDirection) {
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

    checkEnemyProjectilePlayerCollisions() {
        if (!this.player || this.player.isDead) return;

        const playerPos = this.player.getPosition();

        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.enemyProjectiles[i];
            if (!projectile.mesh) continue;

            const projectilePos = projectile.mesh.position;
            const distance = projectilePos.distanceTo(playerPos);

            // If projectile is close enough to player
            if (distance < 2) {
                // Player takes damage
                this.player.takeDamage(10); // Enemy projectiles do less damage

                // Remove projectile
                projectile.remove();
                this.enemyProjectiles.splice(i, 1);
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

    update(deltaTime) {
        try {
            // Skip update if no player or deltaTime is invalid
            if (!this.player || !deltaTime || isNaN(deltaTime)) return;

            // Step physics simulation
            if (this.physics) {
                try {
                    this.physics.update(deltaTime);
                } catch (physicsError) {
                    error('Error in physics update:', physicsError);
                }
            }

            // Update player
            if (this.player) {
                try {
                    this.player.update(deltaTime);

                    // Update player movement based on input - CRITICAL FOR MOVEMENT
                    this.updateMovement();

                    // Log player position for debugging
                    if (Math.random() < 0.01) { // Only log occasionally to avoid spam
                        const pos = this.player.getPosition();
                        console.log(`Player position: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
                    }

                    // Update player animation based on input
                    if (this.input) {
                        const movementState = this.input.getMovementState();
                        console.log('Movement state:',
                            movementState.isMoving ? 'Moving' : 'Not moving',
                            movementState.isJumping ? 'Jumping' : 'Not jumping');
                        this.player.updateMovementAnimation(movementState);
                    }
                } catch (playerError) {
                    error('Error updating player:', playerError.message || playerError);
                    console.error('Player update stack trace:', playerError.stack || 'No stack trace available');
                }
            }

            // Update remote players
            for (const id in this.remotePlayers) {
                try {
                    if (this.remotePlayers[id]) {
                        this.remotePlayers[id].update(deltaTime);
                    }
                } catch (remotePlayerError) {
                    error(`Error updating remote player ${id}:`, remotePlayerError);
                }
            }

            // Update projectiles
            try {
                this.updateProjectiles(deltaTime);
            } catch (projectileError) {
                error('Error updating projectiles:', projectileError);
            }

            // Update enemies in single-player mode
            if (!this.isMultiplayer) {
                try {
                    this.updateEnemies(deltaTime);
                } catch (enemyError) {
                    error('Error updating enemies:', enemyError);
                }

                try {
                    this.checkProjectileEnemyCollisions();
                } catch (collisionError) {
                    error('Error checking projectile-enemy collisions:', collisionError);
                }

                try {
                    this.updateEnemyProjectiles(deltaTime);
                } catch (enemyProjectileError) {
                    error('Error updating enemy projectiles:', enemyProjectileError);
                }

                try {
                    this.checkEnemyProjectilePlayerCollisions();
                } catch (playerCollisionError) {
                    error('Error checking enemy projectile-player collisions:', playerCollisionError);
                }
            }

            // Send player state to server (if multiplayer)
            if (this.isMultiplayer) {
                try {
                    this.sendPlayerState();
                } catch (networkError) {
                    error('Error sending player state to server:', networkError);
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

    animate(currentTime = 0) {
        // Continue animation loop even if there's an error
        try {
            requestAnimationFrame(this.animate.bind(this));
        } catch (rafError) {
            error('Error in requestAnimationFrame:', rafError);
            // Fallback to setTimeout if requestAnimationFrame fails
            setTimeout(() => this.animate(), 16);
            return;
        }

        try {
            // Calculate delta time in seconds (convert from ms)
            const deltaTime = Math.min((currentTime - this.previousTime) / 1000, 0.1); // Cap at 100ms
            this.previousTime = currentTime;

            // Skip update if delta is too small to avoid physics issues
            if (deltaTime > 0) {
                this.update(deltaTime);
            }

            // Render the scene
            if (this.scene) {
                try {
                    this.scene.update();
                } catch (renderError) {
                    error('Error in scene update during animation:', renderError);
                }
            }
        } catch (err) {
            error('Error in animation loop:', err);
            // We've already set up the next animation frame, so we'll recover
        }
    }

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

        log('Invisible walls added to map boundaries');
    }

    spawnEnemies(count) {
        try {
            log('Spawning ' + count + ' enemies');

            // Spawn enemies at random positions
            for (let i = 0; i < count; i++) {
                // Use a wider distribution for enemy spawning
                const x = Math.random() * 80 - 40;
                const z = Math.random() * 80 - 40;

                // IMPORTANT: Start enemies at a higher position to ensure they have time to fall
                const y = 15; // Increased from 5 to 15 to ensure they have time to fall and make ground contact

                // Generate a unique ID for this enemy and get a color from the color manager
                const enemyId = `enemy-${i}-${Date.now().toString(36)}`;
                const enemyColor = this.colorManager.getColorForId(enemyId);
                log(`Assigning color ${enemyColor.toString(16)} to enemy ${i}`);

                // Create enemy with the assigned color
                const enemy = new Enemy(this.scene.scene, this.physics.physicsWorld, { x, y, z }, enemyColor);

                // Store the ID for later reference (useful for color release when enemy dies)
                enemy.id = enemyId;

                this.enemies.push(enemy);

                log(`Enemy ${i} (ID: ${enemyId}) spawned at position x=${x.toFixed(2)}, y=${y.toFixed(2)}, z=${z.toFixed(2)}`);

                // Force immediate activation of physics bodies with stronger initial impulse
                setTimeout(() => {
                    if (enemy.body) {
                        // Ensure the body is active
                        enemy.body.activate(true);

                        // Apply a very strong initial downward impulse to start falling immediately
                        const impulse = new Ammo.btVector3(0, -50, 0); // Increased from -30 to -50
                        enemy.body.applyCentralImpulse(impulse);
                        Ammo.destroy(impulse);

                        log(`Applied strong initial impulse to enemy ${i}`);

                        // Log initial physics position
                        const transform = enemy.body.getWorldTransform();
                        const origin = transform.getOrigin();
                        log(`Enemy ${i} initial physics position: x=${origin.x().toFixed(2)}, y=${origin.y().toFixed(2)}, z=${origin.z().toFixed(2)}`);

                        // Set up periodic checks to ensure enemy reaches the ground
                        const checkInterval = setInterval(() => {
                            if (!enemy.body || enemy.isDead) {
                                clearInterval(checkInterval);
                                return;
                            }

                            // Get current position
                            const transform = enemy.body.getWorldTransform();
                            const origin = transform.getOrigin();
                            const y = origin.y();

                            // Check if enemy is grounded
                            const isGrounded = enemy.checkGroundContact();
                            log(`Enemy ${i} at y=${y.toFixed(2)}, grounded: ${isGrounded}`);

                            // If enemy is grounded, stop checking
                            if (isGrounded) {
                                log(`Enemy ${i} has reached the ground!`);
                                clearInterval(checkInterval);
                            }

                            // If enemy is stuck in air, apply an additional impulse
                            if (!isGrounded && y > 2) {
                                const newImpulse = new Ammo.btVector3(0, -30, 0);
                                enemy.body.applyCentralImpulse(newImpulse);
                                Ammo.destroy(newImpulse);
                                log(`Applied additional impulse to enemy ${i} at height ${y.toFixed(2)}`);
                            }
                        }, 1000); // Check every second
                    }
                }, 100);
            }

            log('Successfully spawned ' + count + ' enemies');
        } catch (err) {
            error('Error spawning enemies:', err);
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
} 