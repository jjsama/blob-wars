import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

let physicsWorld;
let rigidBodies = [];
let tmpTrans;
let scene, camera, renderer;
let blob;
let blobBody;
const moveForce = 15;

// Camera settings
const cameraOffset = new THREE.Vector3(0, 8, 12); // Position camera above and behind player
const cameraLookOffset = new THREE.Vector3(0, 0, -5); // Look ahead of the player
let cameraTarget = new THREE.Vector3();

// Scene setup
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff); // Light blue sky

    // Add some basic lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
}

// Ground plane with physics
function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(50, 50, 10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const groundShape = new Ammo.btStaticPlaneShape(new Ammo.btVector3(0, 1, 0), 0);
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, 0, 0));
    const groundMass = 0;
    const groundLocalInertia = new Ammo.btVector3(0, 0, 0);
    const groundMotionState = new Ammo.btDefaultMotionState(groundTransform);
    const groundRbInfo = new Ammo.btRigidBodyConstructionInfo(groundMass, groundMotionState, groundShape, groundLocalInertia);
    const groundBody = new Ammo.btRigidBody(groundRbInfo);
    physicsWorld.addRigidBody(groundBody);
}

function createBlob() {
    const radius = 1;
    const blobGeometry = new THREE.SphereGeometry(radius, 32, 32);
    const blobMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.3,
        metalness: 0.2
    });
    blob = new THREE.Mesh(blobGeometry, blobMaterial);
    blob.position.y = 5;
    blob.castShadow = true;
    scene.add(blob);

    const blobShape = new Ammo.btSphereShape(radius);
    const blobTransform = new Ammo.btTransform();
    blobTransform.setIdentity();
    blobTransform.setOrigin(new Ammo.btVector3(blob.position.x, blob.position.y, blob.position.z));
    const blobMass = 1;
    const blobLocalInertia = new Ammo.btVector3(0, 0, 0);
    blobShape.calculateLocalInertia(blobMass, blobLocalInertia);
    const blobMotionState = new Ammo.btDefaultMotionState(blobTransform);
    const blobRbInfo = new Ammo.btRigidBodyConstructionInfo(blobMass, blobMotionState, blobShape, blobLocalInertia);
    blobBody = new Ammo.btRigidBody(blobRbInfo);
    blobBody.setFriction(0.5);
    blobBody.setRollingFriction(0.1);
    blobBody.setDamping(0.5, 0.5);

    physicsWorld.addRigidBody(blobBody);
    rigidBodies.push({ mesh: blob, body: blobBody });
}

function updateCamera() {
    if (!blob) return;

    // Calculate camera position based on blob position
    cameraTarget.copy(blob.position).add(cameraLookOffset);

    // Smoothly move camera to follow the blob
    camera.position.copy(blob.position).add(cameraOffset);
    camera.lookAt(cameraTarget);
}

function initPhysics() {
    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
}

function updatePhysics(deltaTime) {
    physicsWorld.stepSimulation(deltaTime, 10);

    for (let i = 0; i < rigidBodies.length; i++) {
        const objThree = rigidBodies[i].mesh;
        const objAmmo = rigidBodies[i].body;
        const ms = objAmmo.getMotionState();
        if (ms) {
            ms.getWorldTransform(tmpTrans);
            const p = tmpTrans.getOrigin();
            const q = tmpTrans.getRotation();
            objThree.position.set(p.x(), p.y(), p.z());
            objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
        }
    }

    // Update camera to follow blob
    updateCamera();
}

let previousTime = 0;
function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    const deltaTime = (currentTime - previousTime) / 1000;
    previousTime = currentTime;

    if (deltaTime > 0) {
        updatePhysics(deltaTime);
    }

    renderer.render(scene, camera);
}

function handleKeyDown(event) {
    if (!blobBody) return;

    let force = new Ammo.btVector3(0, 0, 0);
    let impulseStrength = moveForce;

    // Get camera direction for movement relative to camera view
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0; // Keep movement on the horizontal plane
    cameraDirection.normalize();

    // Calculate right vector
    const right = new THREE.Vector3();
    right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

    switch (event.key) {
        case 'ArrowUp':
        case 'w':
            force.setX(cameraDirection.x * impulseStrength);
            force.setZ(cameraDirection.z * impulseStrength);
            break;
        case 'ArrowDown':
        case 's':
            force.setX(-cameraDirection.x * impulseStrength);
            force.setZ(-cameraDirection.z * impulseStrength);
            break;
        case 'ArrowLeft':
        case 'a':
            force.setX(-right.x * impulseStrength);
            force.setZ(-right.z * impulseStrength);
            break;
        case 'ArrowRight':
        case 'd':
            force.setX(right.x * impulseStrength);
            force.setZ(right.z * impulseStrength);
            break;
        case ' ':
            force.setY(impulseStrength * 1.5); // Jump a bit higher
            break;
    }

    blobBody.activate(true);
    blobBody.applyCentralImpulse(force);
}

// Initialize everything
console.log('Waiting for Ammo.js to load...');
Ammo().then(function (AmmoLib) {
    console.log('Ammo.js loaded successfully');
    Ammo = AmmoLib;
    tmpTrans = new Ammo.btTransform();

    initScene();
    initPhysics();
    createGround();
    createBlob();
    animate();

    // Add resize handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', handleKeyDown);
}).catch(function (error) {
    console.error('Failed to load Ammo.js:', error);
});