import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { GameScene } from './rendering/Scene.js';
import { InputHandler } from './controls/InputHandler.js';
import { Player } from './entities/Player.js';
import { Ground } from './entities/Ground.js';
import { Projectile } from './entities/Projectile.js';
import { Enemy } from './entities/Enemy.js';
import { log, error } from './debug.js';

export class Game {
    constructor() {
        log('Game constructor called');
        this.physics = new PhysicsWorld();
        this.scene = new GameScene();
        this.input = new InputHandler();
        this.player = null;
        this.ground = null;
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.enemies = [];
        this.previousTime = 0;
        this.moveForce = 20;
        this.maxVelocity = 25;
        this.jumpForce = 10;
        this.canJump = true;
        this.lastJumpTime = 0;
        this.bhopWindow = 300;

        // Store projectile class for enemies to use
        this.projectileClass = Projectile;

        // Make game instance globally available for enemies
        window.game = this;

        // Initialize crosshair
        this.initCrosshair();

        // Initialize UI
        this.initUI();
    }

    initUI() {
        // Create health display
        const healthContainer = document.createElement('div');
        healthContainer.id = 'health-container';
        healthContainer.style.position = 'fixed';
        healthContainer.style.bottom = '20px';
        healthContainer.style.left = '20px';
        healthContainer.style.width = '200px';
        healthContainer.style.height = '30px';
        healthContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthContainer.style.border = '2px solid white';
        healthContainer.style.borderRadius = '5px';

        const healthBar = document.createElement('div');
        healthBar.id = 'health-bar';
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
        healthBar.style.transition = 'width 0.3s, background-color 0.3s';

        const healthText = document.createElement('div');
        healthText.id = 'health-text';
        healthText.style.position = 'absolute';
        healthText.style.top = '50%';
        healthText.style.left = '50%';
        healthText.style.transform = 'translate(-50%, -50%)';
        healthText.style.color = 'white';
        healthText.style.fontFamily = 'Arial, sans-serif';
        healthText.style.fontWeight = 'bold';
        healthText.style.textShadow = '1px 1px 2px black';
        healthText.textContent = '100 HP';

        healthContainer.appendChild(healthBar);
        healthContainer.appendChild(healthText);
        document.body.appendChild(healthContainer);
    }

    async init() {
        try {
            log('Initializing game systems');

            // Initialize systems
            log('Initializing scene');
            this.scene.init();
            log('Scene initialized');

            log('Initializing physics');
            this.physics.init();
            log('Physics initialized');

            log('Initializing input');
            this.input.init();
            log('Input initialized');

            // Create game objects
            log('Creating ground');
            this.ground = new Ground(this.scene.scene, this.physics.physicsWorld);
            this.ground.create();
            log('Ground created');

            // Add environment elements
            log('Adding environment elements');
            this.addEnvironmentElements();
            log('Environment elements added');

            log('Creating player');
            this.player = new Player(this.scene.scene, this.physics.physicsWorld, { x: 0, y: 5, z: 0 });
            this.physics.registerRigidBody(this.player.mesh, this.player.body);
            log('Player created');

            // Add a timeout to check if the player model loaded
            setTimeout(() => {
                if (this.player && !this.player.modelLoaded) {
                    log('Player model did not load in time, using fallback');
                    // Create a simple fallback mesh
                    const geometry = new THREE.BoxGeometry(1, 2, 1);
                    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
                    const fallbackMesh = new THREE.Mesh(geometry, material);
                    fallbackMesh.position.copy(this.player.getPosition());
                    this.scene.scene.add(fallbackMesh);

                    // Update the player's mesh reference
                    if (this.player.mesh) {
                        this.scene.scene.remove(this.player.mesh);
                    }
                    this.player.mesh = fallbackMesh;
                }
            }, 5000); // Check after 5 seconds

            // Set up input handlers
            log('Setting up input handlers');
            this.setupInputHandlers();
            log('Input handlers set up');

            // Spawn enemies
            this.spawnEnemies(5); // Spawn 5 enemies

            // Start game loop
            log('Starting animation loop');
            this.animate();
            log('Game initialization complete');
        } catch (err) {
            error('Error in Game.init', err);
            throw err;
        }
    }

