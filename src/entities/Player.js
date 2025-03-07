import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { log, error } from '../debug.js';

export class Player {
    constructor(scene, physicsWorld, position = { x: 0, y: 5, z: 0 }) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.mesh = null;
        this.body = null;
        this.modelLoaded = false;
        this.animations = {
            idle: null,
            walk: null,
            run: null,
            jump: null
        };
        this.currentAnimation = 'idle';
        this.mixer = null;
        this.currentAction = null;
        this.tempMesh = null;

        // Create a temporary mesh first - this ensures we always have a visible player
        this.createTempMesh();

        // Create physics body
        this.createPhysics();

        // Try to load the model, but don't wait for it
        setTimeout(() => {
            this.loadModel();
        }, 1000);

        log('Player created');
    }

    createTempMesh() {
        try {
            log('Creating temporary player model');

            // Create a simple temporary model
            const playerGroup = new THREE.Group();

            // Body
            const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 8, 16);
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: 0x3366ff,
                roughness: 0.7,
                metalness: 0.3
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.castShadow = true;
            body.position.y = 0.5;
            playerGroup.add(body);

            // Head
            const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
            const headMaterial = new THREE.MeshStandardMaterial({
                color: 0xffcc99,
                roughness: 0.7,
                metalness: 0.2
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 1.3;
            head.castShadow = true;
            playerGroup.add(head);

            // Set position
            playerGroup.position.set(this.position.x, this.position.y, this.position.z);

            this.tempMesh = playerGroup;
            this.mesh = playerGroup; // Use temp mesh until model loads
            this.scene.add(this.mesh);

            log('Temporary player model created');
        } catch (err) {
            error('Error creating temporary mesh', err);

            // Create an absolute fallback - just a box
            const geometry = new THREE.BoxGeometry(1, 2, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);
            this.scene.add(this.mesh);

            log('Fallback box mesh created');
        }
    }

    loadModel() {
        try {
            log('Loading player model');

            const loader = new GLTFLoader();

            // Use local model path instead of external URL to avoid CORS issues
            const modelUrl = './public/models/Soldier.glb';

            log(`Loading model from: ${modelUrl}`);

            loader.load(
                modelUrl,
                (gltf) => {
                    try {
                        log('Model loaded successfully');

                        // Set up the model
                        const model = gltf.scene;

                        // Keep the current position
                        if (this.mesh) {
                            model.position.copy(this.mesh.position);
                        } else {
                            model.position.set(this.position.x, this.position.y, this.position.z);
                        }

                        model.scale.set(1, 1, 1);
                        model.traverse((node) => {
                            if (node.isMesh) {
                                node.castShadow = true;
                                node.receiveShadow = true;
                            }
                        });

                        // Remove the temporary mesh
                        if (this.tempMesh) {
                            this.scene.remove(this.tempMesh);
                        }

                        // Replace the mesh
                        if (this.mesh && this.mesh !== this.tempMesh) {
                            this.scene.remove(this.mesh);
                        }

                        this.mesh = model;
                        this.scene.add(this.mesh);
                        this.modelLoaded = true;

                        // Set up animations
                        this.mixer = new THREE.AnimationMixer(model);

                        // Map animations to our animation types
                        if (gltf.animations && gltf.animations.length > 0) {
                            log(`Found ${gltf.animations.length} animations`);

                            gltf.animations.forEach((clip) => {
                                log(`Found animation: ${clip.name}`);

                                const lowerName = clip.name.toLowerCase();
                                if (lowerName.includes('idle')) {
                                    this.animations.idle = clip;
                                } else if (lowerName.includes('walk')) {
                                    this.animations.walk = clip;
                                } else if (lowerName.includes('run')) {
                                    this.animations.run = clip;
                                } else if (lowerName.includes('jump')) {
                                    this.animations.jump = clip;
                                }
                            });

                            // Start with idle animation
                            if (this.animations.idle) {
                                this.setAnimation('idle');
                            } else if (gltf.animations.length > 0) {
                                // If no idle animation found, use the first one
                                this.animations.idle = gltf.animations[0];
                                this.setAnimation('idle');
                            }
                        } else {
                            log('No animations found in the model');
                        }

                        log('Model setup complete');
                    } catch (err) {
                        error('Error in model loading callback', err);
                        // Keep using the temporary mesh
                        this.modelLoaded = false;
                    }
                },
                (xhr) => {
                    if (xhr.lengthComputable) {
                        const percent = (xhr.loaded / xhr.total * 100).toFixed(2);
                        log(`Loading model: ${percent}%`);
                    }
                },
                (err) => {
                    error('Error loading model', err);
                    log('Using temporary mesh instead');
                    this.modelLoaded = false;
                }
            );
        } catch (err) {
            error('Error in loadModel', err);
            this.modelLoaded = false;
        }
    }

    createPhysics() {
        try {
            log('Creating player physics');

            // Create physics body for player
            const shape = new Ammo.btCapsuleShape(0.5, 1);
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(
                this.position.x, this.position.y, this.position.z
            ));

            const mass = 1;
            const localInertia = new Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(mass, localInertia);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(
                mass, motionState, shape, localInertia
            );

            this.body = new Ammo.btRigidBody(rbInfo);
            this.body.setFriction(0.8);
            this.body.setRestitution(0.1);
            this.body.setDamping(0.2, 0.2);

            // Prevent player from tipping over
            this.body.setAngularFactor(new Ammo.btVector3(0, 1, 0));

            this.physicsWorld.addRigidBody(this.body);

            log('Player physics created');
        } catch (err) {
            error('Error creating physics', err);
        }
    }

    setAnimation(animationName) {
        try {
            log(`Player animation changed to: ${animationName}`);
            this.currentAnimation = animationName;

            // If we have a mixer and the requested animation
            if (this.mixer && this.animations[animationName]) {
                // If we have a current action, fade it out
                if (this.currentAction) {
                    const oldAction = this.currentAction;
                    const newAction = this.mixer.clipAction(this.animations[animationName]);

                    // Crossfade to new animation
                    oldAction.fadeOut(0.2);
                    newAction.reset().fadeIn(0.2).play();

                    this.currentAction = newAction;
                } else {
                    // Just play the new animation
                    this.currentAction = this.mixer.clipAction(this.animations[animationName]);
                    this.currentAction.play();
                }
            } else if (!this.modelLoaded && this.tempMesh) {
                // If model isn't loaded, change the color of the temp mesh
                const bodyMesh = this.tempMesh.children.find(child =>
                    child instanceof THREE.Mesh && child.position.y === 0.5);

                if (bodyMesh) {
                    switch (animationName) {
                        case 'idle':
                            bodyMesh.material.color.set(0x3366ff); // Blue
                            break;
                        case 'walk':
                            bodyMesh.material.color.set(0x33cc33); // Green
                            break;
                        case 'run':
                            bodyMesh.material.color.set(0xff6600); // Orange
                            break;
                        case 'jump':
                            bodyMesh.material.color.set(0xffcc00); // Yellow
                            break;
                    }
                }
            }
        } catch (err) {
            error('Error in setAnimation', err);
        }
    }

    update(deltaTime) {
        try {
            if (!this.body || !this.mesh) return;

            // Update mesh position based on physics
            const ms = this.body.getMotionState();
            if (ms) {
                const transform = new Ammo.btTransform();
                ms.getWorldTransform(transform);
                const p = transform.getOrigin();
                const q = transform.getRotation();

                this.mesh.position.set(p.x(), p.y(), p.z());

                // For the soldier model, we don't want to rotate it with physics
                // Instead, we'll handle rotation manually based on movement direction
                if (this.modelLoaded) {
                    // Keep the y rotation (for direction) but reset x and z rotation
                    const euler = new THREE.Euler().setFromQuaternion(
                        new THREE.Quaternion(q.x(), q.y(), q.z(), q.w())
                    );
                    this.mesh.rotation.y = euler.y;
                } else {
                    // For the temp mesh, apply full rotation
                    this.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
                }
            }

            // Update animation mixer
            if (this.mixer && deltaTime) {
                this.mixer.update(deltaTime);
            }
        } catch (err) {
            error('Error in player update', err);
        }
    }

    applyForce(force) {
        try {
            if (!this.body) return;
            this.body.activate(true);
            this.body.applyCentralImpulse(force);
        } catch (err) {
            error('Error applying force', err);
        }
    }

    getPosition() {
        if (!this.mesh) return new THREE.Vector3();
        return this.mesh.position;
    }
}
