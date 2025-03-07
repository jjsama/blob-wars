import * as THREE from 'three';
export class Projectile {
    constructor(scene, physicsWorld, position, direction) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.direction = direction;
        this.mesh = null;
        this.body = null;
        this.lifespan = 3000; // 3 seconds
        this.createdAt = Date.now();
        
        this.create();
    }
    
    create() {
        // Create mesh
        const geometry = new THREE.SphereGeometry(0.3, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff3333,
            roughness: 0.3,
            metalness: 0.5,
            emissive: 0x331111
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        
        // Create physics
        const shape = new Ammo.btSphereShape(0.3);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(
            this.position.x, this.position.y, this.position.z
        ));
        
        const mass = 0.5;
        const inertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, inertia);
        
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, inertia
        );
        
        this.body = new Ammo.btRigidBody(rbInfo);
        
        // Apply force in direction
        const shootForce = 40;
        const impulse = new Ammo.btVector3(
            this.direction.x * shootForce,
            3, // Slight upward trajectory
            this.direction.z * shootForce
        );
        
        this.body.setLinearVelocity(impulse);
        this.body.setFriction(0.5);
        this.body.setRestitution(0.8); // Make it bouncy
        
        this.physicsWorld.addRigidBody(this.body);
    }
    
    update() {
        if (!this.body || !this.mesh) return;
        
        // Update mesh position based on physics
        const ms = this.body.getMotionState();
        if (ms) {
            const transform = new Ammo.btTransform();
            ms.getWorldTransform(transform);
            const p = transform.getOrigin();
            const q = transform.getRotation();
            this.mesh.position.set(p.x(), p.y(), p.z());
            this.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
        }
        
        // Check if projectile should be removed
        if (Date.now() - this.createdAt > this.lifespan) {
            this.remove();
            return false;
        }
        
        return true;
    }
    
    remove() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
        
        if (this.body) {
            this.physicsWorld.removeRigidBody(this.body);
        }
    }
} 