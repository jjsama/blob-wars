/**
 * HealthBar - A simple CSS-based health bar that follows an entity in 3D space
 */
export class HealthBar {
    /**
     * Create a health bar 
     * @param {Object} options - Configuration options
     * @param {THREE.Object3D} options.owner - The 3D object to attach the health bar to
     * @param {Object} options.scene - The game scene
     * @param {THREE.Camera} options.camera - The camera used for position projection
     * @param {Number} options.maxHealth - Maximum health value (default: 100)
     * @param {Number} options.width - Width of the health bar in pixels (default: 50)
     * @param {Number} options.height - Height of the health bar in pixels (default: 6)
     * @param {Number} options.yOffset - Vertical offset in world units (default: 2.0)
     */
    constructor(options) {
        this.owner = options.owner;
        this.scene = options.scene;
        this.camera = options.camera;
        this.maxHealth = options.maxHealth || 100;
        this.currentHealth = this.maxHealth;
        this.width = options.width || 50;
        this.height = options.height || 6;
        this.yOffset = options.yOffset || 2.0;
        
        console.log(`Creating health bar. Owner:`, this.owner, `Camera:`, this.camera);
        
        // Create the health bar elements
        this.createHealthBar();
        
        // Initialize position
        this.update();
    }
    
    /**
     * Create the CSS-based health bar elements
     */
    createHealthBar() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'health-bar-container';
        this.container.style.position = 'absolute';
        this.container.style.width = `${this.width}px`;
        this.container.style.height = `${this.height}px`;
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        this.container.style.border = '1px solid #000';
        this.container.style.borderRadius = '3px';
        this.container.style.pointerEvents = 'none';
        this.container.style.zIndex = '1000';
        this.container.style.display = 'none'; // Start hidden
        
        // Create health fill
        this.fill = document.createElement('div');
        this.fill.className = 'health-bar-fill';
        this.fill.style.width = '100%'; // Full health at start
        this.fill.style.height = '100%';
        this.fill.style.backgroundColor = '#00FF00'; // Green
        this.fill.style.borderRadius = '2px';
        this.fill.style.transition = 'width 0.2s ease-in-out, background-color 0.2s ease-in-out';
        
        // Add fill to container
        this.container.appendChild(this.fill);
        
        // Add container to document
        document.body.appendChild(this.container);
        
        console.log('Health bar created with container:', this.container);
    }
    
    /**
     * Update the health bar
     * @param {Number} health - Current health value
     */
    updateHealth(health) {
        this.currentHealth = Math.max(0, Math.min(this.maxHealth, health));
        const percentage = (this.currentHealth / this.maxHealth) * 100;
        
        if (this.fill) {
            // Update width based on health percentage
            this.fill.style.width = `${percentage}%`;
            
            // Update color based on health
            if (percentage > 70) {
                this.fill.style.backgroundColor = '#00FF00'; // Green
            } else if (percentage > 30) {
                this.fill.style.backgroundColor = '#FFFF00'; // Yellow
            } else {
                this.fill.style.backgroundColor = '#FF0000'; // Red
            }
            
            // Show only if health is below max
            if (this.currentHealth < this.maxHealth) {
                this.show();
            } else {
                this.hide();
            }
        }
    }
    
    /**
     * Update the health bar position
     */
    update() {
        if (!this.owner || !this.camera || !this.container) return;
        
        try {
            // Get the position of the owner in world space
            const position = this.owner.position.clone();
            
            // Add Y offset
            position.y += this.yOffset;
            
            // Project the 3D position to 2D screen space
            const vector = position.clone();
            vector.project(this.camera);
            
            // Convert to screen coordinates
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
            
            // Check if the health bar should be visible
            if (vector.z < 1) {
                // Update the health bar position
                this.container.style.left = `${x - (this.width / 2)}px`;
                this.container.style.top = `${y}px`;
                
                // Show if health is below max
                if (this.currentHealth < this.maxHealth) {
                    this.show();
                }
            } else {
                // Hide if behind camera
                this.hide();
            }
        } catch (err) {
            console.error('Error updating health bar:', err);
        }
    }
    
    /**
     * Show the health bar
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }
    
    /**
     * Hide the health bar
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
    
    /**
     * Remove the health bar
     */
    remove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
} 