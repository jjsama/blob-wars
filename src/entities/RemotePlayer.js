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
        this.interpolationSpeed = 10; // Increased from 5 to 10 for smoother movement

        // For rotation interpolation
        this.targetRotation = new THREE.Vector3(0, 0, 0);
        this.previousRotation = new THREE.Vector3(0, 0, 0);
        this.rotationInterpolationFactor = 0;
        this.rotationInterpolationSpeed = 15; // Faster than position for responsive turning

        // Movement state
        this.isMoving = false;
        this.lastPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.movementThreshold = 0.01;

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // Store the player's color
        this.playerColor = color;
        this.needsSceneAdd = false; // Flag for delayed addition

        // Add to scene ONLY if the scene exists
        if (this.scene && this.scene.scene) {
            this.scene.scene.add(this);
            console.log(`Remote player ${id} added to scene at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
        } else {
            error(`RemotePlayer ${id}: Cannot add to scene because this.scene or this.scene.scene is null/undefined. Will attempt later.`); // Update error message
            this.needsSceneAdd = true; // Set flag to add later
        }

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
        if (!this.modelLoaded || !this.model) {
            this.positionQueue.push({
                x: position.x,
                y: position.y,
                z: position.z
            });
            // console.log(`[RemotePlayer ${this.remoteId}] Model not loaded, queued position. Queue size: ${this.positionQueue.length}`); // Reduce noise
            return;
        }

        // *** Add Logging ***
        if (Math.random() < 0.1) { // Log occasionally
            console.log(`[RemotePlayer ${this.remoteId}] setPosition called. Mesh exists: ${!!this.mesh}. Pos:`, JSON.stringify(position));
        }
        // *** End Logging ***

        // Update interpolation targets
        this.previousPosition.copy(this.position);
        this.targetPosition.set(position.x, position.y, position.z);
        this.interpolationFactor = 0;

        // // Detect movement for animation (based on target, not interpolated position) - REMOVED
        // const dx = this.targetPosition.x - this.lastPosition.x;
        // const dy = this.targetPosition.y - this.lastPosition.y; // Include Y for jumping detection
        // const dz = this.targetPosition.z - this.lastPosition.z;
        // const distanceSquared = dx * dx + dy * dy + dz * dz;
        //
        // const wasMoving = this.isMoving;
        // this.isMoving = distanceSquared > this.movementThreshold;
        //
        // // Update animation based on state flags (isJumping, isAttacking, etc.) - REMOVED
        // // This is handled in updateRemotePlayerState now, relying on server state.
        // // if (this.isMoving !== wasMoving && !this.isAttacking && !this.isJumping && !this.isDead) {
        // //     this.playAnimation(this.isMoving ? 'walkForward' : 'idle');
        // // }

        // this.lastPosition.copy(this.targetPosition); // REMOVED - lastPosition is not used elsewhere
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
                        console.log(`RemotePlayer ${this.remoteId}: Processing ${this.positionQueue.length} queued positions after model load`);
                        const latestPosition = this.positionQueue.pop();
                        this.setPosition(latestPosition);
                        this.positionQueue = []; // Clear the queue
                    }

                    log(`Remote player ${this.remoteId} model loaded and positioned successfully`); // Log success
                },
                undefined,
                (loadError) => {
                    // --- Improved Error Handling ---
                    error(`
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
Failed to load remote player model for ID: ${this.remoteId}
Error: ${loadError.message || 'Unknown loading error'}
URL attempted: ${modelPath}
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
`);

                    // Add a placeholder visual to indicate the player exists but model failed
                    console.log(`Adding placeholder geometry for failed model load: ${this.remoteId}`);
                    const placeholderGeometry = new THREE.BoxGeometry(0.7, 1.8, 0.7); // Similar size to player
                    const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.8 }); // Red color
                    const placeholderMesh = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
                    placeholderMesh.position.set(0, 0.9, 0); // Position roughly where player would be

                    // Add placeholder as child only if scene exists
                    if (this.scene && this.scene.scene) {
                        this.add(placeholderMesh);
                        console.log(`Added placeholder for ${this.remoteId} to parent object.`);
                    } else {
                        error(`RemotePlayer ${this.remoteId}: Cannot add placeholder because scene or scene.scene is null/undefined.`);
                    }
                    this.model = placeholderMesh; // Use placeholder as the 'model' for positioning
                    this.modelLoaded = true; // Set to true so position updates apply to placeholder

                    // Process queued positions for the placeholder
                    if (this.positionQueue.length > 0) {
                        console.log(`Processing ${this.positionQueue.length} queued positions for placeholder: ${this.remoteId}`);
                        const latestPosition = this.positionQueue.pop();
                        this.setPosition(latestPosition); // Apply position to parent RemotePlayer object
                        this.positionQueue = [];
                    }
                    // --- End Improved Error Handling ---
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

        console.log(`Setting up ${gltf.animations.length} animations for remote player ${this.remoteId}`);

        // Create animation mixer
        this.mixer = new THREE.AnimationMixer(this.model);

        // Clear existing animations
        this.animations = {};
        this.animationActions = {};
        let foundIdle = false; // Flag to track if idle was found

        // Process animations with proper name normalization (trimming)
        gltf.animations.forEach(anim => {
            // *** Trim whitespace/newlines from the name before storing ***
            const originalName = anim.name;
            const trimmedName = originalName.trim();

            // Store with trimmed name
            this.animations[trimmedName] = anim;
            this.animationActions[trimmedName] = this.mixer.clipAction(anim);

            // Log if name was trimmed (for debugging)
            if (originalName !== trimmedName) {
                console.log(`[${this.remoteId}] RemotePlayer Animation: Trimmed '${originalName}' to '${trimmedName}'`);
            }

            // ALSO store with lowercase name for case-insensitive lookup (keep this part)
            const lowerTrimmedName = trimmedName.toLowerCase();
            if (lowerTrimmedName !== trimmedName) {
                this.animations[lowerTrimmedName] = anim;
                this.animationActions[lowerTrimmedName] = this.mixer.clipAction(anim);
            }
        });

        // Start idle animation by default (using trimmed lowercase for robustness)
        const idleAnimationNames = ['idle', 'Idle', 'IDLE']; // Add variations if needed
        for (const name of idleAnimationNames) {
            const potentialName = name.trim(); // Use trimmed name for lookup
            if (this.animationActions[potentialName]) { // Check action map
                console.log(`[${this.remoteId}] Found default idle: '${potentialName}'. Playing.`);
                this.playAnimation(potentialName); // Play using the found name
                foundIdle = true;
                break;
            }
            // Also check lowercase version
            const lowerPotentialName = potentialName.toLowerCase();
            if (lowerPotentialName !== potentialName && this.animationActions[lowerPotentialName]) {
                console.log(`[${this.remoteId}] Found default idle (lowercase): '${lowerPotentialName}'. Playing.`);
                this.playAnimation(lowerPotentialName);
                foundIdle = true;
                break;
            }
        }

        if (!foundIdle) {
            console.warn(`[${this.remoteId}] RemotePlayer: Could not find any default idle animation. Available: ${Object.keys(this.animationActions).join(', ')}`);
            // Fallback: Play the first animation found? Or leave it?
            // For now, leave it, the first state update should correct it.
            this.currentAnimation = null; // Indicate no animation is set
            this.currentAction = null;
        }
    }

    playAnimation(name) {
        // Don't attempt to play animations until mesh and mixer are available
        if (!this.modelLoaded || !this.mixer || !this.model) {
            return;
        }

        // Try to find the animation with case-insensitive lookup
        let animName = name;
        // Use the name directly first (assuming it was trimmed during setup)
        let actionToPlay = this.animationActions[animName];

        if (!actionToPlay) {
            // Try lowercase version if original fails
            const lowerName = name.toLowerCase();
            actionToPlay = this.animationActions[lowerName];
            if (actionToPlay) {
                animName = lowerName;
            } else {
                console.warn(`Animation '${name}' (or variations) not found for remote player. Available: ${Object.keys(this.animationActions).join(', ')}`);
                return;
            }
        }

        // Don't restart the same animation unless it's a jump or attack
        // Check if the currentAction is actually running
        if (this.currentAction && this.currentAnimation === animName && this.currentAction.isRunning() && animName !== 'jump' && animName !== 'attack') {
            return;
        }

        try {
            // If we have a current action, fade it out
            // Only fade if it's different from the action we want to play
            if (this.currentAction && this.currentAction !== actionToPlay) {
                this.currentAction.fadeOut(0.2);
            }

            // Get the new action (we already found it above)
            const action = actionToPlay;

            // Reset and play the new action
            action.reset();
            action.fadeIn(0.2); // Use fadeIn for smooth transition
            action.play();

            // Update current animation and action
            this.currentAnimation = animName;
            this.currentAction = action;

            // Log the animation being played
            if (Math.random() < 0.05) { // Log occasionally
                console.log(`[Client PlayAnim] ID: ${this.remoteId} - Playing: ${animName}`);
            }
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

        // Store previous rotation
        this.previousRotation.y = this.model.rotation.y;

        // Set target rotation
        this.targetRotation.y = targetY;
        this.rotationInterpolationFactor = 0;
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

        // --- Delayed Scene Add --- 
        if (this.needsSceneAdd) {
            if (this.scene && this.scene.scene) {
                this.scene.scene.add(this);
                this.needsSceneAdd = false; // Successfully added
                console.log(`RemotePlayer ${this.remoteId} added to scene (delayed).`);
            } else {
                // Log only occasionally if still waiting
                if (Math.random() < 0.01) {
                    console.log(`RemotePlayer ${this.remoteId} still waiting for scene to be ready...`);
                }
            }
        }
        // --- End Delayed Scene Add --- 

        // Interpolate rotation
        if (this.rotationInterpolationFactor < 1 && this.model) {
            this.rotationInterpolationFactor += deltaTime * this.rotationInterpolationSpeed;
            if (this.rotationInterpolationFactor > 1) this.rotationInterpolationFactor = 1;

            // Interpolate rotation using shortest path
            let fromAngle = this.previousRotation.y;
            let toAngle = this.targetRotation.y;

            // Normalize angles
            while (fromAngle > Math.PI) fromAngle -= 2 * Math.PI;
            while (fromAngle < -Math.PI) fromAngle += 2 * Math.PI;
            while (toAngle > Math.PI) toAngle -= 2 * Math.PI;
            while (toAngle < -Math.PI) toAngle += 2 * Math.PI;

            // Calculate shortest rotation path
            let diff = toAngle - fromAngle;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;

            // Apply interpolated rotation
            this.model.rotation.y = fromAngle + diff * this.rotationInterpolationFactor;
        }

        // Update visual elements
        // this.updateVisualElements(); // This call was causing the error, handle updates within updateHealthBarPosition
        this.updateHealthBarPosition(); // Call the correct function to update DOM position
    }

    updateVisualElements() {
        // This function is now effectively replaced by updateHealthBarPosition
        // and the name tag update logic within Game.js
        // We can potentially remove this later if nothing else uses it.
        if (!this.modelLoaded) {
            return;
        }

        // // Update health bar position - INCORRECT LOGIC REMOVED
        // if (this.healthBar) {
        //     const worldPos = this.getWorldPosition(new THREE.Vector3());
        //     // INCORRECT: this.healthBar is a DOM object container, not a THREE object
        //     // this.healthBar.position.set(worldPos.x, worldPos.y + 2, worldPos.z); 
        //     // this.healthBar.updateHealth(this.health); // Health update is handled by updateHealthBar
        // }
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

        console.log(`Remote player ${this.remoteId} removed and cleaned up`);
    }

    attack() {
        if (this.isAttacking) return;

        this.isAttacking = true;
        this.playAnimation('attack');
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
        console.log(`[RemotePlayer ${this.remoteId}] die() called. isDead set to true.`);
    }

    respawn(position) {
        console.log(`[RemotePlayer ${this.remoteId}] respawn() called. Position: ${JSON.stringify(position)}`);
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
        // 1. Guard Clause: Checks if required objects exist
        if (!this.healthBar || !this.healthBar.container || !this.scene || !this.scene.camera) {
            // Add logging here
            if (Math.random() < 0.05) { // Log occasionally to avoid spam
                console.log(`[RemotePlayer ${this.remoteId}] updateHealthBarPosition exiting early. HealthBar: ${!!this.healthBar}, Container: ${!!this.healthBar?.container}, Scene: ${!!this.scene}, Camera: ${!!this.scene?.camera}`); // Use console.log
            }
            return;
        }

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