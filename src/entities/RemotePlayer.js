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

        // Ragdoll state
        this.isRagdolled = false;
        this.ragdollStartTime = 0;
        this.ragdollBones = null;
        this.originalBonePositions = {};
        this.originalBoneRotations = {};

        // Random ragdoll direction for death animation
        this.ragdollDirection = new THREE.Vector3(
            Math.random() * 2 - 1,  // -1 to 1
            Math.random() * 0.5,    // 0 to 0.5 (slight upward bias)
            Math.random() * 2 - 1   // -1 to 1
        ).normalize();

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

            console.log(`[RemotePlayer ${this.remoteId}] Loading model from: ${modelPath}`);

            loader.load(
                modelPath,
                (gltf) => {
                    // Get the model
                    const model = gltf.scene;

                    // Scale the model
                    model.scale.set(0.35, 0.35, 0.35);

                    // Reset model position relative to parent with proper Y offset
                    model.position.set(0, 0, 0); // Remove the -2 offset, let the parent handle position

                    // DEBUG: Add a visible marker to verify position
                    const debugMarker = new THREE.Mesh(
                        new THREE.SphereGeometry(0.1, 8, 8),
                        new THREE.MeshBasicMaterial({ color: 0xff0000 })
                    );
                    debugMarker.position.set(0, 1, 0); // Position above the player's head
                    model.add(debugMarker);

                    console.log(`[RemotePlayer ${this.remoteId}] Model loaded. Current position: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`);

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

                    // Force position update to ensure visibility
                    this.position.set(
                        this.position.x,
                        Math.max(0.1, this.position.y), // Ensure at least slightly above ground
                        this.position.z
                    );

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

        // Find and map bones for ragdoll simulation
        this.mapBonesForRagdoll();
    }

    // New method to map bones for ragdoll simulation
    mapBonesForRagdoll() {
        try {
            if (!this.model) {
                console.warn(`[RemotePlayer ${this.remoteId}] Cannot map bones: Model not loaded yet`);
                return;
            }

            // First, try to find the skeleton
            let skeleton = null;
            this.model.traverse(child => {
                if (child.isSkinnedMesh && child.skeleton) {
                    skeleton = child.skeleton;
                }
            });

            if (!skeleton) {
                console.warn(`[RemotePlayer ${this.remoteId}] No skeleton found in model`);
                return;
            }

            this.skeleton = skeleton;

            // Get all bone names for debugging
            const boneNames = skeleton.bones.map(bone => bone.name.toLowerCase());
            console.log(`[RemotePlayer ${this.remoteId}] Available bones:`, boneNames);

            // Define exact bone names based on the actual model (no dots in the names)
            const exactBoneNames = {
                torso: 'torso',
                head: 'head',
                leftArm: 'armleft',  // Changed from 'arm.left' to 'armleft'
                rightArm: 'armright', // Changed from 'arm.right' to 'armright'
                leftLeg: 'legleft',   // Changed from 'leg.left' to 'legleft'
                rightLeg: 'legright'  // Changed from 'leg.right' to 'legright'
            };

            // Find bones matching the exact names
            this.ragdollBones = {};

            for (const [partName, boneName] of Object.entries(exactBoneNames)) {
                const matchingBone = skeleton.bones.find(bone =>
                    bone.name.toLowerCase() === boneName.toLowerCase()
                );

                if (matchingBone) {
                    this.ragdollBones[partName] = matchingBone;

                    // Store original position and rotation
                    this.originalBonePositions[partName] = matchingBone.position.clone();
                    this.originalBoneRotations[partName] = matchingBone.quaternion.clone();

                    console.log(`[RemotePlayer ${this.remoteId}] Mapped ${partName} to bone: ${matchingBone.name}`);
                } else {
                    console.warn(`[RemotePlayer ${this.remoteId}] Could not find exact bone match for ${partName} (${boneName})`);
                }
            }

            console.log(`[RemotePlayer ${this.remoteId}] Bone mapping complete. Found ${Object.keys(this.ragdollBones).length} bones.`);
        } catch (err) {
            console.error(`[RemotePlayer ${this.remoteId}] Error mapping bones:`, err);
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

        // Interpolate rotation (only if not ragdolled)
        if (!this.isRagdolled && this.rotationInterpolationFactor < 1 && this.model) {
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

        // Update ragdoll animation if active
        if (this.isRagdolled && this.ragdollBones) {
            this.updateRagdoll(deltaTime);
        }

        // Update visual elements
        this.updateHealthBarPosition();
    }

    // New method for updating ragdoll animation
    updateRagdoll(deltaTime) {
        if (!this.ragdollBones || !this.isDead) return;

        // Time since ragdoll started (in seconds)
        const elapsedTime = (Date.now() - this.ragdollStartTime) / 1000;

        // Calculate a realistic gravity effect
        const gravity = 9.8; // m/s²
        // *** ADJUST FALL DISTANCE - Apply gravity more directly ***
        // const fallDistance = Math.min(10, 0.5 * gravity * elapsedTime * elapsedTime); // s = 0.5 * g * t² with max limit
        // Calculate fall based on initial velocity and gravity
        const initialYVelocity = this.ragdollDirection.y * 2.0; // Approx initial vertical speed
        const fallDistance = -(initialYVelocity * elapsedTime + 0.5 * -gravity * elapsedTime * elapsedTime);

        // Calculate main body position (used as reference for all parts)
        // Start with a forward momentum then gradually fall down
        const initialVelocity = 2.0; // Initial forward velocity
        const forwardDistance = Math.min(2.0, initialVelocity * elapsedTime * 0.5); // Limit forward movement

        // Main body trajectory
        const bodyX = this.initialPosition.x + this.ragdollDirection.x * forwardDistance;
        // *** ADJUST BODY Y - Use calculated fallDistance ***
        // const bodyY = Math.max(0, this.initialPosition.y - fallDistance * 0.8); // Fall with 80% of gravity
        const bodyY = Math.max(0, this.initialPosition.y - fallDistance); // Apply calculated fall
        const bodyZ = this.initialPosition.z + this.ragdollDirection.z * forwardDistance;

        // Set the overall player position (affects the whole model)
        this.position.set(bodyX, bodyY, bodyZ);

        // Apply calculated transformations to individual bones
        Object.entries(this.ragdollBones).forEach(([partName, bone]) => {
            // Skip if bone is missing
            if (!bone) return;

            // Get initial position
            const initialPos = this.originalBonePositions[partName] || new THREE.Vector3();

            // Different dynamics for each body part
            let rotationAmount = 0;
            let posOffset = new THREE.Vector3();

            switch (partName) {
                case 'head':
                    // Head falls forward and down
                    rotationAmount = Math.min(Math.PI / 2, elapsedTime * 2); // Gradually tilt down up to 90 degrees
                    posOffset.set(
                        0,
                        // Head moves down slightly as body collapses
                        -Math.min(0.1, elapsedTime * 0.05),
                        // Head moves forward as it tilts down
                        -Math.min(0.1, elapsedTime * 0.05)
                    );
                    break;

                case 'torso':
                    // Torso gradually tilts forward
                    rotationAmount = Math.min(Math.PI / 3, elapsedTime * 1.5); // Up to 60 degrees
                    posOffset.set(0, 0, 0); // Torso is the reference point
                    break;

                case 'leftArm':
                case 'rightArm':
                    // Arms swing outward and forward with momentum
                    const isLeft = partName === 'leftArm';
                    const armPhase = isLeft ? 0 : Math.PI; // Opposite phases for right/left

                    // Initial swing direction
                    const swingDirection = isLeft ? 1 : -1;

                    // Arms first swing outward then gradually fall down
                    // First 0.3 seconds: swing out, then gradually fall
                    const swingAmount = elapsedTime < 0.3 ?
                        swingDirection * elapsedTime * 3 : // Swing out
                        swingDirection * 0.9 - (elapsedTime - 0.3) * 1.5; // Then fall down

                    rotationAmount = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, swingAmount));

                    // Arms also move outward from body slightly
                    posOffset.set(
                        swingDirection * Math.min(0.1, elapsedTime * 0.2), // Move slightly outward
                        -Math.min(0.1, elapsedTime * 0.1), // Move down slightly
                        0
                    );
                    break;

                case 'leftLeg':
                case 'rightLeg':
                    // Legs collapse under the body
                    const legIsLeft = partName === 'leftLeg';
                    const legDirection = legIsLeft ? 1 : -1;

                    // Legs bend at the knees
                    rotationAmount = Math.min(Math.PI / 3, elapsedTime * 1.0); // Up to 60 degrees

                    // Legs spread slightly and collapse
                    posOffset.set(
                        legDirection * Math.min(0.05, elapsedTime * 0.1), // Spread slightly
                        -Math.min(0.15, elapsedTime * 0.3), // Collapse downward
                        0
                    );
                    break;
            }

            // Apply position offsets (relative to original bone positions)
            bone.position.copy(initialPos).add(posOffset);

            // Create a rotation based on the calculated amount
            // Different rotation axes for different parts
            let rotationAxis = new THREE.Vector3(1, 0, 0); // Default: rotate around X (forward tilt)

            // Customize rotation axis by part
            if (partName === 'leftArm' || partName === 'rightArm') {
                // Arms rotate around Z and Y
                rotationAxis.set(0, 1, 1).normalize();
            } else if (partName === 'leftLeg' || partName === 'rightLeg') {
                // Legs rotate around X and slight Z
                rotationAxis.set(1, 0, 0.2).normalize();
            }

            // Apply rotation
            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(
                rotationAxis,
                rotationAmount
            );

            // Get original rotation
            const origRotation = this.originalBoneRotations[partName] || new THREE.Quaternion();

            // Combine with original rotation
            bone.quaternion.copy(origRotation).multiply(rotationQuat);

            // Add subtle random motion for realism (reduced from previous version)
            if (elapsedTime > 0.5) { // Only add after initial collapse
                const randomFactor = 0.02; // Very subtle
                bone.position.x += (Math.random() - 0.5) * randomFactor;
                bone.position.y += (Math.random() - 0.5) * randomFactor;
                bone.position.z += (Math.random() - 0.5) * randomFactor;
            }
        });

        // *** ADD LOGIC TO ROTATE TORSO HORIZONTAL ***
        // *** MAKE FASTER ***
        const rotationDuration = 1.0; // Time in seconds to reach horizontal (was 1.5)
        const torsoBone = this.ragdollBones['torso'];

        if (torsoBone && elapsedTime < rotationDuration) {
            const targetQuat = new THREE.Quaternion();
            // Target rotation: lying flat on XZ plane
            targetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

            const currentQuat = torsoBone.quaternion.clone();
            const origRotation = this.originalBoneRotations['torso'] || new THREE.Quaternion();
            // const combinedInitialQuat = origRotation.clone(); // Not needed for this approach

            // Slerp towards the target rotation from its original bone rotation.
            let t = Math.min(1, elapsedTime / rotationDuration);
            // *** FADE OUT INFLUENCE towards the end ***
            const fadeStart = rotationDuration * 0.7;
            if (elapsedTime > fadeStart) {
                t *= 1.0 - (elapsedTime - fadeStart) / (rotationDuration - fadeStart);
            }

            const finalQuat = origRotation.clone().slerp(targetQuat, t);

            // Apply the interpolated rotation
            torsoBone.quaternion.copy(finalQuat);
        } else if (torsoBone && elapsedTime >= rotationDuration && !this._ragdollSettled) {
            // Ensure it stays flat after the duration
            const targetQuat = new THREE.Quaternion();
            targetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            const origRotation = this.originalBoneRotations['torso'] || new THREE.Quaternion();
            // Combine original with flat rotation - Make sure to apply relative to original
            const finalFlatQuat = origRotation.clone().multiply(targetQuat);
            torsoBone.quaternion.copy(finalFlatQuat);
            this._ragdollSettled = true; // Mark as settled
        }
        // *** END HORIZONTAL ROTATION LOGIC ***
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

        // Update health bar without repositioning
        this.updateHealthBar();

        // Add damage indicator
        this.showDamageIndicator();

        // Apply a subtle visual shake effect instead of physical movement
        this.applyDamageShake(amount);

        // Kill player if health depleted
        if (this.health <= 0 && !this.isDead) {
            this.die();
        }
    }

    // Add a visual shake effect instead of physical jerking
    applyDamageShake(amount) {
        // Skip if dead or not yet loaded
        if (this.isDead || !this.modelLoaded || !this.model) return;

        // Scale shake intensity based on damage amount
        const intensity = Math.min(0.05, amount * 0.005);

        // Store original model position for reference
        const originalPos = this.model.position.clone();

        // Apply shake effect using animation technique rather than physics
        let duration = 0;
        const maxDuration = 0.3; // Seconds
        const shakeFPS = 60;
        const shakeDelta = 1 / shakeFPS;

        // Use requestAnimationFrame for smoother animation
        const shakeAnimation = () => {
            if (duration >= maxDuration || !this.model || this.isDead) {
                // Reset to original position when done
                if (this.model) {
                    this.model.position.copy(originalPos);
                }
                return;
            }

            // Create random shake offset
            const offsetX = (Math.random() - 0.5) * intensity;
            const offsetY = (Math.random() - 0.5) * intensity;
            const offsetZ = (Math.random() - 0.5) * intensity;

            // Apply shake offset
            this.model.position.set(
                originalPos.x + offsetX,
                originalPos.y + offsetY,
                originalPos.z + offsetZ
            );

            // Increment time
            duration += shakeDelta;

            // Continue animation
            requestAnimationFrame(shakeAnimation);
        };

        // Start shake animation
        shakeAnimation();
    }

    // Update updateHealthBar method to avoid repositioning during damage
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

        // Only update the position when not taking damage
        // Position updates are handled by updateHealthBarPosition in the main update loop
    }

    die() {
        if (this.isDead) return;

        this.isDead = true;
        console.log(`Remote player ${this.remoteId} died`);

        // *** Store current position BEFORE activating ragdoll ***
        this.initialPosition.copy(this.position);

        // Start ragdoll animation
        this.activateRagdoll();

        console.log(`[RemotePlayer ${this.remoteId}] die() called. isDead set to true, ragdoll activated.`);
    }

    // Update activateRagdoll to have more realistic force direction
    activateRagdoll() {
        // Stop any current animation
        if (this.mixer) {
            this.mixer.stopAllAction();
        }

        // Set ragdoll state
        this.isRagdolled = true;
        this.ragdollStartTime = Date.now();

        // Generate a momentum direction based on more realistic physics
        // Getting shot typically causes forward/backward momentum

        // Default to forward fall (away from camera)
        let dirX = 0;
        let dirY = 0.1; // Slight upward component for initial momentum
        let dirZ = 1.0;  // Forward momentum

        // If we have a model and camera, we can do a more realistic direction
        if (this.model && window.game && window.game.scene && window.game.scene.camera) {
            // Get direction from camera to player (approximates shot direction)
            const cameraPos = window.game.scene.camera.position;
            const playerPos = this.position;

            // Calculate direction vector from camera to player
            dirX = playerPos.x - cameraPos.x;
            dirZ = playerPos.z - cameraPos.z;

            // Normalize the horizontal direction
            const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
            if (length > 0) {
                dirX /= length;
                dirZ /= length;
            }

            // Add small random variation for realism
            dirX += (Math.random() - 0.5) * 0.3;
            dirZ += (Math.random() - 0.5) * 0.3;
        }

        this.ragdollDirection = new THREE.Vector3(dirX, dirY, dirZ).normalize();

        // Scale by a consistent value for consistent death animation
        const forceMagnitude = 1.0;
        this.ragdollDirection.multiplyScalar(forceMagnitude);

        console.log(`[RemotePlayer ${this.remoteId}] Ragdoll activated with realistic direction:`,
            this.ragdollDirection.x.toFixed(2),
            this.ragdollDirection.y.toFixed(2),
            this.ragdollDirection.z.toFixed(2)
        );
    }

    respawn(position) {
        console.log(`[RemotePlayer ${this.remoteId}] respawn() called. Position: ${JSON.stringify(position)}`);
        this.isDead = false;
        this.health = 100;

        // Reset ragdoll state
        this.isRagdolled = false;
        this._ragdollSettled = false; // Reset settled flag

        // Reset all bones to original positions and rotations
        if (this.ragdollBones) {
            Object.entries(this.ragdollBones).forEach(([partName, bone]) => {
                if (bone) {
                    // Reset position
                    if (this.originalBonePositions[partName]) {
                        bone.position.copy(this.originalBonePositions[partName]);
                    }

                    // Reset rotation
                    if (this.originalBoneRotations[partName]) {
                        bone.quaternion.copy(this.originalBoneRotations[partName]);
                    }
                }
            });
        }

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