import * as THREE from 'three';

export class Projectile {
    constructor(scene, physicsWorld, position, direction, speed = 60, owner = null) {
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

        // Get owner's color if available, otherwise use default red
        this.color = (owner && owner.playerColor) ? owner.playerColor : 0xff0000;

        this.create();
    }

    activate(position, direction, owner = null, speed = 60) {
        console.log('[Projectile activate] Activating projectile...');
        this.position.copy(position);
        this.direction.copy(direction).normalize();
        this.speed = speed;
        this.owner = owner;
        this.creationTime = Date.now();
        this.active = true; // Make sure active flag is set
        this.color = (owner && owner.playerColor) ? owner.playerColor : 0xff0000;

        // Recreate mesh if it doesn't exist or was removed
        if (!this.mesh) {
            console.log('[Projectile activate] Recreating mesh...');
            this.createMesh(); // Use helper
        } else {
            // Update existing mesh color and position
            this.mesh.material.color.setHex(this.color);
            this.mesh.position.copy(this.position);
            this.scene.add(this.mesh); // Ensure it's in the scene
            console.log('[Projectile activate] Re-added existing mesh to scene.');
        }

        // Recreate physics body if it doesn't exist or was removed
        if (!this.body) {
            console.log('[Projectile activate] Recreating physics body...');
            this.createBody(); // Use helper
        } else {
            // Reset body position and ensure it's in the world
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(this.position.x, this.position.y, this.position.z));
            this.body.setWorldTransform(transform);
            this.body.getMotionState().setWorldTransform(transform);
            // Re-add to world just in case (might not be necessary if never removed properly)
            this.physicsWorld.addRigidBody(this.body);
            console.log('[Projectile activate] Reset existing physics body transform.');
        }

        // Store initial direction for movement
        this.initialDirection = this.direction.clone();
        console.log('[Projectile activate] Activation complete.');
    }

    createMesh() {
        const radius = 0.08;
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.3,
            metalness: 0.7,
            transparent: true,
            opacity: 0.8
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        console.log(`[Projectile createMesh] Mesh created. Position: ${this.mesh.position.x.toFixed(2)},${this.mesh.position.y.toFixed(2)},${this.mesh.position.z.toFixed(2)}. Color: #${material.color.getHexString()}, Opacity: ${material.opacity}`);
    }

    createBody() {
        const radius = 0.08;
        const physicsRadius = radius * 0.8;
        const shape = new Ammo.btSphereShape(physicsRadius);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(this.position.x, this.position.y, this.position.z));

        const mass = 0; // Kinematic
        const localInertia = new Ammo.btVector3(0, 0, 0);
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        this.body = new Ammo.btRigidBody(rbInfo);
        this.body.projectileInstance = this;
        this.body.setCollisionFlags(2); // CF_KINEMATIC_OBJECT
        this.physicsWorld.addRigidBody(this.body);
        Ammo.destroy(localInertia); // Clean up
        console.log('[Projectile createBody] Body created and added.');
    }

    create() {
        try {
            this.createMesh();
            this.createBody();
            this.initialDirection = this.direction.clone(); // Store initial direction
        } catch (err) {
            console.error('Failed to create projectile:', err);
            // Ensure we have a valid mesh even if physics fails
            if (!this.mesh) {
                this.createMesh();
            }
        }
    }

    update(deltaTime) {
        try {
            if (!this.active || !this.mesh) return false;

            const moveAmount = this.speed * (deltaTime || 0.016);

            this.mesh.position.x += this.initialDirection.x * moveAmount;
            this.mesh.position.y += this.initialDirection.y * moveAmount;
            this.mesh.position.z += this.initialDirection.z * moveAmount;

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
                Ammo.destroy(transform);
            }

            const timeAlive = Date.now() - this.creationTime;
            if (timeAlive > this.lifetime) {
                console.log(`[Projectile update] Lifetime exceeded (${timeAlive} > ${this.lifetime}). Removing.`);
                this.remove('lifetime');
                return false;
            }

            this.checkCollisions();

            return this.active;
        } catch (err) {
            console.error('[Projectile update] Error:', err);
            this.remove('error');
            return false;
        }
    }

    checkCollisions() {
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
                const hitBody = Ammo.castObject(rayCallback.m_collisionObject, Ammo.btRigidBody);

                const ownerBody = this.owner?.body;
                if (hitBody !== this.body && hitBody !== ownerBody) {
                    const hitPoint = rayCallback.get_m_hitPointWorld();
                    console.log(`[Projectile checkCollisions] Ray hit detected. Removing projectile. Hit point: ${hitPoint.x().toFixed(2)},${hitPoint.y().toFixed(2)},${hitPoint.z().toFixed(2)}`);
                    this.handleCollision();
                } else if (hitBody === ownerBody) {
                    // Optional: Log if it hit the owner but ignore collision
                    // console.log('[Projectile checkCollisions] Ray hit owner. Ignoring.');
                }
            }

            Ammo.destroy(rayStart);
            Ammo.destroy(rayEnd);
            Ammo.destroy(rayCallback);
        } catch (err) {
            console.error('Error in collision check:', err);
        }
    }

    handleCollision() {
        try {
            this.remove();

            if (this.hitObject && this.hitObject.takeDamage) {
                this.hitObject.takeDamage(this.damage);
            }
        } catch (err) {
            console.error('Error in projectile collision handling:', err);
        }
    }

    remove(reason = 'unknown') {
        if (!this.active) {
            return;
        }

        console.log(`[Projectile remove] Removing projectile. Reason: ${reason}`);
        this.active = false;
        try {
            if (this.mesh) {
                this.scene.remove(this.mesh);
            }

            if (this.body) {
                this.physicsWorld.removeRigidBody(this.body);
            }
        } catch (err) {
            console.error('Error removing projectile graphics/physics:', err);
        }
    }
} 