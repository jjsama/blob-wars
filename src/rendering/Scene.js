import * as THREE from 'three';

export class GameScene {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.orbitControls = null;
        this.skybox = null;

        // Position camera to match pre-refactor style
        // This places the camera more to the right of the character to keep the reticle centered
        this.cameraOffset = new THREE.Vector3(2.2, 1.8, 4.0); // Increased right offset and distance
        this.cameraTarget = new THREE.Vector3(0.8, 0, 0); // Look ahead and to the right

        // Mouse control variables
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetRotationX = 0;
        this.targetRotationY = 0;
        this.sensitivity = 0.002; // Mouse sensitivity
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x88ccff);
        this.scene.fog = new THREE.Fog(0x88ccff, 50, 1000);

        // Add lighting
        this.scene.add(new THREE.AmbientLight(0x404040, 1.5));

        const directionalLight = new THREE.DirectionalLight(0xffffff, 7);
        directionalLight.position.set(200, 450, 500);
        directionalLight.castShadow = true;

        // Configure shadow properties
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 1200;
        directionalLight.shadow.camera.left = -500;
        directionalLight.shadow.camera.right = 500;
        directionalLight.shadow.camera.top = 350;
        directionalLight.shadow.camera.bottom = -350;

        this.scene.add(directionalLight);

        // Create camera with initial position
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 20); // Set an initial position

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Set up mouse controls
        this.setupMouseControls();

        // Add resize handler
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupMouseControls() {
        // Lock pointer for FPS-style controls
        this.renderer.domElement.addEventListener('click', () => {
            // Check if we already have pointer lock
            if (document.pointerLockElement !== this.renderer.domElement) {
                console.log('Requesting pointer lock...');
                this.renderer.domElement.requestPointerLock().catch(error => {
                    console.error('Failed to request pointer lock:', error);
                });
            }
        });

        // Mouse movement handler with error handling
        document.addEventListener('mousemove', (event) => {
            try {
                if (document.pointerLockElement === this.renderer.domElement) {
                    // Ensure movement values are valid numbers
                    const movementX = event.movementX || 0;
                    const movementY = event.movementY || 0;

                    if (isNaN(movementX) || isNaN(movementY)) {
                        console.warn('Invalid mouse movement values:', event.movementX, event.movementY);
                        return;
                    }

                    // Update rotation based on mouse movement
                    this.targetRotationX -= movementX * this.sensitivity;
                    this.targetRotationY -= movementY * this.sensitivity;

                    // Limit vertical rotation to prevent flipping
                    this.targetRotationY = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.targetRotationY)); // Allow looking down/up more
                }
            } catch (err) {
                console.error('Error handling mouse movement:', err);
            }
        });

        // Handle pointer lock change and error events
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== this.renderer.domElement) {
                console.log('Pointer lock released');
            } else {
                console.log('Pointer lock acquired');
            }
        });

        document.addEventListener('pointerlockerror', (event) => {
            console.error('Pointer lock error:', event);
        });
    }

    updateCamera(target) {
        try {
            if (!target) {
                console.warn('No target provided for camera update');
                return new THREE.Vector3(0, 0, -1);
            }
            // Validate target position (optional but good practice)
            if (isNaN(target.x) || isNaN(target.y) || isNaN(target.z)) {
                console.error('Invalid target position for camera update:', target);
                return new THREE.Vector3(0, 0, -1);
            }

            // --- Calculate Camera Position based on Mouse Rotation ---
            // Create a rotation quaternion based on MOUSE input
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromEuler(
                new THREE.Euler(this.targetRotationY, this.targetRotationX, 0, 'YXZ')
            );

            // Apply the camera's rotation to the base offset
            const rotatedOffset = this.cameraOffset.clone().applyQuaternion(rotationQuaternion);

            // Set camera position relative to the target
            this.camera.position.copy(target).add(rotatedOffset);

            // --- Calculate LookAt Target ---
            // Apply target offset to better position what we're looking at
            // This helps keep the character positioned to the left side of the screen
            const lookTargetOffset = this.cameraTarget.clone().applyQuaternion(rotationQuaternion);

            // Look slightly ahead and to the right of the player's base position
            const lookTarget = target.clone().add(lookTargetOffset);
            lookTarget.y += 1.0; // Adjust this height as needed

            // --- Set Camera LookAt ---
            this.camera.lookAt(lookTarget);

            // --- Return Look Direction ---
            const lookDirection = new THREE.Vector3();
            this.camera.getWorldDirection(lookDirection);
            return lookDirection;

        } catch (err) {
            console.error('Error in updateCamera:', err);
            return new THREE.Vector3(0, 0, -1);
        }
    }

    update() {
        try {
            // Use the stored player reference
            if (this.player) {
                const playerPos = this.player.getPosition();

                // Calculate desired camera position (offset from player)
                const cameraOffset = new THREE.Vector3(0, 5, 8);

                // Verify position is valid before updating camera
                if (playerPos &&
                    typeof playerPos.x === 'number' &&
                    typeof playerPos.y === 'number' &&
                    typeof playerPos.z === 'number' &&
                    !isNaN(playerPos.x) &&
                    !isNaN(playerPos.y) &&
                    !isNaN(playerPos.z)) {

                    this.updateCamera(new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z));
                } else {
                    console.warn('Invalid player position:', playerPos);
                }
            }

            // Make sure we render each frame
            this.render();
        } catch (err) {
            console.error('Error in scene update:', err);
            // Still try to render even if there was an error
            try {
                this.render();
            } catch (renderErr) {
                console.error('Critical render error:', renderErr);
            }
        }
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) {
            console.warn('Cannot render: missing renderer, scene, or camera');
            return;
        }
        try {
            this.renderer.render(this.scene, this.camera);
        } catch (err) {
            console.error('Error rendering scene:', err);
        }
    }

    /**
     * Sets the player object for the scene to track.
     * @param {Player} player - The local player object.
     */
    setPlayerToFollow(player) {
        this.player = player;
    }

    createCamera() {
        // ... existing code ...
    }
} 