
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
    }

    init() {
        window.addEventListener('keydown', (event) => {
            this.keyStates[event.key] = true;
            this.callbacks.keyDown.forEach(callback => callback(event));
        });

        window.addEventListener('keyup', (event) => {
            this.keyStates[event.key] = false;
            this.callbacks.keyUp.forEach(callback => callback(event));
        });

        window.addEventListener('mousemove', (event) => {
            this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
            this.callbacks.mouseMove.forEach(callback => callback(event));
        });

        window.addEventListener('mousedown', (event) => {
            this.callbacks.mouseDown.forEach(callback => callback(event));
        });

        window.addEventListener('mouseup', (event) => {
            this.callbacks.mouseUp.forEach(callback => callback(event));
        });
    }

    isKeyPressed(key) {
        return this.keyStates[key] === true;
    }

    onKeyDown(callback) {
        this.callbacks.keyDown.push(callback);
    }

    onKeyUp(callback) {
        this.callbacks.keyUp.push(callback);
    }

    onMouseMove(callback) {
        this.callbacks.mouseMove.push(callback);
    }

    onMouseDown(callback) {
        this.callbacks.mouseDown.push(callback);
    }

    onMouseUp(callback) {
        this.callbacks.mouseUp.push(callback);
    }
} 