import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class Player {
    constructor(scene, physicsWorld, position = GAME_CONFIG.playerStartPosition, playerId = null, playerColor = null) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
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
        this.playerId = playerId || 'local';

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // Use the provided color or fallback to teal
        this.playerColor = playerColor || 0x00d2d3; // Bright teal as default

        log(`Player created with ID: ${this.playerId}, color: ${this.playerColor.toString(16)}`);

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

        log('Player created with direct space key listener');
    }

    loadModel() {
        try {
            // Create a GLTFLoader
            const loader = new GLTFLoader();

            // Use path from constants file that works in both dev and prod
            const modelPath = ASSET_PATHS.models.player;
            console.log(`Loading player model from path: ${modelPath}`);

            loader.load(
                modelPath,
                (gltf) => {
                    console.log(`Player model loaded successfully from ${modelPath}!`);
                    // Get the model from the loaded GLTF
                    const model = gltf.scene;

                    // Scale the model appropriately
                    model.scale.set(0.35, 0.35, 0.35);

                    // Set the model's position
                    model.position.copy(this.position);

                    // Rotate the model to face forward
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
                                            m.emissive = new THREE.Color(this.playerColor);
                                            m.emissiveIntensity = 0.2; // Add glow
                                        }
                                    });
                                } else {
                                    child.material = child.material.clone();
                                    // Skip eyes
                                    if (!child.material.name || !child.material.name.toLowerCase().includes('eye')) {
                                        child.material.color.setHex(this.playerColor);
                                        child.material.emissive = new THREE.Color(this.playerColor);
                                        child.material.emissiveIntensity = 0.2; // Add glow
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

                    // Call the onModelLoaded callback if defined (for remote players)
                    if (typeof this.onModelLoaded === 'function') {
                        this.onModelLoaded(model);
                    }

                    // Process any queued position updates for remote players
                    if (this.isRemote && this.positionQueue.length > 0) {
                        console.log(`Processing ${this.positionQueue.length} queued positions for remote player`);
                        // Use the most recent position
                        const latestPosition = this.positionQueue.pop();
                        this.mesh.position.set(latestPosition.x, latestPosition.y, latestPosition.z);
                        console.log(`Applied queued position: x=${latestPosition.x.toFixed(2)}, y=${latestPosition.y.toFixed(2)}, z=${latestPosition.z.toFixed(2)}`);
                        // Clear the queue
                        this.positionQueue = [];
                    }

                    // Set up animations
                    this.mixer = new THREE.AnimationMixer(model);

                    // Process animations with proper name normalization
                    if (gltf.animations && gltf.animations.length > 0) {
                        console.log(`Player model has ${gltf.animations.length} animations:`);
                        gltf.animations.forEach((anim, index) => {
                            console.log(`Animation ${index}: "${anim.name}"`);
                        });

                        // Create a normalized mapping of animations
                        this.animations = {};
                        this.animationActions = {};

                        gltf.animations.forEach(anim => {
                            // Store with original name
                            this.animations[anim.name] = anim;
                            this.animationActions[anim.name] = this.mixer.clipAction(anim);

                            // Also store with lowercase name for case-insensitive lookup
                            const lowerName = anim.name.toLowerCase();
                            if (lowerName !== anim.name) {
                                this.animations[lowerName] = anim;
                                this.animationActions[lowerName] = this.mixer.clipAction(anim);
                            }
                        });
                    } else {
                        console.warn('No animations found in the player model');
                    }

                    // Set the initial animation to idle (try multiple variants of the name)
                    const idleAnimationNames = ['idle', 'Idle', 'IDLE'];
                    for (const name of idleAnimationNames) {
                        if (this.animations[name]) {
                            this.playAnimation(name);
                            console.log(`Started player animation: ${name}`);
                            break;
                        }
                    }

                    // Create physics only after model is loaded
                    if (!this._physicsCreated) {
                        this.createPhysics();
                        this._physicsCreated = true;
                    }

                    // Apply queued position updates
                    if (this.positionQueue.length > 0) {
                        const queuedPosition = this.positionQueue.pop();
                        this.setPosition(queuedPosition);
                    }
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

            // Scale down the model to make it smaller
            model.scale.set(0.35, 0.35, 0.35); // Reduced from 0.5 to 0.35 (70% of previous size)

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
            log('No animations found in player model');
            return;
        }

        log(`Setting up ${animations.length} animations for player`);

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
                log(`Mapping player animation ${i}: ${clip.name} -> ${name}`);
                this.animations[name] = clip;
                this.animationActions[name] = this.mixer.clipAction(clip);
            }
        }

        // Start with idle animation if available
        if (this.animations.idle && this.animationActions.idle) {
            log('Starting with idle animation');
            this.playAnimation('idle');
        } else {
            log('No idle animation found, cannot start animations');
        }
    }

    createPhysics() {
        try {
            log('Creating player physics');

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

            this.canJump = false;
            this.physicsWorld.addRigidBody(this.body);

            log('Player physics created');
        } catch (err) {
            error('Error creating physics', err);
        }
    }

    playAnimation(name) {
        // Don't attempt to play animations until mesh and mixer are available
        if (!this.modelLoaded || !this.mixer || !this.mesh) {
            // Instead of logging an error, silently return until model is ready
            return;
        }

        // Try to find the animation with case-insensitive lookup
        let animName = name;
        if (!this.animations[name] || !this.animationActions[name]) {
            // Try lowercase version
            const lowerName = name.toLowerCase();
            if (this.animations[lowerName] && this.animationActions[lowerName]) {
                animName = lowerName;
            } else {
                // Only log once for better performance
                if (name.toLowerCase() === 'idle' && !this._loggedMissingIdle) {
                    console.warn(`Idle animation not found, animations may not be properly loaded. Available animations: ${Object.keys(this.animations).join(', ')}`);
                    this._loggedMissingIdle = true;
                }
                return;
            }
        }

        // Don't restart the same animation unless it's a jump or attack
        if (this.currentAnimation === animName && animName !== 'jump' && animName !== 'attack') return;

        try {
            // For attack and jump animations, we want to make sure they complete
            const isOneShot = (animName === 'attack' || animName === 'jump');

            // If we have a current action, fade it out
            if (this.currentAction) {
                this.currentAction.fadeOut(0.2);
            }

            // Get the new action
            const action = this.animationActions[animName];

            // Reset and play the new action
            action.reset();
            action.fadeIn(0.2);
            action.play();

            // Update current animation and action
            this.currentAnimation = animName;
            this.currentAction = action;
        } catch (err) {
            console.error(`Error playing animation '${animName}':`, err);
        }
    }

    updateMovementAnimation(movementState) {
        try {
            // Don't attempt to play animations until mesh and mixer are available
            if (!this.modelLoaded || !this.mixer || !this.mesh) {
                return;
            }

            // If player is jumping, play jump animation regardless of other movements
            if (movementState.isJumping) {
                this.playAnimation('jump');
                return;
            }

            // If player is attacking, don't override the animation
            if (this.isAttacking) {
                return;
            }

            // Determine which animation to play based on the specific keys pressed
            if (movementState.isMoving) {
                // Priority for animations:
                // 1. Strafe left/right takes precedence if only those keys are pressed
                // 2. Forward/backward if only those keys are pressed
                // 3. Otherwise combination movements use forward/backward

                // Check for pure strafing (left or right without forward/backward)
                if (movementState.left && !movementState.right && !movementState.forward && !movementState.backward) {
                    this.playAnimation('strafeLeft');
                    return;
                }

                if (movementState.right && !movementState.left && !movementState.forward && !movementState.backward) {
                    this.playAnimation('strafeRight');
                    return;
                }

                // Forward/backward movement
                if (movementState.forward && !movementState.backward) {
                    this.playAnimation('walkForward');
                    return;
                }

                if (movementState.backward && !movementState.forward) {
                    this.playAnimation('walkBackward');
                    return;
                }

                // Combination - default to forward/backward depending on which is active
                if (movementState.forward) {
                    this.playAnimation('walkForward');
                } else if (movementState.backward) {
                    this.playAnimation('walkBackward');
                } else {
                    // This case shouldn't really happen given the isMoving check
                    this.playAnimation('idle');
                }
            } else {
                // No movement, play idle
                this.playAnimation('idle');
            }
        } catch (err) {
            console.error('Error updating movement animation:', err);
        }
    }

    attack() {
        if (this.isAttacking) return;

        this.isAttacking = true;
        this.playAnimation('attack');

        // Send attack event to server if this is the local player in multiplayer mode
        if (this.playerId === 'local' && window.game && window.game.isMultiplayer && window.game.networkManager) {
            window.game.networkManager.sendAttack();
        }

        // Reset attack state after a fixed time
        setTimeout(() => {
            this.isAttacking = false;

            // If we're still in attack animation, switch back to idle
            if (this.currentAnimation === 'attack') {
                this.playAnimation('idle');
            }
        }, 800); // Fixed time for attack animation
    }

    jump() {
        if (this.isJumping) {
            log('Jump requested but already jumping');
            return;
        }

        log('JUMP INITIATED - Playing jump animation');
        this.isJumping = true;

        // Play the jump animation first
        this.playAnimation('jump');

        // Apply physics for the jump with a slight delay to match animation
        setTimeout(() => {
            if (this.body) {
                this.body.activate(true);

                // Get current velocity to preserve horizontal components
                const velocity = this.body.getLinearVelocity();
                const currentVelX = velocity.x();
                const currentVelZ = velocity.z();

                // Set velocity directly instead of applying force
                const jumpVelocity = new Ammo.btVector3(
                    currentVelX,
                    10.0, // Upward velocity for jump
                    currentVelZ
                );

                this.body.setLinearVelocity(jumpVelocity);
                Ammo.destroy(jumpVelocity);
                log('Jump velocity set: x=' + currentVelX + ', y=10.0, z=' + currentVelZ);
            }
        }, 50); // Small delay to sync with animation start

        // Get exact animation duration from the clip
        const jumpDuration = this.animations.jump ?
            (this.animations.jump.duration * 1000) : 833; // 0.833 seconds as fallback

        log(`Jump animation duration: ${jumpDuration}ms`);

        // Reset jump state after animation completes
        setTimeout(() => {
            this.isJumping = false;
            log('Jump state reset - player can jump again');
        }, jumpDuration);
    }

    update(deltaTime) {
        try {
            if (!this.body || !this.mesh) {
                // Silent return if basic objects aren't available yet
                return;
            }

            // Check if Ammo is defined before proceeding
            if (typeof Ammo === 'undefined') {
                error('Ammo is not defined in Player update');
                return;
            }

            // Define a consistent Y-offset for all player models
            const MODEL_Y_OFFSET = -1.0;

            // Update mesh position based on physics
            try {
                const ms = this.body.getMotionState();
                if (ms) {
                    const transform = new Ammo.btTransform();
                    ms.getWorldTransform(transform);

                    // Make sure transform is valid
                    if (transform) {
                        const p = transform.getOrigin();

                        // Make sure p is valid and has x, y, z methods
                        if (p && typeof p.x === 'function' && typeof p.y === 'function' && typeof p.z === 'function') {
                            // Update mesh position with the offset for the model
                            this.mesh.position.set(p.x(), p.y() + MODEL_Y_OFFSET, p.z());
                        }
                    }
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

            // Make the player always face the direction of the crosshair/camera
            try {
                // First verify that all required objects exist
                if (!this.modelLoaded) return;
                if (typeof window === 'undefined') return;
                if (!window.game) return;

                const game = window.game;
                if (!game.scene || !game.scene.camera) return;

                // Create a vector to store camera direction
                const cameraDirection = new THREE.Vector3();

                // Get the world direction from the camera
                game.scene.camera.getWorldDirection(cameraDirection);

                // Only proceed if we have a valid direction vector
                if (isNaN(cameraDirection.x) || isNaN(cameraDirection.y) || isNaN(cameraDirection.z)) {
                    error('Invalid camera direction:', cameraDirection);
                    return;
                }

                // Zero out the Y component to keep character upright
                cameraDirection.y = 0;

                // Only normalize if the vector has non-zero length
                if (cameraDirection.length() > 0) {
                    cameraDirection.normalize();

                    // Calculate the angle to face the camera direction
                    const angle = Math.atan2(cameraDirection.x, cameraDirection.z);

                    // Set rotation to match crosshair direction - with error checking
                    if (!isNaN(angle)) {
                        this.mesh.rotation.set(0, angle, 0);
                    }
                }
            } catch (rotationError) {
                throw new Error(`Rotation error: ${rotationError.message || 'Unknown rotation error'}`);
            }
        } catch (err) {
            // Ensure we're properly logging the error with details
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
            const camera = window.game.scene.camera;
            if (!camera) return;

            // Get forward and right vectors from camera (but ignore y-component for horizontal movement)
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();

            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0;
            right.normalize();

            // Calculate movement direction in camera space
            const moveX = direction.x;
            const moveZ = direction.z;

            // Calculate final direction by combining forward/back and left/right components
            const finalDirection = new THREE.Vector3();
            finalDirection.addScaledVector(forward, -moveZ); // Forward is -Z
            finalDirection.addScaledVector(right, moveX);

            // Ensure normalization for consistent speed regardless of diagonal movement
            // This guarantees the same speed in all directions
            finalDirection.normalize();

            // Get current velocity to preserve Y component (for jumping/falling)
            const velocity = this.body.getLinearVelocity();
            const currentVelY = velocity.y();

            // Always use the max velocity to ensure consistent movement speed
            // This creates a direct, responsive control feel
            const moveSpeed = maxVelocity;

            // Set velocity directly instead of applying force
            const newVelocity = new Ammo.btVector3(
                finalDirection.x * moveSpeed,
                currentVelY,
                finalDirection.z * moveSpeed
            );

            this.body.setLinearVelocity(newVelocity);
            Ammo.destroy(newVelocity);

            // Debug info occasionally
            if (Math.random() < 0.005) {
                console.log(`Applied movement with speed: ${moveSpeed.toFixed(2)}, direction: (${finalDirection.x.toFixed(2)}, ${finalDirection.z.toFixed(2)})`);
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

        // Debug logging
        console.log(`setPosition called${this.isRemote ? ' (remote)' : ''}: x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);

        // If mesh isn't loaded yet, queue the position update for remote players
        if (!this.mesh && this.isRemote) {
            // Store the position update in the queue (keep only the most recent 5)
            this.positionQueue.push({ ...position });
            if (this.positionQueue.length > 5) {
                this.positionQueue.shift(); // Remove oldest position
            }
            console.log(`Model not loaded yet, queued position update. Queue size: ${this.positionQueue.length}`);
            return;
        }

        // Update the mesh position
        if (this.mesh) {
            this.mesh.position.set(position.x, position.y, position.z);
            console.log(`Mesh position updated to: x=${this.mesh.position.x.toFixed(2)}, y=${this.mesh.position.y.toFixed(2)}, z=${this.mesh.position.z.toFixed(2)}`);
        } else {
            console.warn('setPosition: mesh is not available yet, position update skipped');
        }

        // If this is a remote player, we don't need to update physics
        if (this.isRemote) return;

        // Update the physics body position if it exists
        if (this.body) {
            const transform = this.body.getWorldTransform();
            const origin = transform.getOrigin();

            origin.setX(position.x);
            origin.setY(position.y);
            origin.setZ(position.z);

            transform.setOrigin(origin);
            this.body.setWorldTransform(transform);
        }
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

    shoot() {
        if (!this.canShoot) return;

        // Get the direction the player is facing
        const direction = this.getAimDirection();

        // Get the position to spawn the projectile (in front of the player)
        const muzzleOffset = new THREE.Vector3(0, 0.5, 0).applyQuaternion(this.mesh.quaternion);
        const muzzlePosition = this.mesh.position.clone().add(muzzleOffset);

        // Create projectile
        const projectile = new Projectile(
            window.game.scene.scene,
            window.game.physics.physicsWorld,
            muzzlePosition,
            direction,
            50 // Speed
        );

        // Add to game's projectiles array
        window.game.projectiles.push(projectile);

        // Set cooldown
        this.canShoot = false;
        setTimeout(() => {
            this.canShoot = true;
        }, 500); // 500ms cooldown
    }

    getAimDirection() {
        // Get the camera direction for aiming
        const direction = new THREE.Vector3();
        // We need to access the camera from the scene
        // This assumes the scene has a reference to the camera
        if (window.game && window.game.scene && window.game.scene.camera) {
            window.game.scene.camera.getWorldDirection(direction);
        }
        return direction;
    }

    takeDamage(amount, attackerId = null) {
        // Store previous health for comparison
        const previousHealth = this.health;

        // Apply damage locally for immediate feedback
        this.health = Math.max(0, this.health - amount);

        // Update health UI
        this.updateHealthUI();

        // Log the damage event
        console.log(`Player took ${amount} damage, health reduced from ${previousHealth} to ${this.health}`);

        // If this is the local player in a multiplayer game, we still apply damage locally
        // but we don't have to send a damage event because the server should have calculated this
        // This is client-side prediction for responsive feedback
        if (this.playerId === 'local' && window.game && window.game.isMultiplayer && window.game.networkManager) {
            // Add a damage indicator for visual feedback
            this.addDamageIndicator(amount);

            // We could implement client-side prediction by sending a "hit-confirm" event
            // if we're confident in our hit detection
            // window.game.networkManager.sendHitConfirm(attackerId, amount);
        }

        // Check if this damage kills the player
        if (this.health <= 0 && !this.isDead) {
            this.die(attackerId);
        }
    }

    updateHealthUI() {
        const healthBar = document.getElementById('health-bar');
        const healthText = document.getElementById('health-text');

        if (healthBar && healthText) {
            // Update health bar width
            healthBar.style.width = `${this.health}%`;

            // Update health text
            healthText.textContent = `${this.health} HP`;

            // Change color based on health
            if (this.health > 70) {
                healthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)'; // Green
            } else if (this.health > 30) {
                healthBar.style.backgroundColor = 'rgba(255, 255, 0, 0.7)'; // Yellow
            } else {
                healthBar.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Red
            }
        }
    }

    die(attackerId = null) {
        this.isDead = true;

        // Play death animation
        this.playAnimation('death');

        // Send death event to server if this is the local player
        if (this.playerId === 'local' && window.game && window.game.isMultiplayer && window.game.networkManager) {
            window.game.networkManager.sendDeath();
        }

        // Show death message
        const deathMessage = document.createElement('div');
        deathMessage.style.position = 'fixed';
        deathMessage.style.top = '50%';
        deathMessage.style.left = '50%';
        deathMessage.style.transform = 'translate(-50%, -50%)';
        deathMessage.style.color = 'red';
        deathMessage.style.fontSize = '48px';
        deathMessage.style.fontFamily = 'Arial, sans-serif';
        deathMessage.style.fontWeight = 'bold';
        deathMessage.style.textShadow = '2px 2px 4px black';
        deathMessage.textContent = 'YOU DIED';

        document.body.appendChild(deathMessage);

        // Respawn after 3 seconds
        setTimeout(() => {
            this.respawn();
            document.body.removeChild(deathMessage);
        }, 3000);
    }

    /**
     * Respawn the player
     */
    respawn() {
        log(`Player respawning`);

        // Reset health
        this.health = 100;
        this.isDead = false;
        this.isJumping = false;

        // Update health UI
        this.updateHealthUI();

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
                this.position = { ...spawnPosition };
                this.createPhysics();

                // Update mesh position
                if (this.mesh) {
                    this.mesh.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
                }

                log(`Player physics reset at position: x=${spawnPosition.x.toFixed(2)}, y=${spawnPosition.y.toFixed(2)}, z=${spawnPosition.z.toFixed(2)}`);
            } catch (err) {
                error('Error recreating physics on respawn:', err);
            }
        } else {
            // Just update position if no physics body
            this.setPosition(spawnPosition);
        }

        // Play idle animation
        this.playAnimation('idle');
        log('Player respawn complete');
    }

    setAnimation(name) {
        this.playAnimation(name);
    }

    checkGroundContact() {
        if (!this.body) return;

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
            const transform = this.body.getWorldTransform();
            if (!transform) {
                error('Invalid transform in checkGroundContact');
                return;
            }

            const origin = transform.getOrigin();
            if (!origin || typeof origin.x !== 'function') {
                error('Invalid origin in checkGroundContact');
                return;
            }

            // Increased ray length to detect ground more reliably
            // Start from slightly above the player's feet (adjusted for capsule)
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

            // Additional check: if very close to y=0 (ground level), force canJump to true
            // This helps in case the ray test somehow misses
            if (!this.canJump && origin.y() < 1.5) {
                this.canJump = true;
                console.log('Force setting canJump=true because player is close to ground');
            }

            // Log when ground state changes
            if (wasOnGround !== this.canJump) {
                if (this.canJump) {
                    log('Player touched ground');

                    // Reset jump state for player when touching ground
                    this.isJumping = false;

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

            // Clean up Ammo.js objects to prevent memory leaks
            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);
        } catch (err) {
            error('Error in checkGroundContact:', err);
        }
    }

    // Add a visual damage indicator method
    addDamageIndicator(amount) {
        // Create a floating damage indicator
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.textContent = `-${amount}`;
        indicator.style.position = 'absolute';
        indicator.style.color = 'red';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontSize = '20px';
        indicator.style.textShadow = '0 0 3px black';
        indicator.style.zIndex = '1000';
        indicator.style.pointerEvents = 'none';

        document.body.appendChild(indicator);

        // Position the indicator in the center of the screen (where the crosshair is)
        indicator.style.top = '50%';
        indicator.style.left = '50%';
        indicator.style.transform = 'translate(-50%, -150%)'; // Position above crosshair

        // Add animation
        indicator.style.transition = 'all 1s ease-out';

        // Start animation after a small delay
        setTimeout(() => {
            indicator.style.opacity = '0';
            indicator.style.transform = 'translate(-50%, -200%)'; // Move up while fading
        }, 10);

        // Remove from DOM after animation completes
        setTimeout(() => {
            document.body.removeChild(indicator);
        }, 1000);
    }
}
