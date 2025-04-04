import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class RemotePlayer extends THREE.Object3D {
    constructor(scene, id, position = { x: 0, y: 0, z: 0 }, color = null) {
        super();

        this.scene = scene;
        this.remoteId = id;
        this.initialPosition = position;
        this.modelLoaded = false;
        this.animations = {};
        this.animationActions = {};
        this.currentAnimation = 'idle';
        this.mixer = null;
        this.currentAction = null;
        this.nameTag = null;
        this.healthBar = null;
        this.isDead = false;
        this.isAttacking = false;
        this.isJumping = false;
        this.health = 100;

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // For position interpolation
        this.targetPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.previousPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.interpolationFactor = 0;

        // Dynamic interpolation settings
        this.BASE_INTERPOLATION_SPEED = 10;
        this.interpolationSpeed = this.BASE_INTERPOLATION_SPEED;
        this.lastUpdateTime = Date.now();
        this.updateInterval = 100; // assume 100ms update interval initially
        this.updateIntervals = []; // store recent update intervals for averaging

        // For rotation interpolation
        this.targetRotation = new THREE.Euler(0, 0, 0);
        this.previousRotation = new THREE.Euler(0, 0, 0);

        // Store the player's assigned color
        this.playerColor = color;

        // Fixed Y-offset to match the physics body height in local player
        this.modelYOffset = 0.0;

        // Load the model immediately
        this.loadModel();

        // Create health bar
        this.createHealthBar();

        log(`Remote player ${id} created at position x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);
    }

    loadModel() {
        try {
            // Create a GLTFLoader
            const loader = new GLTFLoader();

            // Use path from constants file that works in both dev and prod
            const modelPath = ASSET_PATHS.models.player;
            console.log(`Loading remote player model from path: ${modelPath}`);

            loader.load(
                modelPath,
                (gltf) => {
                    console.log(`Remote player model loaded successfully from ${modelPath}!`);

                    // Get the model from the loaded GLTF
                    const model = gltf.scene;

                    // Scale the model appropriately
                    model.scale.set(0.35, 0.35, 0.35);

                    // Set the model's initial position with the Y-offset to fix floating issue
                    const offsetPosition = new THREE.Vector3(
                        this.initialPosition.x,
                        this.initialPosition.y - 1.0, // Apply -1.0 offset to match local player
                        this.initialPosition.z
                    );
                    model.position.copy(offsetPosition);

                    // Rotate the model to face forward
                    model.rotation.set(0, Math.PI, 0);

                    // Ensure all meshes cast shadows
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Apply player color if provided
                            if (this.playerColor && child.material) {
                                // Clone the material to avoid affecting other instances
                                if (Array.isArray(child.material)) {
                                    child.material = child.material.map(m => m.clone());
                                    child.material.forEach(m => {
                                        // Skip eyes
                                        if (!m.name || !m.name.toLowerCase().includes('eye')) {
                                            m.color.setHex(this.playerColor);
                                            m.emissive = new THREE.Color(this.playerColor);
                                            m.emissiveIntensity = 0.2; // Add glow
                                        }
                                    });
                                } else {
                                    child.material = child.material.clone();
                                    // Skip eyes
                                    if (!child.material.name || !child.material.name.toLowerCase().includes('eye')) {
                                        child.material.color.setHex(this.playerColor);
                                        child.material.emissive = new THREE.Color(this.playerColor);
                                        child.material.emissiveIntensity = 0.2; // Add glow
                                    }
                                }
                            }
                        }
                    });

                    // Add the model to this object
                    this.add(model);

                    // Store reference to the model
                    this.model = model;

                    // Add this to the scene
                    this.scene.add(this);
                    this.modelLoaded = true;

                    console.log(`Remote player ${this.remoteId} model added to scene`);

                    // Process any queued position updates
                    if (this.positionQueue.length > 0) {
                        console.log(`Processing ${this.positionQueue.length} queued positions for remote player ${this.remoteId}`);
                        // Use the most recent position
                        const latestPosition = this.positionQueue.pop();
                        this.setPosition(latestPosition);
                        // Clear the queue
                        this.positionQueue = [];
                    }

                    // Set up animations
                    this.setupAnimations(gltf);
                },
                // Progress callback
                (xhr) => {
                    console.log(`Remote player model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`);
                },
                // Error callback
                (error) => {
                    console.error(`Failed to load remote player model: ${error.message}`);
                }
            );
        } catch (err) {
            console.error('Exception while loading remote player model:', err);
        }
    }

    setupAnimations(gltf) {
        if (!gltf.animations || gltf.animations.length === 0) {
            console.log('No animations found in remote player model');
            return;
        }

        console.log(`Setting up ${gltf.animations.length} animations for remote player`);

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.model);

        // Clear existing animations
        this.animations = {};
        this.animationActions = {};

        // Process animations with proper name normalization
        gltf.animations.forEach(anim => {
            // Store with original name
            this.animations[anim.name] = anim;
            this.animationActions[anim.name] = this.mixer.clipAction(anim);

            // Also store with lowercase name for case-insensitive lookup
            const lowerName = anim.name.toLowerCase();
            if (lowerName !== anim.name) {
                this.animations[lowerName] = anim;
                this.animationActions[lowerName] = this.mixer.clipAction(anim);
            }
        });

        // Start idle animation by default
        const idleAnimationNames = ['idle', 'Idle', 'IDLE'];
        for (const name of idleAnimationNames) {
            if (this.animations[name]) {
                this.playAnimation(name);
                console.log(`Started remote player animation: ${name}`);
                break;
            }
        }
    }

    playAnimation(name) {
        // Don't attempt to play animations until mesh and mixer are available
        if (!this.modelLoaded || !this.mixer || !this.model) {
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
                console.warn(`Animation '${name}' not found for remote player`);
                return;
            }
        }

        // Don't restart the same animation unless it's a jump or attack
        if (this.currentAnimation === animName && animName !== 'jump' && animName !== 'attack') return;

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

            console.log(`Remote player ${this.remoteId} playing animation: ${animName}`);
        } catch (err) {
            console.error(`Error playing animation '${animName}' for remote player:`, err);
        }
    }

    setPosition(position) {
        if (!position) {
            console.error('setPosition called with invalid position for remote player:', position);
            return;
        }

        // If model isn't loaded yet, queue the position update
        if (!this.modelLoaded) {
            this.positionQueue.push({ ...position });
            if (this.positionQueue.length > 5) {
                this.positionQueue.shift(); // Keep only the most recent 5 updates
            }
            // Only log queue size changes occasionally
            if (Math.random() < 0.1) {
                console.log(`Remote player ${this.remoteId}: Model not loaded yet, queued position update. Queue size: ${this.positionQueue.length}`);
            }
            return;
        }

        // Define a consistent Y-offset for all player models
        const MODEL_Y_OFFSET = -1.0;

        // Calculate time since last update to adjust interpolation speed
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        // Only update if reasonable time has passed (ignore duplicate/batched updates)
        if (timeSinceLastUpdate > 10) {
            // Track update intervals for averaging (keep last 5)
            this.updateIntervals.push(timeSinceLastUpdate);
            if (this.updateIntervals.length > 5) {
                this.updateIntervals.shift();
            }

            // Calculate average update interval
            if (this.updateIntervals.length > 0) {
                this.updateInterval = this.updateIntervals.reduce((sum, val) => sum + val, 0) / this.updateIntervals.length;

                // Adjust interpolation speed based on update frequency
                // Faster updates -> slower interpolation (smoother movement)
                // Slower updates -> faster interpolation (catch up quicker)
                const idealUpdateRate = 50; // 50ms = 20 updates per second is ideal
                const updateRatio = this.updateInterval / idealUpdateRate;

                // Clamp to reasonable range: between 0.5x and 3x base speed
                this.interpolationSpeed = Math.max(0.5, Math.min(3.0, updateRatio)) * this.BASE_INTERPOLATION_SPEED;
            }
        }

        // Update interpolation targets with y-offset to fix floating model
        this.previousPosition.copy(this.position);
        this.targetPosition.set(
            position.x,
            position.y + MODEL_Y_OFFSET, // Apply offset consistently
            position.z
        );
        this.interpolationFactor = 0;

        // Only log position updates occasionally for debugging
        if (Math.random() < 0.05) {
            console.log(`Remote player ${this.remoteId} target position set: x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}, interpolation speed: ${this.interpolationSpeed.toFixed(2)}`);
        }
    }

    setRotation(rotation) {
        if (!rotation) return;

        if (!this.modelLoaded) return;

        // Handle both number (just Y rotation) and full rotation object
        if (typeof rotation === 'number') {
            this.previousRotation.copy(this.model.rotation);
            this.targetRotation.set(0, rotation, 0);
        } else {
            this.previousRotation.copy(this.model.rotation);
            this.targetRotation.set(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
        }

        this.interpolationFactor = 0;
    }

    getPosition() {
        return {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        };
    }

    getRotation() {
        if (!this.model) return { x: 0, y: 0, z: 0 };

        return {
            x: this.model.rotation.x,
            y: this.model.rotation.y,
            z: this.model.rotation.z
        };
    }

    update(deltaTime) {
        if (!this.modelLoaded) return;

        // Update animation mixer
        if (this.mixer && deltaTime) {
            this.mixer.update(deltaTime);
        }

        // Smooth position interpolation
        if (this.interpolationFactor < 1) {
            this.interpolationFactor += deltaTime * this.interpolationSpeed;
            if (this.interpolationFactor > 1) this.interpolationFactor = 1;

            // Interpolate position
            this.position.lerpVectors(
                this.previousPosition,
                this.targetPosition,
                this.interpolationFactor
            );

            // Interpolate rotation if model exists
            if (this.model) {
                // Interpolate Y rotation (most common case)
                this.model.rotation.y = THREE.MathUtils.lerp(
                    this.previousRotation.y,
                    this.targetRotation.y,
                    this.interpolationFactor
                );

                // Only interpolate X and Z if they're significantly different
                if (Math.abs(this.previousRotation.x - this.targetRotation.x) > 0.01) {
                    this.model.rotation.x = THREE.MathUtils.lerp(
                        this.previousRotation.x,
                        this.targetRotation.x,
                        this.interpolationFactor
                    );
                }

                if (Math.abs(this.previousRotation.z - this.targetRotation.z) > 0.01) {
                    this.model.rotation.z = THREE.MathUtils.lerp(
                        this.previousRotation.z,
                        this.targetRotation.z,
                        this.interpolationFactor
                    );
                }
            }
        }

        // Update nametag position if it exists
        if (this.nameTag) {
            this.updateNameTag();
        }

        // Update health bar position if it exists
        if (this.healthBar) {
            this.updateHealthBar();
        }
    }

    // Update nametag position to follow the player
    updateNameTag() {
        if (!this.nameTag || !this.scene.camera) return;

        try {
            // Convert 3D position to screen coordinates
            const vector = new THREE.Vector3();
            vector.setFromMatrixPosition(this.matrixWorld);

            // Check if player is behind camera
            const cameraDirection = this.scene.camera.getWorldDirection(new THREE.Vector3());
            const playerDirection = new THREE.Vector3().subVectors(vector, this.scene.camera.position).normalize();
            const dotProduct = cameraDirection.dot(playerDirection);

            // Hide tag if player is behind camera (dot product < 0)
            if (dotProduct < 0) {
                this.nameTag.style.display = 'none';
                return;
            }

            // Show tag if player is visible
            this.nameTag.style.display = 'block';

            // Project to screen coordinates
            vector.project(this.scene.camera);

            // Convert to CSS coordinates
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight - 50; // Position above player

            // Update nametag position
            this.nameTag.style.left = `${x - (this.nameTag.offsetWidth / 2)}px`;
            this.nameTag.style.top = `${y}px`;

            // Add distance fade effect - farther players have more transparent tags
            const distance = this.position.distanceTo(this.scene.camera.position);
            const maxDistance = 50; // Maximum distance at which tag is visible
            const opacity = Math.max(0.2, 1 - (distance / maxDistance));

            this.nameTag.style.opacity = opacity.toString();
        } catch (err) {
            console.error('Error updating nametag:', err);
        }
    }

    setAnimation(name) {
        this.playAnimation(name);
    }

    remove() {
        // Remove from scene
        if (this.parent) {
            this.parent.remove(this);
        }

        // Clean up mixer
        if (this.mixer) {
            this.mixer.stopAllAction();
        }

        // Remove health bar if it exists
        if (this.healthBar) {
            if (this.healthBar.container && this.healthBar.container.parentNode) {
                this.healthBar.container.parentNode.removeChild(this.healthBar.container);
            }
            this.healthBar = null;
        }

        // Remove name tag if it exists
        if (this.nameTag && this.nameTag.parentNode) {
            this.nameTag.parentNode.removeChild(this.nameTag);
            this.nameTag = null;
        }

        // Remove model
        if (this.model) {
            // Remove from scene (redundant due to parent removal, but just in case)
            if (this.model.parent) {
                this.model.parent.remove(this.model);
            }

            // Dispose of geometries and materials
            this.model.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();

                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        }

        console.log(`Remote player ${this.remoteId} removed from scene`);
    }

    attack() {
        if (this.isAttacking) return;

        this.isAttacking = true;
        this.playAnimation('attack');

        // Reset attack state after a fixed time
        setTimeout(() => {
            this.isAttacking = false;

            // If we're still in attack animation, switch back to idle
            if (this.currentAnimation === 'attack' && !this.isDead) {
                this.playAnimation('idle');
            }
        }, 800); // Fixed time for attack animation
    }

    takeDamage(amount) {
        if (!this.health) this.health = 100; // Initialize health if it doesn't exist

        this.health = Math.max(0, this.health - amount);

        console.log(`Remote player ${this.remoteId} took ${amount} damage, health: ${this.health}`);

        // Update health bar
        this.updateHealthBar();

        // Add damage indicator
        this.showDamageIndicator();

        if (this.health <= 0 && !this.isDead) {
            this.die();
        }
    }

    die() {
        if (this.isDead) return;

        this.isDead = true;
        console.log(`Remote player ${this.remoteId} died`);

        // Play death animation if available
        this.playAnimation('death');
    }

    respawn(position) {
        this.isDead = false;
        this.health = 100;

        // Update position if provided
        if (position) {
            this.setPosition(position);
        }

        // Reset to idle animation
        this.playAnimation('idle');

        console.log(`Remote player ${this.remoteId} respawned`);
    }

    showDamageIndicator() {
        // Create a floating damage indicator
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.textContent = '!';
        indicator.style.position = 'absolute';
        indicator.style.color = 'red';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontSize = '24px';
        indicator.style.textShadow = '0 0 3px black';
        indicator.style.zIndex = '1000';
        indicator.style.pointerEvents = 'none';

        document.body.appendChild(indicator);

        // Position the indicator over the player
        const updatePosition = () => {
            if (!this.model) {
                indicator.remove();
                return;
            }

            // Convert 3D position to screen coordinates
            const vector = new THREE.Vector3();
            vector.setFromMatrixPosition(this.matrixWorld);

            // Project to screen coordinates
            vector.project(this.scene.camera);

            // Convert to CSS coordinates
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight - 30;

            indicator.style.left = `${x}px`;
            indicator.style.top = `${y}px`;
        };

        // Animate and remove the indicator
        let opacity = 1;
        const animate = () => {
            opacity -= 0.02;
            indicator.style.opacity = opacity;
            updatePosition();

            if (opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                indicator.remove();
            }
        };

        updatePosition();
        animate();
    }

    createHealthBar() {
        // Create a health bar element
        const healthBarContainer = document.createElement('div');
        healthBarContainer.className = 'remote-health-bar-container';
        healthBarContainer.style.position = 'absolute';
        healthBarContainer.style.width = '50px';
        healthBarContainer.style.height = '6px';
        healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthBarContainer.style.borderRadius = '3px';
        healthBarContainer.style.overflow = 'hidden';
        healthBarContainer.style.pointerEvents = 'none';
        healthBarContainer.style.zIndex = '999';

        const healthBarFill = document.createElement('div');
        healthBarFill.className = 'remote-health-bar-fill';
        healthBarFill.style.width = '100%'; // Start at full health
        healthBarFill.style.height = '100%';
        healthBarFill.style.backgroundColor = 'rgba(0, 255, 0, 0.7)'; // Green for full health
        healthBarFill.style.transition = 'width 0.3s ease-in-out, background-color 0.3s ease-in-out';

        healthBarContainer.appendChild(healthBarFill);
        document.body.appendChild(healthBarContainer);

        this.healthBar = {
            container: healthBarContainer,
            fill: healthBarFill
        };

        // Initialize health bar with current health
        this.updateHealthBar();
    }

    updateHealthBar() {
        if (!this.healthBar) return;

        // Update health bar width
        const healthPercent = Math.max(0, Math.min(100, this.health));
        this.healthBar.fill.style.width = `${healthPercent}%`;

        // Change color based on health
        if (healthPercent > 70) {
            this.healthBar.fill.style.backgroundColor = 'rgba(0, 255, 0, 0.7)'; // Green
        } else if (healthPercent > 30) {
            this.healthBar.fill.style.backgroundColor = 'rgba(255, 255, 0, 0.7)'; // Yellow
        } else {
            this.healthBar.fill.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Red
        }

        // Position the health bar above the name tag
        this.updateHealthBarPosition();
    }

    updateHealthBarPosition() {
        if (!this.healthBar || !this.scene.camera) return;

        try {
            // Convert 3D position to screen coordinates
            const vector = new THREE.Vector3();
            vector.setFromMatrixPosition(this.matrixWorld);

            // Check if player is behind camera
            const cameraDirection = this.scene.camera.getWorldDirection(new THREE.Vector3());
            const playerDirection = new THREE.Vector3().subVectors(vector, this.scene.camera.position).normalize();
            const dotProduct = cameraDirection.dot(playerDirection);

            // Hide health bar if player is behind camera or dead
            if (dotProduct < 0 || this.isDead) {
                this.healthBar.container.style.display = 'none';
                return;
            }

            // Only show health bar if not full health
            const healthPercent = Math.max(0, Math.min(100, this.health));
            this.healthBar.container.style.display = healthPercent < 100 ? 'block' : 'none';

            // Project to screen coordinates
            vector.project(this.scene.camera);

            // Convert to CSS coordinates
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight - 65; // Position above nametag

            // Update health bar position
            this.healthBar.container.style.left = `${x - 25}px`; // Center the 50px wide bar
            this.healthBar.container.style.top = `${y}px`;

            // Adjust opacity based on distance like the nametag
            const distance = this.position.distanceTo(this.scene.camera.position);
            const maxDistance = 50;
            const opacity = Math.max(0.2, 1 - (distance / maxDistance));

            this.healthBar.container.style.opacity = opacity.toString();
        } catch (err) {
            console.error('Error updating health bar position:', err);
        }
    }
} 