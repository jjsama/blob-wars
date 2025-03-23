import * as THREE from 'three';
export class Projectile {
    constructor(scene, physicsWorld, position, direction, speed = 40, owner = null) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.direction = direction.clone().normalize();
        this.speed = 40;
        this.lifetime = 3000;
        this.creationTime = Date.now();
        this.mesh = null;
        this.body = null;
        this.damage = 25;
        this.trailParticles = [];
        this.initialDirection = direction.clone();
        this.owner = owner;
        
        this.create();
    }

    create() {
        // Create a much smaller projectile
        const radius = 0.05; // Reduced by 0.4 times
        const geometry = new THREE.SphereGeometry(radius, 8, 8);
        
        // Determine projectile color based on owner
        let projectileColor = 0xffff00; // Default yellow
        
        if (this.owner) {
            // If owner has a color property, use it
            if (this.owner.color) {
                projectileColor = this.owner.color;
            }
            // For player (blue)
            else if (this.owner.isPlayer) {
                projectileColor = 0x3498db; // Blue for player
            }
        }
        
        // Make it more visible with emission based on owner's color
        const material = new THREE.MeshStandardMaterial({
            color: projectileColor,
            emissive: projectileColor,
            emissiveIntensity: 0.5,
            metalness: 0.7,
            roughness: 0.3
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

        // Set initial velocity in the direction of aim
        const velocity = new Ammo.btVector3(
            this.direction.x * this.speed,
            this.direction.y * this.speed,
            this.direction.z * this.speed
        );
        this.body.setLinearVelocity(velocity);

        // Disable rotation to keep bullet oriented correctly
        this.body.setAngularFactor(new Ammo.btVector3(0, 0, 0));

        // COMPLETELY DISABLE GRAVITY - this is the key change
        this.body.setGravity(new Ammo.btVector3(0, 0, 0));

        // No damping to maintain velocity
        this.body.setDamping(0, 0);

        // Add to physics world
        this.physicsWorld.addRigidBody(this.body);

        // Create initial trail particle
        this.addTrailParticle();

        // Also update trail particles to match
        this.trailColor = projectileColor;
    }

    addTrailParticle() {
        // Create a small particle at the current position
        const particleGeometry = new THREE.SphereGeometry(0.03, 4, 4);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: this.trailColor || 0xff4400,
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

    update(deltaTime) {
        if (!this.body || !this.mesh) return false;

        // Update mesh position based on physics
        const ms = this.body.getMotionState();
        if (ms) {
            const transform = new Ammo.btTransform();
            ms.getWorldTransform(transform);
            const p = transform.getOrigin();

            // Update position
            this.mesh.position.set(p.x(), p.y(), p.z());

            // IMPORTANT: Force the projectile to maintain its exact direction
            // This ensures it travels in a perfectly straight line
            const currentVelocity = this.body.getLinearVelocity();
            const newVelocity = new Ammo.btVector3(
                this.initialDirection.x * this.speed,
                this.initialDirection.y * this.speed,
                this.initialDirection.z * this.speed
            );
            this.body.setLinearVelocity(newVelocity);

            // Keep the orientation aligned with the direction of travel
            this.mesh.lookAt(
                this.mesh.position.clone().add(this.initialDirection)
            );

            // Add trail particles occasionally
            if (Math.random() < 0.3) { // 30% chance each frame
                this.addTrailParticle();
            }

            // Update trail particles
            this.updateTrailParticles();
        }

        // Check if projectile should be removed
        if (Date.now() - this.creationTime > this.lifetime) {
            this.remove();
            return false;
        }

        // Add particle trail for better visibility
        if (this.mesh && Math.random() > 0.5) {
            const trailParticle = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 4, 4),
                new THREE.MeshBasicMaterial({
                    color: this.trailColor || 0xffff00,
                    transparent: true,
                    opacity: 0.7
                })
            );

            trailParticle.position.copy(this.mesh.position);
            this.scene.add(trailParticle);

            // Fade out and remove trail particle
            setTimeout(() => {
                const fadeOut = setInterval(() => {
                    if (trailParticle.material.opacity <= 0.1) {
                        clearInterval(fadeOut);
                        this.scene.remove(trailParticle);
                    } else {
                        trailParticle.material.opacity -= 0.1;
                    }
                }, 50);
            }, 100);
        }

        return true;
    }

    updateTrailParticles() {
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

    handleCollision(collisionPoint, normal) {
        // Create impact mark at collision point
        if (collisionPoint) {
            this.createImpactMark(collisionPoint, normal);
        }
        
        // Always remove the projectile on any collision
        this.remove();
        
        // Check if we hit a character to apply damage
        if (this.hitObject && (this.hitObject.isPlayer || this.hitObject.isEnemy)) {
            // Handle character hit
            if (this.hitObject.takeDamage) {
                this.hitObject.takeDamage(this.damage);
            }
        }
    }

    // Add a new method to create impact marks
    createImpactMark(position, normal) {
        // Create a small decal at the impact point
        const decalSize = 0.2;
        const decalGeometry = new THREE.CircleGeometry(decalSize, 8);
        
        // Rotate the decal to face along the normal
        if (normal) {
            const decalRotation = new THREE.Matrix4();
            const decalUp = new THREE.Vector3(0, 1, 0);
            
            // Align with the surface normal
            if (Math.abs(normal.dot(decalUp)) < 0.99) {
                const axis = new THREE.Vector3().crossVectors(decalUp, normal).normalize();
                const angle = Math.acos(decalUp.dot(normal));
                decalRotation.makeRotationAxis(axis, angle);
                decalGeometry.applyMatrix4(decalRotation);
            }
        }
        
        // Create material with the same color as the projectile but darker
        const decalColor = new THREE.Color(this.trailColor || 0xff4400).multiplyScalar(0.7);
        const decalMaterial = new THREE.MeshBasicMaterial({
            color: decalColor,
            transparent: true,
            opacity: 0.8,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        });
        
        const decal = new THREE.Mesh(decalGeometry, decalMaterial);
        
        // Position slightly above the surface to prevent z-fighting
        const offset = 0.01;
        if (normal) {
            decal.position.copy(position).addScaledVector(normal, offset);
        } else {
            decal.position.copy(position);
        }
        
        // Add to scene
        this.scene.add(decal);
        
        // Remove after 2 seconds with fade out
        setTimeout(() => {
            const fadeInterval = setInterval(() => {
                if (decal.material.opacity <= 0.1) {
                    clearInterval(fadeInterval);
                    this.scene.remove(decal);
                } else {
                    decal.material.opacity -= 0.1;
                }
            }, 100);
        }, 2000);
    }
} 