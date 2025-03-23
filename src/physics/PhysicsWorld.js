import { log, error } from '../debug.js';

export class PhysicsWorld {
    constructor() {
        this.physicsWorld = null;
        this.rigidBodies = [];
        this.tmpTransform = null;
    }

    init() {
        try {
            log('Initializing physics world');

            // Check if Ammo is available
            if (typeof Ammo === 'undefined') {
                throw new Error('Ammo.js is not loaded');
            }

            // Create collision configuration
            log('Creating collision configuration');
            const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();

            // Create dispatcher
            log('Creating dispatcher');
            const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);

            // Create broadphase
            log('Creating broadphase');
            const broadphase = new Ammo.btDbvtBroadphase();

            // Create solver
            log('Creating solver');
            const solver = new Ammo.btSequentialImpulseConstraintSolver();

            // Create physics world
            log('Creating dynamics world');
            this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(
                dispatcher, broadphase, solver, collisionConfiguration
            );

            // Set gravity - increase gravity for faster falling
            log('Setting gravity');
            this.physicsWorld.setGravity(new Ammo.btVector3(0, -20, 0));

            // Create temporary transform
            this.tmpTransform = new Ammo.btTransform();

            // Set up collision detection
            this.setupCollisionDetection();

            log('Physics world initialized successfully');
        } catch (err) {
            error('Failed to initialize physics world', err);
            throw err;
        }
    }

    update(deltaTime) {
        if (!this.physicsWorld) return;

        // Step simulation
        this.physicsWorld.stepSimulation(deltaTime, 10);
    }

    rayTest(from, to) {
        try {
            // Create raycast callback
            const rayCallback = new Ammo.ClosestRayResultCallback(from, to);

            // Perform raycast
            this.physicsWorld.rayTest(from, to, rayCallback);

            return rayCallback;
        } catch (err) {
            error('Failed to perform rayTest', err);

            // Return a dummy callback object with hasHit method to prevent errors
            return {
                hasHit: () => false,
                get_m_collisionObject: () => null,
                get_m_hitPointWorld: () => ({ x: () => 0, y: () => 0, z: () => 0 })
            };
        }
    }

    registerRigidBody(mesh, body) {
        if (mesh && body) {
            this.rigidBodies.push({ mesh, body });
        }
    }

    createRigidBody(shape, mass, position, rotation = { x: 0, y: 0, z: 0 }) {
        try {
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));

            const quaternion = new Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, 1);
            transform.setRotation(quaternion);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const localInertia = new Ammo.btVector3(0, 0, 0);

            if (mass > 0) {
                shape.calculateLocalInertia(mass, localInertia);
            }

            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );

            const body = new Ammo.btRigidBody(rbInfo);
            this.physicsWorld.addRigidBody(body);

            return body;
        } catch (err) {
            error('Failed to create rigid body', err);
            throw err;
        }
    }

    setupCollisionDetection() {
        if (!this.physicsWorld) return;

        try {
            // Get the dispatcher
            const dispatcher = this.physicsWorld.getDispatcher();

            // Set up a callback for each physics step
            this.physicsWorld.setInternalTickCallback(() => {
                try {
                    const numManifolds = dispatcher.getNumManifolds();

                    // Check each collision manifold
                    for (let i = 0; i < numManifolds; i++) {
                        const manifold = dispatcher.getManifoldByIndexInternal(i);
                        const numContacts = manifold.getNumContacts();

                        if (numContacts > 0) {
                            // Get the two colliding bodies
                            const body0 = Ammo.castObject(manifold.getBody0(), Ammo.btRigidBody);
                            const body1 = Ammo.castObject(manifold.getBody1(), Ammo.btRigidBody);

                            // Check if either is a projectile
                            const isProjectile0 = body0.getCollisionFlags() & 4;
                            const isProjectile1 = body1.getCollisionFlags() & 4;

                            if (isProjectile0 || isProjectile1) {
                                // Get the projectile
                                const projectile = isProjectile0 ? body0 : body1;

                                // Try to get the projectile instance using the direct reference
                                if (projectile.projectileInstance) {
                                    projectile.projectileInstance.handleCollision();
                                } else {
                                    // Fallback: find projectile in game arrays
                                    const projectiles = window.game ?
                                        [...window.game.projectiles, ...window.game.enemyProjectiles] : [];

                                    for (const p of projectiles) {
                                        if (p.body === projectile) {
                                            p.handleCollision();
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error in collision detection:', err);
                }
            });
        } catch (err) {
            console.error('Failed to set up collision detection:', err);
        }
    }

    addRigidBody(body, userData = null) {
        if (!this.physicsWorld) return;

        this.physicsWorld.addRigidBody(body);

        // If userData is provided, attach it to the body
        if (userData) {
            // Store the userData in the body
            body.userData = userData;
        }
    }

    removeRigidBody(body) {
        if (!this.physicsWorld || !body) return;

        try {
            this.physicsWorld.removeRigidBody(body);
        } catch (err) {
            console.error('Error removing rigid body:', err);
        }
    }
} 