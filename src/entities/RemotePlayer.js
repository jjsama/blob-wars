import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';
import { ASSET_PATHS, GAME_CONFIG } from '../utils/constants.js';

export class RemotePlayer extends THREE.Object3D {
    constructor(scene, id, position = GAME_CONFIG.playerStartPosition, color = null) {
        super();

        console.log(`[RemotePlayer Constructor] Creating player ${id} at`, position, `Color: ${color?.toString(16)}`);
        // --- DEBUG: Check scene validity ---
        console.log(`  [RemotePlayer Constructor ${id}] Scene object valid: ${!!scene}`);
        console.log(`  [RemotePlayer Constructor ${id}] Scene has .scene property: ${!!scene?.scene}`);
        // --- End Debug ---

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
        if (this.scene) {
            this.scene.add(this);
            console.log(`Remote player ${id} added to scene at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
        } else {
            error(`RemotePlayer ${id}: Cannot add to scene because this.scene is null/undefined. Will attempt later.`);
            this.needsSceneAdd = true; // Set flag to add later
        }

        // Load model
        this.loadModel();
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
                    console.log(`[RemotePlayer ${this.remoteId} loadModel] SUCCESS! GLTF loaded.`);
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
Error Type: ${loadError?.constructor?.name || 'Unknown'}
Error: ${loadError?.message || 'Unknown loading error'}
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
                    if (this.scene) {
                        // this.add(placeholderMesh); // Don't add as child if model load failed, add directly to scene if needed
                        // Let's just log for now, as the main object 'this' is already added
                        // this.scene.add(placeholderMesh); // Avoid adding duplicate representation
                        console.log(`Added placeholder for ${this.remoteId} to parent object.`);
                    } else {
                        error(`RemotePlayer ${this.remoteId}: Cannot add placeholder because scene is null/undefined.`);
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

    /**
     * Returns a clone of the player's current world position.
     * @returns {THREE.Vector3} Cloned position vector.
     */
    getPosition() {
        // Return a clone to prevent external modification of the internal position
        return this.position.clone();
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

            // Clamp the factor to prevent overshooting
            this.interpolationFactor = Math.min(this.interpolationFactor, 1);

            const newPosition = new THREE.Vector3();
            newPosition.lerpVectors(this.previousPosition, this.targetPosition, this.interpolationFactor);
            this.position.copy(newPosition);
        }

        // --- Delayed Scene Add --- 
        if (this.needsSceneAdd) {
            if (this.scene && this.scene.scene) {
                this.scene.add(this);
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
}
