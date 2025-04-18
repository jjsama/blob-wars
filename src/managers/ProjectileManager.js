import { ObjectPool } from '../utils/ObjectPool.js';
import { Projectile } from '../entities/Projectile.js';
import * as THREE from 'three';

export class ProjectileManager {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;

        // Create projectile pool
        this.projectilePool = new ObjectPool(
            () => {
                // Provide dummy vectors for initial pool creation
                const dummyPosition = new THREE.Vector3(0, -1000, 0); // Off-screen initial position
                const dummyDirection = new THREE.Vector3(0, 0, 1);
                // Pass all required args, even if some are dummies for pool init
                return new Projectile(this.scene, this.physicsWorld, dummyPosition, dummyDirection);
            },
            30 // Initial pool size
        );

        this.activeProjectiles = [];
    }

    createProjectile(position, direction, isEnemy = false, owner = null) {
        const projectile = this.projectilePool.get();
        projectile.activate(position, direction, owner);
        projectile.isEnemy = isEnemy; // Track if this is an enemy projectile

        this.activeProjectiles.push(projectile);
        console.log(`[ProjectileManager] Created projectile. Owner: ${owner?.playerId || 'None'}, isEnemy: ${isEnemy}`);
        return projectile;
    }

    update() {
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.activeProjectiles[i];
            const isActive = projectile.update();

            if (!isActive) {
                // Return to pool
                this.projectilePool.release(projectile);
                this.activeProjectiles.splice(i, 1);
            }
        }
    }

    dispose() {
        // Clean up all projectiles
        for (const projectile of this.activeProjectiles) {
            projectile.deactivate();
        }
        this.activeProjectiles = [];
        this.projectilePool.dispose();
    }
} 