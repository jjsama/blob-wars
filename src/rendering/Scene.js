import * as THREE from 'three';

export class GameScene {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Camera settings - adjust these values to position the camera better
        this.cameraOffset = new THREE.Vector3(0, 2.5, 6); // Slightly lower and closer
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
            this.renderer.domElement.requestPointerLock();
        });

        // Mouse movement handler
        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === this.renderer.domElement) {
                // Update rotation based on mouse movement
                this.targetRotationX -= event.movementX * this.sensitivity;
                this.targetRotationY -= event.movementY * this.sensitivity;

                // Limit vertical rotation to prevent flipping
                this.targetRotationY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.targetRotationY));
            }
        });
    }

    updateCamera(target) {
        if (!target) {
            console.warn('No target provided for camera update');
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

        // Position the look target further ahead (15 units instead of 10)
        this.cameraTarget.copy(target).add(lookDirection.multiplyScalar(15));

        // Add a slight vertical offset to the look target to aim a bit higher
        this.cameraTarget.y += 1.0;

        this.camera.lookAt(this.cameraTarget);

        // Return the look direction for use in shooting
        return lookDirection;
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }
} 