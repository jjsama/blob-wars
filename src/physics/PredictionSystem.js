/**
 * PredictionSystem.js
 * 
 * This system handles client-side prediction and server reconciliation for networked physics.
 * It maintains a buffer of player inputs and predictions, and reconciles them with server state.
 */
import { log, error } from '../debug.js';

export class PredictionSystem {
    constructor(game) {
        this.game = game;
        this.inputSequence = 0;
        this.pendingInputs = [];
        this.lastProcessedInput = -1;

        // Increased baseline thresholds to prevent jittery movement
        this.positionReconciliationThreshold = 0.5; // Only reconcile when diff > 0.5 units
        this.velocityDampingThreshold = 0.1; // Stop residual movement below this threshold

        // State tracking
        this.reconciliationEnabled = true;
        this.predictionEnabled = true;
        this.debugMode = false;
        this.isJumping = false;
        this.jumpCooldown = false;
        this.jumpStartTime = 0;

        // Interpolation factors for smoother corrections
        this.correctionFactorGround = 0.15; // Slower interpolation on ground
        this.correctionFactorAir = 0.1; // Even slower in air for smoother jumps

        // Last input time tracking to detect input stopped
        this.lastInputAppliedTime = 0;
        this.noInputDuration = 0;
        this.velocityDampingActive = false;

        // Statistics
        this.reconciliationCount = 0;
        this.lastReconciliationTime = 0;
        this.averageCorrection = { x: 0, y: 0, z: 0 };
    }

    /**
     * Process a player input and add it to the pending inputs buffer
     * @param {Object} input - The player input to process
     * @param {Number} deltaTime - The time elapsed since the last frame
     * @returns {Number} The sequence number assigned to this input
     */
    processInput(input, deltaTime) {
        if (!this.game.player || !this.predictionEnabled) return -1;

        // Increment sequence number
        this.inputSequence++;

        // Check if this is a movement input
        const isMovementInput = input.movement &&
            (input.movement.forward ||
                input.movement.backward ||
                input.movement.left ||
                input.movement.right);

        // Record input timing for detecting when input stops
        if (isMovementInput) {
            this.lastInputAppliedTime = Date.now();
            this.noInputDuration = 0;
            this.velocityDampingActive = false;
        }

        // Apply input immediately on client for instant feedback
        this.applyInput(input, deltaTime);

        // Store input for reconciliation with server timestamp
        const playerPosition = this.game.player.getPosition();
        this.pendingInputs.push({
            sequence: this.inputSequence,
            input,
            position: { ...playerPosition },
            timestamp: Date.now()
        });

        // Keep pending inputs buffer from growing too large
        // Only keep the last 1 second worth of inputs (reduced from 2 seconds for better performance)
        const currentTime = Date.now();
        this.pendingInputs = this.pendingInputs.filter(
            input => currentTime - input.timestamp < 1000
        );

        // Return sequence number for reference
        return this.inputSequence;
    }

    /**
     * Apply an input to the local player - handles actual movement
     * @param {Object} input - The input to apply
     * @param {Number} deltaTime - The time elapsed since the last frame
     */
    applyInput(input, deltaTime) {
        if (!this.game.player) return;

        // Apply movement based on input
        if (input.movement) {
            const direction = { x: 0, z: 0 };

            if (input.movement.forward) direction.z -= 1;
            if (input.movement.backward) direction.z += 1;
            if (input.movement.left) direction.x -= 1;
            if (input.movement.right) direction.x += 1;

            // Only apply if there's actual movement input
            if (direction.x !== 0 || direction.z !== 0) {
                this.game.player.applyMovementForce(
                    direction,
                    this.game.moveForce,
                    this.game.maxVelocity
                );
            } else {
                // Stop player by setting velocity to zero
                const velocity = this.game.player.body.getLinearVelocity();
                const currentVelY = velocity.y();
                const zeroVelocity = new Ammo.btVector3(0, currentVelY, 0);
                this.game.player.body.setLinearVelocity(zeroVelocity);
                Ammo.destroy(zeroVelocity);
            }
        }

        // Apply jump with input validation
        if (input.jump && !this.isJumping && !this.jumpCooldown && this.game.isPlayerOnGround()) {
            this.isJumping = true;
            this.jumpStartTime = Date.now();
            this.game.player.jump();

            // Send explicit jump event to the server
            if (this.game.networkManager && this.game.networkManager.connected) {
                this.game.networkManager.sendJump();
            }

            // Set a cooldown to prevent jump spam
            this.jumpCooldown = true;
            setTimeout(() => {
                this.jumpCooldown = false;
            }, 500);

            // Reset jump state after animation duration
            const jumpResetTime = 1000; // 1 second
            setTimeout(() => {
                this.isJumping = false;
                // Force a ground check
                this.game.player.checkGroundContact();
            }, jumpResetTime);

            // Safety reset - force jump state to false after max time
            setTimeout(() => {
                if (this.isJumping) {
                    this.isJumping = false;
                }
            }, 2000);
        }
    }

