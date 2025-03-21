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

            log('Enemy model loaded and set up');
        } catch (err) {
            error('Error setting up enemy model', err);
        }
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

        // Update health bar
        this.updateHealthBar();

        // Update AI behavior
        this.updateAI(deltaTime);
    }

    updateAI(deltaTime) {
        // Find potential targets (player and other enemies)
        const player = window.game.player;
        const enemies = window.game.enemies;

        // Check if player is in detection range
        if (player && !player.isDead) {
            const distToPlayer = this.mesh.position.distanceTo(player.getPosition());

            if (distToPlayer < this.detectionRange) {
                this.state = 'chase';
                this.target = player;
            } else if (this.state === 'chase' && this.target === player) {
                // Lost sight of player, go back to patrol
                this.state = 'patrol';
                this.target = null;
            }
        }

        // Execute behavior based on current state
        switch (this.state) {
            case 'patrol':
                this.patrol(deltaTime);
                break;
            case 'chase':
                this.chase(deltaTime);
                break;
            case 'attack':
                this.attack();
                break;
        }
    }

    patrol(deltaTime) {
        // If no patrol target or reached target, set a new one
        if (!this.patrolTarget || this.mesh.position.distanceTo(this.patrolTarget) < 2) {
            this.setNewPatrolTarget();
        }

        // Move towards patrol target
        this.moveTowards(this.patrolTarget, deltaTime);
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
            return;
        }

        const targetPos = this.target.getPosition ? this.target.getPosition() : this.target.position;
        const distToTarget = this.mesh.position.distanceTo(targetPos);

        // If in attack range, switch to attack
        if (distToTarget < this.attackRange) {
            this.state = 'attack';
        } else {
            // Move towards target
            this.moveTowards(targetPos, deltaTime);
        }
    }

    moveTowards(targetPos, deltaTime) {
        // Calculate direction to target
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Apply force in that direction - reduce the force to match player movement
        const force = new Ammo.btVector3(
            direction.x * this.moveSpeed * 0.2, // Reduced by factor of 5
            0,
            direction.z * this.moveSpeed * 0.2  // Reduced by factor of 5
        );

        this.body.activate(true);
        this.body.applyCentralImpulse(force);

        // Cap maximum velocity to prevent zipping around
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
            this.shootAt(targetPos);
            this.lastAttackTime = now;
        }
    }

    shootAt(targetPos) {
        // Create a direction vector from enemy to target
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize();

        // Add some randomness to make it less accurate
        direction.x += (Math.random() - 0.5) * 0.1;
        direction.y += (Math.random() - 0.5) * 0.1;
        direction.z += (Math.random() - 0.5) * 0.1;
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
            this.state = 'chase';
            this.target = window.game.player;
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
} 