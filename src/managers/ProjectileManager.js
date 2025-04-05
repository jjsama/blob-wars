import { ObjectPool } from '../utils/ObjectPool.js';
import { Projectile } from '../entities/Projectile.js';

export class ProjectileManager {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;

        // Create projectile pool
        this.projectilePool = new ObjectPool(
            () => new Projectile(this.scene, this.physicsWorld),
            30 // Initial pool size
        );

        this.activeProjectiles = [];
    }

    createProjectile(position, direction, isEnemy = false) {
        const projectile = this.projectilePool.get();
        projectile.activate(position, direction);
        projectile.isEnemy = isEnemy; // Track if this is an enemy projectile

        this.activeProjectiles.push(projectile);
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

    checkCollisions(player, enemies) {
        // Check player projectiles against enemies
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.activeProjectiles[i];
            if (!projectile.active) continue;

            // Remove enemy-related logic
            // if (!projectile.isEnemy) {
            //     // Player projectile - check against enemies
            //     for (const enemy of enemies) {
            //         if (enemy.isDead) continue;
            //         const enemyPos = enemy.getPosition();
            //         const projectilePos = projectile.mesh.position;
            //         const distance = projectilePos.distanceTo(enemyPos);
            //         if (distance < 2) {
            //             enemy.takeDamage(projectile.damage);
            //             this.projectilePool.release(projectile);
            //             this.activeProjectiles.splice(i, 1);
            //             break;
            //         }
            //     }
            // } else {
            //     // Enemy projectile - check against player
            //     if (player && !player.isDead) {
            //         const playerPos = player.getPosition();
            //         const projectilePos = projectile.mesh.position;
            //         const distance = projectilePos.distanceTo(playerPos);
            //         if (distance < 2) {
            //             player.takeDamage(projectile.damage);
            //             this.projectilePool.release(projectile);
            //             this.activeProjectiles.splice(i, 1);
            //         }
            //     }
            // }
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