    /**
     * Handle velocity damping when no input is detected
     * This prevents the "sliding" effect after releasing movement keys
     */
    updateInputDamping() {
        if (!this.game.player || !this.game.player.body) return;

        const now = Date.now();
        this.noInputDuration = now - this.lastInputAppliedTime;

        // If no input for more than 20ms (reduced from 50ms), immediately stop player
        // This creates an immediate response when keys are released
        if (this.noInputDuration > 20 && this.game.isPlayerOnGround()) {
            // Get current velocity
            const velocity = this.game.player.body.getLinearVelocity();
            const vx = velocity.x();
            const vz = velocity.z();

            // Calculate velocity magnitude (horizontal only)
            const velocityMagnitude = Math.sqrt(vx * vx + vz * vz);

            // Apply more aggressive immediate stopping to ensure player stops instantly
            if (velocityMagnitude > 0.0001) {
                // Apply a hard stop by directly zeroing the horizontal velocity
                const zeroVelocity = new Ammo.btVector3(
                    0,
                    velocity.y(), // Maintain vertical velocity
                    0
                );

                this.game.player.body.setLinearVelocity(zeroVelocity);
                this.velocityDampingActive = true;

                // Clean up Ammo object
                Ammo.destroy(zeroVelocity);

                console.log(`Player velocity zeroed immediately, magnitude was: ${velocityMagnitude.toFixed(2)}`);
            }
        } else if (this.noInputDuration <= 20) {
            // Reset damping flag when input is detected again
            this.velocityDampingActive = false;
        }
    }

    /**
     * Process a server state update and reconcile if needed
     * @param {Object} serverState - The server state to reconcile with
     */
    processServerUpdate(serverState) {
        if (!this.game.player || !this.reconciliationEnabled) return;

        // Get the player state from the server update
        const playerState = serverState.players[this.game.networkManager.playerId];
        if (!playerState) return;

        // Handle last processed input acknowledgment
        const serverSequence = playerState.lastProcessedInput;
        if (typeof serverSequence === 'number' && serverSequence > this.lastProcessedInput) {
            // Remove acknowledged inputs
            this.pendingInputs = this.pendingInputs.filter(input =>
                input.sequence > serverSequence
            );
            this.lastProcessedInput = serverSequence;
        }

        // Jump state synchronization
        if (playerState.isJumping !== undefined) {
            this.handleJumpStateSync(playerState.isJumping);
        }

        // Position reconciliation - the main fix for rubber-banding
        this.reconcilePosition(playerState);
    }

    /**
     * Handle jump state synchronization with server
     */
    handleJumpStateSync(serverJumping) {
        // Don't override active jumps too early
        const jumpElapsedTime = Date.now() - this.jumpStartTime;

        if (serverJumping && !this.isJumping) {
            // Server says jumping but client doesn't think so - accept server state
            console.log('Server says player is jumping, updating local state');
            this.isJumping = true;

            // If we're significantly out of sync, trigger a new jump
            if (!this.game.player.isJumping) {
                this.game.player.jump();
                this.jumpStartTime = Date.now();
            }
        }
        else if (!serverJumping && this.isJumping && jumpElapsedTime > 500) {
            // Server says not jumping but client is jumping - only accept if jump should be over
            console.log('Server says player is not jumping, updating local state');
            this.isJumping = false;
            this.jumpCooldown = false;
        }
    }

