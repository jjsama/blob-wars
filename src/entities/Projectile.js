import * as THREE from 'three';
export class Projectile {
    constructor(scene, physicsWorld, position, direction) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.direction = direction.clone().normalize();
        this.speed = 50;
        this.lifetime = 5000;
        this.creationTime = Date.now();
        this.mesh = null;
        this.body = null;

        this.create();
    }

    create() {
        // Create visual representation
        const geometry = new THREE.SphereGeometry(0.2, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff4400,
            emissiveIntensity: 0.5,
            metalness: 0.7,
            roughness: 0.3
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);

        // Create physics body
        const shape = new Ammo.btSphereShape(0.2);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(
            this.position.x, this.position.y, this.position.z
        ));

        const mass = 0.5;
        const localInertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);

        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, localInertia
        );

        this.body = new Ammo.btRigidBody(rbInfo);

        // Set initial velocity in the direction of aim
        const velocity = new Ammo.btVector3(
            this.direction.x * this.speed,
            this.direction.y * this.speed,
            this.direction.z * this.speed
        );
        this.body.setLinearVelocity(velocity);

        // Disable rotation to keep projectile stable
        this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0));

        // Reduce gravity effect significantly
        this.body.setGravity(new Ammo.btVector3(0, -0.5, 0));

        // Reduce damping to maintain velocity
        this.body.setDamping(0.01, 0.01);

        // Add to physics world
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

            // Maintain velocity to counter any slowdown
            const velocity = this.body.getLinearVelocity();
            const speed = Math.sqrt(
                velocity.x() * velocity.x() +
                velocity.y() * velocity.y() +
                velocity.z() * velocity.z()
            );

            // If speed has dropped significantly, boost it back up
            if (speed < this.speed * 0.9) {
                const dir = new THREE.Vector3(velocity.x(), velocity.y(), velocity.z()).normalize();
                const newVelocity = new Ammo.btVector3(
                    dir.x * this.speed,
                    dir.y * this.speed,
                    dir.z * this.speed
                );
                this.body.setLinearVelocity(newVelocity);
            }
        }

        // Check if projectile should be removed
        if (Date.now() - this.creationTime > this.lifetime) {
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