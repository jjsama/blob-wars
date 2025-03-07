export class Crosshair {
    constructor() {
        this.element = null;
        this.create();
    }
    
    create() {
        // Create crosshair element
        this.element = document.createElement('div');
        this.element.id = 'crosshair';
        this.element.style.position = 'absolute';
        this.element.style.top = '50%';
        this.element.style.left = '50%';
        this.element.style.transform = 'translate(-50%, -50%)';
        this.element.style.width = '20px';
        this.element.style.height = '20px';
        this.element.style.pointerEvents = 'none'; // Make sure it doesn't interfere with mouse events
        
        // Create crosshair lines
        const verticalLine = document.createElement('div');
        verticalLine.style.position = 'absolute';
        verticalLine.style.top = '0';
        verticalLine.style.left = '50%';
        verticalLine.style.width = '2px';
        verticalLine.style.height = '100%';
        verticalLine.style.backgroundColor = 'white';
        verticalLine.style.transform = 'translateX(-50%)';
        
        const horizontalLine = document.createElement('div');
        horizontalLine.style.position = 'absolute';
        horizontalLine.style.top = '50%';
        horizontalLine.style.left = '0';
        horizontalLine.style.width = '100%';
        horizontalLine.style.height = '2px';
        horizontalLine.style.backgroundColor = 'white';
        horizontalLine.style.transform = 'translateY(-50%)';
        
        // Add lines to crosshair
        this.element.appendChild(verticalLine);
        this.element.appendChild(horizontalLine);
        
        // Add crosshair to document
        document.body.appendChild(this.element);
    }
    
    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }
    
    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }
} 