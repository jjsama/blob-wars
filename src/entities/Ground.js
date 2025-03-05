import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

export class Ground {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.mesh = null;
        this.body = null;
        this.obstacles = [];
    }
    
    create() {
        // Load texture
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(25, 25);
        
        // Create mesh
        const geometry = new THREE.PlaneGeometry(500, 500, 10, 10);
        const material = new THREE.MeshStandardMaterial({
            map: groundTexture,
            roughness: 0.8,
            metalness: 0.2
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
        
        // Create physics
        const shape = new Ammo.btStaticPlaneShape(new Ammo.btVector3(0, 1, 0), 0);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(0, 0, 0));
        
        const mass = 0;
        const inertia = new Ammo.btVector3(0, 0, 0);
        
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, inertia
        );
        
        this.body = new Ammo.btRigidBody(rbInfo);
        this.physicsWorld.addRigidBody(this.body);
        
        // Add obstacles and environment elements
        this.addObstacles();
    }
    
    addObstacles() {
        // Create some boxes as obstacles
        this.createBox(10, 2, 0, 1, 10, 2, 0x8B4513);  // Brown box
        this.createBox(-10, 1, 5, 2, 2, 2, 0x4682B4);  // Blue box
        this.createBox(0, 1, -15, 5, 2, 5, 0x808080);  // Gray platform
        this.createBox(15, 3, 15, 3, 6, 3, 0x228B22);  // Green tower
        
        // Create a ramp
        this.createRamp(5, 0, -5, 10, 2, 5, 0xA0522D);
        
        // Create some walls
        this.createWall(-25, 5, 0, 1, 10, 50, 0x696969);  // Left wall
        this.createWall(25, 5, 0, 1, 10, 50, 0x696969);   // Right wall
        this.createWall(0, 5, -25, 50, 10, 1, 0x696969);  // Back wall
        this.createWall(0, 5, 25, 50, 10, 1, 0x696969);   // Front wall
    }
    
    createBox(x, y, z, width, height, depth, color) {
        // Create mesh
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7,
            metalness: 0.2
        });
        
        const box = new THREE.Mesh(geometry, material);
        box.position.set(x, y, z);
        box.castShadow = true;
        box.receiveShadow = true;
        this.scene.add(box);
        
        // Create physics
        const shape = new Ammo.btBoxShape(new Ammo.btVector3(width / 2, height / 2, depth / 2));
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(x, y, z));
        
        const mass = 0; // Static object
        const inertia = new Ammo.btVector3(0, 0, 0);
        
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, inertia
        );
        
        const body = new Ammo.btRigidBody(rbInfo);
        body.setFriction(0.5);
        this.physicsWorld.addRigidBody(body);
        
        // Store obstacle
        this.obstacles.push({ mesh: box, body: body });
    }
    
    createRamp(x, y, z, width, height, depth, color) {
        // Create a custom geometry for the ramp
        const geometry = new THREE.BufferGeometry();
        
        // Define vertices for a triangular prism (ramp)
        const vertices = new Float32Array([
            // Front face (triangle)
            -width/2, 0, depth/2,
            width/2, 0, depth/2,
            width/2, height, depth/2,
            
            // Back face (triangle)
            -width/2, 0, -depth/2,
            width/2, 0, -depth/2,
            width/2, height, -depth/2,
            
            // Bottom face (rectangle)
            -width/2, 0, -depth/2,
            width/2, 0, -depth/2,
            width/2, 0, depth/2,
            -width/2, 0, depth/2,
            
            // Right face (rectangle)
            width/2, 0, -depth/2,
            width/2, height, -depth/2,
            width/2, height, depth/2,
            width/2, 0, depth/2,
            
            // Sloped face (rectangle)
            -width/2, 0, -depth/2,
            -width/2, 0, depth/2,
            width/2, height, depth/2,
            width/2, height, -depth/2,
        ]);
        
        // Define indices for triangles
        const indices = [
            0, 1, 2,       // Front face
            3, 5, 4,       // Back face
            6, 7, 8, 6, 8, 9, // Bottom face
            10, 11, 12, 10, 12, 13, // Right face
            14, 15, 16, 14, 16, 17  // Sloped face
        ];
        
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7,
            metalness: 0.2
        });
        
        const ramp = new THREE.Mesh(geometry, material);
        ramp.position.set(x, y, z);
        ramp.castShadow = true;
        ramp.receiveShadow = true;
        this.scene.add(ramp);
        
        // Create a triangle mesh shape for physics
        const mesh = new Ammo.btTriangleMesh();
        
        // Add triangles to the mesh
        for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3;
            const i2 = indices[i+1] * 3;
            const i3 = indices[i+2] * 3;
            
            const v1 = new Ammo.btVector3(vertices[i1], vertices[i1+1], vertices[i1+2]);
            const v2 = new Ammo.btVector3(vertices[i2], vertices[i2+1], vertices[i2+2]);
            const v3 = new Ammo.btVector3(vertices[i3], vertices[i3+1], vertices[i3+2]);
            
            mesh.addTriangle(v1, v2, v3, true);
        }
        
        const shape = new Ammo.btBvhTriangleMeshShape(mesh, true, true);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(x, y, z));
        
        const mass = 0; // Static object
        const inertia = new Ammo.btVector3(0, 0, 0);
        
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, inertia
        );
        
        const body = new Ammo.btRigidBody(rbInfo);
        body.setFriction(0.5);
        this.physicsWorld.addRigidBody(body);
        
        // Store obstacle
        this.obstacles.push({ mesh: ramp, body: body });
    }
    
    createWall(x, y, z, width, height, depth, color) {
        // This is just a box, but semantically different
        this.createBox(x, y, z, width, height, depth, color);
    }
} 