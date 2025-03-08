import * as THREE from 'three';
export class Projectile {
    constructor(scene, physicsWorld, position, direction) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.direction = direction.clone().normalize();
        this.speed = 100; // Increased from 50 to 100 for faster bullet-like speed
        this.lifetime = 3000; // Reduced lifetime for more realistic bullets
        this.creationTime = Date.now();
        this.mesh = null;
        this.body = null;
        this.damage = 25; // Each projectile does 25 damage
        this.trailParticles = []; // For bullet trail effect

        this.create();
    }

    create() {
        // Create a more bullet-like visual representation
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
        geometry.rotateX(Math.PI / 2); // Orient the cylinder along the z-axis

        const material = new THREE.MeshStandardMaterial({
            color: 0xffff00, // Yellow/brass color
            emissive: 0xff8800,
            emissiveIntensity: 0.5,
            metalness: 0.9,
            roughness: 0.2
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;

        // Orient the bullet in the direction of travel
        this.mesh.lookAt(this.position.clone().add(this.direction));

        this.scene.add(this.mesh);

        // Create physics body - smaller and more streamlined
        const shape = new Ammo.btCapsuleShape(0.05, 0.2);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(
            this.position.x, this.position.y, this.position.z
        ));

        // Orient the physics shape in the direction of travel
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.direction);
        const ammoQuat = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
        transform.setRotation(ammoQuat);

        const mass = 0.1; // Very light
        const localInertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);

        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(
            mass, motionState, shape, localInertia
        );

        this.body = new Ammo.btRigidBody(rbInfo);

        // Set initial velocity in the direction of aim - much faster
        const velocity = new Ammo.btVector3(
            this.direction.x * this.speed,
            this.direction.y * this.speed,
            this.direction.z * this.speed
        );
        this.body.setLinearVelocity(velocity);

        // Disable rotation to keep bullet oriented correctly
        this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0));

        // Almost no gravity effect for bullets
        this.body.setGravity(new Ammo.btVector3(0, -0.1, 0));

        // No damping to maintain velocity
        this.body.setDamping(0, 0);

        // Add to physics world
        this.physicsWorld.addRigidBody(this.body);

        // Create initial trail particle
        this.addTrailParticle();
    }

    addTrailParticle() {
        // Create a small particle at the current position
        const particleGeometry = new THREE.SphereGeometry(0.03, 4, 4);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.7
        });

        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(this.mesh.position);
        particle.creationTime = Date.now();
        particle.lifetime = 300; // Short lifetime for trail particles

        this.scene.add(particle);
        this.trailParticles.push(particle);
    }

    update() {
        if (!this.body || !this.mesh) return false;

        // Update mesh position based on physics
        const ms = this.body.getMotionState();
        if (ms) {
            const transform = new Ammo.btTransform();
            ms.getWorldTransform(transform);
            const p = transform.getOrigin();
            const q = transform.getRotation();

            // Update position
            this.mesh.position.set(p.x(), p.y(), p.z());
            this.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());

            // Add trail particles occasionally
            if (Math.random() < 0.3) { // 30% chance each frame
                this.addTrailParticle();
            }

            // Update trail particles
            for (let i = this.trailParticles.length - 1; i >= 0; i--) {
                const particle = this.trailParticles[i];

                // Fade out particles
                const age = Date.now() - particle.creationTime;
                const lifeRatio = age / particle.lifetime;

                if (lifeRatio >= 1) {
                    // Remove old particles
                    this.scene.remove(particle);
                    this.trailParticles.splice(i, 1);
                } else {
                    // Fade out
                    particle.material.opacity = 0.7 * (1 - lifeRatio);
                    // Shrink slightly
                    const scale = 1 - (lifeRatio * 0.5);
                    particle.scale.set(scale, scale, scale);
                }
            }

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
        // Remove all trail particles
        for (const particle of this.trailParticles) {
            this.scene.remove(particle);
        }
        this.trailParticles = [];

        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh = null;
        }

        if (this.body) {
            this.physicsWorld.removeRigidBody(this.body);
            this.body = null;
        }
    }
} 