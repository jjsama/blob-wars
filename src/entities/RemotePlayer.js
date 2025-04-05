import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class RemotePlayer extends THREE.Object3D {
    constructor(scene, id, position = GAME_CONFIG.playerStartPosition, color = null) {
        super();

        this.scene = scene;
        this.remoteId = id;

        // Initialize with the same starting position as local player
        this.position.set(position.x, position.y, position.z);

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

        // Store initial position safely
        this.initialPosition = { ...position };

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // For position interpolation
        this.targetPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.previousPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.interpolationFactor = 0;

        // Dynamic interpolation settings - adjusted for smoother movement
        this.BASE_INTERPOLATION_SPEED = 5; // Reduced from 10 for smoother movement
        this.interpolationSpeed = this.BASE_INTERPOLATION_SPEED;
        this.lastUpdateTime = Date.now();
        this.updateInterval = 100;
        this.updateIntervals = [];

        // For rotation interpolation - reduced sensitivity
        this.targetRotation = new THREE.Euler(0, Math.PI, 0); // Start facing forward like local player
        this.previousRotation = new THREE.Euler(0, Math.PI, 0);
        this.rotationInterpolationSpeed = 8; // Slower rotation interpolation

        // Store the player's assigned color
        this.playerColor = color;

        // Add this to scene immediately
        this.scene.scene.add(this);
        console.log(`Remote player ${id} added to scene at position x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);

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

                    // Ensure the position is up to date before adding the model
                    // Use the most recent position from the queue if available
                    if (this.positionQueue.length > 0) {
                        const latestPos = this.positionQueue[this.positionQueue.length - 1];
                        this.position.set(latestPos.x, latestPos.y, latestPos.z);
                        console.log(`Updated position from queue: ${latestPos.x.toFixed(2)}, ${latestPos.y.toFixed(2)}, ${latestPos.z.toFixed(2)}`);
                    }

                    // Set the model's position relative to parent (no offset needed)
                    model.position.set(0, 0, 0);

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

                    // Mark as loaded
                    this.modelLoaded = true;

                    console.log(`Remote player ${this.remoteId} model added at position x=${this.position.x.toFixed(2)}, y=${this.position.y.toFixed(2)}, z=${this.position.z.toFixed(2)}`);

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

        // Store position for later use
        this.initialPosition = { ...position };

        // If model isn't loaded yet, queue the position update and update the base position
        if (!this.modelLoaded) {
            // Add to queue
            this.positionQueue.push({ ...position });
            if (this.positionQueue.length > 10) {
                this.positionQueue.shift(); // Keep only the most recent 10 updates
            }

            // Update the Object3D position directly
            this.position.set(
                position.x,
                position.y,
                position.z
            );

            // Update the target position for when the model loads
            this.targetPosition.set(
                position.x,
                position.y,
                position.z
            );

            // Copy previous position if not set
            if (this.previousPosition.distanceToSquared(new THREE.Vector3(0, 0, 0)) < 0.001) {
                this.previousPosition.copy(this.targetPosition);
            }

            console.log(`Remote player ${this.remoteId}: Model not loaded yet, base position set to x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);
            return;
        }

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

        // Directly set position for large distances to prevent long interpolation
        const distSq = this.position.distanceToSquared(new THREE.Vector3(position.x, position.y, position.z));
        const TELEPORT_THRESHOLD = 100; // 10 units squared

        if (distSq > TELEPORT_THRESHOLD) {
            // Just teleport for large distances
            console.log(`Remote player ${this.remoteId}: Teleporting due to large distance (${Math.sqrt(distSq).toFixed(2)} units)`);
            this.position.set(
                position.x,
                position.y,
                position.z
            );

            // Update target to match current position to avoid interpolation
            this.previousPosition.copy(this.position);
            this.targetPosition.copy(this.position);
            this.interpolationFactor = 1.0;
            return;
        }

        // Update interpolation targets with y-offset to fix floating model
        this.previousPosition.copy(this.position);
        this.targetPosition.set(
            position.x,
            position.y,
            position.z
        );
        this.interpolationFactor = 0;

        // Log position updates
        console.log(`Remote player ${this.remoteId} position updated: x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);
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
        // Update animation mixer
        if (this.mixer && deltaTime) {
            this.mixer.update(deltaTime);
        }

        // Skip further updates if not fully initialized
        if (!this.modelLoaded) {
            return;
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
                // Interpolate Y rotation with reduced sensitivity
                this.model.rotation.y = THREE.MathUtils.lerp(
                    this.previousRotation.y,
                    this.targetRotation.y,
                    deltaTime * this.rotationInterpolationSpeed
                );

                // Only interpolate X and Z if they're significantly different
                if (Math.abs(this.previousRotation.x - this.targetRotation.x) > 0.01) {
                    this.model.rotation.x = THREE.MathUtils.lerp(
                        this.previousRotation.x,
                        this.targetRotation.x,
                        deltaTime * this.rotationInterpolationSpeed
                    );
                }

                if (Math.abs(this.previousRotation.z - this.targetRotation.z) > 0.01) {
                    this.model.rotation.z = THREE.MathUtils.lerp(
                        this.previousRotation.z,
                        this.targetRotation.z,
                        deltaTime * this.rotationInterpolationSpeed
                    );
                }
            }
        }

        // Update visual elements
        this.updateVisualElements();
    }

    // Split out visual elements update to a separate method
    updateVisualElements() {
        // Update nametag position if it exists
        if (this.nameTag && this.scene.camera) {
            this.updateNameTag();
        }

        // Update health bar position if it exists
        if (this.healthBar) {
            this.updateHealthBar();
        }
    }

    // Update nametag position to follow the player
    updateNameTag() {
        if (!this.nameTag || !this.scene || !this.scene.camera) return;

        try {
            // Get position in world space
            const position = new THREE.Vector3();
            this.getWorldPosition(position);

            // Add height offset to place tag above player's head
            position.y += 2.0;

            // Convert 3D position to screen coordinates
            const screenPosition = position.clone();
            screenPosition.project(this.scene.camera);

            // Check if player is behind camera
            const cameraDirection = this.scene.camera.getWorldDirection(new THREE.Vector3());
            const playerDirection = new THREE.Vector3().subVectors(position, this.scene.camera.position).normalize();
            const dotProduct = cameraDirection.dot(playerDirection);

            // Hide tag if player is behind camera (dot product < 0)
            if (dotProduct < 0) {
                this.nameTag.style.display = 'none';
                return;
            }

            // Show tag if player is visible
            this.nameTag.style.display = 'block';

            // Convert to CSS coordinates
            const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(screenPosition.y * 0.5) + 0.5) * window.innerHeight;

            // Update nametag position
            this.nameTag.style.left = `${x - (this.nameTag.offsetWidth / 2)}px`;
            this.nameTag.style.top = `${y}px`;

            // Add distance fade effect - farther players have more transparent tags
            const distance = position.distanceTo(this.scene.camera.position);
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
        if (!this.healthBar || !this.healthBar.container || !this.scene || !this.scene.camera) return;

        try {
            // Get position in world space
            const position = new THREE.Vector3();
            this.getWorldPosition(position);

            // Add height offset to place bar above player's head but below name tag
            position.y += 1.8;

            // Convert 3D position to screen coordinates
            const screenPosition = position.clone();
            screenPosition.project(this.scene.camera);

            // Check if player is behind camera
            const cameraDirection = this.scene.camera.getWorldDirection(new THREE.Vector3());
            const playerDirection = new THREE.Vector3().subVectors(position, this.scene.camera.position).normalize();
            const dotProduct = cameraDirection.dot(playerDirection);

            // Hide health bar if player is behind camera or dead
            if (dotProduct < 0 || this.isDead) {
                this.healthBar.container.style.display = 'none';
                return;
            }

            // Only show health bar if not full health
            const healthPercent = Math.max(0, Math.min(100, this.health));
            this.healthBar.container.style.display = healthPercent < 100 ? 'block' : 'none';

            // Convert to CSS coordinates
            const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(screenPosition.y * 0.5) + 0.5) * window.innerHeight;

            // Update health bar position (centered horizontally)
            this.healthBar.container.style.left = `${x - 25}px`; // Center the 50px wide bar
            this.healthBar.container.style.top = `${y}px`;

            // Adjust opacity based on distance like the nametag
            const distance = position.distanceTo(this.scene.camera.position);
            const maxDistance = 50;
            const opacity = Math.max(0.2, 1 - (distance / maxDistance));

            this.healthBar.container.style.opacity = opacity.toString();
        } catch (err) {
            console.error('Error updating health bar position:', err);
        }
    }
} 