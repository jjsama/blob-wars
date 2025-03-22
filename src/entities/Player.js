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
        this.animations = {
            idle: null,
            walkForward: null,
            walkBackward: null,
            strafeLeft: null,
            strafeRight: null,
            jump: null,
            attack: null
        };
        this.currentAnimation = 'idle';
        this.mixer = null;
        this.currentAction = null;
        this.tempMesh = null;
        this.health = 100;
        this.isDead = false;
        this.isAttacking = false;
        this.isJumping = false;
        this.canJump = false;
        this.mixerEventAdded = false;

        // Create a temporary mesh first - this ensures we always have a visible player
        this.createTempMesh();

        // Create physics body
        this.createPhysics();

        // Try to load the model, but don't wait for it
        setTimeout(() => {
            this.loadModel();
        }, 1000);

        // Add a direct space key listener for testing
        window.addEventListener('keydown', (event) => {
            if (event.key === ' ' && !this.isJumping) {
                log('DIRECT SPACE KEY DETECTED');
                this.jump();
            }
        });

        log('Player created with direct space key listener');
    }

    createTempMesh() {
        try {
            log('Creating temporary player model');

            // Create a simple temporary model
            const playerGroup = new THREE.Group();

            // Body
            const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 8, 16);
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: 0x3366ff,
                roughness: 0.7,
                metalness: 0.3
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.castShadow = true;
            body.position.y = 0.5;
            playerGroup.add(body);

            // Head
            const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
            const headMaterial = new THREE.MeshStandardMaterial({
                color: 0xffcc99,
                roughness: 0.7,
                metalness: 0.2
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 1.3;
            head.castShadow = true;
            playerGroup.add(head);

            // Set position
            playerGroup.position.set(this.position.x, this.position.y, this.position.z);

            this.tempMesh = playerGroup;
            this.mesh = playerGroup; // Use temp mesh until model loads
            this.scene.add(this.mesh);

            log('Temporary player model created');
        } catch (err) {
            error('Error creating temporary mesh', err);

            // Create an absolute fallback - just a box
            const geometry = new THREE.BoxGeometry(1, 2, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);
            this.scene.add(this.mesh);

            log('Fallback box mesh created');
        }
    }

    loadModel() {
        try {
            log('Loading player model');
            const loader = new GLTFLoader();

            // Use the exact same path as the enemy
            const modelPath = '/public/models/blobville-player.glb';

            log(`Trying to load player model from: ${modelPath}`);

            loader.load(
                modelPath,
                (gltf) => {
                    log('Player model loaded successfully!');

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
                    error(`Failed to load player model: ${err.message}`);
                    log('Using fallback temporary mesh for player');
                }
            );
        } catch (err) {
            error('Error in loadModel', err);
        }
    }

    // Separate method to set up the model once loaded
    setupModel(gltf) {
        try {
            // Set up the model
            const model = gltf.scene;

            // Keep the current position
            if (this.mesh) {
                model.position.copy(this.mesh.position);
            } else {
                model.position.set(this.position.x, this.position.y, this.position.z);
            }

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

            // Remove the temporary mesh
            if (this.tempMesh) {
                this.scene.remove(this.tempMesh);
            }

            // Replace the mesh
            if (this.mesh && this.mesh !== this.tempMesh) {
                this.scene.remove(this.mesh);
            }

            this.mesh = model;
            this.scene.add(this.mesh);
            this.modelLoaded = true;

            // Store animations directly on the mesh for easier access
            this.mesh.animations = gltf.animations;

            // Log all animations in the GLTF file
            log(`Player model loaded with ${gltf.animations.length} animations:`);
            gltf.animations.forEach((anim, index) => {
                log(`Player animation ${index}: "${anim.name}" (Duration: ${anim.duration}s)`);
            });

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

        // First, try to map animations by index (more reliable)
        if (animations.length >= 7) {
            log('Mapping animations by index (more reliable)');
            // Map animations based on the indices we've seen in the console logs
            this.animations.strafeLeft = animations[0];
            this.animations.attack = animations[1];
            this.animations.idle = animations[2];
            this.animations.jump = animations[3];
            this.animations.strafeRight = animations[4];
            this.animations.walkBackward = animations[5];
            this.animations.walkForward = animations[6];

            log('Animations mapped by index:');
            log(`strafeLeft: ${this.animations.strafeLeft ? this.animations.strafeLeft.name : 'NOT FOUND'}`);
            log(`attack: ${this.animations.attack ? this.animations.attack.name : 'NOT FOUND'}`);
            log(`idle: ${this.animations.idle ? this.animations.idle.name : 'NOT FOUND'}`);
            log(`jump: ${this.animations.jump ? this.animations.jump.name : 'NOT FOUND'}`);
            log(`strafeRight: ${this.animations.strafeRight ? this.animations.strafeRight.name : 'NOT FOUND'}`);
            log(`walkBackward: ${this.animations.walkBackward ? this.animations.walkBackward.name : 'NOT FOUND'}`);
            log(`walkForward: ${this.animations.walkForward ? this.animations.walkForward.name : 'NOT FOUND'}`);
        } else {
            // Fallback to mapping by name
            log('Mapping animations by name (fallback)');
            animations.forEach((clip, index) => {
                const name = clip.name.toLowerCase();
                log(`Processing animation ${index}: "${clip.name}"`);

                if (name === 'idle') this.animations.idle = clip;
                else if (name === 'walkforward') this.animations.walkForward = clip;
                else if (name === 'walkbackward') this.animations.walkBackward = clip;
                else if (name === 'strafeleft') this.animations.strafeLeft = clip;
                else if (name === 'straferight') this.animations.strafeRight = clip;
                else if (name === 'jump') this.animations.jump = clip;
                else if (name === 'attack') this.animations.attack = clip;
            });
        }

        // Start with idle animation if available
        if (this.animations.idle) {
            log('Starting with idle animation');
            this.playAnimation('idle');
        } else {
            log('No idle animation found, cannot start animations');
        }
    }

    createFakeAnimations() {
        log('Creating fake animations for blob model');

        // Create a simple up/down bobbing animation for idle
        const times = [0, 0.5, 1];
        const values = [0, 0.1, 0]; // Y position values

        // Create tracks for different animations
        const idleTrack = new THREE.KeyframeTrack(
            '.position[y]', // Property to animate
            times,
            [0, 0.1, 0] // Slight up and down movement
        );

        const walkTrack = new THREE.KeyframeTrack(
            '.position[y]',
            times,
            [0, 0.2, 0] // More pronounced movement
        );

        const runTrack = new THREE.KeyframeTrack(
            '.position[y]',
            times,
            [0, 0.3, 0] // Even more movement
        );

        const jumpTrack = new THREE.KeyframeTrack(
            '.position[y]',
            [0, 0.5, 1],
            [0, 0.5, 0] // Big jump
        );

        // Create animation clips
        this.animations.idle = new THREE.AnimationClip('idle', 1.5, [idleTrack]);
        this.animations.walkForward = new THREE.AnimationClip('walkForward', 1, [walkTrack]);
        this.animations.walkBackward = new THREE.AnimationClip('walkBackward', 1, [walkTrack]);
        this.animations.strafeLeft = new THREE.AnimationClip('strafeLeft', 1, [walkTrack]);
        this.animations.strafeRight = new THREE.AnimationClip('strafeRight', 1, [walkTrack]);
        this.animations.jump = new THREE.AnimationClip('jump', 0.8, [jumpTrack]);
        this.animations.attack = new THREE.AnimationClip('attack', 0.8, [jumpTrack]);

        // Create mixer if it doesn't exist
        if (!this.mixer && this.mesh) {
            this.mixer = new THREE.AnimationMixer(this.mesh);
        }

        // Start with idle animation
        if (this.mixer) {
            this.playAnimation('idle');
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
        if (!this.mixer) {
            log('No mixer available for animations');

            // Try to create the mixer if we have a mesh but no mixer
            if (this.mesh && !this.mixer) {
                log('Attempting to create mixer on demand');
                this.mixer = new THREE.AnimationMixer(this.mesh);
            } else {
                return; // Can't play animation without mixer
            }
        }

        if (!this.animations[name]) {
            log(`Animation ${name} not found, falling back to idle`);

            // If we're already trying to play idle, don't create an infinite loop
            if (name === 'idle') {
                log('Idle animation not found, cannot play any animation');
                return;
            }

            // Try to fall back to idle
            if (this.animations.idle) {
                this.playAnimation('idle');
            }
            return;
        }

        // Don't restart the same animation unless it's a jump or attack
        if (this.currentAnimation === name && name !== 'jump' && name !== 'attack') return;

        log(`Playing animation: ${name}`);

        try {
            // For attack and jump animations, we want to make sure they complete
            const isOneShot = (name === 'attack' || name === 'jump');

            // Stop any current animation with appropriate crossfade
            if (this.currentAction) {
                // For jump, we want a very quick transition with no blending
                if (name === 'jump') {
                    this.currentAction.stop();
                } else {
                    const fadeTime = isOneShot ? 0.1 : 0.2;
                    this.currentAction.fadeOut(fadeTime);
                }
            }

            // Start new animation
            const action = this.mixer.clipAction(this.animations[name]);

            // Reset the action to ensure it plays from the beginning
            action.reset();

            // For jump and attack, make sure they play only once
            if (isOneShot) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true; // Keep the last frame until we transition

                // For jump specifically, ensure smooth playback
                if (name === 'jump') {
                    action.timeScale = 1.0;  // Normal speed
                    action.weight = 1.0;     // Full weight
                    action.enabled = true;   // Make sure it's enabled

                    // Don't use crossfade for jump - play it immediately
                    action.play();

                    // Schedule return to idle after animation completes
                    const jumpDuration = this.animations.jump.duration * 1000;
                    setTimeout(() => {
                        if (this.currentAnimation === 'jump') {
                            this.playAnimation('idle');
                        }
                    }, jumpDuration);
                } else {
                    // For other one-shot animations, use normal fade
                    const fadeInTime = 0.1;
                    action.fadeIn(fadeInTime);
                    action.play();
                }
            } else {
                // For regular animations, use normal crossfade
                const fadeInTime = 0.2;
                action.fadeIn(fadeInTime);
                action.play();
            }

            this.currentAction = action;
            this.currentAnimation = name;
        } catch (err) {
            error(`Error playing animation ${name}:`, err);
        }
    }

    updateMovementAnimation(input) {
        // Don't change animations during attack
        if (this.isAttacking) return;

        // Debug the input state
        if (input.jump) {
            log('Jump input detected in updateMovementAnimation');
            log(`isJumping: ${this.isJumping}, canJump: ${this.canJump}`);
        }

        // Handle jump with highest priority
        if (input.jump && !this.isJumping) {
            log('Jump conditions met, calling jump()');
            this.jump();
            return;
        }

        // Only change other animations if we're not jumping
        if (!this.isJumping) {
            if (input.forward) {
                this.playAnimation('walkForward');
            } else if (input.backward) {
                this.playAnimation('walkBackward');
            } else if (input.left) {
                this.playAnimation('strafeLeft');
            } else if (input.right) {
                this.playAnimation('strafeRight');
            } else {
                this.playAnimation('idle');
            }
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

                // Reduced jump force for a short hop
                const jumpForce = new Ammo.btVector3(0, 10, 0);
                this.body.applyCentralImpulse(jumpForce);
                Ammo.destroy(jumpForce);
                log('Jump force applied: 0, 10, 0');
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
            if (!this.body || !this.mesh) return;

            // Update mesh position based on physics
            const ms = this.body.getMotionState();
            if (ms) {
                const transform = new Ammo.btTransform();
                ms.getWorldTransform(transform);
                const p = transform.getOrigin();

                // Update position - adjust the offset to match the model
                this.mesh.position.set(p.x(), p.y() - 1.0, p.z());

                // Check if player is on ground
                this.checkGroundContact();

                // Make sure the player doesn't fall through the world
                if (p.y() < -10) {
                    // Reset position if player falls too far
                    const resetTransform = new Ammo.btTransform();
                    resetTransform.setIdentity();
                    resetTransform.setOrigin(new Ammo.btVector3(0, 5, 0));
                    ms.setWorldTransform(resetTransform);
                    this.body.setWorldTransform(resetTransform);

                    // Reset velocity
                    const zero = new Ammo.btVector3(0, 0, 0);
                    this.body.setLinearVelocity(zero);
                    this.body.setAngularVelocity(zero);
                }

                // Make the player always face the direction of the crosshair/camera
                if (this.modelLoaded && window.game && window.game.scene) {
                    const cameraDirection = new THREE.Vector3();
                    window.game.scene.camera.getWorldDirection(cameraDirection);
                    cameraDirection.y = 0; // Keep upright
                    cameraDirection.normalize();

                    // Calculate the angle to face the camera direction
                    const angle = Math.atan2(cameraDirection.x, cameraDirection.z);

                    // Set rotation to match crosshair direction
                    this.mesh.rotation.set(0, angle, 0);
                }
            }

            // Update animation mixer
            if (this.mixer && deltaTime) {
                this.mixer.update(deltaTime);
            }
        } catch (err) {
            error('Error in player update', err);
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

    getPosition() {
        if (!this.mesh) return new THREE.Vector3();
        return this.mesh.position;
    }

    shoot() {
        // Get the direction the player is facing
        const direction = this.getAimDirection();

        // Create a projectile in that direction
        // ... existing projectile creation code ...
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

    setRotation(yRotation) {
        if (this.mesh) {
            // For the model, we only want to set the Y rotation
            if (this.modelLoaded) {
                // Add a small delay to make the rotation smoother
                const currentRotation = this.mesh.rotation.y;
                const rotationDiff = yRotation - currentRotation;

                // Normalize the difference to be between -PI and PI
                let normalizedDiff = rotationDiff;
                while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
                while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

                // Apply a smooth rotation (interpolate)
                this.mesh.rotation.y += normalizedDiff * 0.1; // 10% of the way there
            } else {
                // For the temp mesh, we can set the full rotation
                const currentRotation = new THREE.Euler().setFromQuaternion(this.mesh.quaternion);
                this.mesh.rotation.set(currentRotation.x, yRotation, currentRotation.z);
            }
        }
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
        // Reset health
        this.health = 100;
        this.isDead = false;
        this.updateHealthUI();

        // Reset position
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(0, 5, 0));

        const ms = this.body.getMotionState();
        ms.setWorldTransform(transform);

        this.body.setWorldTransform(transform);

        // Reset velocity
        const zero = new Ammo.btVector3(0, 0, 0);
        this.body.setLinearVelocity(zero);
        this.body.setAngularVelocity(zero);

        // Activate the body
        this.body.activate(true);
    }

    setAnimation(name) {
        this.playAnimation(name);
    }

    checkGroundContact() {
        if (!this.body) return;

        try {
            // Cast a ray downward from the player's position to check for ground
            const origin = this.body.getWorldTransform().getOrigin();
            const rayStart = new Ammo.btVector3(origin.x(), origin.y() - 0.5, origin.z());
            const rayEnd = new Ammo.btVector3(origin.x(), origin.y() - 2.0, origin.z());

            const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);
            this.physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

            // If the ray hit something, the player is on the ground
            const wasOnGround = this.canJump;
            this.canJump = rayCallback.hasHit();

            // Log when ground state changes
            if (wasOnGround !== this.canJump) {
                log(this.canJump ? 'Player touched ground' : 'Player left ground');
            }

            // Clean up Ammo.js objects to prevent memory leaks
            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);
        } catch (err) {
            error('Error in checkGroundContact', err);
        }
    }
}
