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

        // Create a temporary mesh first
        this.createTempMesh();

        // Initialize other properties
        this.patrolTarget = new THREE.Vector3();
        this.health = 100;
        this.moveSpeed = 5;
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

        // Load the model with a delay to ensure scene is ready
        setTimeout(() => {
            try {
                this.loadModel();
            } catch (error) {
                console.error("Failed to load enemy model:", error);
            }
        }, 150);
    }

    createTempMesh() {
        try {
            // Create a simple temporary model
            const enemyGroup = new THREE.Group();

            // Body
            const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 8, 16);
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: 0xff0000,
                roughness: 0.7,
                metalness: 0.3
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.castShadow = true;
            body.position.y = 0.5;
            enemyGroup.add(body);

            // Set the position from the stored position
            enemyGroup.position.copy(this.position);

            // Add to scene
            this.scene.add(enemyGroup);
            this.mesh = enemyGroup;

            // Set initial rotation
            this.mesh.rotation.y = Math.random() * Math.PI * 2;
        } catch (err) {
            console.error('Error creating temporary enemy model', err);
        }
    }

    loadModel() {
        // Set a flag to track loading status
        this.isModelLoading = true;

        try {
            // Create a GLTFLoader
            const loader = new GLTFLoader();

            // Load the model - FIXING THE PATH to match the player's model path
            loader.load('/public/models/blobville-player.glb', (gltf) => {
                // Only proceed if we still have a valid mesh
                if (!this.mesh) {
                    console.warn('Enemy mesh was removed before model loaded');
                    return;
                }

                // Store the gltf object
                this.gltf = gltf;

                // Get the model from the loaded GLTF
                const model = gltf.scene;

                // Scale the model appropriately - match player scale
                model.scale.set(0.35, 0.35, 0.35);

                // Apply any material adjustments - make enemies red
                model.traverse((child) => {
                    if (child.isMesh) {
                        // Clone the material to avoid sharing across instances
                        child.material = child.material.clone();

                        // Make enemy red (distinctive from player)
                        child.material.color.set(0xff0000);

                        // Enable shadows
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Replace the temporary mesh with the loaded model
                const oldPosition = this.mesh.position.clone();
                const oldRotation = this.mesh.rotation.clone();

                // Remove the old mesh from the scene
                this.scene.remove(this.mesh);

                // Set the new model as the mesh
                this.mesh = model;

                // Add the new model to the scene
                this.scene.add(this.mesh);

                // Restore position and rotation
                this.mesh.position.copy(oldPosition);
                this.mesh.rotation.copy(oldRotation);

                // Set up animations
                this.setupAnimations(gltf);

                // Flag that the model is loaded
                this.modelLoaded = true;
                this.isModelLoading = false;

                console.log("Enemy model loaded successfully");
            },
                // Progress callback
                (xhr) => {
                    console.log(`Enemy model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
                },
                // Error callback
                (error) => {
                    console.error('Error loading enemy model:', error);
                    this.isModelLoading = false;
                });
        } catch (err) {
            console.error('Exception while loading enemy model:', err);
            this.isModelLoading = false;
        }
    }

    setupAnimations(gltf) {
        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.mesh);

        console.log(`Enemy GLTF contains ${gltf.animations.length} animations:`);
        gltf.animations.forEach((anim, index) => {
            console.log(`Enemy animation ${index}: "${anim.name}" (Duration: ${anim.duration}s)`);
        });

        // DIRECT APPROACH: Map animations by index exactly like the player
        // This is the most reliable method since we know the player's animations work
        const animationNames = [
            'strafeLeft',    // 0
            'attack',        // 1
            'idle',          // 2
            'jump',          // 3
            'strafeRight',   // 4
            'walkBackward',  // 5
            'walkForward'    // 6
        ];

        // Clear any existing animations
        this.animations = {};
        this.animationActions = {};

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
        // Skip if no mixer or we're already playing this animation
        if (!this.mixer || this.currentAnimation === name) {
            return;
        }

        // Get the action for this animation
        const action = this.animationActions[name];

        // If action doesn't exist, log and return
        if (!action) {
            console.warn(`Animation '${name}' not found for enemy`);
            return;
        }

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

        console.log(`Enemy playing animation: ${name}`);
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

        // Apply strafe impulse
        this.body.activate(true);
        const velocity = this.body.getLinearVelocity();
        const currentVel = new Ammo.btVector3(0, velocity.y(), 0);
        this.body.setLinearVelocity(currentVel);
        Ammo.destroy(currentVel);

        const strafeForce = new Ammo.btVector3(
            strafeDir.x * this.moveSpeed * 8,
            0,
            strafeDir.z * this.moveSpeed * 8
        );

        this.body.applyCentralImpulse(strafeForce);
        Ammo.destroy(strafeForce);

        // Face the target while strafing
        this.lookAt(targetPos);

        // Play appropriate strafe animation - simplified
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
            const ms = this.body.getMotionState();
            if (ms) {
                const transform = new Ammo.btTransform();
                ms.getWorldTransform(transform);
                const p = transform.getOrigin();

                // Update mesh position with the offset for the model
                // Use the same offset as the player (-1.0)
                this.mesh.position.set(p.x(), p.y() - 1.0, p.z());
            }

            // Update animation mixer
            if (this.mixer && deltaTime) {
                this.mixer.update(deltaTime);
            }

            // Only update health bar if we have the necessary properties
            if (this.healthBarContainer && this.healthBar && this.mesh) {
                this.updateHealthBar();
            }

            // Check if on ground before attempting to jump
            this.checkGroundContact();

            // Update AI behavior
            this.updateAI(deltaTime);
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

        // Apply jump force
        if (this.body) {
            this.body.activate(true);
            const jumpForce = new Ammo.btVector3(0, 10, 0);
            this.body.applyCentralImpulse(jumpForce);
            Ammo.destroy(jumpForce);
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
        // Face the target
        if (targetPos) {
            this.lookAt(targetPos);
        }

        // Play attack animation
        this.playAnimation('attack');
        this.isAttacking = true;

        // Reset attack state after animation completes
        setTimeout(() => {
            this.isAttacking = false;
        }, 500);

        // Shoot at target
        if (targetPos) {
            this.shootAt(targetPos);
        }
    }

    shootAt(targetPos) {
        if (!window.game) return;

        try {
            // Calculate direction to target with slight randomness
            const direction = new THREE.Vector3()
                .subVectors(targetPos, this.mesh.position)
                .normalize();

            // Add slight randomness to aim
            direction.x += (Math.random() - 0.5) * 0.1;
            direction.y += (Math.random() - 0.5) * 0.1;
            direction.z += (Math.random() - 0.5) * 0.1;
            direction.normalize();

            // Create projectile at position slightly in front of enemy
            const spawnPos = new THREE.Vector3(
                this.mesh.position.x + direction.x * 1.5,
                this.mesh.position.y + 1.5, // Adjust for height
                this.mesh.position.z + direction.z * 1.5
            );

            // Create the projectile
            const projectile = new window.game.projectileClass(
                this.scene,
                this.physicsWorld,
                spawnPos,
                direction,
                this // Set the owner to this enemy
            );

            // Add to game's projectiles
            if (window.game.enemyProjectiles) {
                window.game.enemyProjectiles.push(projectile);
            }
        } catch (err) {
            console.error('Error shooting:', err);
        }
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

    // Improve the moveTowardWithForce method to use the correct animation
    moveTowardWithForce(targetPosition, speed) {
        if (!this.body || !this.mesh) return;

        // Calculate direction vector
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.mesh.position)
            .normalize();

        // Look at the target
        this.lookAt(targetPosition);

        // Apply movement force
        this.body.activate(true);
        const velocity = this.body.getLinearVelocity();
        const currentVel = new Ammo.btVector3(0, velocity.y(), 0);
        this.body.setLinearVelocity(currentVel);
        Ammo.destroy(currentVel);

        const moveForce = new Ammo.btVector3(
            direction.x * speed * 10,
            0,
            direction.z * speed * 10
        );

        this.body.applyCentralImpulse(moveForce);
        Ammo.destroy(moveForce);

        // Always use walkForward for simplicity
        this.playAnimation('walkForward');
    }

    // Add ground contact check similar to player
    checkGroundContact() {
        if (!this.body || !this.physicsWorld) return;

        try {
            // Cast a ray downward from the enemy's position to check for ground
            const origin = this.body.getWorldTransform().getOrigin();
            const rayStart = new Ammo.btVector3(origin.x(), origin.y() - 0.5, origin.z());
            const rayEnd = new Ammo.btVector3(origin.x(), origin.y() - 2.0, origin.z());

            const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);
            this.physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

            // If the ray hit something, the enemy is on the ground
            this.canJump = rayCallback.hasHit();

            // Clean up Ammo.js objects to prevent memory leaks
            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);
        } catch (err) {
            console.error('Error in checkGroundContact', err);
        }
    }
} 