import * as THREE from 'three';
import { log, error } from '../debug.js'; // Assuming debug utilities are helpful

export class UIManager {
    constructor(scene, domContainer) {
        if (!scene || !scene.camera) {
            throw new Error("UIManager requires a scene object with a camera.");
        }
        if (!domContainer) {
            throw new Error("UIManager requires a DOM container element.");
        }

        this.scene = scene; // Reference to the main THREE.Scene object
        this.camera = scene.camera; // Reference to the camera for projection
        this.domContainer = domContainer; // The parent element for UI components (e.g., document.body)

        // Maps to store UI elements associated with player IDs
        this.nameTags = {}; // { playerId: nameTagElement }
        this.healthBars = {}; // { playerId: { container: containerElement, fill: fillElement } }

        // References to static HUD elements (can be assigned later or during init)
        this.localHealthBar = null;
        this.localHealthText = null;
        this.crosshair = null;
        this.deathMessageOverlay = null;

        // --- Aiming Reticle ---+
        this.aimingReticule = null; // Will hold the THREE.Sprite
        // --- End Aiming Reticle ---+

        log("UIManager initialized.");
    }

    // --- Player-Specific UI Methods ---

    /**
     * Creates the necessary DOM elements for a player's overhead UI.
     * @param {string} playerId - The unique ID of the player.
     * @param {string} name - The display name for the player.
     */
    createPlayerUI(playerId, name) {
        log(`Creating UI for player: ${playerId}`);

        // --- Name Tag ---
        const nameTag = document.createElement('div');
        nameTag.className = 'player-nametag'; // Add CSS class for styling
        nameTag.textContent = name || playerId; // Use name or ID
        nameTag.style.position = 'absolute';
        nameTag.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        nameTag.style.color = 'white';
        nameTag.style.padding = '2px 5px';
        nameTag.style.borderRadius = '3px';
        nameTag.style.fontSize = '12px';
        nameTag.style.whiteSpace = 'nowrap';
        nameTag.style.pointerEvents = 'none'; // Prevent interaction
        nameTag.style.display = 'none'; // Initially hidden
        nameTag.style.zIndex = '998'; // Below health bar/damage indicators
        this.domContainer.appendChild(nameTag);
        this.nameTags[playerId] = nameTag;

        // --- Health Bar ---
        const healthBarContainer = document.createElement('div');
        healthBarContainer.className = 'player-health-bar-container'; // Add CSS class
        healthBarContainer.style.position = 'absolute';
        healthBarContainer.style.width = '50px';
        healthBarContainer.style.height = '6px';
        healthBarContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.7)'; // Darker background
        healthBarContainer.style.borderRadius = '3px';
        healthBarContainer.style.overflow = 'hidden';
        healthBarContainer.style.pointerEvents = 'none';
        healthBarContainer.style.display = 'none'; // Initially hidden (only show when not full health)
        healthBarContainer.style.zIndex = '999'; // Above name tag

        const healthBarFill = document.createElement('div');
        healthBarFill.className = 'player-health-bar-fill'; // Add CSS class
        healthBarFill.style.width = '100%'; // Start full
        healthBarFill.style.height = '100%';
        healthBarFill.style.backgroundColor = 'rgba(0, 255, 0, 0.8)'; // Initial green
        healthBarFill.style.transition = 'width 0.3s ease-out, background-color 0.3s ease-out';