    /**
     * Reconcile local position with server position
     * This function has been completely redesigned to fix rubber-banding
     */
    reconcilePosition(playerState) {
        // Get positions
        const serverPosition = playerState.position;
        const clientPosition = this.game.player.getPosition();

        // Calculate position difference
        const dx = serverPosition.x - clientPosition.x;
        const dy = serverPosition.y - clientPosition.y;
        const dz = serverPosition.z - clientPosition.z;

        // Calculate squared distance to avoid square root
        const distanceSquared = dx * dx + dy * dy + dz * dz;

        // Determine player state for threshold adjustment
        const isCurrentlyJumping = this.isJumping || this.game.player.isJumping;
        const isOnGround = this.game.isPlayerOnGround();

        // Early return if difference is below threshold - prevents unnecessary corrections
        if (distanceSquared <= this.positionReconciliationThreshold * this.positionReconciliationThreshold) {
            return;
        }

        // Update statistics
        this.reconciliationCount++;
        this.lastReconciliationTime = Date.now();
        this.averageCorrection.x = 0.9 * this.averageCorrection.x + 0.1 * Math.abs(dx);
        this.averageCorrection.y = 0.9 * this.averageCorrection.y + 0.1 * Math.abs(dy);
        this.averageCorrection.z = 0.9 * this.averageCorrection.z + 0.1 * Math.abs(dz);

        // Debug logging
        if (this.debugMode) {
            log(`Reconciling position: Client (${clientPosition.x.toFixed(2)}, ${clientPosition.y.toFixed(2)}, ${clientPosition.z.toFixed(2)}) -> Server (${serverPosition.x.toFixed(2)}, ${serverPosition.y.toFixed(2)}, ${serverPosition.z.toFixed(2)})`);
            log(`Correction: (${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)})`);
        }

        // Determine if server position is on ground
        const serverOnGround = Math.abs(serverPosition.y - 0) < 0.5;

        // Choose correction factor based on state
        const correctionFactor = isOnGround ? this.correctionFactorGround : this.correctionFactorAir;

        // Calculate interpolated position
        let newPosition;

        if (serverOnGround) {
            // When on ground according to server, fully accept Y position
            newPosition = {
                x: clientPosition.x + dx * correctionFactor,
                y: serverPosition.y,
                z: clientPosition.z + dz * correctionFactor
            };

            // Reset jump state
            this.isJumping = false;
            this.jumpCooldown = false;
        }
        else if (isCurrentlyJumping) {
            // During active jumps, preserve client Y position more
            const jumpWeight = Math.min(1.0, (Date.now() - this.jumpStartTime) / 1000);

            newPosition = {
                x: clientPosition.x + dx * correctionFactor,
                y: clientPosition.y + dy * correctionFactor * jumpWeight,
                z: clientPosition.z + dz * correctionFactor
            };
        }
        else {
            // Normal case - smooth interpolation
            newPosition = {
                x: clientPosition.x + dx * correctionFactor,
                y: clientPosition.y + dy * correctionFactor,
                z: clientPosition.z + dz * correctionFactor
            };
        }

        // Apply the interpolated position
        this.game.player.setPosition(newPosition);

        // Re-apply pending inputs with fixed deltaTime
        this.reapplyPendingInputs();
    }

    /**
     * Re-apply pending inputs after position reconciliation
     */
    reapplyPendingInputs() {
        if (this.pendingInputs.length === 0) return;

        // Use a consistent time step (60 FPS = 16.67 ms)
        const fixedDeltaTime = 1 / 60;

        // Apply all pending inputs
        for (const inputData of this.pendingInputs) {
            this.applyInput(inputData.input, fixedDeltaTime);
        }

        if (this.debugMode && this.pendingInputs.length > 0) {
            log(`Re-applied ${this.pendingInputs.length} pending inputs after reconciliation`);
        }
    }

    /**
     * Update method called every frame
     * @param {Number} deltaTime - The time elapsed since the last frame
     */
    update(deltaTime) {
        // Handle stopping movement when no keys are pressed
        this.updateInputDamping();
    }

    /**
     * Get stats about the prediction system for debugging
     */
    getStats() {
        return {
            pendingInputCount: this.pendingInputs.length,
            reconciliationCount: this.reconciliationCount,
            lastReconciliationTime: this.lastReconciliationTime,
            timeSinceLastReconciliation: Date.now() - this.lastReconciliationTime,
            averageCorrection: this.averageCorrection,
            enabled: {
                prediction: this.predictionEnabled,
                reconciliation: this.reconciliationEnabled
            },
            isJumping: this.isJumping,
            noInputDuration: this.noInputDuration,
            velocityDampingActive: this.velocityDampingActive
        };
    }

    /**
     * Toggle prediction on/off
     */
    togglePrediction() {
        this.predictionEnabled = !this.predictionEnabled;
        log(`Client-side prediction: ${this.predictionEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Toggle reconciliation on/off
     */
    toggleReconciliation() {
        this.reconciliationEnabled = !this.reconciliationEnabled;
        log(`Server reconciliation: ${this.reconciliationEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Toggle debug mode on/off
     */
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        log(`Prediction debug mode: ${this.debugMode ? 'ENABLED' : 'DISABLED'}`);
    }
} 