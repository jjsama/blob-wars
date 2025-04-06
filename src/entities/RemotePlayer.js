import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class RemotePlayer extends THREE.Object3D {
    constructor(scene, id, position = GAME_CONFIG.playerStartPosition, color = null) {
        super();

        this.scene = scene;
        this.remoteId = id;

        // Initialize with the provided position, adjusting Y for proper alignment
        this.position.set(position.x, position.y, position.z); // Remove the +1.0 offset here

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

        // Store initial position
        this.initialPosition = new THREE.Vector3(position.x, position.y, position.z);

        // For position interpolation
        this.targetPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.previousPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.interpolationFactor = 0;
        this.interpolationSpeed = 5;

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // Store the player's color
        this.playerColor = color;

        // Add to scene
        this.scene.scene.add(this);
        log(`Remote player ${id} added to scene at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);

        // Load model
        this.loadModel();

        // Create health bar
        this.createHealthBar();
    }

    setPosition(position) {
        if (!position) {
            console.warn('RemotePlayer.setPosition: Invalid position provided');
            return;
        }

        // Store position update if model isn't loaded yet
        if (!this.modelLoaded) {
            this.positionQueue.push({
                x: position.x,
                y: position.y,
                z: position.z
            });
            console.log(`RemotePlayer ${this.remoteId}: Model not loaded, queued position update. Queue size: ${this.positionQueue.length}`);
            return;
        }

        // Update the Object3D position
        this.position.set(position.x, position.y, position.z);

        // Update interpolation targets
        this.previousPosition.copy(this.position);
        this.targetPosition.set(position.x, position.y, position.z);
        this.interpolationFactor = 0;

        // Update visual elements
        this.updateVisualElements();
    }

    loadModel() {
        try {
            const loader = new GLTFLoader();
            const modelPath = ASSET_PATHS.models.player;

            loader.load(
                modelPath,
                (gltf) => {
                    // Get the model
                    const model = gltf.scene;

                    // Scale the model
                    model.scale.set(0.35, 0.35, 0.35);

                    // Reset model position relative to parent with proper Y offset
                    model.position.set(0, 0, 0); // Remove the -2 offset, let the parent handle position

                    // Rotate to face forward
                    model.rotation.set(0, Math.PI, 0);

                    // Apply materials and shadows
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Apply player color if provided
                            if (this.playerColor && child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material = child.material.map(m => m.clone());
                                    child.material.forEach(m => {
                                        if (!m.name?.toLowerCase().includes('eye')) {
                                            m.color.setHex(this.playerColor);
                                        }
                                    });
                                } else {
                                    child.material = child.material.clone();
                                    if (!child.material.name?.toLowerCase().includes('eye')) {
                                        child.material.color.setHex(this.playerColor);
                                    }
                                }
                            }
                        }
                    });

                    // Add model
                    this.add(model);
                    this.model = model;
                    this.modelLoaded = true;

                    // Set up animations
                    this.setupAnimations(gltf);

                    // Process any queued position updates
                    if (this.positionQueue.length > 0) {
                        console.log(`RemotePlayer ${this.remoteId}: Processing ${this.positionQueue.length} queued positions`);
                        const latestPosition = this.positionQueue.pop();
                        this.setPosition(latestPosition);
                        this.positionQueue = []; // Clear the queue
                    }

                    log(`Remote player ${this.remoteId} model loaded and positioned`);
                },
                undefined,
                (error) => {
                    error(`Failed to load remote player model: ${error.message}`);
                }
            );
        } catch (err) {
            error('Exception while loading remote player model:', err);
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

    setRotation(rotation) {
        if (!rotation || !this.modelLoaded || !this.model) return;

        // Handle both number (just Y rotation) and full rotation object
        let targetY;
        if (typeof rotation === 'number') {
            targetY = rotation;
        } else {
            targetY = rotation.y || 0;
        }

        // Normalize the target rotation to be between -PI and PI
        while (targetY > Math.PI) targetY -= 2 * Math.PI;
        while (targetY < -Math.PI) targetY += 2 * Math.PI;

        // Calculate the shortest rotation path
        let currentY = this.model.rotation.y;
        while (currentY > Math.PI) currentY -= 2 * Math.PI;
        while (currentY < -Math.PI) currentY += 2 * Math.PI;

        let diff = targetY - currentY;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;

        // Only update rotation if the change is significant
        if (Math.abs(diff) > 0.1) {
            this.previousRotation.y = currentY;
            this.targetRotation.y = currentY + diff;
            this.interpolationFactor = 0;
        }
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
        if (!this.modelLoaded) {
            return;
        }

        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        // Interpolate position
        if (this.interpolationFactor < 1) {
            this.interpolationFactor += deltaTime * this.interpolationSpeed;
            if (this.interpolationFactor > 1) this.interpolationFactor = 1;

            const newPosition = new THREE.Vector3();
            newPosition.lerpVectors(this.previousPosition, this.targetPosition, this.interpolationFactor);
            this.position.copy(newPosition);
        }

        // Update visual elements
        this.updateVisualElements();
    }

    updateVisualElements() {
        if (!this.modelLoaded) {
            return;
        }

        // Update health bar position
        if (this.healthBar) {
            const worldPos = this.getWorldPosition(new THREE.Vector3());
            this.healthBar.position.set(worldPos.x, worldPos.y + 2, worldPos.z);
            this.healthBar.updateHealth(this.health);
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
        this.scene.scene.remove(this);

        // Stop animations
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }

        // Remove UI elements
        if (this.healthBar?.container?.parentNode) {
            this.healthBar.container.parentNode.removeChild(this.healthBar.container);
            this.healthBar = null;
        }

        if (this.nameTag?.parentNode) {
            this.nameTag.parentNode.removeChild(this.nameTag);
            this.nameTag = null;
        }

        // Clean up model resources
        if (this.model) {
            this.model.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else if (child.material) {
                        child.material.dispose();
                    }
                }
            });

            this.remove(this.model);
            this.model = null;
        }

        // Clear references
        this.scene = null;
        this.animations = {};
        this.animationActions = {};

        log(`Remote player ${this.remoteId} removed and cleaned up`);
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

    destroy() {
        // Remove from scene
        if (this.scene && this.scene.scene) {
            this.scene.scene.remove(this);
        }

        // Clean up health bar
        if (this.healthBar) {
            this.healthBar.destroy();
            this.healthBar = null;
        }

        // Clean up animations
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }

        // Clean up model
        if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.model = null;
        }

        // Clear references
        this.scene = null;
        this.animations = null;
        this.animationActions = null;
        this.currentAction = null;
    }
} 