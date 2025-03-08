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
        this.moveSpeed = 5;
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
        // Create a temporary enemy mesh (capsule)
        const geometry = new THREE.CapsuleGeometry(1, 2, 4, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xff0000,
            roughness: 0.7,
            metalness: 0.3
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
    }
    
    loadModel() {
        try {
            const loader = new GLTFLoader();
            
            // Load the same soldier model as the player but with red material
            loader.load('./assets/models/soldier.glb', (gltf) => {
                if (this.isDead) return; // Don't load if already dead
                
                const model = gltf.scene;
                
                // Apply red material to indicate enemy
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0xff0000,
                            roughness: 0.7,
                            metalness: 0.3
                        });
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Scale and position the model
                model.scale.set(1.5, 1.5, 1.5);
                model.position.copy(this.mesh.position);
                model.rotation.y = this.mesh.rotation.y;
                
                // Replace the temp mesh with the model
                this.scene.remove(this.mesh);
                this.mesh = model;
                this.scene.add(this.mesh);
                
                this.modelLoaded = true;
                
                log('Enemy model loaded');
            }, undefined, (error) => {
                console.error('Error loading enemy model:', error);
            });
        } catch (err) {
            error('Error in enemy model loading', err);
        }
    }
    
    createPhysics() {
        // Create physics body
        const shape = new Ammo.btCapsuleShape(1, 2);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(
            this.position.x, this.position.y, this.position.z
        ));
        
        const mass = 80;
        const localInertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);
        
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, localInertia
        );
        
        this.body = new Ammo.btRigidBody(rbInfo);
        this.body.setFriction(0.5);
        this.body.setRestitution(0);
        
        // Lock rotation to prevent tipping over
        this.body.setAngularFactor(new Ammo.btVector3(0, 1, 0));
        
        // Add to physics world
        this.physicsWorld.addRigidBody(this.body);
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
                
                // Update mesh position
                if (this.modelLoaded) {
                    this.mesh.position.set(p.x(), p.y(), p.z());
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
        
        // Apply force in that direction
        const force = new Ammo.btVector3(
            direction.x * this.moveSpeed,
            0,
            direction.z * this.moveSpeed
        );
        
        this.body.activate(true);
        this.body.applyCentralImpulse(force);
        
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