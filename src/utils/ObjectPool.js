/**
 * Generic object pool to reuse objects instead of creating/destroying them
 */
export class ObjectPool {
    constructor(objectFactory, initialSize = 20) {
        this.objectFactory = objectFactory;
        this.pool = [];
        
        // Pre-populate the pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.objectFactory());
        }
    }
    
    get() {
        // Return an object from the pool or create a new one if empty
        if (this.pool.length > 0) {
            return this.pool.pop();
        } else {
            return this.objectFactory();
        }
    }
    
    release(object) {
        // Reset the object and return it to the pool
        if (object.reset) {
            object.reset();
        }
        this.pool.push(object);
    }
    
    // Clean up the pool when no longer needed
    dispose() {
        for (const object of this.pool) {
            if (object.dispose) {
                object.dispose();
            }
        }
        this.pool = [];
    }
} 