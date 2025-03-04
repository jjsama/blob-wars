import * as THREE from 'three';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Ground plane
const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Lay it flat
scene.add(ground);

// Blob player (just a sphere for now)
const blobGeometry = new THREE.SphereGeometry(1, 32, 32);
const blobMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const blob = new THREE.Mesh(blobGeometry, blobMaterial);
blob.position.y = 1; // Above ground
scene.add(blob);

// Camera position
camera.position.set(0, 5, 10);
camera.lookAt(blob.position);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Simple blob wobble (for fun)
  blob.position.y = 1 + Math.sin(Date.now() * 0.005) * 0.2;

  renderer.render(scene, camera);
}
animate();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});