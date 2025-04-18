import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class Player {
    /**
     * Represents the player character.
     *
     * @param {THREE.Scene} scene - The main THREE scene.
     * @param {Ammo.btDiscreteDynamicsWorld} physicsWorld - The physics world.
     * @param {object} initialPosition - Initial {x, y, z} position.
     * @param {string} playerId - The player's unique ID.
     * @param {number} playerColor - The player's color.
     * @param {THREE.Camera} camera - The game camera.
     * @param {Array} projectilesArray - Reference to the game's projectiles array.
     * @param {NetworkManager} networkManager - The network manager instance.
     * @param {UIManager} uiManager - The UI manager instance.
     */
    constructor(scene, physicsWorld, initialPosition, playerId, playerColor, camera, projectilesArray, networkManager, uiManager) {
        if (!scene || !physicsWorld || !initialPosition || !playerId || playerColor === undefined || !camera || !projectilesArray || !networkManager || !uiManager) {
            throw new Error("Player constructor missing required arguments.");
        }

        // Store dependencies
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.camera = camera;
        this.projectilesArray = projectilesArray;
        this.networkManager = networkManager;
        this.uiManager = uiManager;

        this.playerId = playerId;
        this.playerColor = playerColor;
        this.initialPosition = { ...initialPosition };
        this.position = initialPosition;
        this.mesh = null;
        this.body = null;
        this.modelLoaded = false;
        this.animations = {};
        this.animationActions = {};
        this.currentAnimation = 'idle';
        this.mixer = null;
        this.currentAction = null;
        this.health = 100;
        this.isDead = false;
        this.isAttacking = false;
        this.isJumping = false;
        this.canJump = false;
        this.mixerEventAdded = false;
        this._loggedMissingIdle = false;
        this._physicsCreated = false;
        this.respawnTimer = null;

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        console.log(`Player created with ID: ${this.playerId}, color: ${this.playerColor.toString(16)}`);

        // Create physics body
        this.createPhysics();

        // Load the model immediately
        this.loadModel();

        // Add a direct space key listener for testing
        window.addEventListener('keydown', (event) => {
            if (event.key === ' ' && !this.isJumping) {
                log('DIRECT SPACE KEY DETECTED');
                this.jump();
            }
        });

        console.log('Player created with direct space key listener');
    }

    loadModel() {
        try {
            const loader = new GLTFLoader();
            const modelPath = ASSET_PATHS.models.player;

            loader.load(
                modelPath,
                (gltf) => {
                    console.log(`Player model loaded successfully from ${modelPath}!`);

                    // Get the model
                    const model = gltf.scene;

                    // Scale the model
                    model.scale.set(0.25, 0.25, 0.25);

                    // Reset model position relative to parent
                    model.position.set(0, -1, 0); // Offset Y to match physics body

                    // Rotate to face forward
                    model.rotation.set(0, Math.PI, 0);

                    // Ensure all meshes cast shadows
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Apply player color if defined
                            if (this.playerColor && !this.isRemote) {
                                // Clone the material to avoid affecting other instances
                                if (Array.isArray(child.material)) {
                                    child.material = child.material.map(m => m.clone());
                                    child.material.forEach(m => {
                                        // Skip eyes
                                        if (!m.name || !m.name.toLowerCase().includes('eye')) {
                                            m.color.setHex(this.playerColor);
                                        }
                                    });
                                } else {
                                    child.material = child.material.clone();
                                    // Skip eyes
                                    if (!child.material.name || !child.material.name.toLowerCase().includes('eye')) {
                                        child.material.color.setHex(this.playerColor);
                                    }
                                }
                            }
                        }
                    });

                    // Set the new model as the mesh
                    this.mesh = model;

                    // Add the new model to the scene
                    this.scene.add(this.mesh);
                    this.modelLoaded = true;

                    // Set up animations
                    this.mixer = new THREE.AnimationMixer(model);

                    // Process animations
                    gltf.animations.forEach(animation => {
                        // Trim whitespace (like newlines) from the animation name
                        const originalName = animation.name;
                        const trimmedName = originalName.trim();

                        // Use the trimmed name as the key
                        this.animations[trimmedName] = animation;
                        this.animationActions[trimmedName] = this.mixer.clipAction(animation);
                    });

                    // Start idle animation
                    this.playAnimation('idle');

                    // Process any queued position updates
                    if (this.positionQueue.length > 0) {
                        console.log(`Processing ${this.positionQueue.length} queued positions`);
                        const latestPosition = this.positionQueue.pop();
                        this.setPosition(latestPosition);
                        this.positionQueue = []; // Clear the queue
                    } else {
                        // Set initial position if no queued positions
                        this.setPosition(this.position);
                    }

                    console.log('Player model loaded and initialized');
                },
                // Progress callback
                (xhr) => {
                    console.log(`Player model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
                },
                // Error callback
                (error) => {
                    console.error(`Failed to load player model: ${error.message}`);
                }
            );
        } catch (err) {
            console.error('Exception while loading player model:', err);
        }
    }

    // Separate method to set up the model once loaded
    setupModel(gltf) {
        try {
            // Set up the model
            const model = gltf.scene;

            // Set the model position 
            model.position.set(this.position.x, this.position.y, this.position.z);

            // Rotate the model 180 degrees to face forward instead of backward
            model.rotation.set(0, Math.PI, 0); // This should make it face forward

            // Make sure the model casts shadows
            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            // Scale down the model to make it smaller - standard for third-person shooter
            model.scale.set(0.3, 0.3, 0.3); // Further reduced to allow better visibility around character

            // Apply a larger offset to the left to match pre-refactor style
            // This places the character to the left side of the screen for better right-side visibility
            model.position.x -= 0.8;

            this.mesh = model;
            this.scene.add(this.mesh);
            this.modelLoaded = true;

            // Set up animations
            this.setupAnimations(gltf.animations);
        } catch (err) {
            error('Error setting up model', err);
        }
    }

    // Separate method to set up animations
    setupAnimations(animations) {
        if (!animations || animations.length === 0) {
            return;
        }

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.mesh);

        // Clear existing animations
        this.animations = {};
        this.animationActions = {};

        // Define the expected animation names
        const animationNames = [
            'strafeLeft',    // 0
            'attack',        // 1
            'idle',          // 2
            'jump',          // 3
            'strafeRight',   // 4
            'walkBackward',  // 5
            'walkForward'    // 6
        ];

        // Map animations by index (more reliable)
        for (let i = 0; i < Math.min(animations.length, animationNames.length); i++) {
            const name = animationNames[i];
            const clip = animations[i];

            if (clip) {
                this.animations[name] = clip;
                this.animationActions[name] = this.mixer.clipAction(clip);
            }
        }

        // Start with idle animation if available
        if (this.animations.idle && this.animationActions.idle) {
            this.playAnimation('idle');
        }
    }

    createPhysics() {
        try {
            console.log('Creating player physics');

            // Create physics body for player with simplified properties
            const shape = new Ammo.btCapsuleShape(0.5, 1);
            const transform = new Ammo.btTransform();
            transform.setIdentity();

            // Position the physics body slightly higher to account for model offset
            transform.setOrigin(new Ammo.btVector3(
                this.position.x, this.position.y + 1.0, this.position.z
            ));

            const mass = 1;
            const localInertia = new Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(mass, localInertia);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );

            this.body = new Ammo.btRigidBody(rbInfo);
            this.body.setFriction(0.5);
            this.body.setRestitution(0.2);

            // Prevent player from tipping over
            this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0)); // Lock all rotation

            // Set linear damping to prevent excessive sliding
            this.body.setDamping(0.1, 0.1);

            // Allow jumping by setting the correct flags
            this.body.setFlags(this.body.getFlags() | 2); // CF_CHARACTER_OBJECT flag

            // Activate the body so it's affected by physics immediately
            this.body.activate(true);

            // --- Prevent automatic sleeping --- 
            const DISABLE_DEACTIVATION = 4;
            this.body.setActivationState(DISABLE_DEACTIVATION);
            console.log('Player physics body set to never deactivate.');
            // --- End prevent sleeping ---

            this.canJump = false;
            this.physicsWorld.addRigidBody(this.body);

            console.log('Player physics created');
        } catch (err) {
            error('Error creating physics', err);
        }
    }

    playAnimation(name) {
        if (!this.modelLoaded || !this.mixer || !this.mesh) {
            return;
        }

        let animName = name;
        let action = this.animationActions[animName];

        // Case-insensitive lookup
        if (!action) {
            const lowerName = name.toLowerCase();
            if (this.animationActions[lowerName]) {
                animName = lowerName;
                action = this.animationActions[animName];
            } else {
                console.warn(`Animation "${name}" (or variations) not found. Cannot play. Available: ${Object.keys(this.animationActions).join(', ')}`);
                if (name.toLowerCase() === 'idle' && !this._loggedMissingIdle) {
                    console.warn(`Idle animation not found. Available: ${Object.keys(this.animations).join(', ')}`);
                    this._loggedMissingIdle = true;
                }
                return;
            }
        }

        // Prevent restart ONLY if the same animation is requested AND it's currently running
        // AND it's NOT a one-shot animation ('attack' or 'jump').
        // Also specifically prevent restarting jump if it's already playing.
        if (
            this.currentAnimation === animName &&
            this.currentAction &&
            this.currentAction.isRunning() &&
            (animName !== 'attack') // Allow attack to be triggered again
            && (animName !== 'jump') // Prevent jump from restarting if already playing
        ) {
            // If jump is already playing, explicitly do nothing
            if (animName === 'jump') return;
            // Otherwise, allow other non-attack/non-jump animations to continue looping
            // return; // Keep this commented out for now to ensure transitions happen
        }

        try {
            // Fade out the previous action
            if (this.currentAction && this.currentAction !== action) {
                // Don't fade out if the new action is attack (let it interrupt)
                if (animName !== 'attack') {
                    this.currentAction.fadeOut(0.2);
                } else {
                    this.currentAction.stop(); // Stop immediately for attack
                }
            }

            // --- Configure and Play New Action ---
            action.reset();

            // Set loop mode for one-shot animations
            if (animName === 'attack' || animName === 'jump') {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true; // Hold the last frame
                console.log(`[playAnimation] Set ${animName} to LoopOnce.`);
            } else {
                // Ensure looping animations loop correctly
                action.setLoop(THREE.LoopRepeat, Infinity);
            }

            // Fade in and play
            action.fadeIn(animName === 'attack' ? 0.05 : 0.2); // Faster fade for attack
            action.play();

            // --- Handle Attack Animation Finish ---
            if (animName === 'attack') {
                // Remove previous listener if any exists for this specific action
                this.mixer.removeEventListener('finished', this._onAttackAnimationFinished);
                // Add listener for THIS action instance
                this._attackActionListener = (e) => this._onAttackAnimationFinished(e, action); // Pass the specific action
                this.mixer.addEventListener('finished', this._attackActionListener);
                console.log(`[playAnimation] Added 'finished' listener for this attack action.`);
            }

            // Update current animation and action
            this.currentAnimation = animName;
            this.currentAction = action;
        } catch (err) {
            console.error(`Error playing animation '${animName}':`, err);
        }
    }

    // --- Listener function specifically for attack animation finish ---
    _onAttackAnimationFinished(event, finishedAction) {
        // Check if the finished action is the one we were listening for
        if (event.action === finishedAction) {
            const initialAttackingState = this.isAttacking; // Store if we *were* attacking

            // Always remove the listener for *this* finished action
            if (this.mixer && this._attackActionListener) {
                this.mixer.removeEventListener('finished', this._attackActionListener);
                console.log(`[Player ${this.playerId}] Removed \'finished\' listener for attack action: ${finishedAction.getClip().name}.`);
                this._attackActionListener = null; // Clear the stored listener
            }

            // Only proceed if this listener call corresponds to the end of an attack state
            if (initialAttackingState) {
                console.log(`[Player ${this.playerId}] Attack animation finished (${event.action.getClip().name}). Resetting isAttacking.`);
                this.isAttacking = false; // Tentatively reset the flag

                // NOW, check if another attack was initiated *during* this one
                // If isAttacking is *still* false (meaning attack() wasn\'t called again),
                // then we transition back to idle/movement.
                if (!this.isAttacking) {
                    const nextAnimation = this.intendedAnimation && this.intendedAnimation !== 'idle'
                        ? this.intendedAnimation
                        : 'idle';
                    console.log(`[Player ${this.playerId}] Attack truly finished. Transitioning to: ${nextAnimation}`);
                    this.playAnimation(nextAnimation);
                } else {
                    // isAttacking must be true again, meaning attack() was called during this animation.
                    // Do *not* transition here, let the new attack animation play out.
                    console.log(`[Player ${this.playerId}] Attack finished, but another attack was queued (isAttacking=true). Allowing next attack to continue.`);
                }
            }
        }
    }

    update(deltaTime) {
        try {
            if (!this.body || !this.mesh) {
                return;
            }
            if (typeof Ammo === 'undefined') {
                error('Ammo is not defined in Player update');
                return;
            }

            const MODEL_Y_OFFSET = -1.0;

            // Update mesh position based on physics
            try {
                const ms = this.body.getMotionState();
                if (ms) {
                    const transform = new Ammo.btTransform();
                    ms.getWorldTransform(transform);
                    if (transform) {
                        const p = transform.getOrigin();
                        if (p && typeof p.x === 'function') {
                            this.mesh.position.set(p.x(), p.y() + MODEL_Y_OFFSET, p.z());
                        }
                    }
                    // Clean up transform
                    Ammo.destroy(transform);
                }
            } catch (physicsError) {
                throw new Error(`Physics transform error: ${physicsError.message || 'Unknown physics error'}`);
            }

            // Update animation mixer
            try {
                if (this.mixer && deltaTime) {
                    this.mixer.update(deltaTime);
                }
            } catch (animationError) {
                throw new Error(`Animation error: ${animationError.message || 'Unknown animation error'}`);
            }

            // Make the player face the direction the camera is looking
            try {
                if (!this.modelLoaded || !this.camera) return;
                const cameraDirection = new THREE.Vector3();
                this.camera.getWorldDirection(cameraDirection);
                if (isNaN(cameraDirection.x)) {
                    error('Invalid camera direction:', cameraDirection);
                    return;
                }
                cameraDirection.y = 0;
                if (cameraDirection.length() > 0) {
                    cameraDirection.normalize();
                    const angle = Math.atan2(cameraDirection.x, cameraDirection.z);
                    if (!isNaN(angle)) {
                        this.mesh.rotation.set(0, angle, 0);
                    }
                }
            } catch (rotationError) {
                throw new Error(`Rotation error: ${rotationError.message || 'Unknown rotation error'}`);
            }

            this.checkGroundContact();

            // --- NEW: Debounced Animation Logic ---
            try {
                if (this.modelLoaded && this.mixer) {
                    let targetAnimation = 'idle';
                    const isMoving = this.intendedAnimation !== 'idle';

                    // Check special states first
                    if (this.isDead) {
                        targetAnimation = this.currentAnimation; // Keep current if dead
                    } else if (this.isAttacking) {
                        // If attacking, the 'attack' animation is playing (LoopOnce).
                        // Let it finish. The 'finished' listener will handle the transition.
                        targetAnimation = 'attack'; // Keep visually prioritizing attack while flag is true
                    } else if (isMoving) {
                        // If not attacking/dead, and movement is intended, use that animation
                        targetAnimation = this.intendedAnimation;
                    } else {
                        // Not attacking/dead, no movement intent => force idle
                        targetAnimation = 'idle';
                    }

                    // Play the determined animation only if it's different from the current one
                    // OR if the target is 'attack' (allowing attack to interrupt/start).
                    // This prevents constantly restarting idle/movement animations.
                    if (this.currentAnimation !== targetAnimation || targetAnimation === 'attack') {
                        // Prevent interrupting jump animation mid-air
                        if (!(targetAnimation !== 'jump' && this.currentAnimation === 'jump' && this.currentAction?.isRunning())) {
                            // Don't restart attack if it's already the current animation (it will handle finishing itself)
                            if (targetAnimation !== 'attack' || this.currentAnimation !== 'attack') {
                                this.playAnimation(targetAnimation);
                            }
                        }
                    }
                }
            } catch (animationUpdateError) {
                error(`Error updating animation based on intent: ${animationUpdateError.message || animationUpdateError}`);
            }
            // --- END NEW Animation Logic ---

        } catch (err) {
            error('Error updating player:', err.message || err);
            console.error('Player update stack trace:', err.stack || 'No stack trace available');
        }
    }

    applyForce(force) {
        try {
            if (!this.body) return;

            // Make sure the body is active
            this.body.activate(true);

            // Only log forces during development/debugging
            // log(`Applying force: ${force.x()}, ${force.y()}, ${force.z()}`);

            // Apply the force as an impulse for immediate effect
            this.body.applyCentralImpulse(force);
        } catch (err) {
            error('Error applying force', err);
        }
    }

    /**
     * Apply movement using constant velocity in a specific direction, with respect to camera
     * @param {Object} direction - Direction vector { x, z }
     * @param {Number} moveForce - This is now used as the base speed
     * @param {Number} maxVelocity - Maximum velocity to set
     */
    applyMovementForce(direction, moveForce, maxVelocity) {
        try {
            if (!this.body || !this.mesh) return;

            // Make sure the body is active
            this.body.activate(true);

            // Get camera's forward and right vectors to move relative to camera orientation
            // const camera = window.game.scene.camera; // Use stored camera
            // if (!camera) return;
            if (!this.camera) return;

            // Get forward and right vectors from camera (but ignore y-component for horizontal movement)
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); // Use this.camera
            forward.y = 0;
            forward.normalize();

            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion); // Use this.camera
            right.y = 0;
            right.normalize();

            // Calculate movement direction in camera space
            const moveX = direction.x;
            const moveZ = direction.z;

            // Calculate final direction by combining forward/back and left/right components
            const finalDirection = new THREE.Vector3();
            finalDirection.addScaledVector(forward, -moveZ); // Forward is -Z
            finalDirection.addScaledVector(right, moveX);
            finalDirection.normalize();

            // Get current velocity to preserve Y component
            const velocity = this.body.getLinearVelocity();
            const currentVelY = velocity.y();

            // Use a fixed speed for consistent movement
            const MOVE_SPEED = 15;

            // Set velocity directly
            const newVelocity = new Ammo.btVector3(
                finalDirection.x * MOVE_SPEED,
                currentVelY,
                finalDirection.z * MOVE_SPEED
            );

            this.body.setLinearVelocity(newVelocity);
            Ammo.destroy(newVelocity);

            // Debug info occasionally
            if (Math.random() < 0.005) {
                const vel = this.body.getLinearVelocity();
                if (vel) {
                    console.log(`Player velocity: (${vel.x().toFixed(2)}, ${vel.y().toFixed(2)}, ${vel.z().toFixed(2)})`);
                }
            }
        } catch (err) {
            error('Error applying movement velocity', err);
        }
    }

    getPosition() {
        const position = new THREE.Vector3();
        if (this.mesh) {
            this.mesh.getWorldPosition(position);
        }
        return { x: position.x, y: position.y, z: position.z };
    }

    /**
     * Set the player's position directly (used for remote players)
     * @param {Object} position - Position object with x, y, z coordinates
     */
    setPosition(position) {
        if (!position) {
            console.error('setPosition called with invalid position:', position);
            return;
        }

        // Store position update if model isn't loaded yet
        if (!this.modelLoaded || !this.mesh) {
            this.positionQueue.push({
                x: position.x,
                y: position.y,
                z: position.z
            });
            console.log(`Model not loaded yet, queued position update. Queue size: ${this.positionQueue.length}`);
            return;
        }

        // Update the mesh position
        this.mesh.position.set(position.x, position.y, position.z);

        // Update the physics body position if it exists and this is not a remote player
        if (this.body && !this.isRemote) {
            try {
                const transform = new Ammo.btTransform();
                const ms = this.body.getMotionState();
                ms.getWorldTransform(transform);

                transform.setOrigin(new Ammo.btVector3(position.x, position.y + 1.0, position.z));
                this.body.setWorldTransform(transform);
                ms.setWorldTransform(transform);

                // Activate the body
                this.body.activate(true);
            } catch (err) {
                console.error('Error updating physics body position:', err);
            }
        }

        // Store the position for future reference
        this.position = { ...position };
    }

    /**
     * Get the player's rotation
     * @returns {Object} Rotation as an object with x, y, z (in radians)
     */
    getRotation() {
        if (!this.mesh) return { x: 0, y: 0, z: 0 };

        return {
            x: this.mesh.rotation.x,
            y: this.mesh.rotation.y,
            z: this.mesh.rotation.z
        };
    }

    /**
     * Set the player's rotation (used for remote players)
     * @param {Object} rotation - Rotation object with x, y, z in radians
     */
    setRotation(rotation) {
        if (!rotation) return;

        if (typeof rotation === 'number') {
            // Handle the case where we just get a y rotation value
            if (this.mesh) {
                this.mesh.rotation.y = rotation;
            }
            return;
        }

        // Handle the case where we get a full rotation object
        if (this.mesh) {
            this.mesh.rotation.set(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
        }
    }

    takeDamage(amount, attackerId) {
        if (this.isDead) return;
        this.health -= amount;
        this.health = Math.max(0, this.health);

        // Send damage confirmation to server if local player
        if (this.playerId === 'local' && this.networkManager?.connected) {
            // This logic seems incorrect for client-side, server should handle hit confirmation
        }

        // Show damage indicator for local player
        if (this.uiManager) {
            const currentPos = this.getPosition();
            this.uiManager.showDamageIndicator(new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z), amount);
        }

        if (this.health <= 0) {
            this.die(attackerId);
        }
        this.updateHealthBar();
    }

    die(killerId = null) {
        if (this.isDead || this.respawnTimer) return; // Prevent multiple deaths/respawns
        this.isDead = true;
        this.health = 0;
        console.log(`Player ${this.playerId} died. Killed by: ${killerId || 'Unknown'}`);

        // Clear any existing respawn timer just in case
        if (this.respawnTimer) {
            clearTimeout(this.respawnTimer);
            this.respawnTimer = null;
        }

        // Play death animation (if available)
        this.playAnimation('death'); // Assuming a 'death' animation exists

        // Send death event to server if local player (if multiplayer logic exists)
        // if (!this.isRemote && this.networkManager?.connected) {
        //     this.networkManager.sendDeath();
        // }

        // Show death message via UIManager (if local player)
        if (this.uiManager && this.playerId.startsWith('local')) { // Check if local
            this.uiManager.showDeathMessage();
        }

        // Disable physics interactions slightly differently - make body static temporarily?
        if (this.body) {
            // Optional: Make body kinematic or static to prevent movement while dead
            // this.body.setCollisionFlags(this.body.getCollisionFlags() | 2); // CF_KINEMATIC_OBJECT
            // Or maybe remove it temporarily? Decide based on desired effect.
            // For simplicity, let's just rely on movement checks ignoring isDead.
        }

        // Update local HUD
        this.updateHealthBar();

        // --- Start Respawn Timer ---
        const respawnDelay = 3000; // 3 seconds
        console.log(`Player ${this.playerId} scheduling respawn in ${respawnDelay}ms`);
        this.respawnTimer = setTimeout(() => {
            console.log(`Player ${this.playerId} timer finished, attempting respawn...`);
            this.respawn();
            this.respawnTimer = null; // Clear the timer reference
        }, respawnDelay);
        // --- End Respawn Timer ---
    }

    /**
     * Respawn the player
     */
    respawn() {
        console.log(`Player respawning`);

        // Reset health
        this.health = 100;
        this.isDead = false;
        this.isJumping = false;

        // Update health UI via UIManager (will happen in Game update loop)
        // if (window.game && window.game.uiManager) {
        //     window.game.uiManager.updateLocalPlayerHealth(this.health);
        // }

        // Reset position to spawn position
        const spawnPosition = { ...GAME_CONFIG.playerStartPosition };

        // Add slight randomization to prevent spawning in the same spot
        spawnPosition.x += (Math.random() - 0.5) * 2;
        spawnPosition.z += (Math.random() - 0.5) * 2;

        // Ensure we're above ground
        spawnPosition.y = Math.max(5, spawnPosition.y);

        // If we have a physics body, reset its state
        if (this.body && this.physicsWorld) {
            // Remove old physics body
            this.physicsWorld.removeRigidBody(this.body);

            // Create a fresh physics body at the spawn position
            try {
                // Clean up old Ammo objects
                if (this.body) {
                    Ammo.destroy(this.body);
                    this.body = null;
                }

                // Create a new physics body
                this.position = { ...spawnPosition }; // Update internal position tracking
                this.createPhysics(); // Recreates the body at this.position

                // *** Explicitly reset velocity after recreating the body ***
                if (this.body) {
                    const zeroVelocity = new Ammo.btVector3(0, 0, 0);
                    this.body.setLinearVelocity(zeroVelocity);
                    this.body.setAngularVelocity(zeroVelocity); // Also reset angular velocity
                    Ammo.destroy(zeroVelocity);
                    this.body.activate(true); // Ensure it's active
                }
                // *** End velocity reset ***

                // Update mesh position (should align with physics body)
                if (this.mesh) {
                    this.mesh.position.set(spawnPosition.x, spawnPosition.y - 1.0, spawnPosition.z); // Apply model offset
                }

                console.log(`Player physics reset at position: x=${spawnPosition.x.toFixed(2)}, y=${spawnPosition.y.toFixed(2)}, z=${spawnPosition.z.toFixed(2)}`);
            } catch (err) {
                error('Error recreating physics on respawn:', err);
            }
        } else {
            // Just update position if no physics body (less likely now)
            this.setPosition(spawnPosition);
        }

        // Play idle animation
        this.playAnimation('idle');

        // Hide death message if local player
        if (this.uiManager && this.playerId.startsWith('local')) {
            this.uiManager.hideDeathMessage();
        }

        console.log('Player respawn complete');
    }

    setAnimation(name) {
        this.playAnimation(name);
    }

    checkGroundContact() {
        if (!this.body || !this.physicsWorld) return;

        // --- Ground Check Logging --- 
        const transform = this.body.getWorldTransform();
        const origin = transform.getOrigin();
        const currentY = origin.y();
        const currentVelY = this.body.getLinearVelocity().y();
        let logMsg = `[GroundCheck] Pre-Check | y: ${currentY.toFixed(3)}, velY: ${currentVelY.toFixed(3)}, canJump: ${this.canJump}, isJumping: ${this.isJumping}`;
        // --- End Ground Check --- 

        try {
            // Check if Ammo is defined
            if (typeof Ammo === 'undefined') {
                error('Ammo is not defined in checkGroundContact');
                return;
            }

            // Make sure the body has getWorldTransform
            if (typeof this.body.getWorldTransform !== 'function') {
                error('Player body missing getWorldTransform method');
                return;
            }

            // Cast a ray downward from the player's position to check for ground
            const rayStart = new Ammo.btVector3(origin.x(), origin.y() - 0.9, origin.z());
            // Cast ray further down to ensure we detect ground
            const rayEnd = new Ammo.btVector3(origin.x(), origin.y() - 3.0, origin.z());

            const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);

            if (!this.physicsWorld || typeof this.physicsWorld.rayTest !== 'function') {
                error('Invalid physicsWorld or missing rayTest method');
                Ammo.destroy(rayStart);
                Ammo.destroy(rayEnd);
                Ammo.destroy(rayCallback);
                return;
            }

            this.physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

            // If the ray hit something, the player is on the ground
            const wasOnGround = this.canJump;
            this.canJump = rayCallback.hasHit();

            // --- Ground Check Logging ---
            const hitResult = rayCallback.hasHit();
            logMsg += ` | RayHit: ${hitResult}`;
            // --- End Ground Check --- 

            // Additional check: if very close to y=0 (ground level), force canJump to true
            // This helps in case the ray test somehow misses
            if (!this.canJump && origin.y() < 1.5) {
                this.canJump = true;
                // --- Ground Check Logging ---
                logMsg += ` | ForceGround: true (y=${origin.y().toFixed(3)})`;
                // --- End Ground Check --- 
                console.log('Force setting canJump=true because player is close to ground');
            }

            // Log when ground state changes
            if (wasOnGround !== this.canJump) {
                logMsg += ` | StateChange: ${wasOnGround} -> ${this.canJump}`;
                if (this.canJump) {
                    log('Player touched ground');

                    // If we were falling, play land animation
                    const velocity = this.body.getLinearVelocity();
                    if (velocity.y() < -5) {
                        // Play land animation if we were falling fast
                        this.playAnimation('idle');
                    }
                } else {
                    log('Player left ground');
                }
            }

            // --- More Robust isJumping Reset ---
            // If we are on the ground now, ensure isJumping is false.
            if (this.canJump && this.isJumping) {
                log('[GroundCheck] Confirmed on ground, ensuring isJumping is false.');
                this.isJumping = false;
                logMsg += ` | Reset isJumping`;
            }
            // --- End Robust Reset ---

            // Clean up Ammo.js objects to prevent memory leaks
            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);
        } catch (err) {
            logMsg += ` | ERROR: ${err.message}`;
            error('Error in checkGroundContact:', err);
        } finally {
            // Log the final message regardless of errors
            if (Math.random() < 0.1) { // Log only 10% of the time to reduce spam
                log(logMsg);
            }
        }
    }

    // NEW Method to set animation intent based on input state
    setMovementIntent(movementState) {
        let intent = 'idle';

        if (movementState.isMoving) {
            // Determine intended animation based on specific keys pressed
            if (movementState.left && !movementState.right && !movementState.forward && !movementState.backward) {
                intent = 'strafeLeft';
            } else if (movementState.right && !movementState.left && !movementState.forward && !movementState.backward) {
                intent = 'strafeRight';
            } else if (movementState.forward && !movementState.backward) {
                intent = 'walkForward';
            } else if (movementState.backward && !movementState.forward) {
                intent = 'walkBackward';
            } else if (movementState.forward) {
                intent = 'walkForward'; // Default to forward/backward for combinations
            } else if (movementState.backward) {
                intent = 'walkBackward';
            }
            this.lastMovementInputTime = Date.now(); // Update timestamp when moving
        }

        this.intendedAnimation = intent;
    }

    // Added attack method for local player
    attack() {
        console.log(`[Player attack] ID: ${this.playerId}. Called. Current state: isAttacking=${this.isAttacking}, isDead=${this.isDead}`);

        // Allow attacking even if the previous attack animation hasn't technically finished
        // The finished listener will handle the state eventually.
        // We only prevent attacking if dead.
        if (this.isDead) return;

        // If already attacking, let the current animation attempt to finish, but set flag again
        // This allows rapid clicks to feel responsive but relies on the finished listener
        // to eventually clear the state.
        console.log(`[Player ${this.playerId}] attack() called.`);
        this.isAttacking = true; // Set flag immediately

        // --- Play attack animation ---
        // playAnimation now handles LoopOnce and the 'finished' listener setup
        this.playAnimation('attack');

        // REMOVED setTimeout for resetting isAttacking
    }

    // *** Add the missing jump method back ***
    jump() {
        try {
            // Check if we can jump (on ground) and if the jump animation isn't already playing
            if (this.canJump && !(this.currentAnimation === 'jump' && this.currentAction?.isRunning())) {
                const impulse = new Ammo.btVector3(0, 7, 0);
                this.body.applyCentralImpulse(impulse);
                Ammo.destroy(impulse);

                this.isJumping = true; // Still needed for physics/ground check logic
                this.canJump = false;

                // Play jump animation (playAnimation handles LoopOnce)
                this.playAnimation('jump');

                console.log(`[Player ${this.playerId}] Jump initiated. isJumping: ${this.isJumping}, canJump: ${this.canJump}`);
            } else {
                // Log why jump was prevented
                let reason = "";
                if (!this.canJump) reason += "Not on ground (canJump=false). ";
                if (this.currentAnimation === 'jump' && this.currentAction?.isRunning()) reason += "Jump animation already playing.";
                console.log(`[Player ${this.playerId}] Jump prevented. ${reason}`);
            }
        } catch (err) {
            error(`Error during jump:`, err);
            this.isJumping = false; // Reset on error
        }
    }
    // *** End of added jump method ***
}
