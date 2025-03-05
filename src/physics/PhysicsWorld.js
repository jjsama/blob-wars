import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

export class PhysicsWorld {
    constructor() {
        this.physicsWorld = null;
        this.rigidBodies = [];
        this.tmpTrans = null;
    }

    init() {
        const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        const broadphase = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();
        this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
        this.physicsWorld.setGravity(new Ammo.btVector3(0, -20, 0));
        this.tmpTrans = new Ammo.btTransform();
    }

    update(deltaTime) {
        if (!this.physicsWorld) {
            console.warn('Physics world not initialized');
            return;
        }
        
        this.physicsWorld.stepSimulation(deltaTime, 10);
        
        // Update all rigid bodies
        for (let i = 0; i < this.rigidBodies.length; i++) {
            const objThree = this.rigidBodies[i].mesh;
            const objAmmo = this.rigidBodies[i].body;
            
            if (!objThree || !objAmmo) continue;
            
            const ms = objAmmo.getMotionState();
            if (ms) {
                ms.getWorldTransform(this.tmpTrans);
                const p = this.tmpTrans.getOrigin();
                const q = this.tmpTrans.getRotation();
                objThree.position.set(p.x(), p.y(), p.z());
                objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
            }
        }
    }

    addRigidBody(body) {
        if (!this.physicsWorld) return;
        this.physicsWorld.addRigidBody(body);
    }

    removeRigidBody(body) {
        if (!this.physicsWorld) return;
        this.physicsWorld.removeRigidBody(body);
    }

    registerRigidBody(mesh, body) {
        this.rigidBodies.push({ mesh, body });
    }

    unregisterRigidBody(mesh) {
        const index = this.rigidBodies.findIndex(item => item.mesh === mesh);
        if (index !== -1) {
            this.rigidBodies.splice(index, 1);
        }
    }

    rayTest(from, to) {
        const rayCallback = new Ammo.ClosestRayResultCallback(from, to);
        this.physicsWorld.rayTest(from, to, rayCallback);
        return rayCallback;
    }
} 