    setupInputHandlers() {
        // Handle key down events
        this.input.onKeyDown((event) => {
            if (event.key === ' ' && !event.repeat) {
                this.handleJump();
            }

            if (event.key === 'f' && !event.repeat) {
                this.shootProjectile();
            }
        });

        // Handle mouse down events
        this.input.onMouseDown((event) => {
            if (event.button === 0) { // Left mouse button
                this.shootProjectile();
            }
        });
    }

    handleJump() {
        if (!this.player) return;

        const now = Date.now();
        const timeSinceLastJump = now - this.lastJumpTime;

        if (this.isPlayerOnGround()) {
            // Set jump animation
            this.player.setAnimation('jump');

            // Apply jump force
            const jumpImpulse = new Ammo.btVector3(0, this.jumpForce, 0);
            this.player.applyForce(jumpImpulse);
            this.lastJumpTime = now;
            this.canJump = false;

            // Apply a smaller forward boost if moving for bhop
            if (this.player.body) {
                const velocity = this.player.body.getLinearVelocity();
                const horizVelocity = Math.sqrt(velocity.x() * velocity.x() + velocity.z() * velocity.z());
                if (horizVelocity > 5) {
                    const boostImpulse = new Ammo.btVector3(
                        velocity.x() * 0.1,
                        0,
                        velocity.z() * 0.1
                    );
                    this.player.applyForce(boostImpulse);
                }
            }
        } else if (timeSinceLastJump < this.bhopWindow) {
            // Bhop - significantly reduced jump force for subsequent hops
            const jumpImpulse = new Ammo.btVector3(0, this.jumpForce * 0.7, 0);
            this.player.applyForce(jumpImpulse);
            this.lastJumpTime = now;

            // Apply a smaller forward boost
            if (this.player.body) {
                const velocity = this.player.body.getLinearVelocity();
                const boostImpulse = new Ammo.btVector3(
                    velocity.x() * 0.1,
                    0,
                    velocity.z() * 0.1
                );
                this.player.applyForce(boostImpulse);
            }
        }
    }

    isPlayerOnGround() {
        if (!this.player) return false;

        const playerPos = this.player.getPosition();
        const rayStart = new Ammo.btVector3(
            playerPos.x,
            playerPos.y - 0.9,
            playerPos.z
        );
        const rayEnd = new Ammo.btVector3(
            playerPos.x,
            playerPos.y - 1.1,
            playerPos.z
        );

        const rayCallback = this.physics.rayTest(rayStart, rayEnd);
        return rayCallback.hasHit();
    }

    initCrosshair() {
        // Check if crosshair already exists
        let crosshair = document.getElementById('crosshair');

        // If it doesn't exist, create it programmatically
        if (!crosshair) {
            crosshair = document.createElement('div');
            crosshair.id = 'crosshair';

            const verticalLine = document.createElement('div');
            verticalLine.className = 'crosshair-vertical';

            const horizontalLine = document.createElement('div');
            horizontalLine.className = 'crosshair-horizontal';

            crosshair.appendChild(verticalLine);
            crosshair.appendChild(horizontalLine);

            // Apply inline styles to ensure visibility
            crosshair.style.position = 'fixed';
            crosshair.style.top = '50%';
            crosshair.style.left = '50%';
            crosshair.style.transform = 'translate(-50%, -50%)';
            crosshair.style.width = '24px';
            crosshair.style.height = '24px';
            crosshair.style.pointerEvents = 'none';
            crosshair.style.zIndex = '1000';

            verticalLine.style.position = 'absolute';
            verticalLine.style.top = '0';
            verticalLine.style.left = '50%';
            verticalLine.style.width = '2px';
            verticalLine.style.height = '100%';
            verticalLine.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            verticalLine.style.transform = 'translateX(-50%)';
            verticalLine.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.9)';

            horizontalLine.style.position = 'absolute';
            horizontalLine.style.top = '50%';
            horizontalLine.style.left = '0';
            horizontalLine.style.width = '100%';
            horizontalLine.style.height = '2px';
            horizontalLine.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            horizontalLine.style.transform = 'translateY(-50%)';
            horizontalLine.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.9)';

