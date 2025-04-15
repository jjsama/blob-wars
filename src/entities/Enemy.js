import * as THREE from 'three';
import { log, error } from '../debug.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class Enemy {
    /**
     * Represents an enemy character.
     *
     * @param {THREE.Scene} scene - The main THREE scene.
     * @param {Ammo.btDiscreteDynamicsWorld} physicsWorld - The physics world.
     * @param {object} initialPosition - Initial {x, y, z} position.
     * @param {string} id - The enemy's unique ID.
     * @param {number} enemyColor - The enemy's color.
     * @param {THREE.Camera} camera - The main game camera.
     * @param {Array} enemyProjectilesArray - Reference to the game's enemy projectiles array.
     */
    constructor(scene, physicsWorld, initialPosition, id, enemyColor, camera, enemyProjectilesArray) {
        if (!scene || !physicsWorld || !initialPosition || !id || enemyColor === undefined || !camera || !enemyProjectilesArray) {
            throw new Error("Enemy constructor missing required arguments.");
        }

        // Store dependencies
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.camera = camera;
        this.enemyProjectilesArray = enemyProjectilesArray;

        this.id = id;
        this.enemyColor = enemyColor;
        this.initialPosition = { ...initialPosition };

        // First, check if scene and physicsWorld are valid
        if (!scene || !physicsWorld) {
            console.error("Enemy constructor called with invalid scene or physicsWorld");
            return; // Early return to prevent further errors
        }

        this.mesh = null;
        this.body = null;
        this.isDead = false;
        this.isAttacking = false;
        this.isJumping = false;
        this.canJump = false;
        this.healthBarContainer = null;
        this.healthBar = null;
        this.modelLoaded = false;
        this.animations = {};
        this.animationActions = {};
        this.mixer = null;
        this.currentAnimation = null;
        this.currentAction = null;

        // Create a default position if none provided
        if (!initialPosition) {
            initialPosition = {
                x: (Math.random() - 0.5) * 40,
                y: 0, // Start at ground level
                z: (Math.random() - 0.5) * 40
            };
        }

        // IMPORTANT: Store position as a THREE.Vector3
        // Set Y to 0 to ensure enemies start on the ground
        this.position = new THREE.Vector3(
            initialPosition.x || 0,
            0, // Always start at ground level
            initialPosition.z || 0
        );

        // Log initial position for debugging
        console.log(`Enemy initialized at position: x=${this.position.x.toFixed(2)}, y=${this.position.y.toFixed(2)}, z=${this.position.z.toFixed(2)}`);

        // Initialize other properties
        this.patrolTarget = new THREE.Vector3();
        this.health = 100;
        this.moveSpeed = 15;
        this.maxVelocity = 18;
        this.jumpForce = 10;
        this.attackRange = 20;           // Reduced from 30 to 20 so enemies attack more aggressively
        this.detectionRange = 40;        // Reduced from 60 to 40 to make detection more focused
        this.attackCooldown = 1000;      // Reduced from 1500ms to 1000ms for much more frequent attacks
        this.jumpCooldown = 3000;        // Reduced from 4000ms to 3000ms
        this.lastAttackTime = 0;
        this.lastJumpTime = 0;

        // Keep track of loading state
        this._physicsCreated = false;

        // First load the model (CRITICAL: Load before physics)
        this.loadModel();

        // Create health bar
        setTimeout(() => {
            try {
                this.createHealthBar();
            } catch (error) {
                console.error("Failed to create health bar:", error);
            }
        }, 100);

        // Start a timer to ensure enemy starts patrolling even without targets
        setTimeout(() => {
            if (this.mesh && this.body && !this.isDead) {
                console.log("Starting forced patrol behavior");
                this.setRandomPatrolTarget();
            }
        }, 5000); // Start patrolling after 5 seconds
    }

    loadModel() {
        // Set a flag to track loading status
        this.isModelLoading = true;

        try {
            // Create a GLTFLoader
            const loader = new GLTFLoader();

            // Use path from constants file that works in both dev and prod
            const modelPath = ASSET_PATHS.models.player; // Using same model as player
            console.log(`Loading enemy model from path: ${modelPath}`);

            loader.load(
                modelPath,
                (gltf) => {
                    console.log(`Enemy model loaded successfully from ${modelPath}!`);

                    // Get the model from the loaded GLTF
                    const model = gltf.scene;

                    // Scale the model appropriately - match player scale
                    model.scale.set(0.35, 0.35, 0.35);

                    // Apply distinct bright colors to enemies - NO WHITE/GRAY
                    let enemyColor;

                    // Use provided color if available, otherwise generate one
                    if (this.enemyColor) {
                        enemyColor = this.enemyColor;
                    } else {
                        // Default color generation logic
                        const brightColors = [
                            0xff6b6b, // Bright red
                            0x48dbfb, // Bright blue
                            0x1dd1a1, // Bright green
                            0xfeca57, // Bright yellow
                            0xff9ff3, // Bright pink
                            0x54a0ff, // Bright sky blue
                            0x00d2d3, // Bright teal
                            0xf368e0, // Bright magenta
                            0xff9f43, // Bright orange
                            0xee5253, // Bright crimson
                            0xa29bfe  // Bright purple
                        ];

                        // Use a hash of the position to get a consistent color for this enemy
                        const colorIndex = Math.abs(
                            Math.floor(
                                (this.position.x * 13 + this.position.z * 17) % brightColors.length
                            )
                        );
                        enemyColor = brightColors[colorIndex];
                    }

                    model.traverse((child) => {
                        if (child.isMesh) {
                            // Clone the material to avoid sharing across instances
                            child.material = child.material.clone();

                            // Only color the body material, not the eyes
                            const isEyeMaterial = child.material.name &&
                                (child.material.name.toLowerCase().includes('eye') ||
                                    child.material.name.toLowerCase().includes('pupil'));

                            if (!isEyeMaterial) {
                                // Force set the color - ensure it's applied
                                child.material.color.setHex(enemyColor);
                                // Make sure the material is not transparent
                                child.material.transparent = false;
                                child.material.opacity = 1.0;
                                // Ensure the material is updated
                                child.material.needsUpdate = true;
                            }

                            // Enable shadows
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Store the enemy color for projectiles to use
                    this.enemyColor = enemyColor;

                    // Log the color used for debugging
                    console.log(`Enemy colored with hex: ${enemyColor.toString(16)}`);

                    // Set the model's position directly on the ground
                    // IMPORTANT: Set Y to 0 to ensure it starts on the ground
                    model.position.set(this.position.x, 0, this.position.z);

                    // Rotate the model to face forward
                    model.rotation.set(0, Math.PI, 0);

                    // Set the new model as the mesh
                    this.mesh = model;

                    // Add the new model to the scene
                    this.scene.add(this.mesh);
                    this.modelLoaded = true;

                    // CRITICAL: Create physics AFTER model is loaded and positioned
                    if (!this._physicsCreated) {
                        this.createPhysics();
                        this._physicsCreated = true;
                    }

                    // Set up animations
                    this.setupAnimations(gltf);

                    // Initialize patrol target to start movement immediately
                    this.setRandomPatrolTarget();
                    console.log(`Initial patrol target set: x=${this.patrolTarget.x.toFixed(2)}, z=${this.patrolTarget.z.toFixed(2)}`);

                    console.log("Enemy model loaded successfully");

                    // Mark loading as complete
                    this.isModelLoading = false;
                },
                // Progress callback
                (xhr) => {
                    console.log(`Enemy model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
                },
                // Error callback
                (error) => {
                    console.error(`Error loading enemy model: ${error.message || error}`);
                    this.isModelLoading = false;
                }
            );
        } catch (err) {
            console.error(`Error in enemy loadModel: ${err.message || err}`);
            this.isModelLoading = false;
        }
    }

    setupAnimations(gltf) {
        if (!gltf.animations || gltf.animations.length === 0) {
            console.log('No animations found in enemy model');
            return;
        }

        console.log(`Setting up ${gltf.animations.length} animations for enemy`);

        // Create a new animation mixer
        this.mixer = new THREE.AnimationMixer(this.mesh);

        // Initialize collections
        this.animations = {};
        this.animationActions = {};

        // Log available animations
        gltf.animations.forEach((anim, index) => {
            // Trim animation names to handle any whitespace issues
            const trimmedName = anim.name.trim();
            console.log(`Enemy animation ${index}: "${anim.name}" (trimmed: "${trimmedName}") (duration: ${anim.duration.toFixed(2)}s)`);
        });

        // Process all animations with proper normalization
        gltf.animations.forEach(clip => {
            // Trim the animation name to remove any whitespace
            const trimmedName = clip.name.trim();

            // Store with trimmed name
            this.animations[trimmedName] = clip;
            this.animationActions[trimmedName] = this.mixer.clipAction(clip);
            console.log(`Added animation: "${trimmedName}" (original: "${clip.name}")`);

            // Also store with original name (as a fallback)
            if (trimmedName !== clip.name) {
                this.animations[clip.name] = clip;
                this.animationActions[clip.name] = this.mixer.clipAction(clip);
                console.log(`Also added original name: "${clip.name}"`);
            }

            // Also store with lowercase name for case-insensitive lookup
            const lowerName = trimmedName.toLowerCase();
            if (lowerName !== trimmedName) {
                this.animations[lowerName] = clip;
                this.animationActions[lowerName] = this.mixer.clipAction(clip);
                console.log(`Also added lowercase variant: "${lowerName}"`);
            }
        });

        // Define the expected animation names (in priority order)
        const expectedAnimations = [
            'idle',
            'walkForward',
            'walkBackward',
            'strafeLeft',
            'strafeRight',
            'attack',
            'jump'
        ];

        // Check which expected animations are missing
        const missingAnimations = expectedAnimations.filter(name => {
            // Check all possible variations of the name
            return !this.animations[name] &&
                !this.animations[name.toLowerCase()] &&
                !this.animations[` ${name}`] && // Check with leading space
                !this.animations[`${name} `];   // Check with trailing space
        });

        if (missingAnimations.length > 0) {
            console.warn(`Missing expected animations: ${missingAnimations.join(', ')}`);

            // Try to map missing animations to available ones based on partial name matching
            const availableNames = Object.keys(this.animations);

            missingAnimations.forEach(missingName => {
                // Try to find a suitable replacement using more flexible matching
                const replacement = availableNames.find(available => {
                    const cleanAvailable = available.trim().toLowerCase();
                    const cleanMissing = missingName.trim().toLowerCase();
                    return cleanAvailable.includes(cleanMissing) || cleanMissing.includes(cleanAvailable);
                });

                if (replacement) {
                    console.log(`Mapping missing animation "${missingName}" to available "${replacement}"`);
                    this.animations[missingName] = this.animations[replacement];
                    this.animationActions[missingName] = this.animationActions[replacement];
                } else {
                    // If no specific match found, use a default animation like walkForward
                    // for leftward movement and walkBackward for rightward movement
                    if (missingName.toLowerCase().includes('left') && this.animations['walkForward']) {
                        console.log(`No match found for "${missingName}", defaulting to walkForward`);
                        this.animations[missingName] = this.animations['walkForward'];
                        this.animationActions[missingName] = this.animationActions['walkForward'];
                    } else if (missingName.toLowerCase().includes('right') && this.animations['walkBackward']) {
                        console.log(`No match found for "${missingName}", defaulting to walkBackward`);
                        this.animations[missingName] = this.animations['walkBackward'];
                        this.animationActions[missingName] = this.animationActions['walkBackward'];
                    } else if (this.animations['idle']) {
                        // Last resort: use idle animation
                        console.log(`No match found for "${missingName}", defaulting to idle`);
                        this.animations[missingName] = this.animations['idle'];
                        this.animationActions[missingName] = this.animationActions['idle'];
                    }
                }
            });
        }

        // Try to play idle animation with different possible names
        const idleAnimationNames = ['idle', 'Idle', 'IDLE', 'idle '.trim(), ' idle'.trim()];
        let idleStarted = false;

        for (const name of idleAnimationNames) {
            if (this.animations[name]) {
                this.playAnimation(name);
                console.log(`Started enemy animation: ${name}`);
                idleStarted = true;
                break;
            }
        }

        // If no idle animation was found, try to use the first available animation
        if (!idleStarted && Object.keys(this.animations).length > 0) {
            const firstAnim = Object.keys(this.animations)[0];
            console.log(`No idle animation found, using first available animation: ${firstAnim}`);
            this.playAnimation(firstAnim);
        }
    }

    playAnimation(name) {
        // Don't attempt to play animations until everything is loaded
        if (!this.modelLoaded || !this.mixer || !this.mesh) {
            console.log(`Cannot play animation '${name}': model not fully loaded`);
            return;
        }

        // Try to find the animation with case-insensitive lookup
        let animName = name;
        let animation = null;
        let action = null;

        // First check exact match
        if (this.animations[name] && this.animationActions[name]) {
            animation = this.animations[name];
            action = this.animationActions[name];
        }
        // Then try lowercase
        else if (this.animations[name.toLowerCase()] && this.animationActions[name.toLowerCase()]) {
            animName = name.toLowerCase();
            animation = this.animations[animName];
            action = this.animationActions[animName];
            console.log(`Found animation using lowercase name: '${animName}'`);
        }
        // Then try trimmed version
        else if (this.animations[name.trim()] && this.animationActions[name.trim()]) {
            animName = name.trim();
            animation = this.animations[animName];
            action = this.animationActions[animName];
            console.log(`Found animation using trimmed name: '${animName}'`);
        }
        // Then try trimmed lowercase
        else if (this.animations[name.trim().toLowerCase()] && this.animationActions[name.trim().toLowerCase()]) {
            animName = name.trim().toLowerCase();
            animation = this.animations[animName];
            action = this.animationActions[animName];
            console.log(`Found animation using trimmed lowercase name: '${animName}'`);
        }
        // Fallback to similar animation name
        else {
            // Check if there's any animation containing the requested name
            const animKeys = Object.keys(this.animations);
            const foundKey = animKeys.find(key =>
                key.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(key.toLowerCase())
            );

            if (foundKey) {
                animName = foundKey;
                animation = this.animations[foundKey];
                action = this.animationActions[foundKey];
                console.log(`Found similar animation: '${foundKey}' for requested '${name}'`);
            }
            // Last resort - try to use a default
            else {
                // Use appropriate defaults based on animation type
                if (name.toLowerCase().includes('idle') && this.animations['idle']) {
                    animName = 'idle';
                } else if ((name.toLowerCase().includes('walk') || name.toLowerCase().includes('forward')) && this.animations['walkForward']) {
                    animName = 'walkForward';
                } else if (name.toLowerCase().includes('back') && this.animations['walkBackward']) {
                    animName = 'walkBackward';
                } else if (name.toLowerCase().includes('left') && this.animations['strafeLeft']) {
                    animName = 'strafeLeft';
                } else if (name.toLowerCase().includes('right') && this.animations['strafeRight']) {
                    animName = 'strafeRight';
                } else if (name.toLowerCase().includes('attack') && this.animations['attack']) {
                    animName = 'attack';
                } else if (name.toLowerCase().includes('jump') && this.animations['jump']) {
                    animName = 'jump';
                } else if (animKeys.length > 0) {
                    // Use first available as last resort
                    animName = animKeys[0];
                } else {
                    console.error(`No animations available for enemy`);
                    return;
                }

                animation = this.animations[animName];
                action = this.animationActions[animName];
                console.log(`Using fallback animation '${animName}' for requested '${name}'`);
            }
        }

        if (!animation || !action) {
            console.error(`Failed to find animation '${name}' or create action`);
            return;
        }

        // Don't restart the same animation
        if (this.currentAnimation === animName) return;

        try {
            // If we have a current action, fade it out
            if (this.currentAction) {
                this.currentAction.fadeOut(0.2);
            }

            // Reset and play the new action
            action.reset();
            action.fadeIn(0.2);
            action.play();

            console.log(`Successfully playing animation '${animName}'`);

            // Update current animation and action
            this.currentAnimation = animName;
            this.currentAction = action;
        } catch (err) {
            console.error(`Error playing enemy animation '${animName}':`, err);
        }
    }

    strafeAroundTarget(targetPos) {
        if (!this.body || !this.mesh) return;

        // Calculate direction to target
        const dirToTarget = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Create perpendicular vector for strafing
        const strafeDir = new THREE.Vector3(-dirToTarget.z, 0, dirToTarget.x);

        // Randomly reverse direction sometimes
        if (Math.random() < 0.01) {
            strafeDir.multiplyScalar(-1);
        }

        // Log strafing info
        console.log(`Enemy strafing around target: dir=(${strafeDir.x.toFixed(2)}, ${strafeDir.z.toFixed(2)})`);

        // Get current velocity to preserve Y component
        const velocity = this.body.getLinearVelocity();
        const currentVelY = velocity.y();

        // Use a fixed speed for consistency
        const STRAFE_SPEED = 8;

        // Set velocity directly
        const newVelocity = new Ammo.btVector3(
            strafeDir.x * STRAFE_SPEED,
            currentVelY,
            strafeDir.z * STRAFE_SPEED
        );

        // Apply the velocity and activate the body
        this.body.setLinearVelocity(newVelocity);
        this.body.activate(true);
        Ammo.destroy(newVelocity);

        // Face the target while strafing
        this.lookAt(targetPos);

        // Play appropriate strafe animation based on direction
        if (strafeDir.x > 0) {
            this.playAnimation('strafeRight');
        } else {
            this.playAnimation('strafeLeft');
        }
    }

    createPhysics() {
        try {
            console.log('Creating enemy physics');

            // Create physics body for enemy with same approach as player
            const shape = new Ammo.btCapsuleShape(0.5, 1);
            const transform = new Ammo.btTransform();
            transform.setIdentity();

            // Position the physics body directly above the mesh
            const posX = this.mesh ? this.mesh.position.x : this.position.x;
            const posY = this.mesh ? this.mesh.position.y : 0; // Default to ground level
            const posZ = this.mesh ? this.mesh.position.z : this.position.z;

            // Set the origin for the physics body with the +1.0 Y offset from mesh
            transform.setOrigin(new Ammo.btVector3(posX, posY + 1.0, posZ));

            // Detailed logging for debugging physics body creation
            console.log(`Enemy physics creation details:`);
            console.log(`- Original position: x=${this.position.x.toFixed(2)}, y=${this.position.y.toFixed(2)}, z=${this.position.z.toFixed(2)}`);
            console.log(`- Mesh position: x=${posX.toFixed(2)}, y=${posY.toFixed(2)}, z=${posZ.toFixed(2)}`);
            console.log(`- Physics body position: x=${posX.toFixed(2)}, y=${(posY + 1.0).toFixed(2)}, z=${posZ.toFixed(2)}`);

            const mass = 1;
            const localInertia = new Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(mass, localInertia);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );

            this.body = new Ammo.btRigidBody(rbInfo);

            // CRITICAL: Reduce friction and damping even more to ensure smooth movement
            this.body.setFriction(0.05);       // Reduced from 0.1
            this.body.setRestitution(0.2);
            this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0)); // No rotation
            this.body.setDamping(0.0, 0.0);    // No damping
            this.body.setFlags(this.body.getFlags() | 2); // CF_CHARACTER_OBJECT flag

            // Apply initial downward impulse to help it settle
            const initialForce = new Ammo.btVector3(0, -100, 0);
            this.body.applyCentralImpulse(initialForce);
            Ammo.destroy(initialForce);

            // Ensure the body starts active
            this.body.activate(true);

            // Initialize canJump as false until ground check is successful
            this.canJump = false;

            // Add the body to physics world
            this.physicsWorld.addRigidBody(this.body);

            console.log(`Enemy physics body created successfully`);

            // Clean up Ammo.js objects
            Ammo.destroy(rbInfo);
            Ammo.destroy(localInertia);

            // Apply a larger initial force in a random direction to start movement immediately
            setTimeout(() => {
                if (this.body) {
                    const angle = Math.random() * Math.PI * 2;
                    const startImpulse = new Ammo.btVector3(
                        Math.cos(angle) * 30, // Increased from 10 to 30
                        0,
                        Math.sin(angle) * 30  // Increased from 10 to 30
                    );
                    this.body.applyCentralImpulse(startImpulse);
                    Ammo.destroy(startImpulse);
                    console.log(`Applied initial impulse to start enemy movement`);
                }
            }, 500);
        } catch (err) {
            console.error('Error creating enemy physics:', err);
        }
    }

    createHealthBar() {
        // Create a health bar element
        const healthBarContainer = document.createElement('div');
        healthBarContainer.className = 'enemy-health-bar-container';
        healthBarContainer.style.position = 'absolute';
        healthBarContainer.style.width = '40px';
        healthBarContainer.style.height = '5px';
        healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthBarContainer.style.borderRadius = '2px';
        healthBarContainer.style.overflow = 'hidden';
        healthBarContainer.style.zIndex = '999';
        healthBarContainer.style.pointerEvents = 'none'; // Don't block mouse events

        const healthBarFill = document.createElement('div');
        healthBarFill.className = 'enemy-health-bar-fill';
        healthBarFill.style.width = '100%';
        healthBarFill.style.height = '100%';
        healthBarFill.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
        healthBarFill.style.transition = 'width 0.2s ease-in-out';

        healthBarContainer.appendChild(healthBarFill);
        document.body.appendChild(healthBarContainer);

        this.healthBar = {
            container: healthBarContainer,
            fill: healthBarFill
        };

        // Update health bar with initial health
        this.updateHealthBar();
    }

    updateHealthBar() {
        if (!this.healthBar) return;

        // Update fill width based on current health percentage
        const healthPercent = (this.health / this.maxHealth) * 100;
        this.healthBar.fill.style.width = `${healthPercent}%`;

        // Position the health bar above the enemy
        if (this.mesh) {
            const meshPosition = new THREE.Vector3();
            this.mesh.getWorldPosition(meshPosition);

            // Project to screen space
            const vector = meshPosition.clone();
            vector.y += 2.5; // Position above the enemy's head

            // Convert to screen coordinates
            if (window.game && window.game.scene && window.game.scene.camera) {
                vector.project(window.game.scene.camera);

                // Convert to pixel coordinates
                const widthHalf = window.innerWidth / 2;
                const heightHalf = window.innerHeight / 2;
                const x = (vector.x * widthHalf) + widthHalf;
                const y = -(vector.y * heightHalf) + heightHalf;

                // Position the health bar
                this.healthBar.container.style.left = `${x - 20}px`; // Center the 40px bar
                this.healthBar.container.style.top = `${y - 10}px`;

                // Only show health bar if enemy is in front of camera and not at full health
                if (vector.z > 1 || this.health >= this.maxHealth) {
                    this.healthBar.container.style.display = 'none';
                } else {
                    this.healthBar.container.style.display = 'block';
                }
            }
        }
    }

    update(deltaTime) {
        if (!this.mesh || !this.body) {
            return;
        }

        try {
            // Skip updates if enemy is dead (but still process fade-out effect)
            if (this.isDead) {
                // Continue fade-out if we've started it
                if (this.fadingOut && this.mesh) {
                    this.fadeOutTimer += deltaTime;

                    // Calculate opacity - linear fade over 2 seconds
                    const fadeProgress = Math.min(this.fadeOutTimer / 2, 1.0);
                    const opacity = 1.0 - fadeProgress;

                    // Apply fade to all materials
                    this.mesh.traverse((child) => {
                        if (child.isMesh && child.material) {
                            // Handle materials array or single material
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => {
                                    if (mat.opacity !== undefined) {
                                        mat.opacity = opacity;
                                    }
                                });
                            } else if (child.material.opacity !== undefined) {
                                child.material.opacity = opacity;
                            }
                        }
                    });

                    // When the fade is complete, remove the enemy
                    if (fadeProgress >= 1.0) {
                        this.remove();
                    }
                }
                return;
            }

            // Update animation mixer
            if (this.mixer) {
                this.mixer.update(deltaTime);
            }

            // Update physics position to follow the mesh
            if (this.body) {
                const ms = this.body.getMotionState();
                if (ms) {
                    const transform = new Ammo.btTransform();
                    ms.getWorldTransform(transform);
                    const origin = transform.getOrigin();

                    // Update mesh position from physics
                    this.mesh.position.set(origin.x(), origin.y() - 1.0, origin.z());
                }
            }

            // Check if we should update AI
            const currentTime = Date.now();
            const timeSinceLastUpdate = currentTime - this.lastAIUpdate;

            if (timeSinceLastUpdate >= this.aiUpdateInterval) {
                this.updateAI(timeSinceLastUpdate / 1000); // Convert to seconds
                this.lastAIUpdate = currentTime;
            }

            // Always update the health bar position
            this.updateHealthBar();

            // Handle strafing movement
            if (this.isStrafing && this.strafeDirection && this.currentTarget) {
                const speed = deltaTime * 3; // 3 units per second

                // Get perpendicular direction to target
                const toTarget = new THREE.Vector3(
                    this.currentTarget.x - this.mesh.position.x,
                    0,
                    this.currentTarget.z - this.mesh.position.z
                ).normalize();

                // Get perpendicular direction (right vector)
                const perpendicular = new THREE.Vector3(
                    -toTarget.z,
                    0,
                    toTarget.x
                );

                // Scale by direction (-1 left, 1 right)
                perpendicular.multiplyScalar(this.strafeDirection * speed);

                // Apply movement
                this.mesh.position.add(perpendicular);

                // Update physics body to match
                const transform = new Ammo.btTransform();
                transform.setIdentity();
                transform.setOrigin(new Ammo.btVector3(
                    this.mesh.position.x,
                    this.mesh.position.y + 1.0, // Physics body is offset
                    this.mesh.position.z
                ));

                this.body.setWorldTransform(transform);
                this.body.activate();
            }
        } catch (err) {
            console.error("Error updating enemy:", err);
        }
    }

    updateAI(deltaTime) {
        try {
            // Skip AI if enemy is dead
            if (this.isDead) return;

            // Never run AI if we don't have a mesh yet
            if (!this.mesh) return;

            const currentTime = Date.now();
            const game = window.game;

            // Skip if game isn't available
            if (!game) return;

            // Function to handle target acquisition
            const findBestTarget = () => {
                let closestTargetDistance = Infinity;
                let closestTargetPosition = null;
                let foundTarget = false;

                // Always check local player first
                if (game.player && !game.player.isDead) {
                    const playerPos = game.player.getPosition();
                    const playerVector = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
                    const distanceToPlayer = this.mesh.position.distanceTo(playerVector);

                    if (distanceToPlayer < this.detectionRange) {
                        closestTargetDistance = distanceToPlayer;
                        closestTargetPosition = playerVector;
                        // Remember this target for persistence
                        this.lastTarget = { id: 'local' };
                        this.lastTargetTime = currentTime;
                        foundTarget = true;
                    }
                }

                // Check remote players in multiplayer mode
                if (game.isMultiplayer && game.remotePlayers) {
                    for (const id in game.remotePlayers) {
                        const remotePlayer = game.remotePlayers[id];
                        if (remotePlayer && !remotePlayer.isDead) {
                            const remotePos = remotePlayer.getPosition();
                            const remoteVector = new THREE.Vector3(remotePos.x, remotePos.y, remotePos.z);
                            const distanceToRemote = this.mesh.position.distanceTo(remoteVector);

                            if (distanceToRemote < this.detectionRange && distanceToRemote < closestTargetDistance) {
                                closestTargetDistance = distanceToRemote;
                                closestTargetPosition = remoteVector;
                                // Remember this target for persistence
                                this.lastTarget = { id: id };
                                this.lastTargetTime = currentTime;
                                foundTarget = true;
                            }
                        }
                    }
                }

                return {
                    position: closestTargetPosition,
                    distance: closestTargetDistance,
                    found: foundTarget
                };
            };

            // Find the best target
            const targetInfo = findBestTarget();

            // If we have a target, engage it
            if (targetInfo.found && targetInfo.position) {
                // Set current target position
                this.currentTarget = targetInfo.position;

                // Enemy is within attack range of target
                if (targetInfo.distance < this.attackRange) {
                    // Play attack animation and handle attack logic
                    if (currentTime - this.lastAttackTime > this.attackCooldown) {
                        this.attack(targetInfo.position);
                        this.lastAttackTime = currentTime;
                    }

                    // Look at target while attacking
                    this.lookAt(targetInfo.position);
                }
                // Enemy is within movement range but outside attack range
                else if (targetInfo.distance < this.detectionRange) {
                    // Decide if we should strafe
                    if (Math.random() < 0.01) {
                        // 50% chance to strafe left or right
                        this.isStrafing = true;
                        this.strafeDirection = Math.random() < 0.5 ? -1 : 1;
                        this.playAnimation('walkForward'); // Use walk animation for strafing

                        // Stop strafing after a random time (1-3 seconds)
                        setTimeout(() => {
                            this.isStrafing = false;
                        }, 1000 + Math.random() * 2000);
                    } else {
                        this.isStrafing = false;
                    }

                    // Move toward the target
                    if (!this.isStrafing) {
                        this.moveTowardWithForce(targetInfo.position, this.movementSpeed);
                        this.playAnimation('walkForward');
                    }

                    // Always look at target
                    this.lookAt(targetInfo.position);
                }
            }
            // No target found, patrol randomly
            else {
                // Check if we should stop pursuing the last target
                const targetPersistenceTime = 3000; // Continue pursuing last target for 3 seconds
                if (this.lastTarget && currentTime - this.lastTargetTime < targetPersistenceTime) {
                    // Try to find the last target again
                    let lastTargetPosition = null;

                    if (this.lastTarget.id === 'local' && game.player && !game.player.isDead) {
                        lastTargetPosition = game.player.getPosition();
                    } else if (game.isMultiplayer && game.remotePlayers && game.remotePlayers[this.lastTarget.id]) {
                        const remotePlayer = game.remotePlayers[this.lastTarget.id];
                        if (!remotePlayer.isDead) {
                            lastTargetPosition = remotePlayer.getPosition();
                        }
                    }

                    if (lastTargetPosition) {
                        // Move toward last known position
                        this.moveTowardWithForce(lastTargetPosition, this.movementSpeed);
                        this.playAnimation('walkForward');
                        this.lookAt(lastTargetPosition);
                        return;
                    }
                }

                // Random patrol behavior
                if (!this.patrolTarget || this.mesh.position.distanceTo(this.patrolTarget) < 2 || Math.random() < 0.01) {
                    this.setRandomPatrolTarget();
                }

                if (this.patrolTarget) {
                    // Move toward patrol target
                    this.moveTowardWithForce(this.patrolTarget, this.patrolSpeed);

                    // Use walk animation during patrol
                    this.playAnimation('walkForward');

                    // Look toward patrol target
                    this.lookAt(this.patrolTarget);
                }
            }
        } catch (err) {
            console.error("Error in enemy AI update:", err);
        }
    }

    jump() {
        if (this.isJumping || !this.canJump) {
            console.log('Jump requested but enemy already jumping or not on ground');
            return;
        }

        console.log('Enemy JUMP INITIATED - Playing jump animation');
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
                console.log('Enemy jump velocity set: x=' + currentVelX.toFixed(2) + ', y=10.0, z=' + currentVelZ.toFixed(2));
            }
        }, 50); // Small delay to sync with animation start

        // Get exact animation duration from the clip
        const jumpDuration = this.animations.jump ?
            (this.animations.jump.duration * 1000) : 833; // 0.833 seconds as fallback

        console.log(`Enemy jump animation duration: ${jumpDuration}ms`);

        // Reset jump state after animation completes
        setTimeout(() => {
            this.isJumping = false;
            console.log('Enemy jump state reset - enemy can jump again');
        }, jumpDuration);
    }

    setRandomPatrolTarget() {
        // Set a random patrol target within a reasonable range
        // First make sure the patrolTarget is a valid Vector3
        if (!this.patrolTarget || !(this.patrolTarget instanceof THREE.Vector3)) {
            this.patrolTarget = new THREE.Vector3();
        }

        // Make sure we have a valid mesh position as reference
        const startPos = this.mesh ? this.mesh.position : this.position;

        // Get random angle and distance for patrol
        const angle = Math.random() * Math.PI * 2;
        const distance = 10 + Math.random() * 30; // 10-40 units away

        this.patrolTarget.set(
            startPos.x + Math.cos(angle) * distance,
            startPos.y,
            startPos.z + Math.sin(angle) * distance
        );

        // Ensure the target is within map bounds
        const mapSize = 80;
        const halfMap = mapSize / 2;

        this.patrolTarget.x = Math.max(-halfMap, Math.min(halfMap, this.patrolTarget.x));
        this.patrolTarget.z = Math.max(-halfMap, Math.min(halfMap, this.patrolTarget.z));

        console.log(`New patrol target set: x=${this.patrolTarget.x.toFixed(2)}, y=${this.patrolTarget.y.toFixed(2)}, z=${this.patrolTarget.z.toFixed(2)}`);
    }

    attack(targetPos) {
        if (this.isAttacking) return;

        // Set attacking flag
        this.isAttacking = true;

        // Play attack animation
        this.playAnimation('attack');

        // Calculate direction to target
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Create spawn position in front of enemy
        const spawnOffset = direction.clone().multiplyScalar(1.0);
        spawnOffset.y += 0.5; // Adjust height to match character
        const spawnPos = this.mesh.position.clone().add(spawnOffset);

        // Create multiple projectiles in a spread pattern
        // More aggressive: 1-3 projectiles per attack instead of 1-2
        const projectileCount = 1 + Math.floor(Math.random() * 3);
        const spreadAngle = Math.PI / 14; // Slightly wider spread (previously PI/16)

        for (let i = 0; i < projectileCount; i++) {
            // Calculate spread direction
            let spreadDirection = direction.clone();

            // Apply spread for all projectiles except the center one
            if (projectileCount > 1 && i > 0) {
                // Create a rotation matrix around the Y axis
                const angleOffset = spreadAngle * (i % 2 === 0 ? 1 : -1) * (Math.floor(i / 2) + 0.5);
                const rotationMatrix = new THREE.Matrix4().makeRotationY(angleOffset);

                // Apply rotation to the direction vector
                spreadDirection.applyMatrix4(rotationMatrix);
            }

            // Create projectile with spread direction
            const projectile = new window.game.projectileClass(
                this.scene,
                this.physicsWorld,
                spawnPos.clone(), // Clone to prevent position reference issues
                spreadDirection,
                50 // Speed
            );

            // Add to game's enemy projectiles array
            if (window.game) {
                window.game.enemyProjectiles.push(projectile);
            }
        }

        // Reduce cooldown for a more aggressive attack pattern
        // Create a dynamic cooldown based on the number of projectiles
        // The more projectiles, the longer the cooldown, but still aggressive
        const baseCooldown = 400; // Base cooldown in ms (much faster than before)
        const projectilePenalty = 100; // Additional cooldown per projectile

        // Set a dynamic cooldown between 500ms and 900ms depending on projectile count
        // Previous was fixed at 600ms
        setTimeout(() => {
            this.isAttacking = false;
        }, baseCooldown + (projectileCount * projectilePenalty));
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);

        // Update health bar
        this.updateHealthBar();

        if (this.health <= 0 && !this.isDead) {
            this.die();
            return true;
        }

        return false;
    }

    die() {
        this.isDead = true;

        // Fade out the enemy
        if (this.mesh) {
            // Make all materials transparent
            this.mesh.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.transparent = true;
                        });
                    } else {
                        child.material.transparent = true;
                    }
                }
            });

            // Animate fade out
            const fadeOut = () => {
                let allFaded = true;

                this.mesh.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.opacity > 0) {
                                    mat.opacity -= 0.05;
                                    allFaded = false;
                                }
                            });
                        } else {
                            if (child.material.opacity > 0) {
                                child.material.opacity -= 0.05;
                                allFaded = false;
                            }
                        }
                    }
                });

                if (!allFaded) {
                    setTimeout(fadeOut, 50);
                } else {
                    this.remove();
                }
            };

            fadeOut();
        }

        // Remove health bar
        if (this.healthBarContainer) {
            document.body.removeChild(this.healthBarContainer);
            this.healthBarContainer = null;
        }
    }

    remove() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh = null;
        }

        if (this.healthBarContainer) {
            document.body.removeChild(this.healthBarContainer);
            this.healthBarContainer = null;
        }

        if (this.body) {
            this.physicsWorld.removeRigidBody(this.body);
            this.body = null;
        }
    }

    // Add method to find better tactical position
    findBetterPosition() {
        // Skip if we're attacking
        if (this.isAttacking) return;

        // 30% chance to find cover when health is low
        if (this.health < 40 && Math.random() < 0.3) {
            this.findCover();
            return;
        }

        // 20% chance to flank target
        if (this.patrolTarget && Math.random() < 0.2) {
            this.findFlankingPosition();
            return;
        }

        // Otherwise, just set a new patrol target
        this.setRandomPatrolTarget();
    }

    // Add method to find cover
    findCover() {
        // Look for a position away from the target
        if (!this.patrolTarget) return;

        const targetPos = this.patrolTarget;
        const directionFromTarget = new THREE.Vector3()
            .subVectors(this.mesh.position, targetPos)
            .normalize();

        // Move further away from target to find cover
        const coverDistance = 15 + Math.random() * 10; // 15-25 units away

        this.patrolTarget = new THREE.Vector3(
            this.mesh.position.x + directionFromTarget.x * coverDistance,
            this.mesh.position.y,
            this.mesh.position.z + directionFromTarget.z * coverDistance
        );
    }

    // Add method to find flanking position
    findFlankingPosition() {
        if (!this.patrolTarget) return;

        const targetPos = this.patrolTarget;

        // Calculate a position to the side of the target
        const dirToTarget = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Create a perpendicular vector (rotate 90 degrees)
        const flankDir = new THREE.Vector3(-dirToTarget.z, 0, dirToTarget.x);

        // Randomly choose left or right flank
        if (Math.random() < 0.5) {
            flankDir.multiplyScalar(-1);
        }

        // Set flanking distance
        const flankDist = 8 + Math.random() * 7; // 8-15 units to the side

        // Calculate flanking position
        this.patrolTarget = new THREE.Vector3(
            targetPos.x + flankDir.x * flankDist,
            this.mesh.position.y,
            targetPos.z + flankDir.z * flankDist
        );
    }

    // Add a proper getPosition method to the Enemy class
    getPosition() {
        if (!this.mesh) {
            return new THREE.Vector3();
        }
        return this.mesh.position.clone();
    }

    // Add the missing setRotation method to fix the error
    setRotation(yRotation) {
        if (!this.mesh) return;

        // For the model, we only want to set the Y rotation
        if (this.modelLoaded) {
            // Set the rotation directly
            this.mesh.rotation.y = yRotation;
        } else {
            // For the temp mesh, we can set the full rotation
            const currentRotation = this.mesh.rotation.clone();
            this.mesh.rotation.set(currentRotation.x, yRotation, currentRotation.z);
        }
    }

    // Also add a lookAt method for easier targeting
    lookAt(position) {
        if (!this.mesh) return;

        // Calculate direction to target
        const direction = new THREE.Vector3()
            .subVectors(position, this.mesh.position)
            .normalize();

        // Only rotate on Y axis (keep enemy upright)
        direction.y = 0;

        if (direction.length() > 0.1) {
            // Calculate the angle to face the target
            const targetRotation = Math.atan2(direction.x, direction.z);
            this.setRotation(targetRotation);
        }
    }

    // Simplify the moveTowardWithForce method to guarantee movement
    moveTowardWithForce(targetPosition, speed) {
        if (!this.body || !this.mesh) {
            console.log('moveTowardWithForce: Missing body or mesh');
            return;
        }

        // Calculate direction vector
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.mesh.position)
            .normalize();

        // Log the target and current position 
        if (Math.random() < 0.1) {
            console.log(`Moving toward target: current=(${this.mesh.position.x.toFixed(2)}, ${this.mesh.position.z.toFixed(2)}), target=(${targetPosition.x.toFixed(2)}, ${targetPosition.z.toFixed(2)})`);
        }

        // Look at the target
        this.lookAt(targetPosition);

        // Use a fixed speed value to guarantee movement
        const FIXED_SPEED = 10;

        // Get current velocity to preserve Y component
        const velocity = this.body.getLinearVelocity();
        const currentVelY = velocity.y();

        // Create velocity vector with explicit values to ensure movement
        const newVelocity = new Ammo.btVector3(
            direction.x * FIXED_SPEED,
            currentVelY,
            direction.z * FIXED_SPEED
        );

        // Log velocity info (occasionally)
        if (Math.random() < 0.05) {
            console.log(`Setting enemy velocity: x=${(direction.x * FIXED_SPEED).toFixed(2)}, z=${(direction.z * FIXED_SPEED).toFixed(2)}`);
        }

        // Directly set the velocity
        this.body.setLinearVelocity(newVelocity);
        this.body.activate(true); // Ensure the body is active
        Ammo.destroy(newVelocity);

        // Simply play walkForward animation while moving
        this.playAnimation('walkForward');
    }

    // Add ground contact check similar to player
    checkGroundContact() {
        if (!this.body) return false;

        try {
            // Check if Ammo is defined
            if (typeof Ammo === 'undefined') {
                console.error('Ammo is not defined in checkGroundContact');
                return false;
            }

            // Make sure the body has getWorldTransform
            if (typeof this.body.getWorldTransform !== 'function') {
                console.error('Enemy body missing getWorldTransform method');
                return false;
            }

            // Cast a ray downward from the enemy's position to check for ground
            const transform = this.body.getWorldTransform();
            if (!transform) {
                console.error('Invalid transform in checkGroundContact');
                return false;
            }

            const origin = transform.getOrigin();
            if (!origin || typeof origin.x !== 'function') {
                console.error('Invalid origin in checkGroundContact');
                return false;
            }

            // CRITICAL: Start ray at physics body position but with adjusted offset to account for model offset
            // Start ray at the base of the capsule shape (0.5 units down from center)
            // And ensure we're checking far enough (8.0 units) to detect ground reliably
            const rayStart = new Ammo.btVector3(origin.x(), origin.y() - 0.5, origin.z());
            const rayEnd = new Ammo.btVector3(origin.x(), origin.y() - 8.0, origin.z());

            const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);

            if (!this.physicsWorld || typeof this.physicsWorld.rayTest !== 'function') {
                console.error('Invalid physicsWorld or missing rayTest method');
                Ammo.destroy(rayStart);
                Ammo.destroy(rayEnd);
                Ammo.destroy(rayCallback);
                return false;
            }

            this.physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

            // If the ray hit something, the enemy is on the ground
            const wasOnGround = this.canJump;
            this.canJump = rayCallback.hasHit();

            // More frequent logging for debugging (every ~50 frames instead of ~500)
            if (Math.random() < 0.02) {
                const distanceToGround = rayCallback.hasHit() ?
                    origin.y() - rayCallback.get_m_hitPointWorld().y() :
                    "more than 8.0 units";

                console.log(`Enemy ground check details:`);
                console.log(`- Physics Y: ${origin.y().toFixed(2)}, Mesh Y: ${this.mesh.position.y.toFixed(2)}`);
                console.log(`- Ground status: ${this.canJump ? 'ON GROUND' : 'IN AIR'}`);
                console.log(`- Distance to ground: ${typeof distanceToGround === 'number' ? distanceToGround.toFixed(2) : distanceToGround}`);
            }

            // Log when ground state changes
            if (wasOnGround !== this.canJump) {
                const stateChange = this.canJump ? 'LANDED ON GROUND' : 'LEFT GROUND';
                console.log(`Enemy ground contact changed: ${stateChange} at y=${this.mesh.position.y.toFixed(2)}`);
            }

            // Clean up Ammo.js objects to prevent memory leaks
            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);

            return this.canJump;
        } catch (err) {
            console.error('Error in checkGroundContact:', err);
            return false;
        }
    }
}