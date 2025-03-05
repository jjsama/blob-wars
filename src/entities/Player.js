import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

export class Player {
    constructor(scene, physicsWorld, position = { x: 0, y: 5, z: 0 }) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.mesh = null;
        this.body = null;
        this.createMesh();
        this.createPhysics();
    }

    createMesh() {
        // Create a group to hold all character parts
        this.mesh = new THREE.Group();
        this.mesh.position.set(this.position.x, this.position.y, this.position.z);

        // Materials
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            roughness: 0.3,
            metalness: 0.1,
            emissive: 0x330000
        });

        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.1,
            metalness: 0.1
        });

        // Body parts - more detailed clay doll
        // Head
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 32, 32),
            bodyMaterial
        );
        head.position.y = 1.4;
        head.castShadow = true;
        this.mesh.add(head);

        // Body
        const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.5, 1.0, 8, 16),
            bodyMaterial
        );
        body.position.y = 0.5;
        body.castShadow = true;
        this.mesh.add(body);

        // Arms
        const leftArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.2, 0.8, 8, 16),
            bodyMaterial
        );
        leftArm.position.set(-0.7, 0.7, 0);
        leftArm.rotation.z = Math.PI / 6;
        leftArm.castShadow = true;
        this.mesh.add(leftArm);

        const rightArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.2, 0.8, 8, 16),
            bodyMaterial
        );
        rightArm.position.set(0.7, 0.7, 0);
        rightArm.rotation.z = -Math.PI / 6;
        rightArm.castShadow = true;
        this.mesh.add(rightArm);

        // Legs
        const leftLeg = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.2, 0.8, 8, 16),
            bodyMaterial
        );
        leftLeg.position.set(-0.3, -0.2, 0);
        leftLeg.castShadow = true;
        this.mesh.add(leftLeg);

        const rightLeg = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.2, 0.8, 8, 16),
            bodyMaterial
        );
        rightLeg.position.set(0.3, -0.2, 0);
        rightLeg.castShadow = true;
        this.mesh.add(rightLeg);

        // Eyes
        const leftEye = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 16, 16),
            eyeMaterial
        );
        leftEye.position.set(-0.2, 1.5, 0.5);
        this.mesh.add(leftEye);

        const rightEye = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 16, 16),
            eyeMaterial
        );
        rightEye.position.set(0.2, 1.5, 0.5);
        this.mesh.add(rightEye);

        // Add to scene
        this.scene.add(this.mesh);
    }

    createPhysics() {
        // Create a compound shape for better collision
        const compoundShape = new Ammo.btCompoundShape();

        // Add body shape (capsule)
        const bodyShape = new Ammo.btCapsuleShape(0.5, 1.0);
        const bodyTransform = new Ammo.btTransform();
        bodyTransform.setIdentity();
        compoundShape.addChildShape(bodyTransform, bodyShape);

        // Add head shape (sphere)
        const headShape = new Ammo.btSphereShape(0.6);
        const headTransform = new Ammo.btTransform();
        headTransform.setIdentity();
        headTransform.setOrigin(new Ammo.btVector3(0, 0.8, 0));
        compoundShape.addChildShape(headTransform, headShape);

        // Create rigid body
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(
            this.position.x, this.position.y, this.position.z
        ));

        const mass = 1;
        const localInertia = new Ammo.btVector3(0, 0, 0);
        compoundShape.calculateLocalInertia(mass, localInertia);

        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, compoundShape, localInertia
        );

        this.body = new Ammo.btRigidBody(rbInfo);
        this.body.setFriction(0.8);
        this.body.setRollingFriction(0.5);
        this.body.setDamping(0.7, 0.7);
        this.body.setAngularFactor(new Ammo.btVector3(0.2, 1, 0.2));

        this.physicsWorld.addRigidBody(this.body);
    }

    update() {
        if (!this.body || !this.mesh) {
            console.warn('Player update: body or mesh is null');
            return;
        }

        // Update mesh position based on physics
        const ms = this.body.getMotionState();
        if (ms) {
            const transform = new Ammo.btTransform();
            ms.getWorldTransform(transform);
            const p = transform.getOrigin();
            const q = transform.getRotation();

            // Log position for debugging
            if (Math.random() < 0.01) { // Only log occasionally to avoid spam
                console.log('Player position:', p.x(), p.y(), p.z());
            }

            this.mesh.position.set(p.x(), p.y(), p.z());
            this.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
        }
    }

    applyForce(force) {
        if (!this.body) return;
        this.body.activate(true);
        this.body.applyCentralImpulse(force);
    }

    getPosition() {
        return this.mesh.position;
    }
}
