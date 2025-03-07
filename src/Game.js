import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { GameScene } from './rendering/Scene.js';
import { InputHandler } from './controls/InputHandler.js';
import { Player } from './entities/Player.js';
import { Ground } from './entities/Ground.js';
import { Projectile } from './entities/Projectile.js';
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
        this.previousTime = 0;
        this.moveForce = 20;
        this.maxVelocity = 25;
        this.jumpForce = 25;
        this.canJump = true;
        this.lastJumpTime = 0;
        this.bhopWindow = 300;
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

            const jumpImpulse = new Ammo.btVector3(0, this.jumpForce, 0);
            this.player.applyForce(jumpImpulse);
            this.lastJumpTime = now;
            this.canJump = false;

            // Apply a small forward boost if moving for bhop
            if (this.player.body) {
                const velocity = this.player.body.getLinearVelocity();
                const horizVelocity = Math.sqrt(velocity.x() * velocity.x() + velocity.z() * velocity.z());
                if (horizVelocity > 5) {
                    const boostImpulse = new Ammo.btVector3(
                        velocity.x() * 0.2,
                        0,
                        velocity.z() * 0.2
                    );
                    this.player.applyForce(boostImpulse);
                }
            }
        } else if (timeSinceLastJump < this.bhopWindow) {
            // Bhop - slightly reduced jump force for subsequent hops
            const jumpImpulse = new Ammo.btVector3(0, this.jumpForce * 0.9, 0);
            this.player.applyForce(jumpImpulse);
            this.lastJumpTime = now;

            // Apply a small forward boost
            if (this.player.body) {
                const velocity = this.player.body.getLinearVelocity();
                const boostImpulse = new Ammo.btVector3(
                    velocity.x() * 0.15,
                    0,
                    velocity.z() * 0.15
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

    shootProjectile() {
        if (!this.player) return;

        const direction = new THREE.Vector3();
        this.scene.camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();

        const playerPos = this.player.getPosition();
        const position = new THREE.Vector3(
            playerPos.x + direction.x * 1.5,
            playerPos.y + 1.5,
            playerPos.z + direction.z * 1.5
        );

        const projectile = new Projectile(
            this.scene.scene,
            this.physics.physicsWorld,
            position,
            direction
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
        if (!this.input.isKeyPressed('w') && !this.input.isKeyPressed('a') &&
            !this.input.isKeyPressed('s') && !this.input.isKeyPressed('d') &&
            !this.input.isKeyPressed('ArrowUp') && !this.input.isKeyPressed('ArrowDown') &&
            !this.input.isKeyPressed('ArrowLeft') && !this.input.isKeyPressed('ArrowRight')) {
            return;
        }

        let force = new Ammo.btVector3(0, 0, 0);
        let impulseStrength = this.moveForce;

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

            // Cap maximum velocity
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

    update(deltaTime) {
        // Update physics
        this.physics.update(deltaTime);

        // Update movement
        this.updateMovement();

        // Update player
        if (this.player) {
            this.player.update(deltaTime);
        }

        // Update projectiles
        this.updateProjectiles();

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
        // Add some decorative elements
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
} 