export class InputHandler {
    constructor() {
        this.keyStates = {};
        this.mousePosition = { x: 0, y: 0 };
        this.callbacks = {
            keyDown: [],
            keyUp: [],
            mouseMove: [],
            mouseDown: [],
            mouseUp: []
        };
        this.mouseButtons = new Map();
    }

    init() {
        // Prevent default behavior for game control keys
        const gameKeys = ['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'f', 'r']; // Added action keys

        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase(); // Use lowercase consistently
            this.keyStates[key] = true;

            // Use consistent logging
            if (key === ' ') {
                console.log('Jump key pressed');
            }

            // Prevent default browser actions for game keys
            if (gameKeys.includes(key)) {
                event.preventDefault();
            }

            this.callbacks.keyDown.forEach(callback => callback(event));
        });

        window.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase(); // Use lowercase consistently
            this.keyStates[key] = false;

            if (key === ' ') {
                console.log('Jump key released');
            }

            // Call callbacks
            this.callbacks.keyUp.forEach(callback => callback(event));
        });

        window.addEventListener('mousemove', (event) => {
            this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
            this.callbacks.mouseMove.forEach(callback => callback(event));
        });

        window.addEventListener('mousedown', (event) => {
            this.mouseButtons.set(event.button, true);
            this.callbacks.mouseDown.forEach(callback => callback(event));
        });

        window.addEventListener('mouseup', (event) => {
            this.mouseButtons.set(event.button, false);
            this.callbacks.mouseUp.forEach(callback => callback(event));
        });

        // Prevent context menu on right-click
        window.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        // Handle focus/blur to prevent stuck keys
        window.addEventListener('blur', () => {
            this.resetKeys();
        });
    }

    // Reset all keys (useful when window loses focus)
    resetKeys() {
        this.keyStates = {}; // Clear all key states
        this.mouseButtons.clear();
        log('--- [InputHandler] resetKeys called (window blur) ---'); // Use log for consistency
    }

    // Check if a specific key is currently pressed
    isKeyPressed(key) {
        return Boolean(this.keyStates[key.toLowerCase()]); // Use lowercase consistently
    }

    // Get the current input state for game controls
    getInputState() {
        const mouseButtonsObj = Object.fromEntries(this.mouseButtons); // Simpler conversion

        const jumpPressed = this.isKeyPressed(' ');
        if (jumpPressed) {
            console.log('Jump detected in getInputState');
        }

        return {
            forward: this.isKeyPressed('w') || this.isKeyPressed('arrowup'),
            backward: this.isKeyPressed('s') || this.isKeyPressed('arrowdown'),
            left: this.isKeyPressed('a') || this.isKeyPressed('arrowleft'),
            right: this.isKeyPressed('d') || this.isKeyPressed('arrowright'),
            jump: jumpPressed,
            attack: this.isKeyPressed('e') || this.mouseButtons.get(0) || false, // Check button 0 for left click
            reload: this.isKeyPressed('r'),
            interact: this.isKeyPressed('f'),
            mousePosition: this.mousePosition,
            mouseButtons: mouseButtonsObj
        };
    }

    // Get movement direction vector for player movement
    getMovementDirection() {
        const inputState = this.getInputState(); // Use the unified state getter

        // Return null if no movement keys are pressed
        if (!inputState.forward && !inputState.backward && !inputState.left && !inputState.right) {
            return null;
        }

        // Calculate the movement direction
        let x = 0;
        let z = 0;

        if (inputState.forward) z -= 1;
        if (inputState.backward) z += 1;
        if (inputState.left) x -= 1;
        if (inputState.right) x += 1;

        // Normalize the direction vector
        const length = Math.sqrt(x * x + z * z);
        if (length > 0) {
            x /= length;
            z /= length;
        }

        return { x, z };
    }

    // Get the current movement state for animations
    getMovementState() {
        const inputState = this.getInputState(); // Use the unified state getter

        return {
            isMoving: inputState.forward || inputState.backward || inputState.left || inputState.right,
            isJumping: inputState.jump,
            forward: inputState.forward,
            backward: inputState.backward,
            left: inputState.left,
            right: inputState.right
        };
    }

    onKeyDown(callback) {
        if (typeof callback === 'function') {
            this.callbacks.keyDown.push(callback);
        }
    }

    onKeyUp(callback) {
        if (typeof callback === 'function') {
            this.callbacks.keyUp.push(callback);
        }
    }

    onMouseMove(callback) {
        if (typeof callback === 'function') {
            this.callbacks.mouseMove.push(callback);
        }
    }

    onMouseDown(callback) {
        if (typeof callback === 'function') {
            this.callbacks.mouseDown.push(callback);
        }
    }

    onMouseUp(callback) {
        if (typeof callback === 'function') {
            this.callbacks.mouseUp.push(callback);
        }
    }
} 