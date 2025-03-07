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
} 