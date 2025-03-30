import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';

export class Player {
    constructor(scene, physicsWorld, position = { x: 0, y: 5, z: 0 }) {
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
            log('Loading player model');
            const loader = new GLTFLoader();

            // Try multiple paths to handle both development and production builds
            // Order matters - try the most likely paths first
            const modelPaths = [
                '/models/blobville-player.glb',  // Standard path
                '/public/models/blobville-player.glb',  // With public prefix
                '/dist/models/blobville-player.glb',  // From dist
                '/dist/models/models/blobville-player.glb'  // Nested models folder
            ];

            let pathIndex = 0;

            const tryLoadModel = (index) => {
                if (index >= modelPaths.length) {
                    error('Failed to load player model after trying all paths');
                    return;
                }

                const modelPath = modelPaths[index];
                log(`Trying to load player model from: ${modelPath}`);

                loader.load(
                    modelPath,
                    (gltf) => {
                        log(`Player model loaded successfully from ${modelPath}!`);

                        // Log all animations in the GLTF file
                        log(`Player GLTF contains ${gltf.animations.length} animations:`);
                        gltf.animations.forEach((anim, index) => {
                            log(`Player animation ${index}: "${anim.name}" (Duration: ${anim.duration}s)`);
                        });

                        this.setupModel(gltf);
                    },
                    (xhr) => {
                        if (xhr.lengthComputable) {
                            const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
                            log(`Loading player model: ${percent}%`);
                        }
                    },
                    (err) => {
                        error(`Failed to load player model from ${modelPath}: ${err.message}`);
                        // Try next path
                        tryLoadModel(index + 1);
                    }
                );
            };

            // Start trying paths
            tryLoadModel(pathIndex);
        } catch (err) {
            error('Error in loadModel', err);
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

        // Only proceed with valid animation
        if (!this.animations[name] || !this.animationActions[name]) {
            // Only log once for better performance
            if (name === 'idle' && !this._loggedMissingIdle) {
                console.warn('Idle animation not found, animations may not be properly loaded');
                this._loggedMissingIdle = true;
            }
            return;
        }

        // Don't restart the same animation unless it's a jump or attack
        if (this.currentAnimation === name && name !== 'jump' && name !== 'attack') return;

        try {
            // For attack and jump animations, we want to make sure they complete
            const isOneShot = (name === 'attack' || name === 'jump');

            // If we have a current action, fade it out
            if (this.currentAction) {
                this.currentAction.fadeOut(0.2);
            }

            // Get the new action
            const action = this.animationActions[name];

            // Reset and play the new action
            action.reset();
            action.fadeIn(0.2);
            action.play();

            // Update current animation and action
            this.currentAnimation = name;
            this.currentAction = action;
        } catch (err) {
            console.error(`Error playing animation '${name}':`, err);
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
                            this.mesh.position.set(p.x(), p.y() - 1.0, p.z());
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
            finalDirection.normalize();

            // Get current velocity to preserve Y component (for jumping/falling)
            const velocity = this.body.getLinearVelocity();
            const currentVelY = velocity.y();

            // Set velocity directly instead of applying force
            const newVelocity = new Ammo.btVector3(
                finalDirection.x * maxVelocity,
                currentVelY,
                finalDirection.z * maxVelocity
            );

            this.body.setLinearVelocity(newVelocity);
            Ammo.destroy(newVelocity);
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
        if (!position) return;

        // Update the mesh position
        if (this.mesh) {
            this.mesh.position.set(position.x, position.y, position.z);
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

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);

        // Update health UI
        this.updateHealthUI();

        if (this.health <= 0 && !this.isDead) {
            this.die();
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

    die() {
        this.isDead = true;

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

    respawn() {
        try {
            // Check if Ammo is defined
            if (typeof Ammo === 'undefined') {
                error('Ammo is not defined in respawn');
                return;
            }

            // Reset health
            this.health = 100;
            this.isDead = false;
            this.updateHealthUI();

            // Reset position
            if (this.body) {
                const transform = new Ammo.btTransform();
                transform.setIdentity();
                transform.setOrigin(new Ammo.btVector3(0, 5, 0));

                const ms = this.body.getMotionState();
                if (ms && typeof ms.setWorldTransform === 'function') {
                    ms.setWorldTransform(transform);
                }

                if (typeof this.body.setWorldTransform === 'function') {
                    this.body.setWorldTransform(transform);
                }

                // Reset velocity
                const zero = new Ammo.btVector3(0, 0, 0);
                if (typeof this.body.setLinearVelocity === 'function') {
                    this.body.setLinearVelocity(zero);
                }

                if (typeof this.body.setAngularVelocity === 'function') {
                    this.body.setAngularVelocity(zero);
                }

                // Activate the body
                if (typeof this.body.activate === 'function') {
                    this.body.activate(true);
                }

                // Clean up Ammo objects
                Ammo.destroy(zero);
                Ammo.destroy(transform);
            } else {
                error('Cannot respawn player: physics body is null');
            }
        } catch (err) {
            error('Error in respawn:', err);
        }
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

            const rayStart = new Ammo.btVector3(origin.x(), origin.y() - 0.5, origin.z());
            const rayEnd = new Ammo.btVector3(origin.x(), origin.y() - 2.0, origin.z());

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

            // Log when ground state changes
            if (wasOnGround !== this.canJump) {
                if (this.canJump) {
                    log('Player touched ground');
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
}
