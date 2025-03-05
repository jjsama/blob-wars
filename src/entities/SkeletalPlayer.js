import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js';

export class SkeletalPlayer {
    constructor(scene, physicsWorld, position = { x: 0, y: 5, z: 0 }) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.mesh = null;
        this.body = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.loadModel();
    }

    loadModel() {
        // Create a temporary mesh while the model loads
        const tempGeometry = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
        const tempMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            roughness: 0.3,
            metalness: 0.1,
            emissive: 0x330000
        });
        
        this.mesh = new THREE.Mesh(tempGeometry, tempMaterial);
        this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);
        
        // Create physics for the temporary mesh
        this.createPhysics();
        
        // Load the actual model
        const loader = new THREE.GLTFLoader();
        
        // We'll use a simple model for now - you can replace with a more complex one later
        loader.load('https://threejs.org/examples/models/gltf/Soldier.glb', (gltf) => {
            // Remove the temporary mesh
            this.scene.remove(this.mesh);
            
            // Set up the model
            this.mesh = gltf.scene;
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);
            this.mesh.scale.set(1, 1, 1);
            this.mesh.castShadow = true;
            
            // Make sure all parts cast shadows
            this.mesh.traverse((object) => {
                if (object.isMesh) {
                    object.castShadow = true;
                }
            });
            
            this.scene.add(this.mesh);
            
            // Set up animations
            this.mixer = new THREE.AnimationMixer(this.mesh);
            
            // Store animations
            gltf.animations.forEach((clip) => {
                const name = clip.name.toLowerCase();
                this.animations[name] = this.mixer.clipAction(clip);
            });
            
            // Play idle animation by default
            if (this.animations['idle']) {
                this.animations['idle'].play();
                this.currentAction = this.animations['idle'];
            }
        });
    }

    createPhysics() {
        // Create a capsule shape for physics
        const shape = new Ammo.btCapsuleShape(0.5, 1.0);
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
        this.body.setRollingFriction(0.5);
        this.body.setDamping(0.7, 0.7);
        this.body.setAngularFactor(new Ammo.btVector3(0.2, 1, 0.2));
        
        this.physicsWorld.addRigidBody(this.body);
    }

    update(deltaTime) {
        if (!this.body || !this.mesh) return;
        
        // Update animations
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
        
        // Update mesh position based on physics
        const ms = this.body.getMotionState();
        if (ms) {
            const transform = new Ammo.btTransform();
            ms.getWorldTransform(transform);
            const p = transform.getOrigin();
            
            // Only update position, not rotation (for better animation)
            this.mesh.position.set(p.x(), p.y(), p.z());
            
            // Update rotation only on Y axis for direction
            const q = transform.getRotation();
            const euler = new THREE.Euler().setFromQuaternion(
                new THREE.Quaternion(q.x(), q.y(), q.z(), q.w())
            );
            
            // Only apply Y rotation to keep character upright
            this.mesh.rotation.y = euler.y;
        }
    }

    applyForce(force) {
        if (!this.body) return;
        this.body.activate(true);
        this.body.applyCentralImpulse(force);
    }

    getPosition() {
        return this.mesh.position;
    }
    
    // Animation control methods
    playAnimation(name, fadeTime = 0.2) {
        if (!this.animations[name] || !this.mixer) return;
        
        const newAction = this.animations[name];
        
        if (this.currentAction === newAction) return;
        
        // Crossfade to new animation
        newAction.reset();
        newAction.setEffectiveTimeScale(1);
        newAction.setEffectiveWeight(1);
        
        if (this.currentAction) {
            this.currentAction.crossFadeTo(newAction, fadeTime, true);
        }
        
        newAction.play();
        this.currentAction = newAction;
    }
} 