        healthBarContainer.appendChild(healthBarFill);
        this.domContainer.appendChild(healthBarContainer);
        this.healthBars[playerId] = { container: healthBarContainer, fill: healthBarFill };
    }

    /**
     * Removes the DOM elements associated with a player.
     * @param {string} playerId - The ID of the player whose UI should be removed.
     */
    removePlayerUI(playerId) {
        log(`Removing UI for player: ${playerId}`);

        const nameTag = this.nameTags[playerId];
        if (nameTag && nameTag.parentNode) {
            nameTag.parentNode.removeChild(nameTag);
        }
        delete this.nameTags[playerId];

        const healthBar = this.healthBars[playerId];
        if (healthBar && healthBar.container && healthBar.container.parentNode) {
            healthBar.container.parentNode.removeChild(healthBar.container);
        }
        delete this.healthBars[playerId];
    }

    /**
     * Updates the position, visibility, and state of a player's overhead UI.
     * @param {string} playerId - The ID of the player to update.
     * @param {THREE.Vector3} worldPosition - The player's position in 3D space.
     * @param {number} health - The player's current health (0-100).
     * @param {boolean} isDead - Whether the player is dead.
     * @param {boolean} isVisible - Whether the player is potentially visible (e.g., not behind camera).
     */
    updatePlayerUI(playerId, worldPosition, health, isDead, isVisible) {
        const nameTag = this.nameTags[playerId];
        const healthBar = this.healthBars[playerId];

        if (!nameTag || !healthBar) {
            // log(`UI elements not found for player ${playerId} in updatePlayerUI`); // Can be noisy
            return;
        }

        // Hide UI if player is dead or not visible
        if (isDead || !isVisible) {
            nameTag.style.display = 'none';
            healthBar.container.style.display = 'none';
            return;
        }

        // Calculate screen position
        try {
            const screenPosition = this._projectToScreen(worldPosition, 2.0); // Project point slightly above head

            // Check if projection failed (e.g., behind camera after offset)
            if (!screenPosition) {
                nameTag.style.display = 'none';
                healthBar.container.style.display = 'none';
                return;
            }


            // --- Update Name Tag ---
            nameTag.style.display = 'block';
            nameTag.style.left = `${screenPosition.x - (nameTag.offsetWidth / 2)}px`;
            nameTag.style.top = `${screenPosition.y}px`; // Position tag at the calculated Y

            // --- Update Health Bar ---
            const healthPercent = Math.max(0, Math.min(100, health));
            healthBar.fill.style.width = `${healthPercent}%`;

            // Color based on health
            if (healthPercent > 70) {
                healthBar.fill.style.backgroundColor = 'rgba(0, 255, 0, 0.8)'; // Green
            } else if (healthPercent > 30) {
                healthBar.fill.style.backgroundColor = 'rgba(255, 255, 0, 0.8)'; // Yellow
            } else {
                healthBar.fill.style.backgroundColor = 'rgba(255, 0, 0, 0.8)'; // Red
            }

            // Show health bar only if not full health
            healthBar.container.style.display = healthPercent < 100 ? 'block' : 'none';

            // Position health bar slightly below the name tag
            const healthBarYOffset = 18; // Pixels below the name tag's top
            healthBar.container.style.left = `${screenPosition.x - (healthBar.container.offsetWidth / 2)}px`;
            healthBar.container.style.top = `${screenPosition.y + healthBarYOffset}px`;


            // --- Opacity based on Distance ---
            const distance = this.camera.position.distanceTo(worldPosition);
            const maxDistance = 50; // Max distance for full visibility fade
            const minOpacity = 0.2;
            const opacity = Math.max(minOpacity, 1 - (distance / maxDistance));

            nameTag.style.opacity = opacity.toString();
            healthBar.container.style.opacity = opacity.toString();


        } catch (err) {
            error(`Error updating UI for player ${playerId}:`, err);
            nameTag.style.display = 'none';
            healthBar.container.style.display = 'none';
        }
    }

    // --- General UI Methods ---

    /**
     * Shows a temporary floating damage indicator near a world position.
     * @param {THREE.Vector3} worldPosition - The 3D position where the damage occurred.
     * @param {number} amount - The amount of damage.
     * @param {boolean} isCritical - Optional flag for styling critical hits.
     */
    showDamageIndicator(worldPosition, amount, isCritical = false) {
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.textContent = `${amount}`;
        indicator.style.position = 'absolute';
        indicator.style.color = isCritical ? 'orange' : 'red';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontSize = isCritical ? '28px' : '24px';
        indicator.style.textShadow = '1px 1px 2px black';
        indicator.style.zIndex = '1000';
        indicator.style.pointerEvents = 'none';
        indicator.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out'; // Smooth transition

        this.domContainer.appendChild(indicator);

        // Initial position calculation
        const updatePosition = () => {
            const screenPos = this._projectToScreen(worldPosition, 1.5); // Slightly offset Y
            if (screenPos) {
                // Add some randomness to prevent overlap
                const offsetX = (Math.random() - 0.5) * 20;
                const offsetY = (Math.random() - 0.5) * 10;
                indicator.style.left = `${screenPos.x + offsetX}px`;
                indicator.style.top = `${screenPos.y + offsetY}px`;
                indicator.style.transform = 'translate(-50%, -100%)'; // Center horizontally, position above point
                return true;
            }
            return false;
        };


        if (updatePosition()) {
            // Animate upwards and fade out
            requestAnimationFrame(() => { // Ensure initial position is set before animating
                indicator.style.transform = 'translate(-50%, -150%) scale(1.1)'; // Move up more, slight scale
                indicator.style.opacity = '0';
            });


            // Remove after animation
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 500); // Match transition duration
        } else {
            // If initial positioning failed (e.g., off-screen), remove immediately
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }
    }

    /**
     * Updates the main HUD elements for the local player.
     * @param {number} health - The local player's current health.
     */
    updateLocalPlayerHealth(health) {
        if (!this.localHealthBar || !this.localHealthText) {
            this.localHealthBar = document.getElementById('health-bar'); // Try to find them if not set
            this.localHealthText = document.getElementById('health-text');
            if (!this.localHealthBar || !this.localHealthText) {
                // console.warn("Local player health UI elements not found."); // Can be noisy
                return;
            }
        }


        const healthPercent = Math.max(0, Math.min(100, health));
        this.localHealthBar.style.width = `${healthPercent}%`;
        this.localHealthText.textContent = `${Math.round(health)} HP`;


        // Change color based on health
        if (healthPercent > 70) {
            this.localHealthBar.style.backgroundColor = 'rgba(0, 255, 0, 0.7)'; // Green
        } else if (healthPercent > 30) {
            this.localHealthBar.style.backgroundColor = 'rgba(255, 255, 0, 0.7)'; // Yellow
        } else {
            this.localHealthBar.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Red
        }
    }


    /**
      * Shows the "YOU DIED" message overlay.
      */
    showDeathMessage() {
        if (!this.deathMessageOverlay) {
            this.deathMessageOverlay = document.createElement('div');
            this.deathMessageOverlay.id = 'death-message'; // Assign ID for potential CSS styling
            this.deathMessageOverlay.style.position = 'fixed';
            this.deathMessageOverlay.style.top = '50%';
            this.deathMessageOverlay.style.left = '50%';
            this.deathMessageOverlay.style.transform = 'translate(-50%, -50%)';
            this.deathMessageOverlay.style.color = 'red';
            this.deathMessageOverlay.style.fontSize = '72px';
            this.deathMessageOverlay.style.fontFamily = '"Arial Black", Gadget, sans-serif'; // More impactful font
            this.deathMessageOverlay.style.fontWeight = 'bold';
            this.deathMessageOverlay.style.textShadow = '3px 3px 5px black';
            this.deathMessageOverlay.style.zIndex = '1001'; // Ensure it's on top
            this.deathMessageOverlay.style.pointerEvents = 'none';
            this.deathMessageOverlay.textContent = 'YOU DIED';
            this.deathMessageOverlay.style.display = 'none'; // Start hidden
            this.domContainer.appendChild(this.deathMessageOverlay);
        }
        this.deathMessageOverlay.style.display = 'block';
    }


    /**
     * Hides the "YOU DIED" message overlay.
     */
    hideDeathMessage() {
        if (this.deathMessageOverlay) {
            this.deathMessageOverlay.style.display = 'none';
        }
    }


    // --- Helper Methods ---


    /**
     * Projects a 3D world position to 2D screen coordinates.
     * @param {THREE.Vector3} worldPosition - The position in world space.
     * @param {number} yOffset - An optional vertical offset to apply in world space before projection.
     * @returns {{x: number, y: number}|null} Screen coordinates (CSS pixels) or null if behind camera.
     * @private
     */
    _projectToScreen(worldPosition, yOffset = 0) {
        const position = worldPosition.clone();
        position.y += yOffset;


        // Project vector
        const vector = position.project(this.camera);


        // Check if the position is behind the camera (z coordinate > 1 in normalized device coords)
        if (vector.z > 1) {
            return null; // Don't display if behind camera plane
        }


        // Convert normalized device coordinates (-1 to +1) to screen coordinates (pixels)
        const x = (vector.x * 0.5 + 0.5) * this.domContainer.clientWidth;
        const y = (-vector.y * 0.5 + 0.5) * this.domContainer.clientHeight;


        return { x, y };
    }

    // --- NEW: Aiming Reticle Methods ---+
    createAimingReticule() {
        try {
            log("Creating aiming reticle...");

            // Create a sprite with a custom circular shape (no external texture needed)
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext('2d');

            // Draw outer circle
            context.beginPath();
            context.arc(32, 32, 24, 0, 2 * Math.PI);
            context.strokeStyle = 'white';
            context.lineWidth = 3;
            context.stroke();

            // Draw inner dot
            context.beginPath();
            context.arc(32, 32, 4, 0, 2 * Math.PI);
            context.fillStyle = 'red';
            context.fill();

            // Create texture from canvas
            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                sizeAttenuation: false // Important! Makes the sprite consistent size regardless of distance
            });

            this.aimingReticule = new THREE.Sprite(material);
            this.aimingReticule.scale.set(0.03, 0.03, 1); // Smaller size
            this.aimingReticule.visible = true;
            this.aimingReticule.renderOrder = 999; // Ensure it renders on top of other objects

            // Add to scene
            this.scene.add(this.aimingReticule);

            log("Aiming reticle created successfully.");
        } catch (err) {
            error("Failed to create aiming reticle:", err);
        }
    }

    updateAimingReticule(player, camera) {
        if (!this.aimingReticule || !player || !camera) {
            return;
        }

        try {
            // Hide if player is dead
            if (player.isDead) {
                this.aimingReticule.visible = false;
                return;
            }

            // ---- Get camera information ----
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const cameraPos = camera.position.clone();

            // ---- Calculate reticle position ----
            // For pre-refactor style, we position the reticle exactly in the center of where the camera is looking
            // This creates the classic centered-crosshair TPS look with character offset to the side
            const DISTANCE = 20; // Distance ahead of camera

            // Position reticle directly in the camera's forward direction (center of screen)
            const reticlePos = cameraPos.clone().addScaledVector(cameraDirection, DISTANCE);

            // 5. Perform raycast from camera to detect obstacles (centered ray)
            const raycaster = new THREE.Raycaster();
            raycaster.set(cameraPos, cameraDirection);

            // 6. Filter out the player's own mesh and the reticle
            const objectsToIntersect = this.scene.children.filter(obj => {
                // Exclude player mesh and the reticle itself
                if (obj === this.aimingReticule) return false;

                // This checks if the object is the player or a child of the player
                let isPlayer = false;
                let current = obj;
                while (current) {
                    if (current === player.mesh || current === player.model) {
                        isPlayer = true;
                        break;
                    }
                    current = current.parent;
                }
                return !isPlayer;
            });

            const intersects = raycaster.intersectObjects(objectsToIntersect, true);

            // 7. If we hit something closer than our default distance, place reticle there
            if (intersects.length > 0 && intersects[0].distance < DISTANCE) {
                reticlePos.copy(intersects[0].point);
                // Move slightly toward camera to prevent z-fighting
                reticlePos.addScaledVector(cameraDirection, -0.05);
            }

            // 8. Set the reticle position
            this.aimingReticule.position.copy(reticlePos);

            // 9. Ensure reticle always faces the camera
            this.aimingReticule.lookAt(camera.position);

            // 10. Make sure it's visible
            this.aimingReticule.visible = true;

        } catch (err) {
            error("Error updating aiming reticle position:", err);
            this.aimingReticule.visible = false;
        }
    }
    // --- End Aiming Reticle Methods ---+
}
