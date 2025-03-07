import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/loaders/GLTFLoader.js';

// Debug function
function updateDebug(message) {
    const debugElement = document.getElementById('debug');
    if (debugElement) {
        debugElement.innerHTML += `<br>${message}`;
    }
    console.log(message);
}

// Create a simple scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccff);

// Add lighting
scene.add(new THREE.AmbientLight(0x666666, 3));
const directionalLight = new THREE.DirectionalLight(0xffffff, 7);
directionalLight.position.set(200, 450, 500);
scene.add(directionalLight);

// Create camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Create renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create a simple ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Create a temporary character
const tempGeometry = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
const tempMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const tempMesh = new THREE.Mesh(tempGeometry, tempMaterial);
tempMesh.position.set(0, 1, 0);
scene.add(tempMesh);

updateDebug('Scene created');

// Load the Soldier model
const loader = new GLTFLoader();
const modelUrl = './public/models/Soldier.glb'; // Try local path

updateDebug('Loading model from: ' + modelUrl);

loader.load(
    modelUrl,
    (gltf) => {
        updateDebug('Model loaded successfully');
        
        // Remove the temporary mesh
        scene.remove(tempMesh);
        
        // Add the model to the scene
        const model = gltf.scene;
        model.position.set(0, 0, 0);
        scene.add(model);
        
        updateDebug('Model added to scene');
        
        // Set up animations if available
        if (gltf.animations && gltf.animations.length) {
            updateDebug(`Found ${gltf.animations.length} animations`);
            
            const mixer = new THREE.AnimationMixer(model);
            const idleAction = mixer.clipAction(gltf.animations[0]);
            idleAction.play();
            
            // Animation loop
            function animate() {
                requestAnimationFrame(animate);
                
                const delta = 0.016; // Approximately 60fps
                mixer.update(delta);
                
                renderer.render(scene, camera);
            }
            
            animate();
        } else {
            updateDebug('No animations found');
            
            // Simple animation loop
            function animate() {
                requestAnimationFrame(animate);
                renderer.render(scene, camera);
            }
            
            animate();
        }
    },
    (xhr) => {
        const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
        updateDebug(`Loading model: ${percent}%`);
    },
    (error) => {
        updateDebug(`ERROR loading model: ${error.message}`);
        console.error('Error loading model:', error);
        
        // Simple animation loop with temp mesh
        function animate() {
            requestAnimationFrame(animate);
            tempMesh.rotation.y += 0.01;
            renderer.render(scene, camera);
        }
        
        animate();
    }
); 