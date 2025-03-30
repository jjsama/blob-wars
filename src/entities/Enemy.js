import * as THREE from 'three';
import { log, error } from '../debug.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Enemy {
    constructor(scene, physicsWorld, position = null) {
        // First, check if scene and physicsWorld are valid
        if (!scene || !physicsWorld) {
            console.error("Enemy constructor called with invalid scene or physicsWorld");
            return; // Early return to prevent further errors
        }

        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.mesh = null; // Ensure mesh is initialized as null
        this.body = null; // Ensure body is initialized as null
        this.isDead = false;
        this.isAttacking = false;
        this.isJumping = false;
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
                y: 2,
                z: (Math.random() - 0.5) * 40
            };
        }

        // IMPORTANT: Create a proper THREE.Vector3 position object
        this.position = new THREE.Vector3(
            position.x || 0,
            position.y || 2,
            position.z || 0
        );

        // Log for debugging
        console.log(`Enemy initialized at position: ${this.position.x}, ${this.position.y}, ${this.position.z}`);

        // Add a flag to track initialization status
        this.isInitialized = false;

        // Initialize other properties
        this.patrolTarget = new THREE.Vector3();
        this.health = 100;

        // Reduce movement speed for better gameplay
        this.moveSpeed = 15; // Reduced from 20
        this.maxVelocity = 18; // Reduced from 25
        this.jumpForce = 10; // Keep jump force the same

        // More balanced combat parameters
        this.attackRange = 30;
        this.detectionRange = 60;
        this.attackCooldown = 2000;
        this.jumpCooldown = 4000;
        this.lastAttackTime = 0;
        this.lastJumpTime = 0;
        this.teamAwarenessRadius = 15;

        // Create physics with slight delay to ensure mesh is ready
        setTimeout(() => {
            try {
                this.createPhysics();
            } catch (error) {
                console.error("Failed to create physics:", error);
            }
        }, 50);

        // Create health bar with delay to ensure document is ready
        setTimeout(() => {
            try {
                this.createHealthBar();
            } catch (error) {
                console.error("Failed to create health bar:", error);
            }
        }, 100);

        // Load the model IMMEDIATELY
        this.loadModel();
    }

    loadModel() {
        // Set a flag to track loading status
        this.isModelLoading = true;

        try {
            // Create a GLTFLoader
            const loader = new GLTFLoader();

            // Try multiple paths to handle both development and production builds
            const modelPaths = [
                '/models/blobville-player.glb',  // Standard path
                '/public/models/blobville-player.glb',  // With public prefix
                '/dist/models/blobville-player.glb',  // From dist
                '/dist/models/models/blobville-player.glb'  // Nested models folder
            ];

            let pathIndex = 0;

            const tryLoadModel = (index) => {
                if (index >= modelPaths.length) {
                    console.error('Failed to load enemy model after trying all paths');
                    this.isModelLoading = false;
                    return;
                }

                const modelPath = modelPaths[index];
                console.log(`Trying to load enemy model from: ${modelPath}`);

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

                        // Set the model's position
                        model.position.copy(this.position);

                        // Rotate the model to face forward
                        model.rotation.set(0, Math.PI, 0);

                        // Set the new model as the mesh
                        this.mesh = model;

                        // Add the new model to the scene
                        this.scene.add(this.mesh);
                        this.modelLoaded = true;
                        this.isModelLoading = false;

                        // Set up animations
                        this.setupAnimations(gltf);

                        console.log("Enemy model loaded successfully");
                    },
                    // Progress callback
                    (xhr) => {
                        console.log(`Enemy model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
                    },
                    // Error callback
                    (error) => {
                        console.error(`Failed to load enemy model from ${modelPath}: ${error.message}`);
                        // Try next path
                        tryLoadModel(index + 1);
                    }
                );
            };

            // Start trying paths
            tryLoadModel(pathIndex);
        } catch (err) {
            console.error('Exception while loading enemy model:', err);
            this.isModelLoading = false;
        }
    }

    setupAnimations(gltf) {
        if (!gltf.animations || gltf.animations.length === 0) {
            console.log('No animations found in enemy model');
            return;
        }

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.mesh);

        console.log(`Enemy GLTF contains ${gltf.animations.length} animations:`);
        gltf.animations.forEach((anim, index) => {
            console.log(`Enemy animation ${index}: "${anim.name}" (Duration: ${anim.duration}s)`);
        });

        // Clear any existing animations
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

        // Map animations directly by index
        for (let i = 0; i < Math.min(gltf.animations.length, animationNames.length); i++) {
            const name = animationNames[i];
            const clip = gltf.animations[i];

            if (clip) {
                console.log(`Mapping enemy animation ${i}: ${clip.name} -> ${name}`);
                this.animations[name] = clip;
                this.animationActions[name] = this.mixer.clipAction(clip);
            }
        }

        // Start with idle animation
        if (this.animations.idle && this.animationActions.idle) {
            this.animationActions.idle.play();
            this.currentAnimation = 'idle';
            this.currentAction = this.animationActions.idle;
        } else {
            console.warn("No idle animation found for enemy");
        }
    }

    playAnimation(name) {
        // Skip if the model isn't loaded or we don't have a mixer or mesh
        if (!this.modelLoaded || !this.mixer || !this.mesh) {
            // Silently return until everything is ready
            return;
        }

        // Skip if we're already playing this animation
        if (this.currentAnimation === name) {
            return;
        }

        // Get the action for this animation
        const action = this.animationActions[name];

        // If action doesn't exist, silently return
        if (!action) {
            return;
        }

        try {
            // If we were playing a different animation, stop it
            if (this.currentAction) {
                this.currentAction.fadeOut(0.2);
            }

            // Play the new animation
            action.reset();
            action.fadeIn(0.2);
            action.play();

            // Update current animation tracking
            this.currentAction = action;
            this.currentAnimation = name;
        } catch (err) {
            console.error(`Error playing animation ${name}:`, err);
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
            // Create physics shape
            const shape = new Ammo.btCapsuleShape(0.5, 1);

            // Create transform with proper position - adjust Y position to match player
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(
                this.position.x,
                this.position.y + 1.0, // Add offset to match player physics body
                this.position.z
            ));

            // Create motion state
            const motionState = new Ammo.btDefaultMotionState(transform);

            // Set mass and inertia
            const mass = 70;
            const localInertia = new Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(mass, localInertia);

            // Create rigid body
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );
            const body = new Ammo.btRigidBody(rbInfo);

            // Set friction and restitution
            body.setFriction(0.5);
            body.setRestitution(0);

            // Prevent tipping over - lock rotation like player
            body.setAngularFactor(new Ammo.btVector3(0, 0, 0));

            // Set linear damping to prevent excessive sliding
            body.setDamping(0.1, 0.1);

            // Add to physics world
            this.physicsWorld.addRigidBody(body);
            this.body = body;

            // Clean up Ammo.js objects
            Ammo.destroy(rbInfo);
            Ammo.destroy(localInertia);
        } catch (err) {
            console.error('Error creating enemy physics', err);
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
            // Update mesh position based on physics
            // Check if Ammo is available before proceeding
            if (typeof Ammo === 'undefined') {
                console.warn("Ammo is not defined in Enemy update");
                return;
            }

            const ms = this.body.getMotionState();
            if (ms) {
                try {
                    const transform = new Ammo.btTransform();
                    ms.getWorldTransform(transform);

                    // Make sure transform is valid before using it
                    if (transform) {
                        const p = transform.getOrigin();

                        // Safety check for position coordinates
                        if (p && typeof p.x === 'function' && typeof p.y === 'function' && typeof p.z === 'function') {
                            // Update mesh position with the offset for the model
                            // Use the same offset as the player (-1.0)
                            this.mesh.position.set(p.x(), p.y() - 1.0, p.z());
                        }
                    }
                } catch (physicsError) {
                    console.error("Physics transform error in enemy update:", physicsError);
                }
            }

            // Update animation mixer
            if (this.mixer && deltaTime) {
                try {
                    this.mixer.update(deltaTime);
                } catch (animError) {
                    console.error("Animation error in enemy update:", animError);
                }
            }

            // Only update health bar if we have the necessary properties
            if (this.healthBarContainer && this.healthBar && this.mesh) {
                try {
                    this.updateHealthBar();
                } catch (uiError) {
                    console.error("Health bar update error:", uiError);
                }
            }

            // Check if on ground before attempting to jump
            try {
                this.checkGroundContact();
            } catch (groundError) {
                console.error("Ground contact check error:", groundError);
            }

            // Update AI behavior
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

        // Find all potential targets (player and other enemies)
        const targets = [];

        // Add player if available (no special priority)
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

        // Find the closest target - no player preference
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
        if (this.isJumping || !this.canJump) return;

        this.isJumping = true;
        this.playAnimation('jump');

        // Set jump velocity directly instead of applying force
        if (this.body) {
            this.body.activate(true);

            // Get current velocity to preserve horizontal components
            const velocity = this.body.getLinearVelocity();
            const currentVelX = velocity.x();
            const currentVelZ = velocity.z();

            // Set velocity directly for jumping
            const jumpVelocity = new Ammo.btVector3(
                currentVelX,
                10.0, // Upward velocity for jump
                currentVelZ
            );

            this.body.setLinearVelocity(jumpVelocity);
            Ammo.destroy(jumpVelocity);
        }

        // Reset jump state after animation completes
        const jumpDuration = this.animations.jump ?
            (this.animations.jump.duration * 1000) : 833;

        setTimeout(() => {
            this.isJumping = false;
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
        try {
            // Check if we have a valid physics body and mesh
            if (!this.body || !this.mesh) return false;

            // Get the current position
            const transform = this.body.getWorldTransform();
            const origin = transform.getOrigin();
            const position = new THREE.Vector3(origin.x(), origin.y(), origin.z());

            // Create a ray cast from slightly above current position downward
            const raySource = new Ammo.btVector3(position.x, position.y - 0.05, position.z);
            const rayTarget = new Ammo.btVector3(position.x, position.y - 1.1, position.z);
            const rayCallback = new Ammo.ClosestRayResultCallback(raySource, rayTarget);

            // Perform the raycast
            this.physicsWorld.rayTest(raySource, rayTarget, rayCallback);

            // Clean up Ammo.js objects
            Ammo.destroy(raySource);
            Ammo.destroy(rayTarget);

            // Check if the ray hit something
            const hasContact = rayCallback.hasHit();
            Ammo.destroy(rayCallback);

            return hasContact;
        } catch (err) {
            console.error('Error in checkGroundContact', err);
        }
    }
} 