import * as THREE from 'three';

export class GameScene {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Revert to the previous camera settings but with slight adjustments
        this.cameraOffset = new THREE.Vector3(1.0, 2.0, 5.0); // Slightly to the right, good distance
        this.cameraTarget = new THREE.Vector3();

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
        this.scene.add(new THREE.AmbientLight(0x666666, 3));

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
                    this.targetRotationY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.targetRotationY));
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
                return;
            }

            // Validate target position
            if (isNaN(target.x) || isNaN(target.y) || isNaN(target.z)) {
                console.error('Invalid target position for camera update:', target);
                return;
            }

            // Create a rotation quaternion based on mouse input
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromEuler(
                new THREE.Euler(this.targetRotationY, this.targetRotationX, 0, 'YXZ')
            );

            // Apply rotation to the offset
            const rotatedOffset = this.cameraOffset.clone().applyQuaternion(rotationQuaternion);

            // Set camera position and look direction
            this.camera.position.copy(target).add(rotatedOffset);

            // Calculate look target (further ahead of player)
            const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(rotationQuaternion);

            // Position the look target further ahead for better aiming
            this.cameraTarget.copy(target).add(lookDirection.multiplyScalar(20));

            // Add a slight vertical offset to the look target for better aiming
            this.cameraTarget.y += 0.7; // Adjusted for better aiming height

            this.camera.lookAt(this.cameraTarget);

            // Return the look direction for use in shooting
            return lookDirection;
        } catch (err) {
            console.error('Error in updateCamera:', err);
            return new THREE.Vector3(0, 0, -1); // Return a default look direction in case of error
        }
    }

    update() {
        try {
            // Get player position for camera if game instance exists
            if (window.game && window.game.player) {
                try {
                    const playerPos = window.game.player.getPosition();

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
                } catch (posError) {
                    console.error('Error getting player position:', posError);
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
} 