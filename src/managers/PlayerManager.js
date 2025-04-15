import * as THREE from 'three';
import { log, error } from '../debug.js';
import { Player } from '../entities/Player.js';
import { RemotePlayer } from '../entities/RemotePlayer.js';
import { ColorManager } from '../utils/ColorManager.js'; // Assuming ColorManager is needed here
import { GAME_CONFIG } from '../utils/constants.js';

export class PlayerManager {
    /**
     * Manages local and remote players in the game.
     *
     * @param {object} scene - The main THREE.Scene object.
     * @param {object} physicsWorld - The Ammo.js physics world instance.
     * @param {object} networkManager - The NetworkManager instance.
     * @param {object} uiManager - The UIManager instance.
     * @param {object} colorManager - The ColorManager instance.
     * @param {THREE.Camera} camera - The main game camera.
     * @param {Array} projectilesArray - Reference to the game's projectiles array.
     */
    constructor(scene, physicsWorld, networkManager, uiManager, colorManager, camera, projectilesArray) {
        if (!scene || !physicsWorld || !networkManager || !uiManager || !colorManager || !camera || !projectilesArray) {
            throw new Error("PlayerManager requires scene, physicsWorld, networkManager, uiManager, colorManager, camera, and projectilesArray.");
        }
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.networkManager = networkManager;
        this.uiManager = uiManager;
        this.colorManager = colorManager;
        this.camera = camera;
        this.projectilesArray = projectilesArray;

        this.player = null; // Local player instance
        this.remotePlayers = {}; // Map of remote player instances { playerId: RemotePlayer }

        log("PlayerManager initialized.");
    }

    /**
     * Initializes the local player.
     * @returns {Player} The created local player instance.
     */
    initLocalPlayer() {
        const playerId = this.networkManager.playerId || 'local-' + Math.random().toString(36).substring(2, 9);
        const playerColor = this.colorManager.getColorForId(playerId);

        try {
            this.player = new Player(
                this.scene, // Pass the THREE.Scene instance directly
                this.physicsWorld,
                { ...GAME_CONFIG.playerStartPosition }, // Use default start position
                playerId,
                playerColor,
                this.camera,           // Pass camera
                this.projectilesArray, // Pass projectiles array
                this.networkManager,   // Pass network manager
                this.uiManager         // Pass ui manager
            );
            // Note: Physics body registration might happen elsewhere (e.g., in PhysicsWorld or Game.js init)
            // this.physicsWorld.addRigidBody(this.player.body); // Or similar logic
            log(`Local player created with ID: ${playerId} and color: ${playerColor.toString(16)}`);
            return this.player;
        } catch (err) {
            error("Failed to initialize local player:", err);
            throw err; // Re-throw error to indicate failure
        }
    }

    getLocalPlayer() {
        return this.player;
    }

    getPlayer(id) {
        if (id === this.player?.playerId) {
            return this.player;
        }
        return this.remotePlayers[id];
    }

    getAllPlayers() {
        const all = { ...this.remotePlayers };
        if (this.player) {
            all[this.player.playerId] = this.player;
        }
        return all;
    }

    /**
     * Adds a new remote player to the game.
     * @param {string} id - The unique ID of the remote player.
     * @param {object} position - The initial position {x, y, z}.
     * @param {object} initialData - Optional initial state data from the server.
     * @returns {RemotePlayer | null} The created remote player instance or null on failure.
     */
    addRemotePlayer(id, position, initialData = null) {
        if (id === this.player?.playerId) {
            log(`Attempted to add local player ${id} as remote. Ignoring.`);
            return null; // Don't add local player as remote
        }

        log(`PlayerManager: Adding remote player: ${id}`);
        if (this.remotePlayers[id]) {
            log(`PlayerManager: Remote player ${id} already exists. Removing old one.`);
            this.removeRemotePlayer(id); // Clean up existing player first
        }

        // Validate position
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
            position = { ...GAME_CONFIG.playerStartPosition };
            console.warn(`Using default start position for remote player ${id} due to invalid initial position.`);
        }

        const playerColor = this.colorManager.getColorForId(id);
        log(`Assigning color ${playerColor.toString(16)} to remote player ${id}`);

