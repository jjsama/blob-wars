/**
 * PredictionSystem.js
 * 
 * This system handles client-side prediction and server reconciliation for networked physics.
 * It maintains a buffer of player inputs and predictions, and reconciles them with server state.
 */
import * as THREE from 'three';
import { log, error } from '../debug.js';

export class PredictionSystem {
    constructor(game) {
        this.game = game;
        this.inputSequence = 0;
        this.pendingInputs = [];
        this.lastProcessedInput = -1;

        // Thresholds for position reconciliation
        this.positionReconciliationThreshold = 0.1; // Only reconcile when diff > 0.1 units
        this.velocityDampingThreshold = 0.1;

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

        // Movement constants
        this.MOVE_SPEED = 15;
        this.JUMP_FORCE = 10;

        // Last input time tracking
        this.lastInputAppliedTime = 0;
        this.noInputDuration = 0;
        this.velocityDampingActive = false;
        this.lastMovementInput = null;

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

        this.inputSequence++;

        // Track if this is a movement input
        const isMovementInput = input.movement && (
            input.movement.forward ||
            input.movement.backward ||
            input.movement.left ||
            input.movement.right
        );

        // Store last movement input state
        this.lastMovementInput = isMovementInput ? input.movement : null;

        // Apply input immediately for responsiveness
        this.applyInput(input, deltaTime);

        // Store input for reconciliation
        const playerPosition = this.game.player.getPosition();
        this.pendingInputs.push({
            sequence: this.inputSequence,
            input,
            position: { ...playerPosition },
            timestamp: Date.now()
        });

        // Keep only last 1 second of inputs
        const currentTime = Date.now();
        this.pendingInputs = this.pendingInputs.filter(
            input => currentTime - input.timestamp < 1000
        );

        return this.inputSequence;
    }

    /**
     * Apply an input to the local player - handles actual movement
     * @param {Object} input - The input to apply
     * @param {Number} deltaTime - The time elapsed since the last frame
     */
    applyInput(input, deltaTime) {
        if (!this.game.player || !this.game.player.body) return;

        try {
            // Handle movement
            if (input.movement) {
                const direction = { x: 0, z: 0 };

                if (input.movement.forward) direction.z -= 1;
                if (input.movement.backward) direction.z += 1;
                if (input.movement.left) direction.x -= 1;
                if (input.movement.right) direction.x += 1;

                // Get camera direction for movement relative to view
                const camera = this.game.scene.camera;
                if (!camera) return;

                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                forward.y = 0;
                forward.normalize();

                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                right.y = 0;
                right.normalize();

                // Calculate movement direction
                const finalDirection = new THREE.Vector3();
                if (direction.x !== 0 || direction.z !== 0) {
                    finalDirection.addScaledVector(forward, -direction.z);
                    finalDirection.addScaledVector(right, direction.x);
                    finalDirection.normalize();

                    // Get current velocity
                    const velocity = this.game.player.body.getLinearVelocity();
                    const currentVelY = velocity.y();

                    // Set new velocity
                    const newVelocity = new Ammo.btVector3(
                        finalDirection.x * this.MOVE_SPEED,
                        currentVelY,
                        finalDirection.z * this.MOVE_SPEED
                    );
                    this.game.player.body.setLinearVelocity(newVelocity);
                    Ammo.destroy(newVelocity);

                    // Update last input time
                    this.lastInputAppliedTime = Date.now();
                    this.noInputDuration = 0;
                    this.velocityDampingActive = false;
                } else {
                    // If no movement input, stop immediately
                    this.stopMovement();
                }
            } else {
                // No movement input, stop immediately
                this.stopMovement();
            }

            // Handle jumping
            if (input.jump && !this.isJumping && !this.jumpCooldown && this.game.isPlayerOnGround()) {
                this.isJumping = true;
                this.jumpStartTime = Date.now();
                this.game.player.jump();

                // Send jump event to server
                if (this.game.networkManager?.connected) {
                    this.game.networkManager.sendJump();
                }

                // Set jump cooldown
                this.jumpCooldown = true;
                setTimeout(() => {
                    this.jumpCooldown = false;
                }, 500);

                // Reset jump state after animation
                setTimeout(() => {
                    this.isJumping = false;
                    this.game.player.checkGroundContact();
                }, 1000);
            }
        } catch (err) {
            error('Error in applyInput:', err);
        }
    }

    /**
     * Immediately stop player movement
     */
    stopMovement() {
        if (!this.game.player || !this.game.player.body) return;

        const velocity = this.game.player.body.getLinearVelocity();
        const newVelocity = new Ammo.btVector3(
            0,
            velocity.y(), // Preserve vertical velocity
            0
        );
        this.game.player.body.setLinearVelocity(newVelocity);
        Ammo.destroy(newVelocity);
        this.velocityDampingActive = true;
    }

    /**
     * Handle velocity damping when no input is detected
     * This prevents the "sliding" effect after releasing movement keys
     */
    updateInputDamping() {
        if (!this.game.player || !this.game.player.body) return;

        const now = Date.now();
        this.noInputDuration = now - this.lastInputAppliedTime;

        // If no movement input is active, ensure player is stopped
        if (!this.lastMovementInput && this.game.isPlayerOnGround() && !this.velocityDampingActive) {
            this.stopMovement();
        }
    }

    /**
     * Process a server state update and reconcile if needed
     * @param {Object} serverState - The server state to reconcile with
     */
    processServerUpdate(serverState) {
        if (!this.game.player || !this.reconciliationEnabled) return;

        const playerState = serverState.players[this.game.networkManager.playerId];
        if (!playerState) return;

        // Handle server acknowledgment
        if (typeof playerState.lastProcessedInput === 'number' &&
            playerState.lastProcessedInput > this.lastProcessedInput) {
            this.pendingInputs = this.pendingInputs.filter(
                input => input.sequence > playerState.lastProcessedInput
            );
            this.lastProcessedInput = playerState.lastProcessedInput;
        }

        // Position reconciliation
        const serverPos = playerState.position;
        const clientPos = this.game.player.getPosition();

        const dx = serverPos.x - clientPos.x;
        const dy = serverPos.y - clientPos.y;
        const dz = serverPos.z - clientPos.z;

        const distanceSquared = dx * dx + dy * dy + dz * dz;

        // Only reconcile if difference is significant
        if (distanceSquared > this.positionReconciliationThreshold * this.positionReconciliationThreshold) {
            // Smoothly interpolate to server position
            const newPosition = {
                x: clientPos.x + dx * 0.3,
                y: serverPos.y, // Direct Y position update
                z: clientPos.z + dz * 0.3
            };

            this.game.player.setPosition(newPosition);

            // Reapply pending inputs
            for (const inputData of this.pendingInputs) {
                this.applyInput(inputData.input, 1 / 60);
            }
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