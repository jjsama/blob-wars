import * as THREE from 'three';
export class GameScene {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cameraOffset = new THREE.Vector3(0, 2, 8); // Higher and closer
        this.cameraLookOffset = new THREE.Vector3(0, 1, -5); // Look at the upper body
        this.cameraTarget = new THREE.Vector3();
        this.controls = null;
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

        // Add resize handler
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Allow full vertical rotation (up to limits to prevent flipping)
        if (this.controls) {
            this.controls.minPolarAngle = Math.PI * 0.1; // Limit looking straight down
            this.controls.maxPolarAngle = Math.PI * 0.9; // Limit looking straight up
        }
    }

    updateCamera(target) {
        if (!target) {
            console.warn('No target provided for camera update');
            return;
        }

        // Calculate camera position based on target position
        this.cameraTarget.copy(target).add(this.cameraLookOffset);

        // Smoothly move camera to follow the target
        this.camera.position.copy(target).add(this.cameraOffset);
        this.camera.lookAt(this.cameraTarget);
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }
} 