import * as THREE from '../node_modules/three/build/three.module.js';

let physicsWorld;
let rigidBodies = [];
let tmpTrans;
let scene, camera, renderer;

// Scene setup
function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Camera position
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 1, 0);
}

// Ground plane with physics
function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
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
    const blobMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const blob = new THREE.Mesh(blobGeometry, blobMaterial);
    blob.position.y = 5;
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
    const blobBody = new Ammo.btRigidBody(blobRbInfo);
    blobBody.setDamping(0.5, 0.5);

    physicsWorld.addRigidBody(blobBody);
    rigidBodies.push({ mesh: blob, body: blobBody });
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
}).catch(function (error) {
    console.error('Failed to load Ammo.js:', error);
});