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

        // Add throttling for ground checks to prevent jitter
        this._lastGroundCheck = 0;
        this._groundCheckInterval = 50; // Check every 50ms instead of every frame

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // Use the provided color or fallback to teal
        this.playerColor = playerColor || 0x00d2d3; // Bright teal as default

        // NEW Animation State Properties
        this.intendedAnimation = 'idle'; // What animation the input *wants*
        this.lastMovementInputTime = 0;  // Timestamp of the last movement input intent
        this.idleDelay = 150; // ms delay before switching back to idle

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
                    model.scale.set(0.35, 0.35, 0.35);

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
            console.log('Creating player physics with compound shape');

            // Create a compound shape for more realistic physics
            const compoundShape = new Ammo.btCompoundShape();

            // Define transform for positioning child shapes
            const localTransform = new Ammo.btTransform();
            localTransform.setIdentity();

            // 1. Torso (main capsule)
            const torsoShape = new Ammo.btCapsuleShape(0.4, 0.8); // Slightly smaller than before
            localTransform.setOrigin(new Ammo.btVector3(0, 0.4, 0)); // Center of torso
            compoundShape.addChildShape(localTransform, torsoShape);

            // 2. Head (sphere on top)
            const headShape = new Ammo.btSphereShape(0.25);
            localTransform.setOrigin(new Ammo.btVector3(0, 1.0, 0)); // Above torso
            compoundShape.addChildShape(localTransform, headShape);

            // 3. Legs (two thin capsules)
            const legShape = new Ammo.btCapsuleShape(0.15, 0.8);

            // Left leg
            localTransform.setOrigin(new Ammo.btVector3(-0.2, -0.3, 0));
            compoundShape.addChildShape(localTransform, legShape);

            // Right leg
            localTransform.setOrigin(new Ammo.btVector3(0.2, -0.3, 0));
            compoundShape.addChildShape(localTransform, legShape);

            // 4. Arms (two thin capsules)
            const armShape = new Ammo.btCapsuleShape(0.12, 0.6);

            // Left arm
            localTransform.setOrigin(new Ammo.btVector3(-0.4, 0.4, 0));
            compoundShape.addChildShape(localTransform, armShape);

            // Right arm
            localTransform.setOrigin(new Ammo.btVector3(0.4, 0.4, 0));
            compoundShape.addChildShape(localTransform, armShape);

            // Create the world transform
            const transform = new Ammo.btTransform();
            transform.setIdentity();

            // Position the compound body at the player's position, adjusting the Y-offset.
            // Using a higher offset (1.2) to prevent sinking into the ground
            const initialYOffset = 1.2;
            transform.setOrigin(new Ammo.btVector3(
                this.position.x, this.position.y + initialYOffset, this.position.z
            ));

            // Calculate mass and inertia
            const mass = 1.5; // Increased from 1 for better stability
            const localInertia = new Ammo.btVector3(0, 0, 0);
            compoundShape.calculateLocalInertia(mass, localInertia);

            // Create motion state and rigid body
            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, compoundShape, localInertia
            );

            this.body = new Ammo.btRigidBody(rbInfo);
            this.body.setFriction(0.5);
            this.body.setRestitution(0.1); // Reduced from 0.2

            // Increase damping for smoother movement
            this.body.setDamping(0.2, 0.2); // Increased from 0.1

            // Store references to the compound shape and its components for later use
            this.physicsShape = {
                compound: compoundShape,
                torso: torsoShape,
                head: headShape,
                legs: legShape,
                arms: armShape
            };

            // Prevent player from tipping over
            this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0)); // Lock all rotation

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

            console.log('Player compound physics created successfully');
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
                // Log failure to find any variation
                console.warn(`Animation "${name}" (or variations) not found. Cannot play. Available: ${Object.keys(this.animationActions).join(', ')}`);
                // Only log once for better performance
                if (name.toLowerCase() === 'idle' && !this._loggedMissingIdle) {
                    console.warn(`Idle animation not found, animations may not be properly loaded. Available animations: ${Object.keys(this.animations).join(', ')}`);
                    this._loggedMissingIdle = true;
                }
                return;
            }
        }

        // Prevent restart ONLY if the same animation is requested AND its action is currently running.
        // (Except for one-shot animations like jump/attack which should always restart).
        if (
            this.currentAnimation === animName &&
            this.currentAction &&
            this.currentAction.isRunning() &&
            animName !== 'jump' && animName !== 'attack'
        ) {
            return; // Animation is already playing and looping correctly, do nothing.
        }

        // If we reach here, it means we need to start or transition to the requested animation.

        try {
            // Fade out the previous action *unless* it's the same action we're about to play
            // (handles cases where the action might exist but wasn't running).
            if (this.currentAction && this.currentAction !== this.animationActions[animName]) {
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
            // Fine-tuning offset to -0.85 to prevent both sinking and hovering
            const MODEL_Y_OFFSET = -0.85;

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
                            // This offset ensures the visual model stays aligned with the physics body
                            this.mesh.position.set(p.x(), p.y() + MODEL_Y_OFFSET, p.z());

                            // Debug visualization of physics body components (uncomment for debugging)
                            /*
                            if (window.game && window.game.debug && window.game.debug.showPhysics) {
                                this.visualizePhysicsBody(p.x(), p.y(), p.z());
                            }
                            */
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

            // --- Ground Check Throttling ---
            const now = Date.now();
            if (now - this._lastGroundCheck >= this._groundCheckInterval) {
                this._lastGroundCheck = now;
                this.checkGroundContact();
            }
            // --- End Ground Check Throttling ---

            // --- NEW: Debounced Animation Logic --- 
            try {
                if (this.modelLoaded && this.mixer) {
                    let targetAnimation = 'idle'; // Default to idle

                    // Check special states first
                    if (this.isAttacking) {
                        // Let attack() handle finishing the attack animation
                        targetAnimation = this.currentAnimation; // Stay on current (likely 'attack')
                    } else if (this.isJumping) {
                        targetAnimation = 'jump';
                    } else {
                        // Not dead, attacking, or jumping - check movement intent
                        const now = Date.now();
                        if (this.intendedAnimation !== 'idle') {
                            // If intent is movement, use that
                            targetAnimation = this.intendedAnimation;
                        } else {
                            // Intent is idle. Only switch to idle if enough time has passed
                            // or if we are already idle.
                            if (this.currentAnimation === 'idle' || now - this.lastMovementInputTime > this.idleDelay) {
                                targetAnimation = 'idle';
                            }
                            else {
                                // Not enough time passed, keep the current (likely movement) animation
                                targetAnimation = this.currentAnimation;
                            }
                        }
                    }

                    // Play the determined animation (playAnimation handles preventing restarts)
                    this.playAnimation(targetAnimation);
                }
            } catch (animationUpdateError) {
                error(`Error updating animation based on intent: ${animationUpdateError.message || animationUpdateError}`);
            }
            // --- END NEW Animation Logic ---

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
        console.log(`[Player ${this.playerId}] Died. Attacker: ${attackerId || 'None'}`);

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
        console.log(`Player respawning`);

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
        console.log('Player respawn complete');
    }

    setAnimation(name) {
        this.playAnimation(name);
    }

    checkGroundContact() {
        if (!this.body || typeof Ammo === 'undefined') return;

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

            // For compound shape, we'll cast rays from multiple foot positions
            // including some spread to ensure more reliable detection
            const groundHits = [false, false, false, false];
            const rayLength = 2.0; // Shorter ray length for more precise detection

            // Add small buffer to prevent flickering between ground states
            const groundBuffer = 0.1; // Small buffer above ground

            // Define ray starting positions - now with 4 points around the feet
            // Two centered rays and two spread out rays
            const footY = origin.y() - 0.7;  // Consistent Y position for all rays
            const rayStarts = [
                new Ammo.btVector3(origin.x() - 0.2, footY, origin.z()),         // Left foot
                new Ammo.btVector3(origin.x() + 0.2, footY, origin.z()),         // Right foot
                new Ammo.btVector3(origin.x(), footY, origin.z() - 0.2),         // Forward foot
                new Ammo.btVector3(origin.x(), footY, origin.z() + 0.2)          // Back foot
            ];

            // Cast rays downward from each position
            for (let i = 0; i < rayStarts.length; i++) {
                const rayStart = rayStarts[i];
                const rayEnd = new Ammo.btVector3(
                    rayStart.x(),
                    rayStart.y() - rayLength,
                    rayStart.z()
                );

                const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);

                if (!this.physicsWorld || typeof this.physicsWorld.rayTest !== 'function') {
                    error('Invalid physicsWorld or missing rayTest method');
                    Ammo.destroy(rayStart);
                    Ammo.destroy(rayEnd);
                    Ammo.destroy(rayCallback);
                    continue;
                }

                this.physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

                // Check for hit and get distance if hit
                if (rayCallback.hasHit()) {
                    groundHits[i] = true;

                    // Optionally, we could check hit distance here for more precise grounding
                    // const hitPointWorld = rayCallback.get_m_hitPointWorld();
                    // const hitDistance = rayStart.y() - hitPointWorld.y();
                    // groundHits[i] = hitDistance <= (rayLength + groundBuffer);
                }

                // Clean up Ammo.js objects to prevent memory leaks
                Ammo.destroy(rayEnd);
                Ammo.destroy(rayCallback);
            }

            // Previous ground state
            const wasOnGround = this.canJump;

            // Prevent rapid flipping between grounded/not grounded states 
            // by using different thresholds for entering vs leaving grounded state
            if (wasOnGround) {
                // Already on ground - require ALL rays to miss to leave ground state
                // This creates hysteresis to prevent jitter
                this.canJump = groundHits.some(hit => hit);
            } else {
                // Not on ground - require at least 2 rays to hit to enter ground state
                // This prevents entering ground state too easily
                const hitCount = groundHits.filter(hit => hit).length;
                this.canJump = hitCount >= 2;
            }

            // Clean up remaining Ammo.js objects
            rayStarts.forEach(rayStart => Ammo.destroy(rayStart));

            // --- Ground Check Logging ---
            logMsg += ` | RayHit: [${groundHits.join(', ')}]`;
            // --- End Ground Check --- 

            // Additional check: if very close to ground level, force canJump to true
            // This helps in case the ray tests somehow miss
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
                // Add debounce to avoid immediately disabling jump state
                const jumpDuration = Date.now() - (this._lastJumpTime || 0);
                if (jumpDuration > 300) {  // Minimum jump duration, prevents immediate resetting
                    log('[GroundCheck] Confirmed on ground, ensuring isJumping is false.');
                    this.isJumping = false;
                    logMsg += ` | Reset isJumping after ${jumpDuration}ms`;
                }
            }
            // --- End Robust Reset ---

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
        if (this.isAttacking || this.isDead) return; // Don't attack if already attacking or dead

        console.log(`[Player ${this.playerId}] attack() called.`);
        this.isAttacking = true;
        this.playAnimation('attack'); // Play the attack animation

        // Reset attack state after a short duration (e.g., animation length)
        // Adjust timing as needed (e.g., 800ms)
        setTimeout(() => {
            this.isAttacking = false;
            console.log(`[Player ${this.playerId}] attack() finished.`);
            // Optionally, ensure we transition back to idle/movement animation if needed
            // The main update loop should handle this via setMovementIntent
        }, 800);
    }

    // *** Add the missing jump method back ***
    jump() {
        // Basic jump implementation: apply an upward force
        try {
            // Check if we can jump (on ground) and not already jumping
            if (this.canJump && !this.isJumping) {
                // Apply vertical impulse
                const impulse = new Ammo.btVector3(0, 7, 0); // Reduced force from 10 to 7
                this.body.applyCentralImpulse(impulse);
                Ammo.destroy(impulse);

                // Set jump state
                this.isJumping = true;
                this.canJump = false; // Can't jump again until grounded
                this._lastJumpTime = Date.now(); // Track when this jump started

                // Play jump animation
                this.playAnimation('jump');

                console.log(`[Player ${this.playerId}] Jump initiated. isJumping: ${this.isJumping}, canJump: ${this.canJump}`);
            } else {
                console.log(`[Player ${this.playerId}] Jump prevented. canJump: ${this.canJump}, isJumping: ${this.isJumping}`);
            }
        } catch (err) {
            error(`Error during jump:`, err);
            // Make sure jump state is reset on error
            this.isJumping = false;
        }
    }
    // *** End of added jump method ***

    // Optional helper method to visualize physics body for debugging
    visualizePhysicsBody(x, y, z) {
        // This is just a placeholder for future debugging visualization
        // You can implement this method to create/update helper objects
        // that show the locations of the physics body components
        if (!this._debugHelpers) {
            // Create debug visualization objects for each physics component
            this._debugHelpers = {
                torso: new THREE.Mesh(
                    new THREE.CapsuleGeometry(0.4, 0.8),
                    new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
                ),
                head: new THREE.Mesh(
                    new THREE.SphereGeometry(0.25),
                    new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
                ),
                leftLeg: new THREE.Mesh(
                    new THREE.CapsuleGeometry(0.15, 0.8),
                    new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true })
                ),
                rightLeg: new THREE.Mesh(
                    new THREE.CapsuleGeometry(0.15, 0.8),
                    new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true })
                ),
                leftArm: new THREE.Mesh(
                    new THREE.CapsuleGeometry(0.12, 0.6),
                    new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
                ),
                rightArm: new THREE.Mesh(
                    new THREE.CapsuleGeometry(0.12, 0.6),
                    new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
                )
            };

            // Add to scene
            Object.values(this._debugHelpers).forEach(helper => {
                this.scene.add(helper);
            });
        }

        // Update positions of debug helpers
        this._debugHelpers.torso.position.set(x, y + 0.4, z);
        this._debugHelpers.head.position.set(x, y + 1.0, z);
        this._debugHelpers.leftLeg.position.set(x - 0.2, y - 0.3, z);
        this._debugHelpers.rightLeg.position.set(x + 0.2, y - 0.3, z);
        this._debugHelpers.leftArm.position.set(x - 0.4, y + 0.4, z);
        this._debugHelpers.rightArm.position.set(x + 0.4, y + 0.4, z);
    }
}
