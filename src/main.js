import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

let physicsWorld;
let rigidBodies = [];
let tmpTrans;
let scene, camera, renderer;
let blob;
let blobBody;
const moveForce = 10;
const maxVelocity = 15;
const jumpForce = 15;
let canJump = true;
let lastJumpTime = 0;
const bhopWindow = 300;

// Camera settings
const cameraOffset = new THREE.Vector3(0, 8, 12); // Position camera above and behind player
const cameraLookOffset = new THREE.Vector3(0, 0, -5); // Look ahead of the player
let cameraTarget = new THREE.Vector3();

// Scene setup
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    scene.fog = new THREE.Fog(0x88ccff, 50, 1000);

    // Add some basic lighting
    scene.add(new THREE.AmbientLight(0x666666, 3));

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

    scene.add(directionalLight);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
}

// Ground plane with physics
function createGround() {
    // Load texture
    const textureLoader = new THREE.TextureLoader();
    const groundTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(25, 25);

    const groundGeometry = new THREE.PlaneGeometry(500, 500, 10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({
        map: groundTexture,
        roughness: 0.8,
        metalness: 0.2
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Add some obstacles
    addObstacles();

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

// Add obstacles to the scene
function addObstacles() {
    // Create some boxes as obstacles
    const boxGeometry = new THREE.BoxGeometry(5, 2, 5);
    const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0x8888ff,
        roughness: 0.7,
        metalness: 0.3
    });

    // Add several boxes in different positions
    for (let i = 0; i < 10; i++) {
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.position.set(
            Math.random() * 100 - 50,
            1,
            Math.random() * 100 - 50
        );
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);

        // Add physics to the box
        const boxShape = new Ammo.btBoxShape(new Ammo.btVector3(2.5, 1, 2.5));
        const boxTransform = new Ammo.btTransform();
        boxTransform.setIdentity();
        boxTransform.setOrigin(new Ammo.btVector3(box.position.x, box.position.y, box.position.z));
        const boxMass = 0; // Static object
        const boxLocalInertia = new Ammo.btVector3(0, 0, 0);
        const boxMotionState = new Ammo.btDefaultMotionState(boxTransform);
        const boxRbInfo = new Ammo.btRigidBodyConstructionInfo(boxMass, boxMotionState, boxShape, boxLocalInertia);
        const boxBody = new Ammo.btRigidBody(boxRbInfo);
        physicsWorld.addRigidBody(boxBody);
    }

    // Add some ramps
    const rampGeometry = new THREE.BoxGeometry(10, 2, 10);
    const rampMaterial = new THREE.MeshStandardMaterial({
        color: 0xff8844,
        roughness: 0.6,
        metalness: 0.2
    });

    for (let i = 0; i < 5; i++) {
        const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
        ramp.position.set(
            Math.random() * 80 - 40,
            1,
            Math.random() * 80 - 40
        );

        // Rotate the ramp
        ramp.rotation.z = Math.random() * 0.5;
        ramp.castShadow = true;
        ramp.receiveShadow = true;
        scene.add(ramp);

        // Create a custom shape for the ramp
        const rampShape = new Ammo.btBoxShape(new Ammo.btVector3(5, 1, 5));
        const rampTransform = new Ammo.btTransform();
        rampTransform.setIdentity();

        // Set position
        rampTransform.setOrigin(new Ammo.btVector3(ramp.position.x, ramp.position.y, ramp.position.z));

        // Set rotation
        const q = new Ammo.btQuaternion();
        q.setEulerZYX(ramp.rotation.z, ramp.rotation.y, ramp.rotation.x);
        rampTransform.setRotation(q);

        const rampMass = 0; // Static object
        const rampLocalInertia = new Ammo.btVector3(0, 0, 0);
        const rampMotionState = new Ammo.btDefaultMotionState(rampTransform);
        const rampRbInfo = new Ammo.btRigidBodyConstructionInfo(rampMass, rampMotionState, rampShape, rampLocalInertia);
        const rampBody = new Ammo.btRigidBody(rampRbInfo);
        physicsWorld.addRigidBody(rampBody);
    }
}

function createBlob() {
    const radius = 1;
    const blobGeometry = new THREE.SphereGeometry(radius, 32, 32);

    // Create a more interesting material for the blob
    const blobMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.3,
        metalness: 0.5,
        emissive: 0x330000
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
    blobBody.setFriction(0.8);
    blobBody.setRollingFriction(0.5);
    blobBody.setDamping(0.7, 0.7);
    blobBody.setAngularFactor(new Ammo.btVector3(0.2, 1, 0.2));

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

function isOnGround() {
    if (!blob || !blobBody) return false;

    const rayStart = new Ammo.btVector3(
        blob.position.x,
        blob.position.y - 0.9,
        blob.position.z
    );
    const rayEnd = new Ammo.btVector3(
        blob.position.x,
        blob.position.y - 1.1,
        blob.position.z
    );

    const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);
    physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

    return rayCallback.hasHit();
}

function handleKeyDown(event) {
    if (!blobBody) return;

    if (event.repeat) return;

    let force = new Ammo.btVector3(0, 0, 0);
    let impulseStrength = moveForce;

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

    const velocity = blobBody.getLinearVelocity();

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
            const now = Date.now();
            const timeSinceLastJump = now - lastJumpTime;

            if (isOnGround()) {
                force.setY(jumpForce);
                lastJumpTime = now;
                canJump = false;

                const horizVelocity = Math.sqrt(velocity.x() * velocity.x() + velocity.z() * velocity.z());
                if (horizVelocity > 5) {
                    force.setX(velocity.x() * 0.2);
                    force.setZ(velocity.z() * 0.2);
                }
            } else if (timeSinceLastJump < bhopWindow) {
                force.setY(jumpForce * 0.9);
                lastJumpTime = now;

                force.setX(velocity.x() * 0.15);
                force.setZ(velocity.z() * 0.15);
            }
            break;
    }

    blobBody.activate(true);
    blobBody.applyCentralImpulse(force);

    setTimeout(() => {
        if (!blobBody) return;

        const velocity = blobBody.getLinearVelocity();
        const speed = Math.sqrt(
            velocity.x() * velocity.x() +
            velocity.z() * velocity.z()
        );

        if (speed > maxVelocity) {
            const scale = maxVelocity / speed;
            velocity.setX(velocity.x() * scale);
            velocity.setZ(velocity.z() * scale);
            blobBody.setLinearVelocity(velocity);
        }
    }, 10);
}

function handleKeyUp(event) {
    if (!blobBody) return;

    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const velocity = blobBody.getLinearVelocity();

        velocity.setX(velocity.x() * 0.8);
        velocity.setZ(velocity.z() * 0.8);

        blobBody.setLinearVelocity(velocity);
    }
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
    window.addEventListener('keyup', handleKeyUp);
}).catch(function (error) {
    console.error('Failed to load Ammo.js:', error);
});