        console.log(`[PlayerManager addRemotePlayer] Attempting to create RemotePlayer for ${id} at`, position);
        try {
            const remotePlayer = new RemotePlayer(this.scene, id, position, playerColor);
            this.remotePlayers[id] = remotePlayer;

            // Apply any other initial data from the server state
            if (initialData) {
                this.updateRemotePlayerState(remotePlayer, initialData);
            }

            // Create UI
            this.uiManager.createPlayerUI(id, id);

            log(`PlayerManager: Remote player ${id} added successfully.`);
            return remotePlayer;
        } catch (err) {
            error(`PlayerManager: Failed to create remote player ${id}:`, err);
            delete this.remotePlayers[id]; // Clean up if creation failed
            this.colorManager.releaseColor(id); // Release color if failed
            return null;
        }
    }

    /**
     * Removes a remote player from the game.
     * @param {string} id - The ID of the remote player to remove.
     */
    removeRemotePlayer(id) {
        log(`PlayerManager: Removing remote player ${id}`);
        const remotePlayer = this.remotePlayers[id];
        if (remotePlayer) {
            try {
                this.uiManager.removePlayerUI(id);
                remotePlayer.remove(); // Call the entity's own cleanup
            } catch (err) {
                error(`Error during RemotePlayer internal removal for ${id}:`, err);
            }
            delete this.remotePlayers[id];
            this.colorManager.releaseColor(id);
            log(`PlayerManager: Remote player ${id} removed.`);
        } else {
            log(`PlayerManager: Player ${id} not found for removal.`);
        }
    }

    /**
     * Updates all managed remote players.
     * @param {number} deltaTime - The time elapsed since the last frame.
     * @param {function} isVisibleCheck - Function to check if a player is visible (takes player object).
     */
    updateRemotePlayers(deltaTime, isVisibleCheck) {
        for (const id in this.remotePlayers) {
            const player = this.remotePlayers[id];
            if (player) {
                try {
                    // Update internal state (interpolation, animation)
                    player.update(deltaTime);

                    // Update UI
                    const isVisible = isVisibleCheck(player); // Use the provided check function
                    this.uiManager.updatePlayerUI(id, player.getPosition(), player.health, player.isDead, isVisible);

                } catch (err) {
                    error(`PlayerManager: Error updating remote player ${id}:`, err);
                    // Consider adding logic to remove repeatedly failing players
                }
            }
        }
    }

    /**
     * Cleans up remote players that are no longer present in the server state.
     * @param {Set<string>} seenPlayerIds - A Set containing the IDs of players present in the latest server update.
     */
    cleanupDisconnectedPlayers(seenPlayerIds) {
        log(`PlayerManager: Running cleanup. Seen IDs: ${[...seenPlayerIds].join(', ')}. Current Remotes: ${Object.keys(this.remotePlayers).join(', ')}`);
        for (const id in this.remotePlayers) {
            if (!seenPlayerIds.has(id)) {
                log(`PlayerManager: Player ${id} not seen in update. Removing.`);
                this.removeRemotePlayer(id);
            }
        }
    }

    /**
     * Updates a remote player's state based on server data.
     * @param {RemotePlayer} remotePlayer - The remote player instance.
     * @param {object} playerData - The data received from the server (can be partial delta or full state).
     */
    updateRemotePlayerState(remotePlayer, playerData) {
        if (!remotePlayer || !playerData) return;

        // Simplified logging for state updates
        // if (Math.random() < 0.1) { console.log(`[PM UpdateState ${remotePlayer.remoteId}] Data:`, JSON.stringify(playerData)); }

        // Position & Rotation (handled carefully by RemotePlayer interpolation)
        if (playerData.position && typeof playerData.position.x === 'number') {
            remotePlayer.setPosition(playerData.position);
        }
        if (playerData.rotation) {
            remotePlayer.setRotation(playerData.rotation);
        }

        // --- State Flags --- 
        let stateOrAnimationChanged = false;

        if (playerData.isDead !== undefined && remotePlayer.isDead !== playerData.isDead) {
            if (playerData.isDead) {
                log(`[PM UpdateState ${remotePlayer.remoteId}] Setting isDead=true`);
                remotePlayer.die(); // Sets internal flag
            } else {
                log(`[PM UpdateState ${remotePlayer.remoteId}] Setting isDead=false (Respawn)`);
                // Use server position if available for respawn accuracy
                remotePlayer.respawn(playerData.position || remotePlayer.initialPosition);
            }
            stateOrAnimationChanged = true;
        }

        if (playerData.isAttacking !== undefined && remotePlayer.isAttacking !== playerData.isAttacking) {
            log(`[PM UpdateState ${remotePlayer.remoteId}] Setting isAttacking=${playerData.isAttacking}`);
            remotePlayer.isAttacking = playerData.isAttacking;
            stateOrAnimationChanged = true;
        }

        if (playerData.isJumping !== undefined && remotePlayer.isJumping !== playerData.isJumping) {
            log(`[PM UpdateState ${remotePlayer.remoteId}] Setting isJumping=${playerData.isJumping}`);
            remotePlayer.isJumping = playerData.isJumping;
            stateOrAnimationChanged = true;
        }

        // --- Animation --- 
        // Server dictates the animation state
        let targetAnimation = 'idle'; // Fallback
        if (!remotePlayer.isDead) { // Don't apply movement/attack anims if dead
            if (playerData.animation) {
                // --- DEBUG: Log received animation ---+
                console.log(`[PM UpdateState ${remotePlayer.remoteId}] Received animation: ${playerData.animation}`);
                targetAnimation = playerData.animation;
            }
            // Server attack/jump state might override client-sent animation for this tick
            if (playerData.isAttacking) { // Check server data flag
                targetAnimation = 'attack';
                console.log(`[PM UpdateState ${remotePlayer.remoteId}] Prioritizing 'attack' based on server isAttacking flag.`);
            } else if (playerData.isJumping) { // Check server data flag
                targetAnimation = 'jump';
                console.log(`[PM UpdateState ${remotePlayer.remoteId}] Prioritizing 'jump' based on server isJumping flag.`);
            }
        }

        if (remotePlayer.currentAnimation !== targetAnimation) {
            log(`[PM UpdateState ${remotePlayer.remoteId}] Setting animation: ${targetAnimation} (was ${remotePlayer.currentAnimation})`);
            remotePlayer.playAnimation(targetAnimation);
            stateOrAnimationChanged = true;
        }

        // --- Health --- 
        // Update health AFTER handling death state
        if (playerData.health !== undefined && remotePlayer.health !== playerData.health) {
            log(`[PM UpdateState ${remotePlayer.remoteId}] Setting health=${playerData.health}`);
            remotePlayer.health = playerData.health;
            // UI update is handled in the updateRemotePlayers loop
            stateOrAnimationChanged = true;
        }

        // Log final state if anything significant changed
        // if (stateOrAnimationChanged) {
        //     console.log(`[PM UpdateState End ${remotePlayer.remoteId}] Health: ${remotePlayer.health}, Dead: ${remotePlayer.isDead}, Anim: ${remotePlayer.currentAnimation}`);
        // }
    }

    // --- Network Event Handlers (to be called by Game.js) ---

    handleGameStateUpdate(gameState) {
        if (!gameState || !gameState.players) {
            console.warn('PlayerManager received invalid game state:', gameState);
            return;
        }
        console.log(`[PlayerManager handleGameStateUpdate] Processing full state for players:`, Object.keys(gameState.players));
        const seenPlayerIds = new Set();

        for (const [id, playerData] of Object.entries(gameState.players)) {
            seenPlayerIds.add(id);

            if (id === this.player?.playerId) {
                // Handle updates for the local player if needed (e.g., reconciliation)
                // This might be handled by PredictionSystem directly based on server ack
            } else {
                let remotePlayer = this.remotePlayers[id];
                if (!remotePlayer) {
                    log(`PlayerManager: Player ${id} not found in full update, adding.`);
                    remotePlayer = this.addRemotePlayer(id, playerData.position, playerData); // Pass full data
                } else {
                    // Player exists, update its state fully
                    this.updateRemotePlayerState(remotePlayer, playerData);
                }
            }
        }
        this.cleanupDisconnectedPlayers(seenPlayerIds);
    }

    handleGameStateDeltaUpdate(deltaData) {
        if (!deltaData) return;

        console.log(`[PlayerManager handleGameStateDeltaUpdate] Processing delta:`, deltaData);
        // Player Deltas
        if (deltaData.playerDeltas) {
            for (const [id, delta] of Object.entries(deltaData.playerDeltas)) {
                if (id === this.player?.playerId) {
                    // Handle local player delta (reconciliation, handled by PredictionSystem)
                } else {
                    let remotePlayer = this.remotePlayers[id];
                    if (!remotePlayer) {
                        // Player should exist if we received a delta, but handle creation just in case
                        log(`PlayerManager: Player ${id} not found in delta update, adding.`);
                        // Delta might not have position, need robust creation
                        remotePlayer = this.addRemotePlayer(id, delta.position || GAME_CONFIG.playerStartPosition, delta);
                    } else {
                        // Apply partial updates
                        this.updateRemotePlayerState(remotePlayer, delta);
                    }
                }
            }
        }

        // Removed Players
        if (deltaData.removedPlayerIds) {
            deltaData.removedPlayerIds.forEach(id => {
                this.removeRemotePlayer(id);
            });
        }
    }

    handlePlayerDamage(data) {
        const targetPlayer = this.getPlayer(data.targetId);
        if (targetPlayer) {
            log(`PlayerManager: Applying ${data.amount} damage to ${data.targetId}`);
            targetPlayer.takeDamage(data.amount, data.attackerId); // Pass attackerId
            // If local player was hit, show indicator via UIManager
            if (targetPlayer === this.player && data.targetId === this.player.playerId) {
                const currentPos = this.player.getPosition();
                this.uiManager.showDamageIndicator(new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z), data.amount);
            }
        } else {
            log(`PlayerManager: Could not find target ${data.targetId} for damage.`);
        }
    }

    handlePlayerDeath(data) {
        const targetPlayer = this.getPlayer(data.playerId);
        if (targetPlayer && !targetPlayer.isDead) {
            log(`PlayerManager: Processing death for ${data.playerId}`);
            targetPlayer.die(data.killerId); // Pass killerId
            // If local player died, show message via UIManager
            if (targetPlayer === this.player && data.playerId === this.player.playerId) {
                this.uiManager.showDeathMessage();
            }
        } else {
            log(`PlayerManager: Player ${data.playerId} not found or already dead for death event.`);
        }
    }

    handlePlayerRespawn(data) {
        const targetPlayer = this.getPlayer(data.playerId);
        if (targetPlayer && targetPlayer.isDead) { // Only respawn if dead
            log(`PlayerManager: Processing respawn for ${data.playerId}`);
            targetPlayer.respawn(data.position);
            // If local player respawned, hide message via UIManager
            if (targetPlayer === this.player && data.playerId === this.player.playerId) {
                this.uiManager.hideDeathMessage();
            }
        } else {
            log(`PlayerManager: Player ${data.playerId} not found or not dead for respawn event.`);
        }
    }

    // Method to update player color based on received network ID
    updateLocalPlayerNetworkInfo(playerId) {
        if (this.player && this.player.playerId !== playerId) {
            log(`PlayerManager: Updating local player ID from ${this.player.playerId} to ${playerId}`);
            const oldId = this.player.playerId;
            this.colorManager.releaseColor(oldId); // Release old temp color

            this.player.playerId = playerId;
            const newColor = this.colorManager.getColorForId(playerId);
            this.player.playerColor = newColor;

            // Update visual mesh color
            if (this.player.mesh) {
                this.player.mesh.traverse((child) => {
                    if (child.isMesh && child.material && (!child.material.name || !child.material.name.toLowerCase().includes('eye'))) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.color.setHex(newColor));
                        } else {
                            child.material.color.setHex(newColor);
                        }
                    }
                });
            }
            log(`PlayerManager: Updated local player color to ${newColor.toString(16)}`);
        }
    }
} 