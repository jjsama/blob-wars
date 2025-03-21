import * as THREE from 'three';
import { log, error } from '../debug.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Enemy {
    constructor(scene, physicsWorld, position) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position || new THREE.Vector3(
            (Math.random() - 0.5) * 40, // Random X position
            2, // Fixed height
            (Math.random() - 0.5) * 40  // Random Z position
        );
        this.mesh = null;
        this.body = null;
        this.health = 100;
        this.isDead = false;
        this.modelLoaded = false;

        // AI properties
        this.state = 'patrol'; // patrol, chase, attack
        this.patrolTarget = new THREE.Vector3();
        this.patrolRadius = 20;
        this.detectionRange = 30;
        this.attackRange = 15;
        this.moveSpeed = 5; // Reduce this to a more reasonable value
        this.lastAttackTime = 0;
        this.attackCooldown = 2000; // ms
        this.target = null;

        // Animation properties
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
        this.isAttacking = false;
        this.isJumping = false;

        // Add personality traits for more varied behavior
        this.personality = {
            aggression: 0.3 + Math.random() * 0.7, // 0.3-1.0, higher means more aggressive
            caution: Math.random(),                // 0-1, higher means more cautious when low health
            accuracy: 0.5 + Math.random() * 0.5,   // 0.5-1.0, affects shooting accuracy
            mobility: 0.3 + Math.random() * 0.7    // 0.3-1.0, affects movement speed and flanking
        };

        // Adjust properties based on personality
        this.detectionRange = 30 + this.personality.aggression * 10; // 30-40 units
        this.attackRange = 10 + this.personality.aggression * 10;    // 10-20 units
        this.moveSpeed = 5 * this.personality.mobility;              // 1.5-5 units
        this.attackCooldown = 3000 - this.personality.aggression * 1000; // 2000-3000ms

        // Create a temporary mesh first
        this.createTempMesh();

        // Create physics body
        this.createPhysics();

        // Create health bar
        this.createHealthBar();

        // Try to load the model
        setTimeout(() => {
            this.loadModel();
        }, 1000);
    }

    createTempMesh() {
        try {
            log('Creating temporary enemy model');

            // Create a simple temporary model similar to player
            const enemyGroup = new THREE.Group();

            // Body - use same dimensions as player
            const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 8, 16);
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: 0xff3333, // Red color for enemy
                roughness: 0.7,
                metalness: 0.3
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.castShadow = true;
            body.position.y = 0.5;
            enemyGroup.add(body);

            // Head
            const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
            const headMaterial = new THREE.MeshStandardMaterial({
                color: 0xff9999, // Lighter red for head
                roughness: 0.7,
                metalness: 0.2
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 1.3;
            head.castShadow = true;
            enemyGroup.add(head);

            // Set position
            enemyGroup.position.copy(this.position);

            this.mesh = enemyGroup;
            this.scene.add(this.mesh);

            log('Temporary enemy model created');
        } catch (err) {
            error('Error creating temporary enemy mesh', err);

            // Create an absolute fallback - just a box
            const geometry = new THREE.BoxGeometry(1, 2, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.copy(this.position);
            this.scene.add(this.mesh);

            log('Fallback box mesh created for enemy');
        }
    }

    loadModel() {
        try {
            log('Loading blobville enemy model');

            const loader = new GLTFLoader();

            // Use the same model path as the player
            const modelPath = '/public/models/blobville-player.glb';

            log(`Trying to load enemy model from: ${modelPath}`);

            loader.load(
                modelPath,
                (gltf) => {
                    if (this.isDead) return; // Don't load if already dead

                    log('Blobville enemy model loaded successfully!');
                    this.setupModel(gltf);
                },
                (xhr) => {
                    if (xhr.lengthComputable) {
                        const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
                        log(`Loading enemy model: ${percent}%`);
                    }
                },
                (err) => {
                    error(`Failed to load enemy model: ${err.message}`);
                    // Fall back to the temporary mesh
                    log('Using fallback temporary mesh for enemy');
                }
            );
        } catch (err) {
            error('Error in enemy model loading', err);
        }
    }

    setupModel(gltf) {
        try {
            // Set up the model
            const model = gltf.scene;

            // Keep the current position
            if (this.mesh) {
                model.position.copy(this.mesh.position);
                // Adjust the y position to align with the physics capsule
                // This offsets the model down by 1.0 units to match the physics capsule
                model.position.y -= 1.0;
            } else {
                model.position.copy(this.position);
                model.position.y -= 1.0;
            }

            // Rotate the model 180 degrees to face forward instead of backward
            model.rotation.set(0, Math.PI, 0);

            // Apply red material to indicate enemy
            model.traverse((child) => {
                if (child.isMesh) {
                    // Create a red material to distinguish enemies
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xff0000,
                        roughness: 0.7,
                        metalness: 0.3
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Scale down the model to match player size
            model.scale.set(0.35, 0.35, 0.35);

            // Remove the temporary mesh
            if (this.mesh) {
                this.scene.remove(this.mesh);
            }

            this.mesh = model;
            this.scene.add(this.mesh);
            this.modelLoaded = true;

            // Set up animations
            this.setupAnimations(gltf.animations);

            log('Enemy model loaded and set up');
        } catch (err) {
            error('Error setting up enemy model', err);
        }
    }

    setupAnimations(animations) {
        if (!animations || animations.length === 0) {
            log('No animations found for enemy, creating fake animations');
            this.createFakeAnimations();
            return;
        }

        log(`Found ${animations.length} animations for enemy`);

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.mesh);

        // Log all animation names
        animations.forEach((clip, index) => {
            log(`Enemy animation ${index}: ${clip.name}`);
        });

        // Map animations to our animation types
        animations.forEach(clip => {
            switch (clip.name) {
                case 'idle': this.animations.idle = clip; break;
                case 'walkForward': this.animations.walkForward = clip; break;
                case 'walkBackward': this.animations.walkBackward = clip; break;
                case 'strafeLeft': this.animations.strafeLeft = clip; break;
                case 'strafeRight': this.animations.strafeRight = clip; break;
                case 'jump': this.animations.jump = clip; break;
                case 'attack': this.animations.attack = clip; break;
            }
        });

        // If strafeLeft is missing, use strafeRight and reverse it
        if (!this.animations.strafeLeft && this.animations.strafeRight) {
            log('Creating enemy strafeLeft from strafeRight');
            const strafeRightClip = this.animations.strafeRight;

            // Clone the strafeRight animation and reverse it
            const strafeLeftClip = THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(strafeRightClip));
            strafeLeftClip.name = 'strafeLeft';

            // Reverse the animation by negating the values
            strafeLeftClip.tracks.forEach(track => {
                if (track.name.includes('position.x') || track.name.includes('quaternion')) {
                    for (let i = 0; i < track.values.length; i++) {
                        track.values[i] = -track.values[i];
                    }
                }
            });

            this.animations.strafeLeft = strafeLeftClip;
        }

        // If we don't have all animations, use the first one as a fallback
        if (!this.animations.idle && animations.length > 0) {
            this.animations.idle = animations[0];
            log('Using first animation as enemy idle');
        }

        // Start with idle animation
        if (this.animations.idle) {
            this.playAnimation('idle');
        }
    }

    createFakeAnimations() {
        log('Creating fake animations for enemy blob model');

        // Create a simple up/down bobbing animation for idle
        const times = [0, 0.5, 1];

        // Create tracks for different animations
        const idleTrack = new THREE.KeyframeTrack(
            '.position[y]',
            times,
            [0, 0.1, 0] // Slight up and down movement
        );

        const walkTrack = new THREE.KeyframeTrack(
            '.position[y]',
            times,
            [0, 0.2, 0] // More pronounced movement
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

    playAnimation(name) {
        if (!this.mixer) {
            return;
        }

        if (!this.animations[name]) {
            // Try to fall back to idle
            if (name !== 'idle' && this.animations.idle) {
                this.playAnimation('idle');
            }
            return;
        }

        // Don't restart the same animation
        if (this.currentAnimation === name) return;

        // For attack and jump animations, we want to make sure they complete
        const isOneShot = (name === 'attack' || name === 'jump');

        // Stop any current animation with appropriate crossfade
        if (this.currentAction) {
            const fadeTime = isOneShot ? 0.1 : 0.2; // Faster transition for one-shot animations
            this.currentAction.fadeOut(fadeTime);
        }

        // Start new animation
        const action = this.mixer.clipAction(this.animations[name]);
        action.reset();

        const fadeInTime = isOneShot ? 0.1 : 0.2; // Faster transition for one-shot animations
        action.fadeIn(fadeInTime);

        // For attack and jump animations, set them to play once and then return to idle
        if (isOneShot) {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true; // Keep the last frame when finished
        }

        action.play();
        this.currentAction = action;
        this.currentAnimation = name;
    }

    createPhysics() {
        try {
            log('Creating enemy physics');

            // Create physics body with same dimensions as player (0.5, 1)
            const shape = new Ammo.btCapsuleShape(0.5, 1);
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(
                this.position.x, this.position.y, this.position.z
            ));

            const mass = 1; // Same mass as player
            const localInertia = new Ammo.btVector3(0, 0, 0);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );

            this.body = new Ammo.btRigidBody(rbInfo);
            this.body.setFriction(0.5);
            this.body.setRestitution(0.2);

            // Prevent enemy from tipping over
            this.body.setAngularFactor(new Ammo.btVector3(0, 1, 0));

            this.physicsWorld.addRigidBody(this.body);

            log('Enemy physics created');
        } catch (err) {
            error('Error creating enemy physics', err);
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
        if (!this.healthBarContainer || !this.healthBar || !this.mesh) return;

        // Only show health bar if damaged
        if (this.health < 100) {
            this.healthBarContainer.style.display = 'block';

            // Convert 3D position to screen position
            const vector = new THREE.Vector3();
            vector.setFromMatrixPosition(this.mesh.matrixWorld);

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
        } else {
            this.healthBarContainer.style.display = 'none';
        }
    }

    update(deltaTime) {
        if (this.isDead) return;

        // Update mesh position based on physics
        if (this.body && this.mesh) {
            const ms = this.body.getMotionState();
            if (ms) {
                const transform = new Ammo.btTransform();
                ms.getWorldTransform(transform);
                const p = transform.getOrigin();

                // Update mesh position with the offset for the model
                if (this.modelLoaded) {
                    this.mesh.position.set(p.x(), p.y() - 1.0, p.z());
                } else {
                    this.mesh.position.set(p.x(), p.y(), p.z());
                }
            }
        }

        // Update animation mixer
        if (this.mixer && deltaTime) {
            this.mixer.update(deltaTime);
        }

        // Update health bar
        this.updateHealthBar();

        // Update AI behavior
        this.updateAI(deltaTime);
    }

    updateAI(deltaTime) {
        // Skip AI updates if dead
        if (this.isDead) return;

        // Find potential targets (player and other enemies)
        const player = window.game.player;
        const enemies = window.game.enemies;

        // Track if we're moving this frame
        let isMoving = false;

        // Determine the best target based on proximity, health, and threat level
        let bestTarget = null;
        let bestTargetScore = -1;
        let bestTargetDist = Infinity;

        // Consider player as a target
        if (player && !player.isDead) {
            const distToPlayer = this.mesh.position.distanceTo(player.getPosition());

            if (distToPlayer < this.detectionRange) {
                // Score based on distance (closer is better) and player health (lower is better)
                const playerScore = (this.detectionRange - distToPlayer) * 2 + (100 - player.health);

                if (playerScore > bestTargetScore) {
                    bestTargetScore = playerScore;
                    bestTarget = player;
                    bestTargetDist = distToPlayer;
                }
            }
        }

        // Consider other enemies as targets
        if (enemies && enemies.length > 1) {
            for (const enemy of enemies) {
                // Don't target self or dead enemies
                if (enemy === this || enemy.isDead) continue;

                const distToEnemy = this.mesh.position.distanceTo(enemy.mesh.position);

                if (distToEnemy < this.detectionRange) {
                    // Score based on distance and enemy health
                    // We prioritize weaker enemies that are closer
                    const enemyScore = (this.detectionRange - distToEnemy) + (100 - enemy.health) * 0.8;

                    // Slightly prefer player over bots with equal scores
                    if (enemyScore > bestTargetScore - 10) {
                        bestTargetScore = enemyScore;
                        bestTarget = enemy;
                        bestTargetDist = distToEnemy;
                    }
                }
            }
        }

        // Update target based on best option
        if (bestTarget) {
            this.target = bestTarget;

            // If target is in attack range, attack
            if (bestTargetDist < this.attackRange) {
                this.state = 'attack';
            } else {
                // Otherwise chase
                this.state = 'chase';
            }
        } else if (this.target) {
            // Lost sight of target, go back to patrol
            this.state = 'patrol';
            this.target = null;
        }

        // Execute behavior based on current state
        switch (this.state) {
            case 'patrol':
                isMoving = this.patrol(deltaTime);
                break;
            case 'chase':
                isMoving = this.chase(deltaTime);
                break;
            case 'attack':
                this.attack();
                isMoving = false; // Not moving while attacking
                break;
        }

        // Update animation based on movement
        if (!this.isAttacking) {
            if (isMoving) {
                this.playAnimation('walkForward');
            } else {
                this.playAnimation('idle');
            }
        }

        // Occasionally look for cover or better position
        if (Math.random() < 0.01) { // 1% chance per frame to reconsider position
            this.findBetterPosition();
        }
    }

    patrol(deltaTime) {
        // If no patrol target or reached target, set a new one
        if (!this.patrolTarget || this.mesh.position.distanceTo(this.patrolTarget) < 2) {
            this.setNewPatrolTarget();
            return false; // Not moving at the moment of setting new target
        } else {
            // Move towards patrol target
            this.moveTowards(this.patrolTarget, deltaTime);
            return true; // Moving
        }
    }

    setNewPatrolTarget() {
        // Set a random point within patrol radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.patrolRadius;

        this.patrolTarget = new THREE.Vector3(
            this.mesh.position.x + Math.cos(angle) * distance,
            this.mesh.position.y,
            this.mesh.position.z + Math.sin(angle) * distance
        );
    }

    chase(deltaTime) {
        if (!this.target) {
            this.state = 'patrol';
            return false;
        }

        const targetPos = this.target.getPosition ? this.target.getPosition() : this.target.position;
        const distToTarget = this.mesh.position.distanceTo(targetPos);

        // If in attack range, switch to attack
        if (distToTarget < this.attackRange) {
            this.state = 'attack';
            return false;
        } else {
            // Move towards target
            this.moveTowards(targetPos, deltaTime);
            return true; // Moving
        }
    }

    moveTowards(targetPos, deltaTime) {
        // Calculate direction to target
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Apply force in that direction
        const force = new Ammo.btVector3(
            direction.x * this.moveSpeed * 0.2,
            0,
            direction.z * this.moveSpeed * 0.2
        );

        this.body.activate(true);
        this.body.applyCentralImpulse(force);

        // Cap maximum velocity
        const velocity = this.body.getLinearVelocity();
        const speed = Math.sqrt(
            velocity.x() * velocity.x() +
            velocity.z() * velocity.z()
        );

        // Cap maximum speed to 10 units/second
        if (speed > 10) {
            const scale = 10 / speed;
            velocity.setX(velocity.x() * scale);
            velocity.setZ(velocity.z() * scale);
            this.body.setLinearVelocity(velocity);
        }

        // Rotate to face direction of movement
        if (direction.length() > 0.1) {
            const targetRotation = Math.atan2(direction.x, direction.z);
            this.setRotation(targetRotation);
        }

        // Don't play animation here - it's handled in updateAI
    }

    setRotation(yRotation) {
        if (this.mesh) {
            if (this.modelLoaded) {
                // Smooth rotation for model
                const currentRotation = this.mesh.rotation.y;
                const rotationDiff = yRotation - currentRotation;

                // Normalize the difference to be between -PI and PI
                let normalizedDiff = rotationDiff;
                while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
                while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

                // Apply a smooth rotation (interpolate)
                this.mesh.rotation.y += normalizedDiff * 0.1;
            } else {
                // Direct rotation for temp mesh
                this.mesh.rotation.y = yRotation;
            }
        }
    }

    attack() {
        if (!this.target) {
            this.state = 'patrol';
            return;
        }

        const targetPos = this.target.getPosition ? this.target.getPosition() : this.target.position;
        const distToTarget = this.mesh.position.distanceTo(targetPos);

        // If target moved out of attack range, chase again
        if (distToTarget > this.attackRange) {
            this.state = 'chase';
            return;
        }

        // Face the target
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        if (direction.length() > 0.1) {
            const targetRotation = Math.atan2(direction.x, direction.z);
            this.setRotation(targetRotation);
        }

        // Attack on cooldown
        const now = Date.now();
        if (now - this.lastAttackTime > this.attackCooldown) {
            this.performAttack(targetPos);
            this.lastAttackTime = now;
        }
        // Don't play idle animation here - it's handled in updateAI
    }

    performAttack(targetPos) {
        // Set attacking flag
        this.isAttacking = true;

        // Play attack animation
        this.playAnimation('attack');

        // Shoot at target
        this.shootAt(targetPos);

        // Reset attack state after animation completes
        setTimeout(() => {
            this.isAttacking = false;

            // If we're still in attack animation, switch back to idle
            if (this.currentAnimation === 'attack') {
                this.playAnimation('idle');
            }
        }, 800); // Fixed time for attack animation
    }

    shootAt(targetPos) {
        // Create a direction vector from enemy to target
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Add randomness based on inverse of accuracy (less accurate = more random)
        const inaccuracy = 0.2 * (1 - this.personality.accuracy);
        direction.x += (Math.random() - 0.5) * inaccuracy;
        direction.y += (Math.random() - 0.5) * inaccuracy;
        direction.z += (Math.random() - 0.5) * inaccuracy;
        direction.normalize();

        // Create projectile position (from "weapon")
        const weaponOffset = new THREE.Vector3(
            direction.z * 0.5,
            1.5,
            -direction.x * 0.5
        );

        const position = new THREE.Vector3(
            this.mesh.position.x + direction.x * 1.5 + weaponOffset.x,
            this.mesh.position.y + weaponOffset.y,
            this.mesh.position.z + direction.z * 1.5 + weaponOffset.z
        );

        // Create projectile
        const projectile = new window.game.projectileClass(
            this.scene,
            this.physicsWorld,
            position,
            direction
        );

        // Add to game's projectiles
        window.game.enemyProjectiles.push(projectile);
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);

        // Update health bar
        this.updateHealthBar();

        // If damaged and not already chasing, start chasing the player
        if (this.state !== 'chase' && this.health < 100) {
            // If health is low and we're cautious, consider finding cover
            if (this.health < 30 && Math.random() < this.personality.caution) {
                this.findCover();
            } else {
                this.state = 'chase';
                this.target = window.game.player;
            }
        }

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
        if (this.state === 'attack' || this.isAttacking) return;

        // 30% chance to find cover when health is low
        if (this.health < 40 && Math.random() < 0.3) {
            this.findCover();
            return;
        }

        // 20% chance to flank target
        if (this.target && Math.random() < 0.2) {
            this.findFlankingPosition();
            return;
        }

        // Otherwise, just set a new patrol target
        if (this.state === 'patrol') {
            this.setNewPatrolTarget();
        }
    }

    // Add method to find cover
    findCover() {
        // Look for a position away from the target
        if (!this.target) return;

        const targetPos = this.target.getPosition ? this.target.getPosition() : this.target.position;
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

        this.state = 'patrol';
    }

    // Add method to find flanking position
    findFlankingPosition() {
        if (!this.target) return;

        const targetPos = this.target.getPosition ? this.target.getPosition() : this.target.position;

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

        this.state = 'patrol';
    }
} 