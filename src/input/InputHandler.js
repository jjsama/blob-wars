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
            attack: false
        };
    }

    init() {
        // Prevent default behavior for game control keys
        const gameKeys = ['w', 'a', 's', 'd', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

        window.addEventListener('keydown', (event) => {
            // Store the raw key state
            this.keyStates[event.key] = true;

            // Update specific key tracking
            this.updateKeyState(event.key, true);

            // Prevent scrolling when pressing space
            if (gameKeys.includes(event.key)) {
                event.preventDefault();
            }

            // Call callbacks - ensure we're passing the correct event type
            this.callbacks.keyDown.forEach(callback => callback(event));
        });

        window.addEventListener('keyup', (event) => {
            // Store the raw key state
            this.keyStates[event.key] = false;

            // Update specific key tracking
            this.updateKeyState(event.key, false);

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
        // Movement keys
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
        if (key === ' ') {
            this.keys.jump = isPressed;
        }
        if (key === 'e' || key === 'E') {
            this.keys.attack = isPressed;
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

        return {
            forward: this.keyStates['w'] || this.keyStates['arrowup'] || false,
            backward: this.keyStates['s'] || this.keyStates['arrowdown'] || false,
            left: this.keyStates['a'] || this.keyStates['arrowleft'] || false,
            right: this.keyStates['d'] || this.keyStates['arrowright'] || false,
            jump: this.keyStates[' '] || false,
            attack: this.keyStates['e'] || this.keyStates['mouse0'] || false,
            reload: this.keyStates['r'] || false,
            interact: this.keyStates['f'] || false,
            mousePosition: this.mousePosition,
            mouseButtons: mouseButtonsObj
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