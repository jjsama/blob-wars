export class Player {
    constructor(scene, physicsWorld, position = GAME_CONFIG.playerStartPosition, playerId = null) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.mesh = null;
        this.body = null;
        this.modelLoaded = false;
        this.animations = {};
        this.animationActions = {};
        this.currentAnimation = 'idle';
        this.mixer = null;
        this.currentAction = null;
        this.health = 100;
        this.isDead = false;
        this.isAttacking = false;
        this.isJumping = false;
        this.canJump = false;
        this.mixerEventAdded = false;
        this._loggedMissingIdle = false;
        this._physicsCreated = false;
        this.playerId = playerId || 'local';

        // Queue for storing position updates that arrive before model is loaded
        this.positionQueue = [];

        // Use the same vibrant color palette as enemies and remote players
        const brightColors = [
            0xff6b6b, // Bright red
            0x48dbfb, // Bright blue
            0x1dd1a1, // Bright green
            0xfeca57, // Bright yellow
            0xff9ff3, // Bright pink
            0x54a0ff, // Bright sky blue
            0x00d2d3, // Bright teal (default)
            0xf368e0, // Bright magenta
            0xff9f43, // Bright orange
            0xee5253, // Bright crimson
            0xa29bfe  // Bright purple
        ];

        // Determine color based on player ID (for consistent color identity)
        if (this.playerId === 'local') {
            // Default color for local player if no network ID is available
            this.playerColor = 0x00d2d3; // Bright teal
        } else {
            // Use a hash of the ID to get a consistent color
            const colorIndex = Math.abs(this.playerId.split('').reduce(
                (acc, char) => acc + char.charCodeAt(0), 0
            ) % brightColors.length);

            this.playerColor = brightColors[colorIndex];
        }

        log(`Player created with color: ${this.playerColor.toString(16)}`);

        // Create physics body
        this.createPhysics();

        // Load the model immediately
        this.loadModel();
    }

    createPhysics() {
        // Implementation of createPhysics method
    }

    loadModel() {
        // Implementation of loadModel method
    }
} 