            // Add the center dot
            const style = document.createElement('style');
            style.textContent = `
                #crosshair::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 5px;
                    height: 5px;
                    background-color: rgba(255, 0, 0, 0.9);
                    border-radius: 50%;
                    box-shadow: 0 0 4px rgba(255, 0, 0, 0.7);
                }
            `;
            document.head.appendChild(style);

            document.body.appendChild(crosshair);
        }

        // Make sure the crosshair is visible
        crosshair.style.display = 'block';
    }

    shootProjectile() {
        if (!this.player) return;

        // Get the exact direction from the camera (where the crosshair is pointing)
        const direction = new THREE.Vector3();
        this.scene.camera.getWorldDirection(direction);
        direction.normalize();

        const playerPos = this.player.getPosition();

        // Calculate a weapon position that's offset from the player
        // This simulates the projectile coming from a weapon rather than the player's center
        const weaponOffset = new THREE.Vector3(
            direction.z * 0.5,  // Offset to the right side of the player (perpendicular to direction)
            1.5,                // Shoulder height
            -direction.x * 0.5  // Offset to the right side of the player (perpendicular to direction)
        );

        // Start position is now from this weapon position
        const position = new THREE.Vector3(
            playerPos.x + direction.x * 1.5 + weaponOffset.x,
            playerPos.y + weaponOffset.y,
            playerPos.z + direction.z * 1.5 + weaponOffset.z
        );

        // Create a ray from the camera position through the crosshair
        const raycaster = new THREE.Raycaster();
        raycaster.set(this.scene.camera.position, direction);

        // Calculate the exact direction to the target point
        // This ensures the bullet goes exactly where the crosshair is pointing
        const targetPoint = new THREE.Vector3();
        targetPoint.copy(this.scene.camera.position).add(direction.multiplyScalar(1000));

        const exactDirection = new THREE.Vector3();
        exactDirection.subVectors(targetPoint, position).normalize();

        // Create the projectile with the exact direction
        const projectile = new Projectile(
            this.scene.scene,
            this.physics.physicsWorld,
            position,
            exactDirection
        );

        this.projectiles.push(projectile);
    }

    updateMovement() {
        if (!this.player || !this.player.body) return;

        // Check if any movement keys are pressed
        const isMoving = this.input.isKeyPressed('w') || this.input.isKeyPressed('a') ||
            this.input.isKeyPressed('s') || this.input.isKeyPressed('d') ||
            this.input.isKeyPressed('ArrowUp') || this.input.isKeyPressed('ArrowDown') ||
            this.input.isKeyPressed('ArrowLeft') || this.input.isKeyPressed('ArrowRight');

        // Set animation based on movement state
        if (!isMoving) {
            this.player.setAnimation('idle');
        } else if (this.input.isKeyPressed('shift')) {
            this.player.setAnimation('run');
        } else {
            this.player.setAnimation('walk');
        }

        // Skip if no movement keys are pressed
        if (!isMoving) {
            // Apply a stopping force when no keys are pressed to reduce sliding
            if (this.player.body) {
                const velocity = this.player.body.getLinearVelocity();
                // Only stop horizontal movement, not vertical (jumping/falling)
                if (Math.abs(velocity.x()) > 0.1 || Math.abs(velocity.z()) > 0.1) {
                    const stopForce = new Ammo.btVector3(
                        -velocity.x() * 0.8,
                        0,
                        -velocity.z() * 0.8
                    );
                    this.player.applyForce(stopForce);
                }
            }
            return;
        }

        // First, zero out current velocity for more responsive movement
        if (this.player.body) {
            const velocity = this.player.body.getLinearVelocity();
            // Keep vertical velocity (for jumping/falling) but zero out horizontal
            this.player.body.setLinearVelocity(
                new Ammo.btVector3(0, velocity.y(), 0)
            );
        }

        let force = new Ammo.btVector3(0, 0, 0);
        let impulseStrength = this.moveForce * 1.2; // Increased for more immediate movement

        const cameraDirection = new THREE.Vector3();
        this.scene.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

        if (this.input.isKeyPressed('w') || this.input.isKeyPressed('ArrowUp')) {
            force.setX(force.x() + cameraDirection.x * impulseStrength);
            force.setZ(force.z() + cameraDirection.z * impulseStrength);
        }

        if (this.input.isKeyPressed('s') || this.input.isKeyPressed('ArrowDown')) {
            force.setX(force.x() - cameraDirection.x * impulseStrength);
            force.setZ(force.z() - cameraDirection.z * impulseStrength);
        }

        if (this.input.isKeyPressed('a') || this.input.isKeyPressed('ArrowLeft')) {
            force.setX(force.x() - right.x * impulseStrength);
            force.setZ(force.z() - right.z * impulseStrength);
        }

        if (this.input.isKeyPressed('d') || this.input.isKeyPressed('ArrowRight')) {
            force.setX(force.x() + right.x * impulseStrength);
            force.setZ(force.z() + right.z * impulseStrength);
        }

        if (force.x() !== 0 || force.z() !== 0) {
            this.player.applyForce(force);

            // Cap maximum velocity immediately
            const velocity = this.player.body.getLinearVelocity();
            const speed = Math.sqrt(
                velocity.x() * velocity.x() +
                velocity.z() * velocity.z()
            );

            if (speed > this.maxVelocity) {
                const scale = this.maxVelocity / speed;
                velocity.setX(velocity.x() * scale);
                velocity.setZ(velocity.z() * scale);
                this.player.body.setLinearVelocity(velocity);
            }
        }
    }

    updateProjectiles() {
        // Update and filter out expired projectiles
        this.projectiles = this.projectiles.filter(projectile => projectile.update());
    }

    updateEnemies(deltaTime) {
        // Update all enemies
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime);
        });

        // Check for projectile collisions with enemies
        this.checkProjectileEnemyCollisions();

        // Check for enemy projectile collisions with player
        this.checkEnemyProjectilePlayerCollisions();
    }

    checkProjectileEnemyCollisions() {
        // Simple collision detection between projectiles and enemies
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            if (!projectile.mesh) continue;

            const projectilePos = projectile.mesh.position;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (enemy.isDead || !enemy.mesh) continue;

                const enemyPos = enemy.mesh.position;
                const distance = projectilePos.distanceTo(enemyPos);

                // If projectile is close enough to enemy
                if (distance < 2) {
                    // Enemy takes damage
                    const isDead = enemy.takeDamage(25); // Each hit does 25 damage

                    // Remove projectile
                    projectile.remove();
                    this.projectiles.splice(i, 1);

                    // If enemy died, remove from array
                    if (isDead) {
                        this.enemies.splice(j, 1);
                    }

                    break; // Projectile can only hit one enemy
                }
            }
        }
    }

    checkEnemyProjectilePlayerCollisions() {
        if (!this.player || this.player.isDead) return;

        const playerPos = this.player.getPosition();

        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.enemyProjectiles[i];
            if (!projectile.mesh) continue;

            const projectilePos = projectile.mesh.position;
            const distance = projectilePos.distanceTo(playerPos);

            // If projectile is close enough to player
            if (distance < 2) {
                // Player takes damage
                this.player.takeDamage(10); // Enemy projectiles do less damage

                // Remove projectile
                projectile.remove();
                this.enemyProjectiles.splice(i, 1);
            }
        }
    }

    updateEnemyProjectiles() {
        // Update and filter out expired projectiles
        this.enemyProjectiles = this.enemyProjectiles.filter(projectile => projectile.update());
    }

    update(deltaTime) {
        // Update physics
        this.physics.update(deltaTime);

        // Update movement
        this.updateMovement();

        // Update player
        if (this.player) {
            this.player.update(deltaTime);

            // Update player rotation to face the direction of the camera
            if (this.player.mesh) {
                const cameraDirection = new THREE.Vector3();
                this.scene.camera.getWorldDirection(cameraDirection);
                cameraDirection.y = 0; // Keep player upright
                cameraDirection.normalize();

                if (cameraDirection.length() > 0.1) {
                    const targetRotation = Math.atan2(cameraDirection.x, cameraDirection.z);
                    this.player.setRotation(targetRotation);
                }
            }
        }

        // Update projectiles
        this.updateProjectiles();

        // Update enemy projectiles
        this.updateEnemyProjectiles();

        // Update enemies
        this.updateEnemies(deltaTime);

        // Update camera to follow player
        if (this.player) {
            this.scene.updateCamera(this.player.getPosition());
        }
    }

    animate(currentTime = 0) {
        requestAnimationFrame(this.animate.bind(this));

        const deltaTime = (currentTime - this.previousTime) / 1000;
        this.previousTime = currentTime;

        if (deltaTime > 0) {
            this.update(deltaTime);
        }

        this.scene.render();
    }

    addEnvironmentElements() {
        // Add only decorative elements, no walls
        this.addTrees();
        this.addRocks();
        this.addSkybox();
    }

    addTrees() {
        const treePositions = [
            { x: 20, z: 20 },
            { x: -15, z: 10 },
            { x: 5, z: -20 },
            { x: -25, z: -15 }
        ];

        treePositions.forEach(pos => {
            // Simple tree - trunk and foliage
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.7, 5, 8),
                new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 })
            );
            trunk.position.set(pos.x, 2.5, pos.z);
            trunk.castShadow = true;
            this.scene.scene.add(trunk);

            const foliage = new THREE.Mesh(
                new THREE.ConeGeometry(3, 6, 8),
                new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.7 })
            );
            foliage.position.set(pos.x, 7, pos.z);
            foliage.castShadow = true;
            this.scene.scene.add(foliage);
        });
    }

    addRocks() {
        const rockPositions = [
            { x: 12, z: -8, scale: 1.5 },
            { x: -7, z: 15, scale: 1 },
            { x: 18, z: 5, scale: 0.7 },
            { x: -20, z: -10, scale: 2 }
        ];

        rockPositions.forEach(pos => {
            // Simple rock
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(pos.scale, 1),
                new THREE.MeshStandardMaterial({
                    color: 0x808080,
                    roughness: 0.9,
                    metalness: 0.1
                })
            );
            rock.position.set(pos.x, pos.scale / 2, pos.z);
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.scene.scene.add(rock);
        });
    }

    addSkybox() {
        // Simple skybox
        const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
        const skyboxMaterials = [
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }), // Right
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }), // Left
            new THREE.MeshBasicMaterial({ color: 0x4682B4, side: THREE.BackSide }), // Top
            new THREE.MeshBasicMaterial({ color: 0x8B4513, side: THREE.BackSide }), // Bottom
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }), // Front
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide })  // Back
        ];

        const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterials);
        this.scene.scene.add(skybox);
    }

    spawnEnemies(count) {
        log(`Spawning ${count} enemies`);

        for (let i = 0; i < count; i++) {
            // Create enemy at random position
            const position = new THREE.Vector3(
                (Math.random() - 0.5) * 40, // Random X position
                2, // Fixed height
                (Math.random() - 0.5) * 40  // Random Z position
            );

            const enemy = new Enemy(this.scene.scene, this.physics.physicsWorld, position);
            this.enemies.push(enemy);
        }

        log(`${this.enemies.length} enemies spawned`);
    }
} 