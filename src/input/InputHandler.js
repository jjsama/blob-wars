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

        // Add specific key tracking for common game controls
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            attack: false,
            interact: false
        };
    }

    init() {
        // Prevent default behavior for game control keys
        const gameKeys = ['w', 'a', 's', 'd', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

        window.addEventListener('keydown', (event) => {
            // Store the raw key state - ensure we're capturing keys case-insensitively
            const key = event.key;
            this.keyStates[key] = true;

            // Special handling for space bar since it can be represented differently
            if (key === ' ' || key === 'Spacebar') {
                this.keyStates[' '] = true;
                console.log('Jump key pressed');
            }

            // Update specific key tracking
            this.updateKeyState(key, true);

            // Prevent scrolling when pressing space
            if (gameKeys.includes(key)) {
                event.preventDefault();
            }

            // Call callbacks - ensure we're passing the correct event type
            this.callbacks.keyDown.forEach(callback => callback(event));
        });

        window.addEventListener('keyup', (event) => {
            // Store the raw key state
            const key = event.key;
            this.keyStates[key] = false;

            // Special handling for space bar
            if (key === ' ' || key === 'Spacebar') {
                this.keyStates[' '] = false;
                console.log('Jump key released');
            }

            // Update specific key tracking
            this.updateKeyState(key, false);

            // Call callbacks - ensure we're passing the correct event type
            this.callbacks.keyUp.forEach(callback => callback(event));
        });

        window.addEventListener('mousemove', (event) => {
            this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
            // Ensure we're passing the correct event type
            this.callbacks.mouseMove.forEach(callback => callback(event));
        });

        window.addEventListener('mousedown', (event) => {
            this.mouseButtons.set(event.button, true);
            // Ensure we're passing the correct event type
            this.callbacks.mouseDown.forEach(callback => callback(event));
        });

        window.addEventListener('mouseup', (event) => {
            this.mouseButtons.set(event.button, false);
            // Ensure we're passing the correct event type
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

    // Update the specific key tracking
    updateKeyState(key, isPressed) {
        // Movement keys - case insensitive
        if (key === 'w' || key === 'W' || key === 'ArrowUp') {
            this.keys.forward = isPressed;
        }
        if (key === 's' || key === 'S' || key === 'ArrowDown') {
            this.keys.backward = isPressed;
        }
        if (key === 'a' || key === 'A' || key === 'ArrowLeft') {
            this.keys.left = isPressed;
        }
        if (key === 'd' || key === 'D' || key === 'ArrowRight') {
            this.keys.right = isPressed;
        }

        // Action keys
        if (key === ' ' || key === 'Spacebar') {
            this.keys.jump = isPressed;
            console.log(`Jump key ${isPressed ? 'pressed' : 'released'} in updateKeyState`);
        }
        if (key === 'e' || key === 'E') {
            this.keys.attack = isPressed;
        }
        if (key === 'f' || key === 'F') {
            this.keys.interact = isPressed;
        }
    }

    // Reset all keys (useful when window loses focus)
    resetKeys() {
        Object.keys(this.keys).forEach(key => {
            this.keys[key] = false;
        });

        this.keyStates = {};
        this.mouseButtons.clear();
    }

    isKeyPressed(key) {
        return Boolean(this.keyStates[key]); // Use Boolean to ensure a boolean return type
    }

    // Get the current input state for game controls
    getInputState() {
        // Convert Map to a plain object for easier consumption
        const mouseButtonsObj = {};
        this.mouseButtons.forEach((value, key) => {
            mouseButtonsObj[key] = value;
        });

        // Handle multiple key representations and case sensitivity
        const forward = this.keyStates['w'] || this.keyStates['W'] || this.keyStates['ArrowUp'] || this.keys.forward || false;
        const backward = this.keyStates['s'] || this.keyStates['S'] || this.keyStates['ArrowDown'] || this.keys.backward || false;
        const left = this.keyStates['a'] || this.keyStates['A'] || this.keyStates['ArrowLeft'] || this.keys.left || false;
        const right = this.keyStates['d'] || this.keyStates['D'] || this.keyStates['ArrowRight'] || this.keys.right || false;
        const jump = this.keyStates[' '] || this.keyStates['Spacebar'] || this.keys.jump || false;

        if (jump) {
            console.log('Jump detected in getInputState');
        }

        return {
            forward,
            backward,
            left,
            right,
            jump,
            attack: this.keyStates['e'] || this.keyStates['E'] || this.keys.attack || this.mouseButtons.get(0) || false,
            reload: this.keyStates['r'] || this.keyStates['R'] || false,
            interact: this.keyStates['f'] || this.keyStates['F'] || this.keys.interact || false,
            mousePosition: this.mousePosition,
            mouseButtons: mouseButtonsObj
        };
    }

    // Get movement direction vector for player movement
    getMovementDirection() {
        // Process key states to determine movement direction
        const forward = this.keyStates['w'] || this.keyStates['W'] || this.keyStates['ArrowUp'] || false;
        const backward = this.keyStates['s'] || this.keyStates['S'] || this.keyStates['ArrowDown'] || false;
        const left = this.keyStates['a'] || this.keyStates['A'] || this.keyStates['ArrowLeft'] || false;
        const right = this.keyStates['d'] || this.keyStates['D'] || this.keyStates['ArrowRight'] || false;

        // Return null if no movement keys are pressed
        if (!forward && !backward && !left && !right) {
            return null;
        }

        // Calculate the movement direction
        let x = 0;
        let z = 0;

        // Add the contributions of each key
        if (forward) z -= 1;
        if (backward) z += 1;
        if (left) x -= 1;
        if (right) x += 1;

        // Normalize the direction vector for consistent movement speed in all directions
        const length = Math.sqrt(x * x + z * z);
        if (length > 0) {
            x /= length;
            z /= length;
        }

        return { x, z };
    }

    // Get the current movement state for animations
    getMovementState() {
        const forward = this.keyStates['w'] || this.keyStates['W'] || this.keyStates['ArrowUp'] || false;
        const backward = this.keyStates['s'] || this.keyStates['S'] || this.keyStates['ArrowDown'] || false;
        const left = this.keyStates['a'] || this.keyStates['A'] || this.keyStates['ArrowLeft'] || false;
        const right = this.keyStates['d'] || this.keyStates['D'] || this.keyStates['ArrowRight'] || false;
        const jump = this.keyStates[' '] || false;

        return {
            isMoving: forward || backward || left || right,
            isJumping: jump,
            forward: forward,
            backward: backward,
            left: left,
            right: right
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

    // Add this method to the InputHandler class to debug key presses
    debugKeyPress(key) {
        log(`Key pressed: "${key}" (code: ${key.charCodeAt(0)})`);
        log(`Current key states: ${JSON.stringify(this.keyStates)}`);
        log(`Jump key state: ${this.keyStates[' ']}`);
        log(`Current input state: ${JSON.stringify(this.getInputState())}`);
    }

    // Update the handleKeyDown method to add debugging
    handleKeyDown(event) {
        const key = event.key.toLowerCase();

        // Debug space key specifically
        if (key === ' ') {
            log('SPACE KEY DOWN DETECTED');
        }

        this.keyStates[key] = true;

        // Call callbacks
        this.callbacks.keyDown.forEach(callback => {
            callback(key);
        });
    }
} 