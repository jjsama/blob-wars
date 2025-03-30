import * as THREE from 'three';
import { log, error } from '../debug.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class Enemy {
    constructor(scene, physicsWorld, position = null) {
        // First, check if scene and physicsWorld are valid
        if (!scene || !physicsWorld) {
            console.error("Enemy constructor called with invalid scene or physicsWorld");
            return; // Early return to prevent further errors
        }

        this.scene = scene;
        this.physicsWorld = physicsWorld;
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
        if (!position) {
            position = {
                x: (Math.random() - 0.5) * 40,
                y: GAME_CONFIG.enemySpawnHeight,
                z: (Math.random() - 0.5) * 40
            };
        }

        // IMPORTANT: Store position as a THREE.Vector3
        this.position = new THREE.Vector3(
            position.x || 0,
            position.y || 2,
            position.z || 0
        );

        // Log initial position for debugging
        console.log(`Enemy initialized at position: ${this.position.x}, ${this.position.y}, ${this.position.z}`);

        // Initialize other properties
        this.patrolTarget = new THREE.Vector3();
        this.health = 100;
        this.moveSpeed = 15;
        this.maxVelocity = 18;
        this.jumpForce = 10;
        this.attackRange = 30;
        this.detectionRange = 60;
        this.attackCooldown = 2000;
        this.jumpCooldown = 4000;
        this.lastAttackTime = 0;
        this.lastJumpTime = 0;
        this.teamAwarenessRadius = 15;

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
                    const enemyColor = brightColors[colorIndex];

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
                    this.color = enemyColor;

                    // Log the color used for debugging
                    console.log(`Enemy colored with hex: ${enemyColor.toString(16)}`);

                    // Set the model's position - IMPORTANT: We need to adjust the position to account 
                    // for the offset that will be applied in the update method (-1.0 in Y)
                    // The physics body will be at this.position.y + 1.0, and the mesh will be 
                    // shown at physicsBody.y - 1.0, so we need to set the initial mesh position
                    // at exactly this.position.y
                    model.position.copy(this.position);

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
            console.log(`Enemy animation ${index}: "${anim.name}"`);
        });

        // Process all animations with proper normalization
        gltf.animations.forEach(clip => {
            // Store with original name
            this.animations[clip.name] = clip;
            this.animationActions[clip.name] = this.mixer.clipAction(clip);

            // Also store with lowercase name for case-insensitive lookup
            const lowerName = clip.name.toLowerCase();
            if (lowerName !== clip.name) {
                this.animations[lowerName] = clip;
                this.animationActions[lowerName] = this.mixer.clipAction(clip);
            }
        });

        // Try to play idle animation with different possible names
        const idleAnimationNames = ['idle', 'Idle', 'IDLE'];
        for (const name of idleAnimationNames) {
            if (this.animations[name]) {
                this.playAnimation(name);
                console.log(`Started enemy animation: ${name}`);
                break;
            }
        }
    }

    playAnimation(name) {
        // Don't attempt to play animations until everything is loaded
        if (!this.modelLoaded || !this.mixer || !this.mesh) {
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
                // Only log once per enemy for better performance
                console.warn(`Animation '${name}' not found for enemy. Available: ${Object.keys(this.animations).join(', ')}`);
                return;
            }
        }

        // Don't restart the same animation
        if (this.currentAnimation === animName) return;

        try {
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

        // Set velocity directly instead of applying force
        this.body.activate(true);

        // Get current velocity to preserve Y component
        const velocity = this.body.getLinearVelocity();
        const currentVelY = velocity.y();

        // Set constant velocity directly
        const newVelocity = new Ammo.btVector3(
            strafeDir.x * this.maxVelocity,
            currentVelY,
            strafeDir.z * this.maxVelocity
        );

        this.body.setLinearVelocity(newVelocity);
        Ammo.destroy(newVelocity);

        // Face the target while strafing
        this.lookAt(targetPos);

        // Play appropriate strafe animation
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

            // Position the physics body to match the mesh
            // IMPORTANT: The physics body needs to be offset by +1.0 in Y from the mesh
            // because we'll apply a -1.0 offset when updating the mesh position from physics
            const posX = this.mesh ? this.mesh.position.x : this.position.x;
            const posY = this.mesh ? this.mesh.position.y : this.position.y;
            const posZ = this.mesh ? this.mesh.position.z : this.position.z;

            // Add height offset +1.0 to match the player's logic
            transform.setOrigin(new Ammo.btVector3(posX, posY + 1.0, posZ));

            // Log the actual positions for debugging
            console.log(`Creating enemy physics - Mesh position: ${posX}, ${posY}, ${posZ}`);
            console.log(`Creating enemy physics - Body position: ${posX}, ${posY + 1.0}, ${posZ}`);

            // Use exactly same mass as player (1)
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

            // Prevent enemy from tipping over (same as player)
            this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0));

            // Set linear damping (same as player)
            this.body.setDamping(0.1, 0.1);

            // CRITICAL: Set same flags as player to ensure consistent physics behavior
            this.body.setFlags(this.body.getFlags() | 2); // CF_CHARACTER_OBJECT flag

            // Activate the body
            this.body.activate(true);

            // Initialize canJump as false until ground check is successful
            this.canJump = false;

            // Add the body to physics world
            this.physicsWorld.addRigidBody(this.body);

            console.log(`Enemy physics created successfully`);

            // Clean up Ammo.js objects
            Ammo.destroy(rbInfo);
            Ammo.destroy(localInertia);
        } catch (err) {
            console.error('Error creating enemy physics:', err);
        }
    }

    createHealthBar() {
        // Create a health bar that follows the enemy
        const healthBarContainer = document.createElement('div');
        healthBarContainer.className = 'enemy-health-container';
        healthBarContainer.style.position = 'absolute';
        healthBarContainer.style.width = '60px';
        healthBarContainer.style.height = '8px';
        healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthBarContainer.style.border = '1px solid white';
        healthBarContainer.style.borderRadius = '4px';
        healthBarContainer.style.pointerEvents = 'none';
        healthBarContainer.style.display = 'none'; // Initially hidden

        const healthBar = document.createElement('div');
        healthBar.className = 'enemy-health-bar';
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
        healthBar.style.transition = 'width 0.3s, background-color 0.3s';

        healthBarContainer.appendChild(healthBar);
        document.body.appendChild(healthBarContainer);

        this.healthBarContainer = healthBarContainer;
        this.healthBar = healthBar;
    }

    updateHealthBar() {
        // Comprehensive null check
        if (!this.healthBarContainer || !this.healthBar || !this.mesh) {
            return;
        }

        // Only show health bar if damaged
        if (this.health < 100) {
            this.healthBarContainer.style.display = 'block';

            try {
                // Convert 3D position to screen position
                const vector = new THREE.Vector3();

                // Double-check that mesh and matrixWorld exist
                if (!this.mesh || !this.mesh.matrixWorld) {
                    return;
                }

                vector.setFromMatrixPosition(this.mesh.matrixWorld);

                // Verify game and camera exist
                if (!window.game || !window.game.scene || !window.game.scene.camera) {
                    return;
                }

                // Project to screen coordinates
                vector.project(window.game.scene.camera);

                // Convert to CSS coordinates
                const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight - 50; // Position above enemy

                // Update health bar position
                this.healthBarContainer.style.left = `${x - 30}px`; // Center the bar
                this.healthBarContainer.style.top = `${y}px`;

                // Update health bar width
                this.healthBar.style.width = `${this.health}%`;

                // Update health bar color
                if (this.health > 70) {
                    this.healthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)'; // Green
                } else if (this.health > 30) {
                    this.healthBar.style.backgroundColor = 'rgba(255, 255, 0, 0.7)'; // Yellow
                } else {
                    this.healthBar.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Red
                }
            } catch (error) {
                console.error("Error in updateHealthBar:", error);
            }
        } else if (this.healthBarContainer) {
            this.healthBarContainer.style.display = 'none';
        }
    }

    update(deltaTime) {
        if (this.isDead) return;

        // Don't do anything until both mesh and body are created
        if (!this.mesh || !this.body) return;

        try {
            // Check if Ammo is available before proceeding
            if (typeof Ammo === 'undefined') {
                console.warn("Ammo is not defined in Enemy update");
                return;
            }

            // Update mesh position based on physics body position
            try {
                const ms = this.body.getMotionState();
                if (ms) {
                    const transform = new Ammo.btTransform();
                    ms.getWorldTransform(transform);

                    if (transform) {
                        const p = transform.getOrigin();

                        if (p && typeof p.x === 'function') {
                            // Exactly match player's position update with the -1.0 Y offset
                            const physX = p.x();
                            const physY = p.y();
                            const physZ = p.z();

                            // Update mesh position with consistent offset
                            this.mesh.position.set(physX, physY - 1.0, physZ);

                            // Log position occasionally for debugging
                            if (Math.random() < 0.002) {
                                console.log(`Enemy physics body: x=${physX.toFixed(2)}, y=${physY.toFixed(2)}, z=${physZ.toFixed(2)}`);
                                console.log(`Enemy mesh position: x=${this.mesh.position.x.toFixed(2)}, y=${this.mesh.position.y.toFixed(2)}, z=${this.mesh.position.z.toFixed(2)}`);
                            }
                        }
                    }
                }
            } catch (physicsError) {
                console.error("Physics transform error in enemy update:", physicsError);
            }

            // Always keep the body active
            this.body.activate(true);

            // Check ground contact (update canJump)
            try {
                this.checkGroundContact();
            } catch (groundError) {
                console.error("Ground contact check error:", groundError);
            }

            // Update animation mixer if available
            if (this.mixer && deltaTime) {
                try {
                    this.mixer.update(deltaTime);
                } catch (animError) {
                    console.error("Animation error in enemy update:", animError);
                }
            }

            // Update health bar UI if needed
            if (this.healthBarContainer && this.healthBar) {
                try {
                    this.updateHealthBar();
                } catch (uiError) {
                    console.error("Health bar update error:", uiError);
                }
            }

            // Update AI behavior - this handles movements
            try {
                this.updateAI(deltaTime);
            } catch (aiError) {
                console.error("AI update error:", aiError);
            }
        } catch (error) {
            console.error("Error in enemy update:", error);
        }
    }

    updateAI(deltaTime) {
        if (this.isDead) return;

        // Track if we're moving this frame
        let isMoving = false;

        // Apply gravity if enemy is not on ground
        if (!this.canJump && this.body) {
            const gravity = new Ammo.btVector3(0, -20, 0);
            this.body.applyCentralForce(gravity);
            Ammo.destroy(gravity);
        }

        // Find all potential targets (player and other enemies)
        const targets = [];

        // Add player if available
        if (window.game && window.game.player && !window.game.player.isDead) {
            targets.push(window.game.player);
        }

        // Add other enemies
        if (window.game && window.game.enemies) {
            window.game.enemies.forEach(enemy => {
                if (enemy !== this && !enemy.isDead) {
                    targets.push(enemy);
                }
            });
        }

        // Find the closest target
        let closestTarget = null;
        let closestDistance = Infinity;

        targets.forEach(target => {
            if (!target.getPosition) return;

            const targetPos = target.getPosition();
            const distance = this.mesh.position.distanceTo(targetPos);

            if (distance < closestDistance && distance < this.detectionRange) {
                closestTarget = target;
                closestDistance = distance;
            }
        });

        // If we have a target in range
        if (closestTarget) {
            const targetPos = closestTarget.getPosition();

            // If in attack range, attack and strafe
            if (closestDistance < this.attackRange) {
                // Attack if cooldown has passed
                const now = Date.now();
                if (now - this.lastAttackTime > this.attackCooldown) {
                    this.attack(targetPos);
                    this.lastAttackTime = now;
                }

                // Strafe around target
                this.strafeAroundTarget(targetPos);
                isMoving = true;

                // Occasionally jump to avoid shots - only if on ground
                if (this.canJump && now - this.lastJumpTime > this.jumpCooldown && Math.random() < 0.05) {
                    console.log("Enemy attempting jump during combat");
                    this.jump();
                    this.lastJumpTime = now;
                }
            }
            // If target is in sight but not in attack range, move toward it
            else {
                this.moveTowardWithForce(targetPos, this.moveSpeed);
                isMoving = true;

                // Occasionally jump while moving - only if on ground
                const now = Date.now();
                if (this.canJump && now - this.lastJumpTime > this.jumpCooldown && Math.random() < 0.02) {
                    console.log("Enemy attempting jump while moving to target");
                    this.jump();
                    this.lastJumpTime = now;
                }
            }
        }
        // No target in range, patrol randomly
        else {
            // Check if we need a new patrol target
            if (!this.patrolTarget || this.mesh.position.distanceTo(this.patrolTarget) < 2 || Math.random() < 0.01) {
                this.setRandomPatrolTarget();
            }

            // Move toward patrol target
            this.moveTowardWithForce(this.patrolTarget, this.moveSpeed * 0.7); // Move slower when patrolling
            isMoving = true;
        }

        // Update animation based on movement
        this.updateAnimation(isMoving);
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
        const angle = Math.random() * Math.PI * 2;
        const distance = 10 + Math.random() * 30; // 10-40 units away

        this.patrolTarget.set(
            this.mesh.position.x + Math.cos(angle) * distance,
            this.mesh.position.y,
            this.mesh.position.z + Math.sin(angle) * distance
        );

        // Ensure the target is within map bounds
        const mapSize = 80;
        const halfMap = mapSize / 2;

        this.patrolTarget.x = Math.max(-halfMap, Math.min(halfMap, this.patrolTarget.x));
        this.patrolTarget.z = Math.max(-halfMap, Math.min(halfMap, this.patrolTarget.z));
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

        // Create projectile
        const projectile = new window.game.projectileClass(
            this.scene,
            this.physicsWorld,
            spawnPos,
            direction,
            50 // Speed
        );

        // Add to game's enemy projectiles array
        if (window.game) {
            window.game.enemyProjectiles.push(projectile);
        }

        // Reset attacking flag after animation completes
        setTimeout(() => {
            this.isAttacking = false;
        }, 500);
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

    // Add a method to check for nearby teammates
    checkNearbyTeammates() {
        if (!window.game || !window.game.enemies) return 0;

        const myPosition = this.getPosition();
        let nearbyCount = 0;

        window.game.enemies.forEach(enemy => {
            // Skip self
            if (enemy.id === this.id) return;

            const enemyPosition = enemy.getPosition();
            const distance = myPosition.distanceTo(enemyPosition);

            if (distance < this.teamAwarenessRadius) {
                nearbyCount++;
            }
        });

        return nearbyCount;
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

    // Update the moveToward method to use the lookAt method
    moveToward(targetPosition) {
        if (!this.body || !this.mesh) return;

        // Calculate direction to target
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.mesh.position)
            .normalize();

        // Look at the target
        this.lookAt(targetPosition);

        // Apply movement force
        const moveForce = new Ammo.btVector3(
            direction.x * this.moveSpeed,
            0,
            direction.z * this.moveSpeed
        );

        this.body.activate(true);
        this.body.applyCentralForce(moveForce);
        Ammo.destroy(moveForce);

        // Update animation based on movement direction
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        const dot = direction.dot(forward);

        if (dot > 0.7) {
            this.playAnimation('walkForward');
        } else if (dot < -0.7) {
            this.playAnimation('walkBackward');
        } else {
            const cross = new THREE.Vector3().crossVectors(forward, direction);
            if (cross.y > 0) {
                this.playAnimation('strafeLeft');
            } else {
                this.playAnimation('strafeRight');
            }
        }
    }

    // Improve the updateAnimation method to better handle movement states
    updateAnimation(isMoving) {
        // Don't change animations during attack or jump
        if (this.isAttacking || this.isJumping) return;

        // If not moving, play idle animation
        if (!isMoving) {
            this.playAnimation('idle');
        }
        // Otherwise, animation is handled in the movement methods
    }

    // Update the moveTowardWithForce method to use constant velocity
    moveTowardWithForce(targetPosition, speed) {
        if (!this.body || !this.mesh) return;

        // Calculate direction vector
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.mesh.position)
            .normalize();

        // Look at the target
        this.lookAt(targetPosition);

        // Get the forward direction of the enemy
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);

        // Calculate dot product to determine if moving forward or backward
        const dot = direction.dot(forward);

        // Set velocity directly - use constant speed
        this.body.activate(true);

        // Get current velocity to preserve Y component
        const velocity = this.body.getLinearVelocity();
        const currentVelY = velocity.y();

        // Set constant velocity directly
        const newVelocity = new Ammo.btVector3(
            direction.x * this.maxVelocity,
            currentVelY,
            direction.z * this.maxVelocity
        );

        this.body.setLinearVelocity(newVelocity);
        Ammo.destroy(newVelocity);

        // Play appropriate animation based on movement direction
        if (dot > 0.7) {
            this.playAnimation('walkForward');
        } else if (dot < -0.7) {
            this.playAnimation('walkBackward');
        } else {
            // For strafing, handled in strafeAroundTarget method
            const cross = new THREE.Vector3().crossVectors(forward, direction);
            if (cross.y > 0) {
                this.playAnimation('strafeLeft');
            } else {
                this.playAnimation('strafeRight');
            }
        }
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

            // Use the same ray parameters as the player
            const rayStart = new Ammo.btVector3(origin.x(), origin.y() - 0.5, origin.z());
            const rayEnd = new Ammo.btVector3(origin.x(), origin.y() - 2.0, origin.z());

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

            // Log when ground state changes
            if (wasOnGround !== this.canJump) {
                if (this.canJump) {
                    console.log('Enemy touched ground');
                } else {
                    console.log('Enemy left ground');
                }
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