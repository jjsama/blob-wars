import * as THREE from 'three';

export class Projectile {
    constructor(scene, physicsWorld, position, direction, speed = 40, owner = null) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position.clone();
        this.direction = direction.clone().normalize();
        this.speed = speed;
        this.lifetime = 3000; // 3 seconds lifetime
        this.creationTime = Date.now();
        this.damage = 25;
        this.owner = owner;
        this.mesh = null;
        this.body = null;

        // Use a single color for all bullets
        this.color = 0xff0000; // Bright red for all bullets

        this.create();
    }

    create() {
        try {
            // Create a simple small sphere
            const radius = 0.05;
            const geometry = new THREE.SphereGeometry(radius, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: this.color
            });

            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.copy(this.position);
            this.scene.add(this.mesh);

            // Create physics body
            const shape = new Ammo.btSphereShape(radius);
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(
                this.position.x, this.position.y, this.position.z
            ));

            const mass = 0; // CRITICAL: Use mass of 0 to make it kinematic
            const localInertia = new Ammo.btVector3(0, 0, 0);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );

            this.body = new Ammo.btRigidBody(rbInfo);

            // Add user data to identify this as a projectile
            this.body.projectileInstance = this;

            // CRITICAL: Set collision flags for kinematic object
            this.body.setCollisionFlags(2); // CF_KINEMATIC_OBJECT = 2

            // Add to physics world
            this.physicsWorld.addRigidBody(this.body);

            // Store initial direction for consistent movement
            this.initialDirection = this.direction.clone();

            // Clean up Ammo.js objects that are no longer needed
            Ammo.destroy(localInertia);
        } catch (err) {
            console.error('Failed to create projectile:', err);
            // Ensure we have a valid mesh even if physics fails
            if (!this.mesh) {
                const geometry = new THREE.SphereGeometry(0.05, 8, 8);
                const material = new THREE.MeshBasicMaterial({ color: this.color });
                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
            }
        }
    }

    update(deltaTime) {
        try {
            if (!this.mesh) return false;

            // CRITICAL: Move the projectile manually in a straight line
            // This ensures it travels exactly in the direction it was fired
            const moveAmount = this.speed * (deltaTime || 0.016); // Default to 60fps if no deltaTime

            // Update position directly
            this.mesh.position.x += this.initialDirection.x * moveAmount;
            this.mesh.position.y += this.initialDirection.y * moveAmount;
            this.mesh.position.z += this.initialDirection.z * moveAmount;

            // If we have a physics body, update it to match the mesh
            if (this.body) {
                const transform = new Ammo.btTransform();
                transform.setIdentity();
                transform.setOrigin(new Ammo.btVector3(
                    this.mesh.position.x,
                    this.mesh.position.y,
                    this.mesh.position.z
                ));
                this.body.setWorldTransform(transform);
                this.body.getMotionState().setWorldTransform(transform);
            }

            // Check lifetime
            if (Date.now() - this.creationTime > this.lifetime) {
                this.remove();
                return false;
            }

            // Check for collisions manually
            this.checkCollisions();

            return true;
        } catch (err) {
            console.error('Error in projectile update:', err);
            this.remove();
            return false;
        }
    }

    checkCollisions() {
        // Perform a raycast in the direction of travel to detect collisions
        if (!this.physicsWorld || !this.mesh) return;

        try {
            const rayStart = new Ammo.btVector3(
                this.mesh.position.x,
                this.mesh.position.y,
                this.mesh.position.z
            );

            const rayEnd = new Ammo.btVector3(
                this.mesh.position.x + this.initialDirection.x * 0.2,
                this.mesh.position.y + this.initialDirection.y * 0.2,
                this.mesh.position.z + this.initialDirection.z * 0.2
            );

            const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);
            this.physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

            if (rayCallback.hasHit()) {
                // Get the hit object
                const hitBody = Ammo.castObject(rayCallback.m_collisionObject, Ammo.btRigidBody);

                // Don't collide with self
                if (hitBody !== this.body) {
                    this.handleCollision();
                }
            }

            // Clean up Ammo.js objects
            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);
        } catch (err) {
            console.error('Error in collision check:', err);
        }
    }

    handleCollision() {
        try {
            // Simply remove the projectile on any collision
            this.remove();

            // Apply damage if hit character
            if (this.hitObject && this.hitObject.takeDamage) {
                this.hitObject.takeDamage(this.damage);
            }
        } catch (err) {
            console.error('Error in projectile collision handling:', err);
        }
    }

    remove() {
        try {
            if (this.mesh) {
                this.scene.remove(this.mesh);
                this.mesh = null;
            }

            if (this.body) {
                this.physicsWorld.removeRigidBody(this.body);
                this.body = null;
            }
        } catch (err) {
            console.error('Error removing projectile:', err);
        }
    }
} 